import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

import { Content } from "../models/Content.js";
import { Ledger } from "../models/Ledger.js";
import { UsageSession } from "../models/UsageSession.js";
import { User } from "../models/User.js";

// Pin mock mode BEFORE the env-dependent services load, so this suite proves the
// mock-mode settlement path (User.balanceUsd decrement = step-2 caveat #1).
// The dev .env runs the app in circle mode; dotenv does not override an
// already-set process.env var. The atomic invariants below hold in BOTH modes.
process.env.PAYMENT_MODE = "mock";
// Isolate from the dev .env's demo-tuning values (tiny cap, AGENT_REASONING=true).
process.env.SESSION_CAP_ATOMIC = "999999999999";
process.env.AGENT_REASONING = "false";
const { meterService } = await import("./meterService.js");
const { settlementService } = await import("./settlementService.js");

// Its own dedicated test DB so it can run in parallel with the other suites.
const TEST_URI =
  process.env.MONGODB_TEST_URI_SETTLE || "mongodb://127.0.0.1:27017/avalon_settlement_test";

let connected = false;

before(async () => {
  try {
    await mongoose.connect(TEST_URI, { serverSelectionTimeoutMS: 2000 });
    connected = true;
  } catch (err) {
    connected = false;
    await mongoose.disconnect().catch(() => {});
    console.error(`\n[settlementService.test] MongoDB not reachable at ${TEST_URI} — skipping. (${err.message})\n`);
  }
});

beforeEach(async () => {
  if (connected) {
    settlementService._mockSettledNonces.clear();
    await Promise.all([
      User.deleteMany({}),
      Content.deleteMany({}),
      UsageSession.deleteMany({}),
      Ledger.deleteMany({}),
    ]);
  }
});

