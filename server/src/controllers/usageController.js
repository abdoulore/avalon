import { Content } from "../models/Content.js";
import { UsageSession } from "../models/UsageSession.js";
import { User } from "../models/User.js";
import { roundMoney } from "../payments/paymentAdapter.js";
import { paymentMode } from "../payments/paymentMode.js";
import { fromUsdcAtomic } from "../services/circleGatewayService.js";
import { billingService } from "../services/billingService.js";
import { paymentService } from "../services/paymentService.js";
import { sessionService } from "../services/sessionService.js";
import { settlementService } from "../services/settlementService.js";
import { reservationService } from "../services/reservationService.js";
import { ensureDemoUser } from "./userController.js";

export async function startUsageSession(req, res) {
  const user = await ensureDemoUser();
  const { usageSession } = await sessionService.startOrResume({
    userId: user._id,
    contentId: req.body.contentId,
  });

  res.status(201).json({ usageSession });
}

export async function recordUsage(req, res) {
  const usageSession = await UsageSession.findById(req.params.id);
  if (!usageSession) {
    return res.status(404).json({ error: "Usage session not found" });
  }

  const content = await Content.findById(usageSession.contentId);
  if (!content) {
    return res.status(404).json({ error: "Content not found" });
  }

  const usage = calculateUsageCharge({ content, usageSession, body: req.body });
  let split = paymentService.calculateSplit(usage.amountUsd);
  if (usage.amountUsd > 0) {
    const paymentResult = await billingService.charge({
      userId: usageSession.userId,
      sessionId: usageSession._id,
      content,
      amount: usage.amountUsd,
      usageType: usage.reason,
      paymentHeader: req.header("PAYMENT-SIGNATURE"),
      reason: usage.note,
    });
    split = paymentResult.split;
  }

  if (usage.kind === "video_watch") {
    usageSession.secondsWatched += usage.quantity;
  }
  if (usage.kind === "book_page") {
    usageSession.pagesRead += usage.quantity;
  }

  usageSession.totalChargedUsd = roundMoney(usageSession.totalChargedUsd + usage.amountUsd);
  usageSession.amountChargedUsd = usageSession.totalChargedUsd;
  usageSession.totalPlatformFeeUsd = roundMoney(usageSession.totalPlatformFeeUsd + split.platformFeeUsd);
  usageSession.totalCreatorPayoutUsd = roundMoney(usageSession.totalCreatorPayoutUsd + split.creatorPayoutUsd);
  usageSession.events.push({
    kind: usage.kind,
    quantity: usage.quantity,
    amountUsd: usage.amountUsd,
    metadata: {
      ...usage.metadata,
      platformFeeUsd: split.platformFeeUsd,
      creatorPayoutUsd: split.creatorPayoutUsd,
    },
  });

  await usageSession.save();
  const updatedSession = await UsageSession.findById(usageSession._id).populate("contentId");
  res.json({ usageSession: updatedSession });
}

export async function completeUsageSession(req, res) {
  const usageSession = await UsageSession.findByIdAndUpdate(
    req.params.id,
    { status: "completed", endedAt: new Date() },
    { new: true }
  ).populate("contentId");

  if (!usageSession) {
    return res.status(404).json({ error: "Usage session not found" });
  }

  // Final flush settles pending (so spent reflects everything settled), THEN
  // release the unused Gateway reservation (cap - spent) back to the pool. Order
  // matters; release is idempotent so a later disconnect release is a no-op.
  await settlementService.flush({ sessionId: usageSession._id, content: usageSession.contentId });
  await reservationService.releaseSession({ sessionId: usageSession._id });

  const settledSession = await UsageSession.findById(usageSession._id).populate("contentId");
  const user = await User.findById(usageSession.userId);
  res.json({
    usageSession: settledSession,
    receipt: buildReceipt({ usageSession: settledSession, user }),
  });
}

function calculateUsageCharge({ content, usageSession, body }) {
  if (content.type === "video") {
    const seconds = Math.max(0, Math.floor(Number(body.secondsWatched || 0)));
    return {
      kind: "video_watch",
      reason: "video_second",
      quantity: seconds,
      amountUsd: roundMoney(seconds * content.pricePerSecondUsd),
      note: `${seconds}s watched: ${content.title}`,
      metadata: { source: body.source || "player" },
    };
  }

  const pageNumbers = Array.isArray(body.pages) ? body.pages : [];
  const priorPages = new Set(
    usageSession.events
      .flatMap((event) => event.metadata?.pages || [])
      .map(Number)
  );
  const uniquePages = [...new Set(pageNumbers.map(Number).filter((page) => page > 0))]
    .filter((page) => !priorPages.has(page));
  const billablePages = uniquePages.filter((page) => page > Number(content.freePreviewPages || 0));

  return {
    kind: "book_page",
    reason: "book_page",
    quantity: uniquePages.length,
    amountUsd: roundMoney(billablePages.length * content.pricePerPageUsd),
    note: `${uniquePages.length} pages read: ${content.title}`,
    metadata: { pages: uniquePages, billablePages },
  };
}

function buildReceipt({ usageSession, user }) {
  const content = usageSession.contentId;
  const settlement = usageSession.settlement || {};
  return {
    contentTitle: content?.title || "Untitled",
    contentType: usageSession.contentType,
    secondsWatched: usageSession.secondsWatched,
    pagesRead: usageSession.pagesRead,
    totalChargedUsd: usageSession.amountChargedUsd || usageSession.totalChargedUsd,
    creatorEarnedUsd: usageSession.totalCreatorPayoutUsd,
    platformFeeUsd: usageSession.totalPlatformFeeUsd,
    // Mode-specific proof: mock shows the remaining local balance; circle shows
    // the on-chain settlement (amount settled + Gateway tx refs).
    mode: usageSession.mode || paymentMode.name,
    network: paymentMode.network,
    remainingUserBalanceUsd: user?.balanceUsd ?? 0,
    settledUsd: fromUsdcAtomic(settlement.settledAtomic || 0),
    batchRefs: settlement.batchRefs || [],
  };
}
