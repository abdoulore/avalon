/**
 * Experiment: drive the real meter with the model consulted on EVERY tick (cache
 * off) from a high remaining fraction, to see DeepSeek's actual decision at each
 * budget level and find the band where it throttles vs stops.
 * Run: node src/scripts/verifyThrottleArc.js
 */
// Match the demo config exactly (cap $0.06, fraction 0.7, 15s cache).
process.env.AGENT_REASONING = "true";
process.env.SESSION_CAP_ATOMIC = "60000"; // $0.06
process.env.AGENT_LOW_BUDGET_FRACTION = "0.7";
process.env.AGENT_CACHE_MS = "15000";
process.env.PAYMENT_MODE = "mock";

const { connectDatabase } = await import("../config/database.js");
const { Content } = await import("../models/Content.js");
const { User } = await import("../models/User.js");
const { UsageSession } = await import("../models/UsageSession.js");
const { GatewayPool } = await import("../models/GatewayPool.js");
const { Ledger } = await import("../models/Ledger.js");
const { meterService } = await import("../services/meterService.js");

async function main() {
  await connectDatabase();
  const content = await Content.findOne({ title: "Founders at Midnight" });
  const user = await User.create({ name: "Throttle Verify", email: `throttle-verify-${Date.now()}@avalon.test`, balanceUsd: 1, currency: "USDC" });
  const session = await UsageSession.create({ userId: user._id, contentId: content._id, contentType: "video", status: "active" });
  console.log(`cap $0.06, rate $${content.pricePerSecondUsd}/s, fraction 0.95, cache off - model decides every 5s tick\n`);

  for (let i = 1; i <= 14; i += 1) {
    await UsageSession.findByIdAndUpdate(session._id, { lastHeartbeatAt: new Date(Date.now() - 5200) });
    try {
      const r = await meterService.processHeartbeat({ sessionId: session._id, state: "active" });
      const s = r.usageSession;
      const remaining = s.allowance.capAtomic - s.allowance.spentAtomic;
      const d = s.agentDecision || {};
      console.log(
        `tick ${String(i).padStart(2)}: left $${(remaining / 1e6).toFixed(4)}  | ${(d.action || "-").padEnd(8)} (${(d.source || "-").padEnd(12)}) ${d.reason ? `"${d.reason}"` : ""}`
      );
    } catch (err) {
      const s = await UsageSession.findById(session._id);
      const d = s.agentDecision || {};
      console.log(`tick ${String(i).padStart(2)}: EXHAUSTED - last: ${d.action} (${d.source}) "${d.reason || ""}"`);
      break;
    }
  }

  await Promise.all([UsageSession.deleteMany({ userId: user._id }), GatewayPool.deleteMany({ userId: user._id }), Ledger.deleteMany({ userId: user._id })]);
  await User.deleteOne({ _id: user._id });
}

main()
  .catch((err) => {
    console.error("verify error:", err?.response?.data ?? err);
    process.exitCode = 1;
  })
  .finally(() => setTimeout(() => process.exit(process.exitCode ?? 0), 300));
