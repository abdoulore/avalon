/**
 * Part 1 verification: prove a LIVE DeepSeek deliberation returns "throttle" and
 * that the throttle flows into the bill. No DB — the agent decides on a plain
 * session object. Run: node src/scripts/verifyDeepSeekThrottle.js
 */
process.env.AGENT_REASONING = "true";

const { AgentPaymentProvider } = await import("../integrations/agentPaymentProvider.js");
const { fromUsdcAtomic } = await import("../services/circleGatewayService.js");

const agent = new AgentPaymentProvider();

// Contrived low-budget + queued session: $0.035 remaining of a $0.20 cap (17.5%,
// under the 20% threshold) with 3 items queued -> shouldDeliberate fires.
const session = {
  allowance: { capAtomic: 200_000, spentAtomic: 165_000, ratePerSecondCapUsd: 0 },
  agentPolicy: {},
  agentDecision: undefined,
};
const proposedAtomic = 20_000; // $0.02 proposed for this ~5s tick (a high rate)
const context = { tickSeconds: 5, queueAhead: 3, fractionComplete: 0.4 };

// Capture the raw DeepSeek response that flows through decide().
let raw;
const orig = agent.callDeepSeek.bind(agent);
agent.callDeepSeek = async (input) => {
  raw = await orig(input);
  return raw;
};

async function main() {
  console.log("=== Live DeepSeek throttle verification ===");
  console.log("DEEPSEEK_BASE_URL:", (await import("../config/env.js")).env.deepseekBaseUrl);
  console.log("shouldDeliberate:", agent.shouldDeliberate({ session, context, remaining: 35_000, budgetCeilingAtomic: 200_000 }));

  const decision = await agent.decide({ session, content: { title: "The Glass Library" }, proposedAtomic, context });

  console.log("\n--- RAW DeepSeek response ---");
  console.log(JSON.stringify(raw, null, 2));
  console.log("\n--- normalizeStrategy(raw) ---");
  console.log(JSON.stringify(agent.normalizeStrategy(raw), null, 2));
  console.log("\n--- decision ---");
  console.log(JSON.stringify(decision, null, 2));

  const billedAtomic = decision.drawAtomic ?? 0;
  console.log("\nproposed atomic:", proposedAtomic, "= $" + fromUsdcAtomic(proposedAtomic));
  console.log("billed atomic  :", billedAtomic, "= $" + fromUsdcAtomic(billedAtomic));
  console.log("throttled (billed < proposed)?", billedAtomic < proposedAtomic);
  console.log("\n--- session.agentDecision ---");
  console.log(JSON.stringify(session.agentDecision, null, 2));
}

main()
  .catch((err) => {
    console.error("\nVerify error:", err?.response?.data ?? err);
    process.exitCode = 1;
  })
  .finally(() => setTimeout(() => process.exit(process.exitCode ?? 0), 250));
