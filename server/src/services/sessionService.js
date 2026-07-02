import { Content } from "../models/Content.js";
import { UsageSession } from "../models/UsageSession.js";
import { User } from "../models/User.js";
import { paymentMode } from "../payments/paymentMode.js";
import { settlementService } from "./settlementService.js";

export class SessionService {
  async startOrResume({ userId, contentId, capAtomic = 0 }) {
    const requestedCapAtomic = Math.max(0, Math.round(Number(capAtomic) || 0));
    const [user, content] = await Promise.all([
      User.findById(userId),
      Content.findById(contentId),
    ]);

    if (!user) {
      const error = new Error("User not found");
      error.status = 404;
      throw error;
    }
    if (!content) {
      const error = new Error("Content not found");
      error.status = 404;
      throw error;
    }

    // Only the mock economy gates on the local balance. In circle mode funding is
    // the on-chain Gateway reserve, checked atomically when the meter authorizes.
    const minimumCharge = content.type === "video" ? content.pricePerSecondUsd : content.pricePerPageUsd;
    if (paymentMode.requiresLocalBalance && minimumCharge > 0 && user.balanceUsd < minimumCharge) {
      const error = new Error("Insufficient balance. Please top up.");
      error.status = 402;
      throw error;
    }

    // Scoped to the active economy: a session from the other mode must never be
    // resumed (its charges and settlement belong to a different ledger).
    let usageSession = await UsageSession.findOne({
      userId,
      contentId,
      status: "active",
      mode: paymentMode.name,
    });

    // A session whose reservation was released (disconnect backstop) is no longer
    // backed by pool funds — resuming it would let the allowance draw money the
    // pool has already handed back. Settle what it accrued, close it, start fresh.
    if (usageSession?.allowance?.reservationReleased) {
      try {
        await settlementService.flush({ sessionId: usageSession._id, content });
      } catch {
        // best-effort: an ambiguous flush keeps its in-flight for a later retry
      }
      await UsageSession.updateOne(
        { _id: usageSession._id },
        { $set: { status: "completed", endedAt: new Date(), activityState: "left" } }
      );
      usageSession = null;
    }

    if (!usageSession) {
      usageSession = await UsageSession.create({
        userId,
        contentId,
        contentType: content.type,
        activityState: "idle",
        mode: paymentMode.name,
        allowance: { requestedCapAtomic },
      });
    } else if (requestedCapAtomic > 0 && usageSession.allowance?.status === "none") {
      // Not yet authorized: honor a freshly chosen cap on resume.
      usageSession.allowance.requestedCapAtomic = requestedCapAtomic;
      await usageSession.save();
    }

    return { user, content, usageSession };
  }

  async markActivity({ sessionId, state }) {
    return UsageSession.findByIdAndUpdate(
      sessionId,
      {
        activityState: state,
        lastHeartbeatAt: new Date(),
      },
      { new: true }
    );
  }
}

export const sessionService = new SessionService();
