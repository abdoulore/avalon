import { env } from "../config/env.js";
import { toUsdcAtomic, fromUsdcAtomic } from "../services/circleGatewayService.js";

/**
 * Ember, the budget agent. Decides whether a metered tick should be paid at full
 * rate, throttled, or stopped. The agent owns the DECISION; allowanceService owns
 * the ACCOUNTING and enforces the cap atomically regardless of what Ember returns.
 *
 * NAMING: the user-facing agent is "Ember". DeepSeek is the underlying model only
 * (env DEEPSEEK_*, model deepseek-chat). The decision `source` code stays
 * "deepseek" internally and renders as "Ember" in the UI (AgentBanner SOURCE_LABEL).
 *
 *   1. Deterministic guards run FIRST every tick (cheap, never call the model):
 *      remaining<=0 -> stop; proposed>remaining -> stop; rate>cap -> throttle.
 *   2. The model is consulted ONLY on genuine judgment calls (shouldDeliberate):
 *      low remaining budget AND more content queued.
 *   3. deliberate() asks DeepSeek for an ALLOCATION decision and NEVER blocks
 *      billing — timeout / error / unparseable output all fall back to
 *      approve-within-policy so the meter always draws.
 *
 * UNIT BOUNDARY: agentPolicy.budgetUsd and allowance.ratePerSecondCapUsd are
 * DOLLARS; allowance.spentAtomic/capAtomic and proposedAtomic are ATOMIC units.
 * Dollars are converted with toUsdcAtomic before ANY comparison.
 */
const AGENT_TIMEOUT_MS = Number(process.env.AGENT_TIMEOUT_MS || 2500);
const AGENT_CACHE_MS = Number(process.env.AGENT_CACHE_MS || 15000);
const DEEPSEEK_MODEL = "deepseek-chat"; // NOT deepseek-reasoner — wrong latency for a heartbeat call

// The remaining-budget fraction below which the agent consults the model. Read
// per call so it can be tuned (the model only chooses to throttle when remaining
// is genuinely low, so the window has to reach that zone). Default 0.2.
function lowBudgetFraction() {
  return Number(process.env.AGENT_LOW_BUDGET_FRACTION || 0.2);
}

const SYSTEM_PROMPT =
  "You are a budget-allocation agent for a pay-per-second media platform. The user " +
  "pre-authorized a small spending allowance for this session and wants to keep watching " +
  "as long as possible. Your job is to stretch the remaining budget. Strongly PREFER " +
  "THROTTLING to a lower per-second rate to slow the spend and keep the user watching; " +
  "continue at full rate only while the budget is comfortable; STOP only when the budget " +
  "is nearly exhausted, within a tick or two of zero. Throttling is almost always better " +
  "than stopping while budget remains. Reply with ONLY a json object, no prose and no " +
  "markdown fences.";

// Read at call time so tests and the demo can toggle it without a reload.
function agentReasoningEnabled() {
  return String(process.env.AGENT_REASONING).toLowerCase() === "true";
}

export class AgentPaymentProvider {
  async decide({ session, content, proposedAtomic, context = {} }) {
    const capAtomic = Number(session.allowance.capAtomic || 0);
    const spentAtomic = Number(session.allowance.spentAtomic || 0);

    // agentPolicy.budgetUsd is DOLLARS -> atomic ceiling, capped at the allowance.
    const policy = session.agentPolicy || {};
    const budgetCeilingAtomic =
      policy.enabled && Number(policy.budgetUsd) > 0
        ? Math.min(capAtomic, Number(toUsdcAtomic(policy.budgetUsd)))
        : capAtomic;
    const remaining = budgetCeilingAtomic - spentAtomic;

    // 1) Deterministic guards FIRST.
    if (remaining <= 0) {
      return this.record(session, { approve: false, stop: true, reason: "budget_exhausted" }, { remaining, action: "stop", source: "deterministic" });
    }
    if (proposedAtomic > remaining) {
      return this.record(session, { approve: false, stop: true, reason: "would_exceed_budget" }, { remaining, action: "stop", source: "deterministic" });
    }

    // allowance.ratePerSecondCapUsd is DOLLARS/sec -> atomic/sec.
    const rateCapUsd = Number(session.allowance.ratePerSecondCapUsd || 0);
    if (rateCapUsd > 0) {
      const rateCapAtomicPerSec = Number(toUsdcAtomic(rateCapUsd));
      const tickSeconds = Math.max(1, Number(context.tickSeconds) || 1);
      const maxThisTick = Math.floor(rateCapAtomicPerSec * tickSeconds);
      if (proposedAtomic > maxThisTick) {
        return this.record(
          session,
          { approve: maxThisTick > 0, drawAtomic: maxThisTick, stop: false, reason: "rate_throttled" },
          { remaining, action: "throttle", throttleRateAtomicPerSec: rateCapAtomicPerSec, source: "deterministic" }
        );
      }
    }

    // 2) Model ONLY on genuine judgment calls.
    if (agentReasoningEnabled() && this.shouldDeliberate({ session, context, remaining, budgetCeilingAtomic })) {
      return this.deliberateCached({ session, content, proposedAtomic, context, remaining });
    }

    return this.record(session, { approve: true, drawAtomic: proposedAtomic, stop: false, reason: "within_policy" }, { remaining, action: "continue", source: "deterministic" });
  }

  shouldDeliberate({ session, context = {}, remaining, budgetCeilingAtomic }) {
    const cap = Number(budgetCeilingAtomic ?? session.allowance.capAtomic ?? 0);
    const lowBudget = cap > 0 && remaining < cap * lowBudgetFraction();
    const moreQueued = Number(context.queueAhead || 0) > 0;
    return lowBudget && moreQueued;
  }

