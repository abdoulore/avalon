import { UsageSession } from "../models/UsageSession.js";
import { User } from "../models/User.js";
import { paymentMode } from "../payments/paymentMode.js";
import { fromUsdcAtomic } from "../services/circleGatewayService.js";
import { settlementService } from "../services/settlementService.js";
import { reservationService } from "../services/reservationService.js";

// Billing happens on the socket spine (session:start / usage:heartbeat /
// usage:page -> meterService). This controller only closes a session.
export async function completeUsageSession(req, res) {
  const usageSession = await UsageSession.findByIdAndUpdate(
    req.params.id,
    { status: "completed", endedAt: new Date() },
    { new: true }
  ).populate("contentId");

  if (!usageSession) {
    return res.status(404).json({ error: "Usage session not found" });
  }

  // Final flush settles pending (so spent reflects everything settled), THEN
  // release the unused Gateway reservation (cap - spent) back to the pool. Order
  // matters; release is idempotent so a later disconnect release is a no-op.
  await settlementService.flush({ sessionId: usageSession._id, content: usageSession.contentId });
  await reservationService.releaseSession({ sessionId: usageSession._id });

  const settledSession = await UsageSession.findById(usageSession._id).populate("contentId");
  const user = await User.findById(usageSession.userId);
  res.json({
    usageSession: settledSession,
    receipt: buildReceipt({ usageSession: settledSession, user }),
  });
}

function buildReceipt({ usageSession, user }) {
  const content = usageSession.contentId;
  const settlement = usageSession.settlement || {};
  return {
    contentTitle: content?.title || "Untitled",
    contentType: usageSession.contentType,
    secondsWatched: usageSession.secondsWatched,
    pagesRead: usageSession.pagesRead,
    totalChargedUsd: usageSession.amountChargedUsd || usageSession.totalChargedUsd,
    creatorEarnedUsd: usageSession.totalCreatorPayoutUsd,
    platformFeeUsd: usageSession.totalPlatformFeeUsd,
    // Mode-specific proof: mock shows the remaining local balance; circle shows
    // the on-chain settlement (amount settled + Gateway tx refs).
    mode: usageSession.mode || paymentMode.name,
    network: paymentMode.network,
    remainingUserBalanceUsd: user?.balanceUsd ?? 0,
    settledUsd: fromUsdcAtomic(settlement.settledAtomic || 0),
    batchRefs: settlement.batchRefs || [],
  };
}
