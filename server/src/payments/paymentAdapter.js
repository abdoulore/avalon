import { LedgerEntry } from "../models/LedgerEntry.js";
import { User } from "../models/User.js";

export class MockPaymentAdapter {
  async chargeUsage({
    userId,
    sessionId,
    contentId,
    amountUsd,
    platformFeeUsd = 0,
    creatorPayoutUsd = 0,
    creatorId = "",
    creatorName = "",
    note,
  }) {
    if (amountUsd <= 0) {
      return null;
    }

    const user = await User.findOneAndUpdate(
      { _id: userId, balanceUsd: { $gte: amountUsd } },
      { $inc: { balanceUsd: -amountUsd } },
      { new: true }
    );

    if (!user) {
      const existingUser = await User.findById(userId);
      const error = new Error(existingUser ? "Insufficient balance" : "User not found");
      error.status = existingUser ? 402 : 404;
      throw error;
    }

    user.balanceUsd = roundMoney(user.balanceUsd);
    await user.save();

    return LedgerEntry.create({
      userId,
      mode: "mock", // MockPaymentAdapter only ever runs in mock mode
      sessionId,
      contentId,
      type: "usage_debit",
      amountUsd: roundMoney(-amountUsd),
      grossAmountUsd: roundMoney(amountUsd),
      platformFeeUsd: roundMoney(platformFeeUsd),
      creatorPayoutUsd: roundMoney(creatorPayoutUsd),
      creatorId,
      creatorName,
      balanceAfterUsd: user.balanceUsd,
      note,
    });
  }

  async creditMockBalance({ userId, amountUsd, note = "Mock top-up" }) {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error("User not found");
    }

    user.balanceUsd = roundMoney(user.balanceUsd + amountUsd);
    await user.save();

    return LedgerEntry.create({
      userId,
      mode: "mock", // MockPaymentAdapter only ever runs in mock mode
      type: "credit",
      amountUsd: roundMoney(amountUsd),
      balanceAfterUsd: user.balanceUsd,
      note,
    });
  }
}

export function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 1_000_000) / 1_000_000;
}

export const paymentAdapter = new MockPaymentAdapter();
