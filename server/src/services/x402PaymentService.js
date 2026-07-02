import { circleGatewayService } from "./circleGatewayService.js";

export class X402PaymentService {
  createPaymentRequirement({ userId, contentId, amount, reason, resourceUrl = "/api/content/unlock" }) {
    return circleGatewayService.createPaymentRequirements({
      amount,
      resourceUrl,
      description: `${reason} for content ${contentId} by user ${userId}`,
    });
  }

  parsePaymentHeader(paymentHeader) {
    if (!paymentHeader) {
      return null;
    }

    try {
      return JSON.parse(Buffer.from(paymentHeader, "base64").toString("utf8"));
    } catch {
      return null;
    }
  }

  async verifyNanopayment({ paymentHeader, amount, contentId, userId, reason, resourceUrl }) {
    const paymentRequirement = this.createPaymentRequirement({
      userId,
      contentId,
      amount,
      reason,
      resourceUrl,
    });
    const paymentPayload = this.parsePaymentHeader(paymentHeader);

    if (!paymentPayload) {
      return {
        ok: false,
        status: 402,
        paymentRequirement,
        error: "Missing or invalid PAYMENT-SIGNATURE header",
      };
    }

    const verification = await circleGatewayService.verifyPayment({
      paymentPayload,
      paymentRequirements: paymentRequirement,
    });

    return {
      ok: Boolean(verification.isValid),
      status: verification.isValid ? 200 : 402,
      paymentRequirement,
      paymentPayload,
      verification,
      error: verification.invalidReason || "",
    };
  }

  async settleUsageCharge({ userId, creatorId, contentId, amount, usageType, sessionId, paymentHeader }) {
    const verification = await this.verifyNanopayment({
      paymentHeader,
      amount,
      contentId,
      userId,
      reason: usageType,
      resourceUrl: usageType === "book_page" ? "/api/read/charge" : "/api/watch/charge",
    });

    if (!verification.ok) {
      return verification;
    }

    return {
      ok: true,
      creatorId,
      contentId,
      sessionId,
      amount,
      usageType,
      circlePaymentId: verification.verification.circlePaymentId,
      gatewayStatus: verification.verification.gatewayStatus,
      paymentProof: verification.paymentPayload,
      payer: verification.verification.payer,
    };
  }
}

export const x402PaymentService = new X402PaymentService();
