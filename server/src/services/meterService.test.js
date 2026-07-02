import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

import { Content } from "../models/Content.js";
import { UsageSession } from "../models/UsageSession.js";
import { User } from "../models/User.js";

// Pin demo-independent env BEFORE importing the meter (it reads SESSION_CAP_ATOMIC
// at module load). The dev .env carries small demo-tuning values (tiny cap,
// AGENT_REASONING=true) that would otherwise constrain or perturb these tests.
process.env.PAYMENT_MODE = "mock";
process.env.SESSION_CAP_ATOMIC = "999999999999";
process.env.AGENT_REASONING = "false";
process.env.SETTLEMENT_FLUSH_THRESHOLD_ATOMIC = "999999999999";
const { meterService } = await import("./meterService.js");

// Its own dedicated test DB so it can run in parallel with the allowance suite.
const TEST_URI =
  process.env.MONGODB_TEST_URI_METER || "mongodb://127.0.0.1:27017/avalon_meter_test";

let connected = false;

before(async () => {
  // Isolate the metering/draw behavior from settlement: pin the flush threshold
  // sky-high so maybeFlush never fires here. Batched settlement has its own suite.
  process.env.SETTLEMENT_FLUSH_THRESHOLD_ATOMIC = "999999999999";
  try {
    await mongoose.connect(TEST_URI, { serverSelectionTimeoutMS: 2000 });
    connected = true;
  } catch (err) {
    connected = false;
    await mongoose.disconnect().catch(() => {});
    console.error(`\n[meterService.test] MongoDB not reachable at ${TEST_URI} — skipping. (${err.message})\n`);
  }
});

beforeEach(async () => {
  if (connected) {
    await Promise.all([User.deleteMany({}), Content.deleteMany({}), UsageSession.deleteMany({})]);
  }
});

after(async () => {
  if (connected) {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});

// Pin elapsed time deterministically by backdating lastHeartbeatAt.
async function scenario({ balanceUsd, pricePerSecondUsd, freePreviewSeconds = 0, secondsAgo, secondsWatched = 0 }) {
  const user = await User.create({
    name: "Tester",
    email: `tester-${Date.now()}-${Math.random()}@avalon.test`,
    balanceUsd,
    currency: "USDC",
  });
  const content = await Content.create({
    title: "Clip",
    creatorId: "creator",
    creatorName: "Creator",
    type: "video",
    pricePerSecondUsd,
    freePreviewSeconds,
  });
  const session = await UsageSession.create({
    userId: user._id,
    contentId: content._id,
    contentType: "video",
    status: "active",
    secondsWatched,
    lastHeartbeatAt: new Date(Date.now() - secondsAgo * 1000),
  });
  return { user, content, session };
}

test("active video heartbeat draws against an auto-authorized allowance (no signing)", async (t) => {
  if (!connected) return t.skip("MongoDB not reachable");
  const { session } = await scenario({ balanceUsd: 1.0, pricePerSecondUsd: 0.1, secondsAgo: 3 });

  const result = await meterService.processHeartbeat({ sessionId: session._id, state: "active" });

  assert.equal(result.chargeAmount, 0.3, "3s @ $0.10 billed this tick");
  assert.equal(result.creatorShareUsd, 0.255, "85% creator split unchanged");
  assert.equal(result.platformFeeUsd, 0.045, "15% platform split unchanged");

  const fresh = await UsageSession.findById(session._id);
  assert.equal(fresh.allowance.status, "authorized", "auto-authorized on first charge");
  assert.equal(fresh.allowance.capAtomic, 1_000_000, "cap = balance ($1.00) in atomic units");
  assert.equal(fresh.allowance.spentAtomic, 300_000, "drew $0.30 in atomic units");
  assert.equal(fresh.settlement.pendingAtomic, 300_000, "accrued for batched settlement (step 3)");
  assert.equal(fresh.totalChargedUsd, 0.3);
  assert.equal(fresh.secondsWatched, 3);
  assert.equal(fresh.events.at(-1).metadata.source, "allowance-draw");
});

test("a second heartbeat keeps drawing down the same allowance", async (t) => {
  if (!connected) return t.skip("MongoDB not reachable");
  const { session } = await scenario({ balanceUsd: 1.0, pricePerSecondUsd: 0.1, secondsAgo: 3 });

  await meterService.processHeartbeat({ sessionId: session._id, state: "active" });
  // Backdate again so the next tick sees 2 more elapsed seconds.
  await UsageSession.findByIdAndUpdate(session._id, { lastHeartbeatAt: new Date(Date.now() - 2000) });
  await meterService.processHeartbeat({ sessionId: session._id, state: "active" });

  const fresh = await UsageSession.findById(session._id);
  assert.equal(fresh.allowance.spentAtomic, 500_000, "$0.30 + $0.20 drawn against one authorization");
  assert.equal(fresh.settlement.pendingAtomic, 500_000);
  assert.equal(fresh.totalChargedUsd, 0.5);
});

test("a tick that would exceed the allowance throws 402 needsReauth and bills nothing", async (t) => {
  if (!connected) return t.skip("MongoDB not reachable");
  // Balance $0.20 -> cap 200_000. A 5s tick @ $0.10 = $0.50 (500_000) overshoots.
  const { session } = await scenario({ balanceUsd: 0.2, pricePerSecondUsd: 0.1, secondsAgo: 5 });

  await assert.rejects(
    () => meterService.processHeartbeat({ sessionId: session._id, state: "active" }),
    (err) => {
      assert.equal(err.status, 402);
      assert.equal(err.needsReauth, true);
      return true;
    }
  );

  const fresh = await UsageSession.findById(session._id);
  assert.equal(fresh.totalChargedUsd, 0, "nothing billed when the agent stops the tick");
  assert.equal(fresh.allowance.spentAtomic, 0, "no draw occurred");
  assert.equal(fresh.activityState, "left", "agent stop flips the session state");
});

test("a paused heartbeat neither authorizes nor draws", async (t) => {
  if (!connected) return t.skip("MongoDB not reachable");
  const { session } = await scenario({ balanceUsd: 1.0, pricePerSecondUsd: 0.1, secondsAgo: 4 });

  const result = await meterService.processHeartbeat({ sessionId: session._id, state: "paused" });

  assert.equal(result.chargeAmount, 0);
  const fresh = await UsageSession.findById(session._id);
  assert.equal(fresh.allowance.status, "none", "no allowance created while paused");
  assert.equal(fresh.totalChargedUsd, 0);
  assert.equal(fresh.activityState, "paused");
});

test("free-preview seconds are not billed but still consume the preview", async (t) => {
  if (!connected) return t.skip("MongoDB not reachable");
  // 10s preview; this tick is entirely within it (secondsWatched 0, elapsed 4).
  const { session } = await scenario({
    balanceUsd: 1.0,
    pricePerSecondUsd: 0.1,
    freePreviewSeconds: 10,
    secondsAgo: 4,
  });

  const result = await meterService.processHeartbeat({ sessionId: session._id, state: "active" });

  assert.equal(result.chargeAmount, 0, "no charge inside the free preview");
  const fresh = await UsageSession.findById(session._id);
  assert.equal(fresh.allowance.status, "none", "preview ticks don't trigger authorization");
  assert.equal(fresh.secondsWatched, 4, "but preview is consumed (watched seconds advance)");
  assert.equal(fresh.totalChargedUsd, 0);
});