  // Cache the allocation strategy for a short window so we don't call the model
  // on every 5s heartbeat — re-evaluate on a budget-threshold crossing or timeout.
  async deliberateCached({ session, content, proposedAtomic, context, remaining }) {
    const prev = session.agentDecision;
    const cacheFresh =
      prev &&
      prev.decidedAt &&
      (prev.source === "deepseek" || prev.source === "cache") &&
      Date.now() - new Date(prev.decidedAt).getTime() < AGENT_CACHE_MS &&
      remaining >= Number(prev.remainingAtomicAtDecision || 0) * 0.5;

    let strategy;
    let source;
    if (cacheFresh) {
      strategy = { action: prev.action, throttleRateAtomicPerSec: Number(prev.throttleRateAtomicPerSec || 0), reason: prev.reason };
      source = "cache";
    } else {
      strategy = await this.deliberate({ session, content, proposedAtomic, context, remaining });
      source = strategy.fallback ? "fallback" : "deepseek";
    }

    const decision = this.applyStrategy(strategy, { proposedAtomic, context });
    return this.record(session, decision, {
      remaining,
      action: strategy.action,
      throttleRateAtomicPerSec: strategy.throttleRateAtomicPerSec,
      reason: strategy.reason,
      source,
    });
  }

  async deliberate({ session, content, proposedAtomic, context, remaining }) {
    const input = {
      remainingBudgetUsd: fromUsdcAtomic(remaining),
      proposedDrawUsd: fromUsdcAtomic(proposedAtomic),
      fractionConsumed: context.fractionComplete ?? null,
      queueAhead: Number(context.queueAhead || 0),
      contentTitle: content?.title || "current content",
    };
    try {
      const raw = await this.callDeepSeek(input);
      return this.normalizeStrategy(raw);
    } catch {
      // NEVER block billing: timeout / error / parse failure -> within policy.
      return { action: "continue", throttleRateAtomicPerSec: 0, reason: "model_unavailable_fallback", fallback: true };
    }
  }

  async callDeepSeek(input) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AGENT_TIMEOUT_MS);
    try {
      // json_object mode REQUIRES the word "json" + an example shape in the prompt,
      // otherwise DeepSeek can return an empty response.
      const userPrompt =
        `Session state (USD):\n` +
        `- remaining budget: $${input.remainingBudgetUsd}\n` +
        `- proposed draw this ~5s tick: $${input.proposedDrawUsd}\n` +
        `- fraction of "${input.contentTitle}" consumed: ${input.fractionConsumed ?? "unknown"}\n` +
        `- items queued after this: ${input.queueAhead}\n\n` +
        `Decide allocation. Return ONLY json of this exact shape:\n` +
        `{"action":"continue|throttle|stop","throttleRatePerSecondUsd":<number or null>,"reason":"<short>"}\n` +
        `Example: {"action":"throttle","throttleRatePerSecondUsd":0.001,"reason":"low budget, 2 items queued, conserve"}`;

      const res = await fetch(`${env.deepseekBaseUrl}/chat/completions`, {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.deepseekApiKey}` },
        body: JSON.stringify({
          model: DEEPSEEK_MODEL,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userPrompt },
          ],
          response_format: { type: "json_object" },
          temperature: 0,
          max_tokens: 160,
        }),
      });
      if (!res.ok) throw new Error(`deepseek http ${res.status}`);
      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content;
      if (!content) throw new Error("deepseek empty response");
      return JSON.parse(content);
    } finally {
      clearTimeout(timer);
    }
  }

  normalizeStrategy(raw) {
    const action = ["continue", "throttle", "stop"].includes(raw?.action) ? raw.action : "continue";
    let throttleRateAtomicPerSec = 0;
    if (action === "throttle") {
      const rateUsd = Number(raw?.throttleRatePerSecondUsd);
      throttleRateAtomicPerSec = Number.isFinite(rateUsd) && rateUsd > 0 ? Number(toUsdcAtomic(rateUsd)) : 0;
    }
    return { action, throttleRateAtomicPerSec, reason: String(raw?.reason || "deliberated").slice(0, 140), fallback: false };
  }

  applyStrategy(strategy, { proposedAtomic, context = {} }) {
    const reason = strategy.reason || "deliberated";
    if (strategy.action === "stop") {
      return { approve: false, stop: true, reason };
    }
    if (strategy.action === "throttle" && strategy.throttleRateAtomicPerSec > 0) {
      const tickSeconds = Math.max(1, Number(context.tickSeconds) || 1);
      const throttled = Math.min(proposedAtomic, Math.floor(strategy.throttleRateAtomicPerSec * tickSeconds));
      if (throttled <= 0) {
        return { approve: false, stop: true, reason };
      }
      return { approve: true, drawAtomic: throttled, stop: false, reason };
    }
    return { approve: true, drawAtomic: proposedAtomic, stop: false, reason };
  }

  // Legibility: stamp the decision onto the session (the meter persists it and
  // surfaces it in the heartbeat response).
  record(session, decision, meta = {}) {
    if (session) {
      session.agentDecision = {
        action: meta.action || (decision.stop ? "stop" : "continue"),
        reason: meta.reason || decision.reason || "",
        remainingAtomicAtDecision: Math.max(0, Math.round(Number(meta.remaining || 0))),
        throttleRateAtomicPerSec: Math.round(Number(meta.throttleRateAtomicPerSec || 0)),
        source: meta.source || "deterministic",
        decidedAt: new Date(),
      };
    }
    return decision;
  }
}

export const agentPaymentProvider = new AgentPaymentProvider();