after(async () => {
  if (connected) {
    delete process.env.SETTLEMENT_FLUSH_THRESHOLD_ATOMIC;
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});

async function makeVideoSession({ balanceUsd = 10, pricePerSecondUsd = 0.1 } = {}) {
  const user = await User.create({
    name: "Tester",
    email: `settle-${Date.now()}-${Math.random()}@avalon.test`,
    balanceUsd,
    currency: "USDC",
  });
  const content = await Content.create({
    title: "Clip",
    creatorId: "creator",
    creatorName: "Creator",
    type: "video",
    pricePerSecondUsd,
  });
  const session = await UsageSession.create({
    userId: user._id,
    contentId: content._id,
    contentType: "video",
    status: "active",
  });
  return { user, content, session };
}

// One metered tick of `secondsAgo` seconds of active watching. After it returns,
// assert the money invariant must already hold.
async function tickAndCheckInvariant(sessionId, secondsAgo) {
  await UsageSession.findByIdAndUpdate(sessionId, { lastHeartbeatAt: new Date(Date.now() - secondsAgo * 1000) });
  await meterService.processHeartbeat({ sessionId, state: "active" });
  const s = await UsageSession.findById(sessionId);
  assert.equal(
    s.settlement.settledAtomic + (s.settlement.inFlight?.amountAtomic || 0) + s.settlement.pendingAtomic,
    s.allowance.spentAtomic,
    "INVARIANT: settled + inFlight + pending === spent (after every tick)"
  );
  return s;
}

async function ledgerRows(sessionId) {
  return Ledger.find({ sessionId, usageType: "settlement_batch" }).lean();
}

test("many draws fold into ONE batch on final flush; no money lost or double-counted", async (t) => {
  if (!connected) return t.skip("MongoDB not reachable");
  process.env.SETTLEMENT_FLUSH_THRESHOLD_ATOMIC = "999999999999"; // never auto-flush

  const { session } = await makeVideoSession({ balanceUsd: 10, pricePerSecondUsd: 0.1 });

  // 4 ticks of 3s @ $0.10 = 4 draws of 300_000 atomic each.
  for (let i = 0; i < 4; i += 1) {
    const s = await tickAndCheckInvariant(session._id, 3);
    assert.equal(s.settlement.settledAtomic, 0, "nothing settled until the flush");
    assert.equal(s.settlement.pendingAtomic, (i + 1) * 300_000, "pending accrues per draw");
  }

  const result = await settlementService.flush({ sessionId: session._id });
  assert.equal(result.ok, true);
  assert.equal(result.settledAtomic, 1_200_000);
  assert.equal(result.drawCount, 4, "all four draws folded into one batch");

  const s = await UsageSession.findById(session._id);
  assert.equal(s.settlement.pendingAtomic, 0);
  assert.equal(s.settlement.settledAtomic, s.allowance.spentAtomic, "INVARIANT holds after flush");
  assert.equal(s.settlement.settledAtomic, 1_200_000);

  const rows = await ledgerRows(session._id);
  assert.equal(rows.length, 1, "ONE ledger row per batch, not per tick");
  assert.equal(rows[0].amountAtomic, 1_200_000, "row records the atomic amount settled");
  assert.equal(rows[0].drawCount, 4, "row records the number of draws folded in");
  assert.ok(rows[0].batchRef, "row records a settlement batch ref");
  assert.equal(
    rows.reduce((sum, r) => sum + r.amountAtomic, 0),
    s.allowance.spentAtomic,
    "INVARIANT: sum(ledger amountAtomic) === spent after final flush"
  );

  const fundedUser = await User.findById(s.userId);
  assert.equal(fundedUser.balanceUsd, 8.8, "mock balance decremented at settlement ($10 - $1.20)");
});

test("mid-stream threshold batches reconcile exactly to spent", async (t) => {
  if (!connected) return t.skip("MongoDB not reachable");
  // Threshold 500_000: tick1 (300k) holds, tick2 (600k) flushes 2 draws, tick3
  // holds, tick4 flushes 2 draws -> two batches of two draws.
  process.env.SETTLEMENT_FLUSH_THRESHOLD_ATOMIC = "500000";

  const { session } = await makeVideoSession({ balanceUsd: 10, pricePerSecondUsd: 0.1 });
  for (let i = 0; i < 4; i += 1) {
    await tickAndCheckInvariant(session._id, 3);
  }
  await settlementService.flush({ sessionId: session._id }); // sweep any residual

  const s = await UsageSession.findById(session._id);
  assert.equal(s.settlement.pendingAtomic, 0, "fully settled");
  assert.equal(s.settlement.settledAtomic, s.allowance.spentAtomic);
  assert.equal(s.allowance.spentAtomic, 1_200_000);

  const rows = await ledgerRows(session._id);
  assert.ok(rows.length >= 2, "multiple batches across the stream");
  assert.equal(
    rows.reduce((sum, r) => sum + r.amountAtomic, 0),
    1_200_000,
    "INVARIANT: sum(ledger amountAtomic) === spent"
  );
  assert.equal(
    rows.reduce((sum, r) => sum + r.drawCount, 0),
    4,
    "every draw is accounted for across batches exactly once"
  );
});

// Step-1-rigor concurrency proof for the batching boundary.
test("concurrent flushes settle the pending exactly once — no double-count", async (t) => {
  if (!connected) return t.skip("MongoDB not reachable");
  process.env.SETTLEMENT_FLUSH_THRESHOLD_ATOMIC = "999999999999"; // accumulate, don't auto-flush

  const { session } = await makeVideoSession({ balanceUsd: 10, pricePerSecondUsd: 0.1 });
  for (let i = 0; i < 3; i += 1) {
    await tickAndCheckInvariant(session._id, 3); // spent/pending -> 900_000
  }

  // Fire competing flushes at the same pending balance.
  const results = await Promise.all([
    settlementService.flush({ sessionId: session._id }),
    settlementService.flush({ sessionId: session._id }),
    settlementService.flush({ sessionId: session._id }),
  ]);

  const settled = results.filter((r) => r && r.ok);
  assert.equal(settled.length, 1, "exactly one flush claims the pending balance");
  assert.equal(settled[0].settledAtomic, 900_000);

  const s = await UsageSession.findById(session._id);
  assert.equal(s.settlement.pendingAtomic, 0);
  assert.equal(s.settlement.settledAtomic, s.allowance.spentAtomic, "INVARIANT holds under concurrent flush");

  const rows = await ledgerRows(session._id);
  assert.equal(rows.length, 1, "exactly ONE ledger row despite three flush calls");
  assert.equal(rows[0].amountAtomic, 900_000);

  const fundedUser = await User.findById(s.userId);
  assert.equal(fundedUser.balanceUsd, 9.1, "balance decremented once ($10 - $0.90), not three times");
});

// NONCE IDEMPOTENCY: a settle whose response is lost must, on retry, replay the
// SAME nonce so exactly one settlement lands (no double-settle across the lost
// response). This is the claim->sign->settle->finalize safety property.
test("lost response then retry settles exactly once (stable-nonce idempotency)", async (t) => {
  if (!connected) return t.skip("MongoDB not reachable");
  process.env.SETTLEMENT_FLUSH_THRESHOLD_ATOMIC = "999999999999"; // accumulate, flush manually

  const { session } = await makeVideoSession({ balanceUsd: 10, pricePerSecondUsd: 0.1 });
  await tickAndCheckInvariant(session._id, 3);
  await UsageSession.findByIdAndUpdate(session._id, { lastHeartbeatAt: new Date(Date.now() - 3000) });
  await tickAndCheckInvariant(session._id, 3); // spent/pending -> 600_000 ($0.60)

  // Simulate a lost response: the first settle actually lands (records the nonce,
  // decrements balance) but the caller never sees success and treats it as ambiguous.
  const originalSettle = settlementService.settle;
  let settleCalls = 0;
  settlementService.settle = async function patched(args) {
    const result = await originalSettle.call(this, args);
    settleCalls += 1;
    if (settleCalls === 1) throw new Error("simulated lost response after settle landed");
    return result;
  };

  try {
    const r1 = await settlementService.flush({ sessionId: session._id });
    assert.equal(r1.ok, false);
    assert.equal(r1.reason, "ambiguous", "lost response -> ambiguous, in-flight kept");

    let s = await UsageSession.findById(session._id);
    assert.ok(s.settlement.inFlight.amountAtomic > 0, "in-flight retained with its stable nonce");
    assert.equal(s.settlement.settledAtomic, 0, "not finalized — no settlement confirmed yet");
    assert.equal(s.settlement.pendingAtomic, 0, "the claim is in-flight, not back in pending");
    assert.equal((await User.findById(s.userId)).balanceUsd, 9.4, "settle landed once ($10 - $0.60)");
    assert.equal((await ledgerRows(session._id)).length, 0, "no ledger row from the lost attempt");

    const nonceUsed = s.settlement.inFlight.nonce;

    const r2 = await settlementService.flush({ sessionId: session._id }); // retry: SAME nonce
    assert.equal(r2.ok, true, "retry finalizes");

    s = await UsageSession.findById(session._id);
    assert.equal(s.settlement.inFlight.amountAtomic, 0, "in-flight cleared after finalize");
    assert.equal(s.settlement.settledAtomic, s.allowance.spentAtomic, "settled exactly the spend");
    assert.equal(s.settlement.settledAtomic, 600_000);
    assert.equal(settleCalls, 2, "settle was retried with the same claim");

    const rows = await ledgerRows(session._id);
    assert.equal(rows.length, 1, "exactly ONE ledger row despite the retry");
    assert.equal(rows[0].amountAtomic, 600_000);
    assert.equal(
      (await User.findById(s.userId)).balanceUsd,
      9.4,
      "balance NOT decremented again — exactly one settlement landed across the lost response"
    );
  } finally {
    settlementService.settle = originalSettle;
  }
});
