import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import { AgentPaymentProvider } from "./agentPaymentProvider.js";

// These tests exercise pure decision logic — no DB, no network. The model call
// (callDeepSeek) is overridden where a model path is needed.

const ONE_DOLLAR = 1_000_000; // atomic

function makeSession(overrides = {}) {
  return {
    allowance: { capAtomic: ONE_DOLLAR, spentAtomic: 0, ratePerSecondCapUsd: 0 },
    agentPolicy: {},
    ...overrides,
  };
}

let savedFlag;
beforeEach(() => {
  savedFlag = process.env.AGENT_REASONING;
});
afterEach(() => {
  if (savedFlag === undefined) delete process.env.AGENT_REASONING;
  else process.env.AGENT_REASONING = savedFlag;
});

// (a) Deterministic guards still pass with AGENT_REASONING=false, and the model
// is never called even when budget is low and content is queued.
test("AGENT_REASONING=false: deterministic guards only, model never called", async () => {
  process.env.AGENT_REASONING = "false";
  const agent = new AgentPaymentProvider();
  let modelCalled = false;
  agent.callDeepSeek = async () => {
    modelCalled = true;
    throw new Error("model must not be called");
  };

  // normal tick -> within policy
  let d = await agent.decide({
    session: makeSession(),
    content: {},
    proposedAtomic: 300_000,
    context: { tickSeconds: 3, queueAhead: 5 },
  });
  assert.deepEqual([d.approve, d.stop, d.drawAtomic, d.reason], [true, false, 300_000, "within_policy"]);

  // low budget + queued (would deliberate if enabled) -> still deterministic
  d = await agent.decide({
    session: makeSession({ allowance: { capAtomic: ONE_DOLLAR, spentAtomic: 900_000, ratePerSecondCapUsd: 0 } }),
    content: {},
    proposedAtomic: 50_000,
    context: { tickSeconds: 3, queueAhead: 5 },
  });
  assert.equal(d.reason, "within_policy");

  // budget exhausted -> stop
  d = await agent.decide({
    session: makeSession({ allowance: { capAtomic: ONE_DOLLAR, spentAtomic: ONE_DOLLAR, ratePerSecondCapUsd: 0 } }),
    content: {},
    proposedAtomic: 1,
    context: { tickSeconds: 3 },
  });
  assert.deepEqual([d.approve, d.stop, d.reason], [false, true, "budget_exhausted"]);

  // would exceed remaining -> stop
  d = await agent.decide({
    session: makeSession({ allowance: { capAtomic: ONE_DOLLAR, spentAtomic: 990_000, ratePerSecondCapUsd: 0 } }),
    content: {},
    proposedAtomic: 20_000,
    context: { tickSeconds: 3 },
  });
  assert.deepEqual([d.approve, d.stop, d.reason], [false, true, "would_exceed_budget"]);

  assert.equal(modelCalled, false, "model was never consulted with AGENT_REASONING=false");
});

// (b) shouldDeliberate triggers ONLY on low budget AND more content queued.
test("shouldDeliberate: only on low-budget + queued, not on normal ticks", () => {
  const agent = new AgentPaymentProvider();
  const cap = ONE_DOLLAR;

  // low budget (15% remaining) + queued -> deliberate
  assert.equal(
    agent.shouldDeliberate({ session: makeSession(), context: { queueAhead: 3 }, remaining: 150_000, budgetCeilingAtomic: cap }),
    true
  );
  // healthy budget (90% remaining) + queued -> no
  assert.equal(
    agent.shouldDeliberate({ session: makeSession(), context: { queueAhead: 3 }, remaining: 900_000, budgetCeilingAtomic: cap }),
    false
  );
  // low budget but nothing queued -> no
  assert.equal(
    agent.shouldDeliberate({ session: makeSession(), context: { queueAhead: 0 }, remaining: 150_000, budgetCeilingAtomic: cap }),
    false
  );
});

// (c) Model timeout/error falls back to within-policy approve and STILL draws —
// billing never stalls on the model.
test("model error falls back to within-policy approve and still draws", async () => {
  process.env.AGENT_REASONING = "true";
  const agent = new AgentPaymentProvider();
  agent.callDeepSeek = async () => {
    throw new Error("simulated DeepSeek timeout");
  };

  const session = makeSession({ allowance: { capAtomic: ONE_DOLLAR, spentAtomic: 850_000, ratePerSecondCapUsd: 0 } });
  const d = await agent.decide({
    session,
    content: { title: "Clip" },
    proposedAtomic: 50_000, // fits in the 150_000 remaining
    context: { tickSeconds: 3, queueAhead: 3 }, // low budget + queued -> deliberates
  });

  assert.equal(d.approve, true, "falls back to approve");
  assert.equal(d.stop, false);
  assert.equal(d.drawAtomic, 50_000, "still draws the full proposed amount");
  assert.equal(session.agentDecision.source, "fallback", "decision recorded as a model fallback");
});

// (d) Unit conversion: a DOLLAR budget correctly gates an ATOMIC draw.
test("dollar budget (budgetUsd) gates an atomic draw via toUsdcAtomic", async () => {
  process.env.AGENT_REASONING = "false";
  const agent = new AgentPaymentProvider();

  // budgetUsd $0.05 -> 50_000 atomic ceiling (capped under the $1 allowance).
  const session = makeSession({ agentPolicy: { enabled: true, budgetUsd: 0.05 } });

  // proposed $0.06 (60_000 atomic) exceeds the $0.05 budget -> blocked.
  let d = await agent.decide({ session, content: {}, proposedAtomic: 60_000, context: { tickSeconds: 1 } });
  assert.deepEqual([d.stop, d.reason], [true, "would_exceed_budget"]);

  // proposed $0.04 (40_000 atomic) is under the $0.05 budget -> allowed.
  d = await agent.decide({ session, content: {}, proposedAtomic: 40_000, context: { tickSeconds: 1 } });
  assert.deepEqual([d.approve, d.drawAtomic, d.reason], [true, 40_000, "within_policy"]);

  // sanity: WITHOUT the $0.05 policy, 60_000 is fine under the $1 allowance cap.
  session.agentPolicy = {};
  d = await agent.decide({ session, content: {}, proposedAtomic: 60_000, context: { tickSeconds: 1 } });
  assert.equal(d.reason, "within_policy");
});
