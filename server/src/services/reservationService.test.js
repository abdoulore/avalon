import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

import { GatewayPool } from "../models/GatewayPool.js";
import { UsageSession } from "../models/UsageSession.js";

// Pin mock mode so poolKeyFor() is deterministic ("user:<id>") for the
// session-release tests, independent of the dev .env.
process.env.PAYMENT_MODE = "mock";
const { reservationService } = await import("./reservationService.js");

const TEST_URI =
  process.env.MONGODB_TEST_URI_RESERVE || "mongodb://127.0.0.1:27017/avalon_reservation_test";

let connected = false;

before(async () => {
  try {
    await mongoose.connect(TEST_URI, { serverSelectionTimeoutMS: 2000 });
    connected = true;
  } catch (err) {
    connected = false;
    await mongoose.disconnect().catch(() => {});
    console.error(`\n[reservationService.test] MongoDB not reachable at ${TEST_URI} — skipping. (${err.message})\n`);
  }
});

beforeEach(async () => {
  if (connected) {
    await Promise.all([GatewayPool.deleteMany({}), UsageSession.deleteMany({})]);
  }
});

after(async () => {
  if (connected) {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});

function invariantHolds(pool) {
  return (
    pool.availableAtomic >= 0 &&
    pool.availableAtomic + pool.reservedAtomic + pool.spentAtomic === pool.totalAtomic
  );
}

// THE multi-user over-claim proof: many users' sessions all draw from ONE shared
// sponsored Gateway wallet. The pool fits only floor(balance/amount) of them.
test("N concurrent reserves on one shared wallet pool: exactly floor(balance/amount) succeed", async (t) => {
  if (!connected) return t.skip("MongoDB not reachable");
  const key = "wallet:0xsponsor"; // one funded wallet, shared by every user
  await reservationService.ensurePool({ key, seedAtomic: 1_000_000 }); // $1.00 funds it

  const AMOUNT = 250_000; // each session reserves $0.25
  const CONCURRENCY = 12; // twelve users at once
  const EXPECTED = Math.floor(1_000_000 / AMOUNT); // 4

  const results = await Promise.all(
    Array.from({ length: CONCURRENCY }, () => reservationService.reserve({ key, amountAtomic: AMOUNT }))
  );

  const granted = results.filter((r) => r.ok && r.reserved === AMOUNT);
  const denied = results.filter((r) => !r.ok);

  assert.equal(granted.length, EXPECTED, "only floor(balance/amount) succeed - no over-claim across users");
  assert.equal(denied.length, CONCURRENCY - EXPECTED);
  assert.ok(denied.every((r) => r.reason === "insufficient_gateway_balance"));
  assert.ok(denied.every((r) => r.available < AMOUNT), "denied calls report the (insufficient) shared balance");

  const pool = await reservationService.getPool(key);
  assert.equal(pool.availableAtomic, 0, "available never goes below zero");
  assert.equal(pool.reservedAtomic, 1_000_000);
  assert.ok(invariantHolds(pool), "available + reserved + spent === total");
});

test("release returns unused funds; available is restored exactly", async (t) => {
  if (!connected) return t.skip("MongoDB not reachable");
  const key = "wallet:0xsponsor";
  await reservationService.ensurePool({ key, seedAtomic: 1_000_000 });

  await reservationService.reserve({ key, amountAtomic: 400_000 });
  let pool = await reservationService.getPool(key);
  assert.equal(pool.availableAtomic, 600_000);
  assert.equal(pool.reservedAtomic, 400_000);

  const rel = await reservationService.release({ key, amountAtomic: 400_000 });
  assert.equal(rel.ok, true);
  pool = await reservationService.getPool(key);
  assert.equal(pool.availableAtomic, 1_000_000, "available fully restored");
  assert.equal(pool.reservedAtomic, 0);
  assert.ok(invariantHolds(pool));
});

test("settle-convert moves reserved -> spent (out of pool), not back to available", async (t) => {
  if (!connected) return t.skip("MongoDB not reachable");
  const key = "wallet:0xsponsor";
  await reservationService.ensurePool({ key, seedAtomic: 1_000_000 });
  await reservationService.reserve({ key, amountAtomic: 500_000 });

  await reservationService.settleConvert({ key, amountAtomic: 100_000 });

  const pool = await reservationService.getPool(key);
  assert.equal(pool.reservedAtomic, 400_000, "reserved decreased by the settled amount");
  assert.equal(pool.spentAtomic, 100_000, "settled funds are now spent");
  assert.equal(pool.availableAtomic, 500_000, "available unchanged - settled funds leave the pool, not back to available");
  assert.ok(invariantHolds(pool));
});

test("releaseSession is idempotent - a double release credits once", async (t) => {
  if (!connected) return t.skip("MongoDB not reachable");
  const userId = new mongoose.Types.ObjectId();
  const key = reservationService.poolKeyFor(userId); // "user:<id>" in mock mode
  await reservationService.ensurePool({ key, seedAtomic: 1_000_000 });
  await reservationService.reserve({ key, amountAtomic: 500_000 }); // session cap

  const session = await UsageSession.create({
    userId,
    contentId: new mongoose.Types.ObjectId(),
    contentType: "video",
    status: "active",
    allowance: { capAtomic: 500_000, spentAtomic: 200_000, status: "authorized" },
  });

  const r1 = await reservationService.releaseSession({ sessionId: session._id });
  assert.equal(r1.released, 300_000, "releases the unused remainder (cap 500k - spent 200k)");
  let pool = await reservationService.getPool(key);
  assert.equal(pool.availableAtomic, 800_000);
  assert.equal(pool.reservedAtomic, 200_000);

  const r2 = await reservationService.releaseSession({ sessionId: session._id });
  assert.equal(r2.alreadyReleased, true);
  assert.equal(r2.released, 0);
  pool = await reservationService.getPool(key);
  assert.equal(pool.availableAtomic, 800_000, "no double-credit on second release");
  assert.ok(invariantHolds(pool));
});

test("full lifecycle: reserve -> partial spend -> settle -> release unused; invariant holds", async (t) => {
  if (!connected) return t.skip("MongoDB not reachable");
  const userId = new mongoose.Types.ObjectId();
  const key = reservationService.poolKeyFor(userId);
  await reservationService.ensurePool({ key, seedAtomic: 1_000_000 });

  await reservationService.reserve({ key, amountAtomic: 500_000 }); // $0.50 cap
  const session = await UsageSession.create({
    userId,
    contentId: new mongoose.Types.ObjectId(),
    contentType: "video",
    status: "active",
    allowance: { capAtomic: 500_000, spentAtomic: 300_000, status: "authorized" }, // drew $0.30
  });

  await reservationService.settleConvert({ key, amountAtomic: 300_000 }); // the $0.30 settles
  let pool = await reservationService.getPool(key);
  assert.ok(invariantHolds(pool));
  assert.equal(pool.spentAtomic, 300_000);
  assert.equal(pool.reservedAtomic, 200_000);

  const rel = await reservationService.releaseSession({ sessionId: session._id }); // release unused $0.20
  assert.equal(rel.released, 200_000);

  pool = await reservationService.getPool(key);
  assert.ok(invariantHolds(pool));
  assert.equal(pool.reservedAtomic, 0);
  assert.equal(pool.spentAtomic, 300_000);
  assert.equal(pool.availableAtomic, 700_000, "available back to total - spent");
  assert.equal(pool.availableAtomic, pool.totalAtomic - pool.spentAtomic);
});
