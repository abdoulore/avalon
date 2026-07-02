import { paymentAdapter, roundMoney } from "../payments/paymentAdapter.js";

const PLATFORM_FEE_RATE = 0.15;

export class PaymentService {
  async chargeUsage({ userId, creatorId, contentId, sessionId, content, amount, amountUsd, reason, note }) {
    const chargeAmount = amount ?? amountUsd;
    const split = this.calculateSplit(chargeAmount);
    if (split.grossAmountUsd <= 0) {
      return { ledgerEntry: null, split };
    }

    const resolvedContentId = contentId ?? content?._id;
    const resolvedCreatorId = creatorId ?? content?.creatorId ?? "";
    const resolvedCreatorName = content?.creatorName ?? "";
    const resolvedReason = reason ?? "usage";

    const ledgerEntry = await paymentAdapter.chargeUsage({
      userId,
      sessionId,
      contentId: resolvedContentId,
      amountUsd: split.grossAmountUsd,
      platformFeeUsd: split.platformFeeUsd,
      creatorPayoutUsd: split.creatorPayoutUsd,
      creatorId: resolvedCreatorId,
      creatorName: resolvedCreatorName,
      note: note || resolvedReason,
    });

    return { ledgerEntry, split };
  }

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
