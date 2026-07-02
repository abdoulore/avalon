import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

import { Content } from "../models/Content.js";
import { Ledger } from "../models/Ledger.js";
import { UsageSession } from "../models/UsageSession.js";
import { User } from "../models/User.js";

// Pin mock mode + a sky-high flush threshold so accounting stays visible.
process.env.PAYMENT_MODE = "mock";
process.env.SETTLEMENT_FLUSH_THRESHOLD_ATOMIC = "999999999999";
// Large cap so the demo .env's tiny SESSION_CAP_ATOMIC doesn't constrain draws
// (read at meter module load). AGENT_REASONING is controlled per test below.
process.env.SESSION_CAP_ATOMIC = "999999999999";
const { meterService } = await import("./meterService.js");
const { allowanceService } = await import("./allowanceService.js");
const { settlementService } = await import("./settlementService.js");
const { agentPaymentProvider } = await import("../integrations/agentPaymentProvider.js");

const TEST_URI =
  process.env.MONGODB_TEST_URI_READ || "mongodb://127.0.0.1:27017/avalon_read_test";

let connected = false;

before(async () => {
  try {
    await mongoose.connect(TEST_URI, { serverSelectionTimeoutMS: 2000 });
    connected = true;
  } catch (err) {
    connected = false;
    await mongoose.disconnect().catch(() => {});
    console.error(`\n[meterReadPath.test] MongoDB not reachable at ${TEST_URI} — skipping. (${err.message})\n`);
  }
});

beforeEach(async () => {
  if (connected) {
    settlementService._mockSettledNonces.clear();
    delete process.env.AGENT_REASONING;
    await Promise.all([User.deleteMany({}), Content.deleteMany({}), UsageSession.deleteMany({}), Ledger.deleteMany({})]);
  }
});

