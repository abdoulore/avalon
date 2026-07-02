import { paymentAdapter, roundMoney } from "../payments/paymentAdapter.js";

const PLATFORM_FEE_RATE = 0.15;

export class PaymentService {
  async creditMockBalance({ userId, amountUsd, note }) {
    return paymentAdapter.creditMockBalance({ userId, amountUsd, note });
  }

  calculateSplit(amountUsd) {
    const grossAmountUsd = roundMoney(amountUsd);
    const platformFeeUsd = roundMoney(grossAmountUsd * PLATFORM_FEE_RATE);
    const creatorPayoutUsd = roundMoney(grossAmountUsd - platformFeeUsd);

    return {
      grossAmountUsd,
      platformFeeUsd,
      creatorPayoutUsd,
      platformFeeRate: PLATFORM_FEE_RATE,
    };
  }
}

export const paymentService = new PaymentService();
