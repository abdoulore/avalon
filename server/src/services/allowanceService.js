import { UsageSession } from "../models/UsageSession.js";
import { roundMoney } from "../payments/paymentAdapter.js";

/**
 * Owns streaming-allowance drawdown accounting. This replaces per-heartbeat
 * signature verification with an atomic balance check against a pre-authorized
 * cap. The user signs ONCE at session start (allowanceService.authorize); every
 * heartbeat thereafter draws against the cap as pure off-chain accounting.
 *
 * UNITS: all allowance/settlement amounts in and out of this service are INTEGER
 * ATOMIC USDC units (6 dp): $1.00 === 1_000_000. Keeping draw() in integer math
 * makes the $inc/$expr guard exact and drift-free on a real-money ceiling, and
 * matches how Gateway denominates at settlement. Callers convert dollars ->
 * atomic at the edge (reuse toUsdcAtomic from circleGatewayService.js); the API
 * layer converts atomic -> display dollars on the way out.
 *
 * The race-safety is the same trick MockPaymentAdapter.chargeUsage uses for
 * balanceUsd: a single findOneAndUpdate whose query guards the invariant, so
 * MongoDB's per-document atomicity serializes concurrent draws. There is no
 * read-then-write window for two heartbeats to overspend the cap.
 */
export class AllowanceService {
  // Called once at session start, after the user authorizes/deposits.
  // capAtomic is integer atomic USDC units.
  async authorize({ sessionId, capAtomic, ratePerSecondCapUsd = 0, authRef = "" }) {
    return UsageSession.findByIdAndUpdate(
      sessionId,
      {
        "allowance.capAtomic": Math.round(Number(capAtomic) || 0),
        // ratePerSecondCapUsd is still a dollar rate (not on the draw hot path);
        // step 5 should reconcile it to atomic when the agent compares rates.
        "allowance.ratePerSecondCapUsd": roundMoney(ratePerSecondCapUsd),
        "allowance.authRef": authRef,
        "allowance.status": "authorized",
      },
      { new: true }
    );
  }

  // Atomic drawdown in integer atomic units. Succeeds only if the remaining
  // allowance covers `amountAtomic`. The $expr guard (spent + amt <= cap) is
  // evaluated by MongoDB inside the same atomic match+update as the $inc,
  // mirroring the balanceUsd $gte guard in paymentAdapter.chargeUsage.
  async draw({ sessionId, amountAtomic }) {
    const amt = Math.round(Number(amountAtomic) || 0);
    if (amt <= 0) {
      return { ok: true, drawn: 0 };
    }

    const session = await UsageSession.findOneAndUpdate(
      {
        _id: sessionId,
        "allowance.status": "authorized",
        $expr: { $lte: [{ $add: ["$allowance.spentAtomic", amt] }, "$allowance.capAtomic"] },
      },
      {
        $inc: { "allowance.spentAtomic": amt, "settlement.pendingAtomic": amt },
      },
      { new: true }
    );

    if (session) {
      return { ok: true, drawn: amt, session };
    }

    // Guard missed. One read on this cold path to distinguish "never authorized"
    // from "cap reached": we must NOT mark a never-authorized session exhausted,
    // and for a real exhaustion we report the honest stranded remainder so the
    // client's extend prompt is accurate.
    const current = await UsageSession.findById(sessionId).select(
      "allowance.status allowance.capAtomic allowance.spentAtomic"
    );

    if (!current || current.allowance.status === "none") {
      return { ok: false, reason: "not_authorized" };
    }

    // Authorized but this draw would exceed the cap -> exhaust + signal re-auth.
    await UsageSession.updateOne(
      { _id: sessionId, "allowance.status": "authorized" },
      { "allowance.status": "exhausted" }
    );

    const remainingAtomic = Math.max(0, current.allowance.capAtomic - current.allowance.spentAtomic);
    return { ok: false, reason: "allowance_exhausted", remainingAtomic };
  }
}

export const allowanceService = new AllowanceService();
