import { Content } from "../models/Content.js";
import { UsageSession } from "../models/UsageSession.js";
import { isCircle } from "../payments/paymentMode.js";
import { roundMoney } from "../payments/paymentAdapter.js";
import { billingService } from "../services/billingService.js";
import { meterService } from "../services/meterService.js";
import { sessionService } from "../services/sessionService.js";
import { x402PaymentService } from "../services/x402PaymentService.js";
import { ensureDemoUser } from "./userController.js";

export async function unlockContent(req, res) {
  const user = await ensureDemoUser();
  const { content, usageSession } = await sessionService.startOrResume({
    userId: user._id,
    contentId: req.body.contentId,
  });

  const minimumCharge = content.type === "video" ? content.pricePerSecondUsd : content.pricePerPageUsd;
  if (isCircle && minimumCharge > 0) {
    const verification = await x402PaymentService.verifyNanopayment({
      paymentHeader: req.header("PAYMENT-SIGNATURE"),
      amount: minimumCharge,
      contentId: content._id,
      userId: user._id,
      reason: "content_unlock",
      resourceUrl: "/api/content/unlock",
    });

    if (!verification.ok) {
      const error = new Error(verification.error || "Payment required");
      error.status = 402;
      error.paymentRequirement = verification.paymentRequirement;
      throw error;
    }

    res.set("PAYMENT-RESPONSE", Buffer.from(JSON.stringify({ verified: true })).toString("base64"));
  }

  res.json({ ok: true, contentId: content._id, session: usageSession });
}

export async function chargeWatch(req, res) {
  const usageSession = await UsageSession.findById(req.body.sessionId);
  if (!usageSession) {
    return res.status(404).json({ error: "Session not found" });
  }
  const content = await Content.findById(usageSession.contentId);
  const seconds = Math.max(0, Math.floor(Number(req.body.secondsWatched || 0)));
  const amount = roundMoney(seconds * Number(content.liveEventPricePerSecondUsd || content.pricePerSecondUsd || 0));

  const billing = await billingService.charge({
    userId: usageSession.userId,
    sessionId: usageSession._id,
    content,
    amount,
    usageType: "video_second",
    paymentHeader: req.header("PAYMENT-SIGNATURE"),
    reason: `${seconds}s watch charge`,
  });

  usageSession.secondsWatched += seconds;
  usageSession.totalChargedUsd = roundMoney(usageSession.totalChargedUsd + amount);
  usageSession.amountChargedUsd = usageSession.totalChargedUsd;
  usageSession.totalPlatformFeeUsd = roundMoney(usageSession.totalPlatformFeeUsd + billing.split.platformFeeUsd);
  usageSession.totalCreatorPayoutUsd = roundMoney(usageSession.totalCreatorPayoutUsd + billing.split.creatorPayoutUsd);
  await usageSession.save();

  res.set("PAYMENT-RESPONSE", Buffer.from(JSON.stringify({ verified: true })).toString("base64"));
  res.json({ ok: true, usageSession, balanceUsd: billing.user?.balanceUsd });
}

export async function chargeRead(req, res) {
  const usageSession = await UsageSession.findById(req.body.sessionId);
  if (!usageSession) {
    return res.status(404).json({ error: "Session not found" });
  }
  const content = await Content.findById(usageSession.contentId);
  const page = Number(req.body.page);
  const amount = page > Number(content.freePreviewPages || 0) ? Number(content.pricePerPageUsd || 0) : 0;

  const billing = await billingService.charge({
    userId: usageSession.userId,
    sessionId: usageSession._id,
    content,
    amount,
    usageType: "book_page",
    paymentHeader: req.header("PAYMENT-SIGNATURE"),
    reason: `Page ${page} unlock`,
  });

  usageSession.pagesRead += 1;
  usageSession.totalChargedUsd = roundMoney(usageSession.totalChargedUsd + amount);
  usageSession.amountChargedUsd = usageSession.totalChargedUsd;
  usageSession.totalPlatformFeeUsd = roundMoney(usageSession.totalPlatformFeeUsd + billing.split.platformFeeUsd);
  usageSession.totalCreatorPayoutUsd = roundMoney(usageSession.totalCreatorPayoutUsd + billing.split.creatorPayoutUsd);
  await usageSession.save();

  res.set("PAYMENT-RESPONSE", Buffer.from(JSON.stringify({ verified: true })).toString("base64"));
  res.json({ ok: true, usageSession, balanceUsd: billing.user?.balanceUsd });
}

export async function chargeHeartbeat(req, res) {
  const result = await meterService.processHeartbeat({
    sessionId: req.body.sessionId,
    state: req.body.state || "active",
    paymentHeader: req.header("PAYMENT-SIGNATURE"),
  });

  res.set("PAYMENT-RESPONSE", Buffer.from(JSON.stringify({ verified: true })).toString("base64"));
  res.json({
    ok: true,
    session: result.usageSession,
    chargeAmount: result.chargeAmount,
    balanceUsd: result.user?.balanceUsd,
  });
}
