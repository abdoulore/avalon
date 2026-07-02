import crypto from "crypto";
import { Content } from "../models/Content.js";
import { UsageSession } from "../models/UsageSession.js";
import { fromUsdcAtomic } from "./circleGatewayService.js";
import { paymentMode } from "../payments/paymentMode.js";
import { ledgerService } from "./ledgerService.js";
import { paymentService } from "./paymentService.js";
import { reservationService } from "./reservationService.js";

/**
 * Batched settlement of allowance draws, ordered claim -> sign -> settle ->
 * finalize. The accounting moves through three states:
 *
 *   settledAtomic + inFlight.amountAtomic + pendingAtomic === allowance.spentAtomic   (always)
 *
 * - claim: atomically move pendingAtomic -> inFlight, generating a STABLE nonce.
 * - sign + settle the in-flight amount with that nonce.
 * - finalize: inFlight -> settledAtomic, write ONE ledger row with the tx ref.
 * - clean failure (definitely not settled): inFlight -> pendingAtomic, no ledger.
 * - ambiguous (lost response): leave inFlight intact; the retry replays the SAME
 *   nonce, so Gateway rejects the duplicate instead of double-settling.
 */
const DEFAULT_THRESHOLD_ATOMIC = 50_000; // $0.05
const DEFAULT_INTERVAL_MS = 60_000;

function flushThresholdAtomic() {
  return Number(process.env.SETTLEMENT_FLUSH_THRESHOLD_ATOMIC ?? DEFAULT_THRESHOLD_ATOMIC);
}
function flushIntervalMs() {
  return Number(process.env.SETTLEMENT_FLUSH_INTERVAL_MS ?? DEFAULT_INTERVAL_MS);
}
const EMPTY_INFLIGHT = { amountAtomic: 0, draws: 0, nonce: "", claimedAt: null };

export class SettlementService {
  constructor() {
    // Mock-mode idempotency: models Gateway's nonce de-duplication so a replayed
    // nonce returns "already settled" instead of decrementing the balance twice.
    this._mockSettledNonces = new Map();
  }

  async maybeFlush({ sessionId, content }) {
    const session = await UsageSession.findById(sessionId).select("settlement");
    if (!session) return null;
    const pending = session.settlement.pendingAtomic;
    const inFlight = session.settlement.inFlight?.amountAtomic || 0;
    if (pending <= 0 && inFlight <= 0) return null;

    const last = session.settlement.lastBatchAt;
    const due =
      inFlight > 0 || // a stuck in-flight always retries
      pending >= flushThresholdAtomic() ||
      (last && Date.now() - last.getTime() >= flushIntervalMs());
    if (!due) return null;
    return this.flush({ sessionId, content });
  }

  // Settle one batch (existing in-flight, else freshly claimed pending). Safe to
  // call any time; a no-op when there is nothing pending or in-flight.
  async flush({ sessionId, content }) {
    const session = await UsageSession.findById(sessionId);
    if (!session) return null;

    let batch;
    if ((session.settlement.inFlight?.amountAtomic || 0) > 0) {
      const f = session.settlement.inFlight;
      batch = { amountAtomic: f.amountAtomic, draws: f.draws, nonce: f.nonce }; // retry: SAME nonce
    } else {
      batch = await this.claim({ sessionId });
      if (!batch) return null;
    }

    const resolvedContent = content || (await Content.findById(session.contentId));

    let settlement;
    try {
      settlement = await this.settle({ session, content: resolvedContent, ...batch });
    } catch (err) {
      // AMBIGUOUS (lost response / network): keep the in-flight + its nonce for a
      // same-nonce retry. Do NOT return to pending — that would risk double-settle.
      return { ok: false, reason: "ambiguous", error: err.message };
    }

    if (!settlement.ok && !settlement.duplicate) {
      // CLEAN failure: definitely not settled -> return the claim to pending.
      await this.returnToPending({ sessionId, batch });
      return { ok: false, reason: settlement.reason };
    }

    // SUCCESS (settled now) or DUPLICATE (already settled on a prior attempt).
    return this.finalize({ sessionId, batch, settlement, content: resolvedContent });
  }

