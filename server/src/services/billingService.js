import { User } from "../models/User.js";
import { isCircle } from "../payments/paymentMode.js";
import { paymentService } from "./paymentService.js";
import { ledgerService } from "./ledgerService.js";
import { x402PaymentService } from "./x402PaymentService.js";

export class BillingService {
  async charge({ userId, sessionId, content, amount, usageType, reason, paymentHeader }) {
    if (amount <= 0) {
      const user = await User.findById(userId);
      return { charged: false, user, split: paymentService.calculateSplit(0), ledger: null };
    }

    const split = paymentService.calculateSplit(amount);
    let user = await User.findById(userId);
    let circlePaymentId = "";
    let gatewayStatus = "mock";
    let paymentProof = {};

    if (isCircle) {
      const settlement = await x402PaymentService.settleUsageCharge({
        userId,
        creatorId: content.creatorId,
        contentId: content._id,
        amount,
        usageType,
        sessionId,
        paymentHeader,
      });

      if (!settlement.ok) {
        const error = new Error(settlement.error || "Payment required");
        error.status = 402;
        error.paymentRequirement = settlement.paymentRequirement;
        throw error;
      }

      circlePaymentId = settlement.circlePaymentId;
      gatewayStatus = settlement.gatewayStatus;
      paymentProof = settlement.paymentProof;
    } else {
      const result = await paymentService.chargeUsage({
        userId,
        creatorId: content.creatorId,
        contentId: content._id,
        sessionId,
        content,
        amount,
        reason,
      });
      user = await User.findById(userId);
      circlePaymentId = result.ledger?._id ? String(result.ledger._id) : "";
    }

    const ledger = await ledgerService.recordMicrocharge({
      userId,
      creatorId: content.creatorId,
      creatorName: content.creatorName,
      contentId: content._id,
      sessionId,
      amount: split.grossAmountUsd,
      platformFee: split.platformFeeUsd,
      creatorShare: split.creatorPayoutUsd,
      usageType,
      circlePaymentId,
      gatewayStatus,
      paymentProof,
      reason,
    });

    return { charged: true, user, split, ledger };
  }
}

export const billingService = new BillingService();
