import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

import { UsageSession } from "../models/UsageSession.js";
import { toUsdcAtomic } from "./circleGatewayService.js";
import { allowanceService } from "./allowanceService.js";

// Reuse the existing dollars -> atomic conversion; coerce to a Number so the
// values are integer atomic units (toUsdcAtomic returns a string for payloads).
const ATOMIC = (dollars) => Number(toUsdcAtomic(dollars));

// A DEDICATED test database on the local MongoDB — never the real `avalon` DB.
// Override with MONGODB_TEST_URI if your Mongo lives elsewhere.
const TEST_URI =
  process.env.MONGODB_TEST_URI || "mongodb://127.0.0.1:27017/avalon_allowance_test";

let connected = false;

before(async () => {
  try {
    await mongoose.connect(TEST_URI, { serverSelectionTimeoutMS: 2000 });
    connected = true;
    await UsageSession.deleteMany({});
  } catch (err) {
    connected = false;
    await mongoose.disconnect().catch(() => {});
    console.error(
      `\n[allowanceService.test] MongoDB not reachable at ${TEST_URI} — skipping. ` +
        `Start it (docker compose up -d mongo) or set MONGODB_TEST_URI. (${err.message})\n`
    );
  }
});

after(async () => {
  if (connected) {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});

// capDollars is given in dollars for readability; stored as atomic units.
async function makeSession({ capDollars } = {}) {
  const session = await UsageSession.create({
    userId: new mongoose.Types.ObjectId(),
    contentId: new mongoose.Types.ObjectId(),
    contentType: "video",
    status: "active",
  });
  if (capDollars !== undefined) {
    await allowanceService.authorize({ sessionId: session._id, capAtomic: ATOMIC(capDollars) });
  }
  return session;
}

test("draw is a no-op for non-positive amounts", async (t) => {
  if (!connected) return t.skip("MongoDB not reachable");
  const session = await makeSession({ capDollars: 1 });

  assert.deepEqual(await allowanceService.draw({ sessionId: session._id, amountAtomic: 0 }), {
    ok: true,
    drawn: 0,
  });
  assert.deepEqual(await allowanceService.draw({ sessionId: session._id, amountAtomic: -5 }), {
    ok: true,
    drawn: 0,
  });

  const fresh = await UsageSession.findById(session._id);
  assert.equal(fresh.allowance.spentAtomic, 0);
  assert.equal(fresh.settlement.pendingAtomic, 0);
});

test("draw on an unauthorized session returns not_authorized and never marks it exhausted", async (t) => {
  if (!connected) return t.skip("MongoDB not reachable");
  const session = await makeSession(); // status stays "none"

  const res = await allowanceService.draw({ sessionId: session._id, amountAtomic: ATOMIC(0.25) });
  assert.equal(res.ok, false);
  assert.equal(res.reason, "not_authorized");

  const fresh = await UsageSession.findById(session._id);
  assert.equal(fresh.allowance.status, "none", "an unauthorized session is left untouched, not exhausted");
  assert.equal(fresh.allowance.spentAtomic, 0);
});

// The headline proof: fire far more truly-concurrent draws (Promise.all) than
// fit under the cap and confirm EXACTLY floor(cap/amount) succeed, integer-exact.
// A naive read-then-write would let all 12 pass and overspend to 3_000_000.
test("cap holds under concurrent draws — exactly floor(cap/amount) succeed", async (t) => {
  if (!connected) return t.skip("MongoDB not reachable");

  const CAP = ATOMIC(1.0); // 1_000_000 atomic = $1.00
  const AMOUNT = ATOMIC(0.25); // 250_000 atomic = $0.25
  const CONCURRENCY = 12; // fire 3x more than fit
  const EXPECTED_WINNERS = Math.floor(CAP / AMOUNT); // 4

  const session = await makeSession({ capDollars: 1.0 });

  const results = await Promise.all(
    Array.from({ length: CONCURRENCY }, () =>
      allowanceService.draw({ sessionId: session._id, amountAtomic: AMOUNT })
    )
  );

  const winners = results.filter((r) => r.ok && r.drawn === AMOUNT);
  const losers = results.filter((r) => !r.ok);

  assert.equal(winners.length, EXPECTED_WINNERS, "exactly floor(cap/amount) draws succeed");
  assert.equal(losers.length, CONCURRENCY - EXPECTED_WINNERS);
  assert.ok(
    losers.every((r) => r.reason === "allowance_exhausted"),
    "every losing draw reports allowance_exhausted"
  );

  const fresh = await UsageSession.findById(session._id);
  assert.ok(fresh.allowance.spentAtomic <= CAP, "HARD GUARANTEE: spent never exceeds the cap");
  assert.equal(fresh.allowance.spentAtomic, CAP, "spent lands exactly on the cap — integer-exact, no drift");
  assert.equal(fresh.settlement.pendingAtomic, CAP, "pending settlement accrues exactly what was drawn");
  assert.equal(fresh.allowance.status, "exhausted", "status flips to exhausted once the cap is reached");
});

// Change 3: a partial-fit draw at the boundary reports the stranded remainder.
test("partial-fit draw flips to exhausted and reports the stranded remainder", async (t) => {
  if (!connected) return t.skip("MongoDB not reachable");
  const session = await makeSession({ capDollars: 1.0 }); // cap 1_000_000

  const first = await allowanceService.draw({ sessionId: session._id, amountAtomic: ATOMIC(0.6) });
  const second = await allowanceService.draw({ sessionId: session._id, amountAtomic: ATOMIC(0.6) }); // would exceed

  assert.equal(first.ok, true);
  assert.equal(second.ok, false);
  assert.equal(second.reason, "allowance_exhausted");
  assert.equal(second.remainingAtomic, ATOMIC(0.4), "reports the $0.40 left stranded at the cap");

  const fresh = await UsageSession.findById(session._id);
  assert.equal(fresh.allowance.spentAtomic, ATOMIC(0.6));
  assert.equal(fresh.allowance.status, "exhausted");
});

test("sequential draws stop exactly at the cap with nothing stranded", async (t) => {
  if (!connected) return t.skip("MongoDB not reachable");
  const session = await makeSession({ capDollars: 0.5 });

  const a = await allowanceService.draw({ sessionId: session._id, amountAtomic: ATOMIC(0.25) });
  const b = await allowanceService.draw({ sessionId: session._id, amountAtomic: ATOMIC(0.25) });
  const c = await allowanceService.draw({ sessionId: session._id, amountAtomic: ATOMIC(0.25) }); // over cap

  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  assert.equal(c.ok, false);
  assert.equal(c.reason, "allowance_exhausted");
  assert.equal(c.remainingAtomic, 0, "drew exactly to the cap — nothing stranded");

  const fresh = await UsageSession.findById(session._id);
  assert.equal(fresh.allowance.spentAtomic, ATOMIC(0.5));
  assert.equal(fresh.allowance.status, "exhausted");
});
