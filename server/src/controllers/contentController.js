import { Content } from "../models/Content.js";
import { LedgerEntry } from "../models/LedgerEntry.js";
import { UsageSession } from "../models/UsageSession.js";
import { roundMoney } from "../payments/paymentAdapter.js";
import { fromUsdcAtomic } from "../services/circleGatewayService.js";
import { paymentService } from "../services/paymentService.js";

export async function listContent(req, res) {
  const { type } = req.query;
  const filter = { published: true };
  if (type) {
    filter.type = type;
  }

  // type desc puts "video" before "book", so the library leads with films.
  const content = await Content.find(filter).sort({ type: -1, createdAt: -1 });
  res.json({ content });
}

// Full single item, including book page text (bookPages is select:false, so the
// list endpoint stays light and only the reader pulls the heavy field).
export async function getContent(req, res) {
  const content = await Content.findById(req.params.id).select("+bookPages");
  if (!content) {
    return res.status(404).json({ error: "Content not found" });
  }
  res.json({ content });
}

export async function createContent(req, res) {
  const content = await Content.create(normalizeContentPayload(req.body));
  res.status(201).json({ content });
}

export async function updateContent(req, res) {
  const content = await Content.findByIdAndUpdate(
    req.params.id,
    normalizeContentPayload(req.body),
    { new: true, runValidators: true }
  );

  if (!content) {
    return res.status(404).json({ error: "Content not found" });
  }

  res.json({ content });
}

export async function getCreatorEarnings(req, res) {
  const rows = await LedgerEntry.aggregate([
    { $match: { type: "usage_debit", creatorPayoutUsd: { $gt: 0 } } },
    {
      $group: {
        _id: "$creatorName",
        grossAmountUsd: { $sum: "$grossAmountUsd" },
        platformFeeUsd: { $sum: "$platformFeeUsd" },
        creatorPayoutUsd: { $sum: "$creatorPayoutUsd" },
        chargeCount: { $sum: 1 },
      },
    },
    { $sort: { creatorPayoutUsd: -1 } },
  ]);

  res.json({
    creators: rows.map((row) => ({
      creatorName: row._id || "Unknown creator",
      grossAmountUsd: row.grossAmountUsd,
      platformFeeUsd: row.platformFeeUsd,
      creatorPayoutUsd: row.creatorPayoutUsd,
      chargeCount: row.chargeCount,
    })),
  });
}

export async function getCreatorDashboard(req, res) {
  const sessions = await UsageSession.find({}).populate("contentId").lean();

  const byContent = new Map();
  for (const session of sessions) {
    const content = session.contentId;
    if (!content) {
      continue;
    }
    const key = String(content._id);
    const current = byContent.get(key) || {
      contentId: key,
      title: content.title,
      creatorId: content.creatorId,
      creatorName: content.creatorName,
      contentType: content.type,
      secondsWatched: 0,
      pagesRead: 0,
      grossAmountUsd: 0,
      creatorPayoutUsd: 0,
      platformFeeUsd: 0,
    };
    current.secondsWatched += session.secondsWatched || 0;
    current.pagesRead += session.pagesRead || 0;
    current.grossAmountUsd += session.amountChargedUsd || session.totalChargedUsd || 0;
    current.creatorPayoutUsd += session.totalCreatorPayoutUsd || 0;
    current.platformFeeUsd += session.totalPlatformFeeUsd || 0;
    byContent.set(key, current);
  }

  const totals = [...byContent.values()].reduce(
    (sum, row) => ({
      grossAmountUsd: sum.grossAmountUsd + row.grossAmountUsd,
      creatorPayoutUsd: sum.creatorPayoutUsd + row.creatorPayoutUsd,
      platformFeeUsd: sum.platformFeeUsd + row.platformFeeUsd,
      secondsWatched: sum.secondsWatched + row.secondsWatched,
      pagesRead: sum.pagesRead + row.pagesRead,
    }),
    { grossAmountUsd: 0, creatorPayoutUsd: 0, platformFeeUsd: 0, secondsWatched: 0, pagesRead: 0 }
  );

  // Creator share of money accrued but not yet settled on-chain: the live
  // settlement state (pending + in-flight atomic), not the legacy per-tick
  // LedgerEntry rows that the allowance billing spine no longer writes.
  const pendingPayoutUsd = roundMoney(
    sessions.reduce((sum, s) => {
      const unsettledAtomic =
        Number(s.settlement?.pendingAtomic || 0) + Number(s.settlement?.inFlight?.amountAtomic || 0);
      if (unsettledAtomic <= 0) return sum;
      return sum + paymentService.calculateSplit(fromUsdcAtomic(unsettledAtomic)).creatorPayoutUsd;
    }, 0)
  );

  res.json({
    totals: {
      ...totals,
      totalEarningsUsd: totals.creatorPayoutUsd,
      pendingPayoutUsd,
    },
    content: [...byContent.values()].sort((a, b) => b.creatorPayoutUsd - a.creatorPayoutUsd),
  });
}

function normalizeContentPayload(payload) {
  const type = payload.type;

  return {
    title: payload.title,
    creatorId: payload.creatorId || slugify(payload.creatorName || "creator"),
    creatorName: payload.creatorName,
    type,
    description: payload.description || "",
    coverUrl: payload.coverUrl || "",
    mediaUrl: payload.mediaUrl || "",
    // Runtime ("MM:SS" or "H:MM:SS") — the concierge needs it to price a full
    // watch; without it a video can only be ranked by rate, never by total cost.
    durationLabel: type === "video" ? String(payload.durationLabel || "").trim() : "",
    pages: type === "book" ? Number(payload.pages || 0) : 0,
    pricePerSecondUsd: type === "video" ? Number(payload.pricePerSecondUsd || 0) : 0,
    pricePerPageUsd: type === "book" ? Number(payload.pricePerPageUsd || 0) : 0,
    freePreviewSeconds: type === "video" ? Number(payload.freePreviewSeconds || 0) : 0,
    freePreviewPages: type === "book" ? Number(payload.freePreviewPages || 0) : 0,
    isPremium: Boolean(payload.isPremium),
    liveEventPricePerSecondUsd: type === "video" ? Number(payload.liveEventPricePerSecondUsd || 0) : 0,
    published: payload.published ?? true,
  };
}

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