after(async () => {
  if (connected) {
    delete process.env.AGENT_REASONING;
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});

async function makeBook({ balanceUsd = 10, pricePerPageUsd = 0.03, freePreviewPages = 2, pages = 20 } = {}) {
  const user = await User.create({ name: "Reader", email: `r-${Date.now()}-${Math.random()}@avalon.test`, balanceUsd, currency: "USDC" });
  const content = await Content.create({
    title: "The Glass Library",
    creatorId: "ada-north",
    creatorName: "Ada North",
    type: "book",
    pricePerPageUsd,
    freePreviewPages,
    pages,
  });
  const session = await UsageSession.create({ userId: user._id, contentId: content._id, contentType: "book", status: "active" });
  return { user, content, session };
}

// (a) A page turn draws the correct atomic amount and bills the DRAWN amount.
test("page turn draws per-page atomic and bills it; free + duplicate pages are not charged", async (t) => {
  if (!connected) return t.skip("MongoDB not reachable");
  const { session } = await makeBook({ pricePerPageUsd: 0.03, freePreviewPages: 2 });

  // free-preview page -> no charge
  let r = await meterService.processPageRead({ sessionId: session._id, page: 1 });
  assert.equal(r.chargeAmount, 0);
  assert.equal(r.served, true);

  // first paid page -> $0.03 drawn against the allowance
  r = await meterService.processPageRead({ sessionId: session._id, page: 3 });
  assert.equal(r.chargeAmount, 0.03);
  let s = await UsageSession.findById(session._id);
  assert.equal(s.allowance.spentAtomic, 30_000);
  assert.equal(s.settlement.pendingAtomic, 30_000);
  const ev = s.events.at(-1);
  assert.equal(ev.metadata.source, "allowance-draw");
  assert.equal(ev.metadata.page, 3);
  assert.equal(ev.kind, "book_page");

  // same page again -> already billed, no second charge
  r = await meterService.processPageRead({ sessionId: session._id, page: 3 });
  assert.equal(r.chargeAmount, 0);
  s = await UsageSession.findById(session._id);
  assert.equal(s.allowance.spentAtomic, 30_000, "duplicate page does not re-draw");
});

// (b) A per-page agent throttle bills the THROTTLED amount, not the proposed.
test("per-page agent throttle bills the throttled amount", async (t) => {
  if (!connected) return t.skip("MongoDB not reachable");
  process.env.AGENT_REASONING = "true";
  const { session } = await makeBook({ pricePerPageUsd: 0.02, pages: 30 });

  // Pre-spend to a low-budget state so shouldDeliberate fires: cap $0.20, spent $0.17.
  await allowanceService.authorize({ sessionId: session._id, capAtomic: 200_000 });
  await allowanceService.draw({ sessionId: session._id, amountAtomic: 170_000 });

  const originalCall = agentPaymentProvider.callDeepSeek;
  agentPaymentProvider.callDeepSeek = async () => ({
    action: "throttle",
    throttleRatePerSecondUsd: 0.01, // -> 10_000 atomic/sec; tickSeconds=1 -> draw 10_000
    reason: "low budget, pages queued, conserve",
  });
  try {
    const r = await meterService.processPageRead({ sessionId: session._id, page: 5 });
    assert.equal(r.chargeAmount, 0.01, "billed the throttled $0.01, not the proposed $0.02");
    const s = await UsageSession.findById(session._id);
    assert.equal(s.events.at(-1).metadata.drawAtomic, 10_000, "drew 10_000 (throttled) not 20_000");
    assert.equal(s.agentDecision.action, "throttle");
    assert.equal(s.agentDecision.source, "deepseek");
  } finally {
    agentPaymentProvider.callDeepSeek = originalCall;
  }
});

// (c) A page turn that would exceed the allowance -> 402 needsReauth, next page not served.
test("exhaustion on a page turn throws 402 needsReauth and does not serve the page", async (t) => {
  if (!connected) return t.skip("MongoDB not reachable");
  const { session } = await makeBook({ pricePerPageUsd: 0.03, freePreviewPages: 2 });

  await allowanceService.authorize({ sessionId: session._id, capAtomic: 50_000 }); // $0.05 cap

  // page 3 -> $0.03 OK (spent 30_000, remaining 20_000)
  await meterService.processPageRead({ sessionId: session._id, page: 3 });
  // page 4 -> $0.03 would exceed the remaining $0.02 -> 402
  await assert.rejects(
    () => meterService.processPageRead({ sessionId: session._id, page: 4 }),
    (err) => {
      assert.equal(err.status, 402);
      assert.equal(err.needsReauth, true);
      return true;
    }
  );

  const s = await UsageSession.findById(session._id);
  assert.equal(s.allowance.spentAtomic, 30_000, "the refused page was not drawn");
  assert.equal(s.pagesRead, 3, "pagesRead did not advance to the unserved page");
  assert.ok(!s.events.some((e) => e.metadata?.page === 4), "no event for the unserved page");
});

// (d) The invariant holds across a MIXED video+book session settling in one batch,
// and a book batch produces the same settlement_batch ledger shape as video.
test("invariant holds across a mixed video+book session; identical ledger row shape", async (t) => {
  if (!connected) return t.skip("MongoDB not reachable");
  const user = await User.create({ name: "Mixed", email: `m-${Date.now()}@avalon.test`, balanceUsd: 10, currency: "USDC" });
  const content = await Content.create({
    title: "Mixed", creatorId: "c", creatorName: "C", type: "video",
    pricePerSecondUsd: 0.01, pricePerPageUsd: 0.03, pages: 20,
  });
  const session = await UsageSession.create({ userId: user._id, contentId: content._id, contentType: "video", status: "active" });

  // One video tick ($0.02) and one book page ($0.03) draw into the SAME allowance.
  await meterService._chargeAllowance({
    session, content, user, chargeAmount: 0.02, eventKind: "video_watch", quantity: 2,
    context: { tickSeconds: 2, queueAhead: 5 },
  });
  await meterService._chargeAllowance({
    session, content, user, chargeAmount: 0.03, eventKind: "book_page", quantity: 1, extraMetadata: { page: 3 },
    context: { tickSeconds: 1, queueAhead: 5 },
  });

  let s = await UsageSession.findById(session._id);
  const inv = (x) => x.settlement.settledAtomic + (x.settlement.inFlight?.amountAtomic || 0) + x.settlement.pendingAtomic;
  assert.equal(inv(s), s.allowance.spentAtomic, "invariant after mixed draws");
  assert.equal(s.allowance.spentAtomic, 50_000); // 20_000 + 30_000

  const result = await settlementService.flush({ sessionId: session._id, content });
  assert.equal(result.ok, true);
  assert.equal(result.settledAtomic, 50_000);
  assert.equal(result.drawCount, 2, "video tick + book page folded into ONE batch");

  s = await UsageSession.findById(session._id);
  assert.equal(inv(s), s.allowance.spentAtomic, "invariant after settle");
  assert.equal(s.settlement.pendingAtomic, 0);

  // Identical settlement_batch row shape regardless of mixed source content.
  const rows = await Ledger.find({ sessionId: session._id, usageType: "settlement_batch" }).lean();
  assert.equal(rows.length, 1);
  for (const key of ["amount", "amountAtomic", "drawCount", "batchRef", "platformFee", "creatorShare", "usageType", "gatewayStatus"]) {
    assert.ok(key in rows[0], `batch row has ${key}`);
  }
  assert.equal(rows[0].amountAtomic, 50_000);
  assert.equal(rows[0].drawCount, 2);
});
