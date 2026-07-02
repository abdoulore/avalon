import { Ledger } from "../models/Ledger.js";
import { paymentMode } from "../payments/paymentMode.js";

export class LedgerService {
  async recordMicrocharge({
    userId,
    creatorId,
    creatorName,
    contentId,
    sessionId,
    amount,
    platformFee,
    creatorShare,
    usageType,
    circlePaymentId = "",
    gatewayStatus = "mock",
    paymentProof = {},
    reason,
  }) {
    return Ledger.create({
      userId,
      mode: paymentMode.name,
      creatorId,
      creatorName,
      contentId,
      sessionId,
      amount,
      platformFee,
      creatorShare,
      usageType,
      circlePaymentId,
      gatewayStatus,
      paymentProof,
      reason,
    });
  }

  // ONE ledger row per settlement batch (not per tick). Records the atomic
  // amount settled, how many draws were folded in, and the Gateway batch ref —
  // enough to reconcile a batch against the per-tick draws behind it.
  async recordSettlementBatch({
    userId,
    creatorId,
    creatorName,
    contentId,
    sessionId,
    amountUsd,
    amountAtomic,
    platformFee,
    creatorShare,
    drawCount,
    batchRef,
    gatewayStatus = "mock_settled",
    paymentProof = {},
  }) {
    return Ledger.create({
      userId,
      mode: paymentMode.name,
      creatorId,
      creatorName,
      contentId,
      sessionId,
      amount: amountUsd,
      amountAtomic,
      platformFee,
      creatorShare,
      usageType: "settlement_batch",
      drawCount,
      batchRef,
      circlePaymentId: batchRef,
      gatewayStatus,
      paymentProof,
      reason: `Batched settlement of ${drawCount} draw${drawCount === 1 ? "" : "s"}`,
    });
  }

  // All reads are scoped to the active mode so the mock and circle ledgers stay
  // fully separate views, never a blended history.
  getUserHistory(userId) {
    return Ledger.find({ userId, mode: paymentMode.name }).populate("contentId").sort({ timestamp: -1 }).limit(100);
  }

  // The real settlement history: ONE row per batch, with the Gateway tx ref and
  // status. Written in both modes (circle: on-chain; mock: mock_settled), so this
  // is the canonical "what actually settled" view for the dashboard.
  getUserSettlements(userId) {
    return Ledger.find({ userId, mode: paymentMode.name, usageType: "settlement_batch" })
      .populate("contentId")
      .sort({ timestamp: -1 })
      .limit(50);
  }

  // Every settlement batch for the user, newest first — the full "recorded
  // on-chain" history (circle: real Arc tx hashes; mock: simulated refs). Returns
  // the signed proof (from/to/nonce) so the UI can show payer -> recipient.
  getAllSettlements(userId, limit = 200) {
    return Ledger.find({ userId, mode: paymentMode.name, usageType: "settlement_batch" })
      .populate("contentId")
      .sort({ timestamp: -1 })
      .limit(limit);
  }

  countSettlements(userId) {
    return Ledger.countDocuments({ userId, mode: paymentMode.name, usageType: "settlement_batch" });
  }

  getCreatorHistory(creatorId) {
    const filter = { mode: paymentMode.name };
    if (creatorId) filter.creatorId = creatorId;
    return Ledger.find(filter).populate("contentId").sort({ timestamp: -1 }).limit(100);
  }

  getPlatformRevenueHistory() {
    return Ledger.find({ mode: paymentMode.name, platformFee: { $gt: 0 } }).populate("contentId").sort({ timestamp: -1 }).limit(100);
  }
}

export const ledgerService = new LedgerService();
