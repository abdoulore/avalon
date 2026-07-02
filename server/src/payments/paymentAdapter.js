import { LedgerEntry } from "../models/LedgerEntry.js";
import { User } from "../models/User.js";

// Mock-mode local balance credit (top-up). Usage DEBITS run through the
// allowance spine (meterService -> allowanceService -> settlement), never here.
export class MockPaymentAdapter {
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