  // Atomically move pendingAtomic -> inFlight and stamp a stable nonce. Returns
  // null if nothing is claimable (no pending, or an in-flight already exists).
  async claim({ sessionId }) {
    const nonce = `0x${crypto.randomBytes(32).toString("hex")}`;
    const before = await UsageSession.findOneAndUpdate(
      {
        _id: sessionId,
        "settlement.pendingAtomic": { $gt: 0 },
        "settlement.inFlight.amountAtomic": { $in: [0, null] },
      },
      [
        {
          $set: {
            "settlement.inFlight.amountAtomic": "$settlement.pendingAtomic",
            "settlement.inFlight.draws": {
              $subtract: [
                {
                  $size: {
                    $filter: {
                      input: { $ifNull: ["$events", []] },
                      as: "e",
                      cond: { $eq: ["$$e.metadata.source", "allowance-draw"] },
                    },
                  },
                },
                "$settlement.settledDraws",
              ],
            },
            "settlement.inFlight.nonce": nonce,
            "settlement.inFlight.claimedAt": "$$NOW",
            "settlement.pendingAtomic": 0,
          },
        },
      ],
      { new: false }
    );
    if (!before) return null;

    const totalDraws = (before.events || []).filter((e) => e?.metadata?.source === "allowance-draw").length;
    const draws = Math.max(0, totalDraws - (before.settlement.settledDraws || 0));
    return { amountAtomic: before.settlement.pendingAtomic, draws, nonce };
  }

  // inFlight -> settledAtomic + ONE ledger row. Guarded by the batch nonce so
  // concurrent finalizes (e.g. two flushes that both idempotently settled) write
  // exactly one ledger row and increment settledAtomic exactly once.
  async finalize({ sessionId, batch, settlement, content }) {
    const updated = await UsageSession.findOneAndUpdate(
      {
        _id: sessionId,
        "settlement.inFlight.nonce": batch.nonce,
        "settlement.inFlight.amountAtomic": batch.amountAtomic,
      },
      {
        $inc: {
          "settlement.settledAtomic": batch.amountAtomic,
          "settlement.settledDraws": batch.draws,
        },
        $set: { "settlement.inFlight": EMPTY_INFLIGHT, "settlement.lastBatchAt": new Date() },
        $push: { "settlement.batchRefs": settlement.batchRef },
      },
      { new: true }
    );
    if (!updated) {
      return { ok: true, alreadyFinalized: true }; // another flush finalized it
    }

    const amountUsd = fromUsdcAtomic(batch.amountAtomic);
    const split = paymentService.calculateSplit(amountUsd);
    const ledger = await ledgerService.recordSettlementBatch({
      userId: updated.userId,
      creatorId: content?.creatorId || "",
      creatorName: content?.creatorName || "",
      contentId: updated.contentId,
      sessionId,
      amountUsd,
      amountAtomic: batch.amountAtomic,
      platformFee: split.platformFeeUsd,
      creatorShare: split.creatorPayoutUsd,
      drawCount: batch.draws,
      batchRef: settlement.batchRef,
      gatewayStatus: settlement.gatewayStatus || (settlement.duplicate ? "settled_replay" : "settled"),
      paymentProof: settlement.paymentProof || {},
    });

    // Settled funds leave the Gateway pool: reserved -> spent (best-effort; a
    // session that authorized without a pool — e.g. a direct script — is a no-op).
    await reservationService.settleConvert({
      key: reservationService.poolKeyFor(updated.userId),
      amountAtomic: batch.amountAtomic,
    });

    return {
      ok: true,
      settledAtomic: batch.amountAtomic,
      drawCount: batch.draws,
      batchRef: settlement.batchRef,
      ledgerId: ledger?._id,
    };
  }

  // Clean-failure rollback: inFlight -> pendingAtomic. Guarded by nonce so it
  // only reverses this batch. A later flush re-claims with a fresh nonce.
  async returnToPending({ sessionId, batch }) {
    await UsageSession.updateOne(
      { _id: sessionId, "settlement.inFlight.nonce": batch.nonce },
      {
        $inc: { "settlement.pendingAtomic": batch.amountAtomic },
        $set: { "settlement.inFlight": EMPTY_INFLIGHT },
      }
    );
  }

  // External settle of one claimed batch (amount + STABLE nonce), delegated to the
  // active payment mode. Mock decrements the local balance (idempotent via the
  // nonce map below); circle signs + settles on-chain with no fallback. The two
  // never cross. The mock nonce map lives here so a replayed claim is de-duped.
  async settle({ session, content, amountAtomic, nonce }) {
    return paymentMode.settleBatch({
      session,
      amountAtomic,
      nonce,
      mockSettledNonces: this._mockSettledNonces,
    });
  }
}

export const settlementService = new SettlementService();
