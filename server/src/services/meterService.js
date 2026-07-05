import { Content } from "../models/Content.js";
import { UsageSession } from "../models/UsageSession.js";
import { User } from "../models/User.js";
import { roundMoney } from "../payments/paymentAdapter.js";
import { toUsdcAtomic, fromUsdcAtomic } from "./circleGatewayService.js";
import { paymentService } from "./paymentService.js";
import { paymentMode } from "../payments/paymentMode.js";
import { allowanceService } from "./allowanceService.js";
import { reservationService } from "./reservationService.js";
import { settlementService } from "./settlementService.js";
import { agentPaymentProvider } from "../integrations/agentPaymentProvider.js";

const HEARTBEAT_CAP_SECONDS = 6;
// Per-session cap the meter tries to reserve from the Gateway pool. Bounded so
// one session can't grab the whole balance; clamped down to whatever is actually
// available (the allowance cap == the reserved amount).
const SESSION_CAP_ATOMIC = Number(process.env.SESSION_CAP_ATOMIC || 5_000_000); // $5

export class MeterService {
  // Video: per-second billing via socket heartbeats.
  async processHeartbeat({ sessionId, state }) {
    const usageSession = await UsageSession.findById(sessionId);
    if (!usageSession || usageSession.status !== "active") {
      const error = new Error("Active session not found");
      error.status = 404;
      throw error;
    }

    const content = await Content.findById(usageSession.contentId);
    if (!content) {
      const error = new Error("Content not found");
      error.status = 404;
      throw error;
    }

    const user = await User.findById(usageSession.userId);

    const now = new Date();
    const previous = usageSession.lastHeartbeatAt || now;
    const elapsedSeconds = Math.min(
      HEARTBEAT_CAP_SECONDS,
      Math.max(0, Math.floor((now.getTime() - previous.getTime()) / 1000))
    );
    const active = state === "active";
    let chargeAmount = 0; // dollars

    if (active && elapsedSeconds > 0) {
      if (content.type === "video") {
        const previewRemaining = Math.max(0, Number(content.freePreviewSeconds || 0) - usageSession.secondsWatched);
        const billableSeconds = Math.max(0, elapsedSeconds - previewRemaining);
        chargeAmount = roundMoney(billableSeconds * getVideoRate(content));
        usageSession.secondsWatched += elapsedSeconds;
        usageSession.activeWatchDuration += elapsedSeconds;
      } else {
        // Books accrue reading time here but bill per page turn (processPageRead).
        usageSession.activeReadingDuration += elapsedSeconds;
      }
    }

    usageSession.activityState = state;
    usageSession.lastHeartbeatAt = now;

    let split = null;
    if (chargeAmount > 0) {
      const queueAhead = await Content.countDocuments({ published: true, _id: { $ne: content._id } });
      const res = await this._chargeAllowance({
        session: usageSession,
        content,
        user,
        chargeAmount,
        eventKind: "video_watch",
        quantity: elapsedSeconds,
        context: { tickSeconds: elapsedSeconds, secondsWatched: usageSession.secondsWatched, queueAhead, fractionComplete: null },
      });
      split = res.split;
      chargeAmount = res.drawnUsd;
    } else {
      await usageSession.save();
    }

    const finalUser = await User.findById(usageSession.userId);
    const finalSession = await UsageSession.findById(usageSession._id);

    return {
      usageSession: finalSession,
      user: finalUser,
      chargeAmount,
      platformFeeUsd: split?.platformFeeUsd || 0,
      creatorShareUsd: split?.creatorPayoutUsd || 0,
      agentDecision: finalSession?.agentDecision,
      insufficientBalance: false,
    };
  }

  // Books: per-page billing through the SAME allowance spine as video. Discrete
  // (one draw per page turn), deliberated per page. On exhaustion it throws 402
  // and the page is NOT served — the reader pauses at the boundary.
  async processPageRead({ sessionId, page }) {
    const session = await UsageSession.findById(sessionId);
    if (!session || session.status !== "active") {
      const error = new Error("Active session not found");
      error.status = 404;
      throw error;
    }

    const content = await Content.findById(session.contentId);
    if (!content) {
      const error = new Error("Content not found");
      error.status = 404;
      throw error;
    }

    const user = await User.findById(session.userId);
    const pageNum = Math.max(1, Math.floor(Number(page) || 1));
    const freePreviewPages = Number(content.freePreviewPages || 0);
    const pricePerPageUsd = Number(content.pricePerPageUsd || 0);
    // Dedup: a page already billed in this session is served free (no re-charge).
    const billedPages = new Set(
      (session.events || [])
        .filter((e) => e?.metadata?.source === "allowance-draw" && e.metadata?.page != null)
        .map((e) => Number(e.metadata.page))
    );
    const billable = pageNum > freePreviewPages && pricePerPageUsd > 0 && !billedPages.has(pageNum);

    let split = null;
    let chargeAmount = 0;
    if (billable) {
      session.activityState = "active";
      session.lastHeartbeatAt = new Date();
      const queueAhead = Math.max(0, Number(content.pages || 0) - pageNum); // pages remaining
      const res = await this._chargeAllowance({
        session,
        content,
        user,
        chargeAmount: roundMoney(pricePerPageUsd),
        eventKind: "book_page",
        quantity: 1,
        extraMetadata: { page: pageNum },
        context: { tickSeconds: 1, queueAhead, fractionComplete: content.pages ? pageNum / Number(content.pages) : null },
      });
      split = res.split;
      chargeAmount = res.drawnUsd;
      // Page is now served — advance the furthest-read marker (avoid clobbering
      // settlement fields that maybeFlush may have changed: use $max, not save()).
      await UsageSession.updateOne({ _id: sessionId }, { $max: { pagesRead: pageNum } });
    } else {
      await UsageSession.updateOne(
        { _id: sessionId },
        { $max: { pagesRead: pageNum }, $set: { activityState: "active", lastHeartbeatAt: new Date() } }
      );
    }

    const finalUser = await User.findById(session.userId);
    const finalSession = await UsageSession.findById(sessionId);

    return {
      usageSession: finalSession,
      user: finalUser,
      chargeAmount,
      served: true,
      platformFeeUsd: split?.platformFeeUsd || 0,
      creatorShareUsd: split?.creatorPayoutUsd || 0,
      agentDecision: finalSession?.agentDecision,
    };
  }

  // The ONE billing spine for both content types: auto-authorize (mock bridge) ->
  // agent.decide -> allowanceService.draw -> accrue pendingAtomic -> batched
  // settlement. Bills the amount actually DRAWN (the agent may throttle). Throws
  // 402 (needsReauth) on agent-stop or allowance exhaustion.
  async _chargeAllowance({ session, content, user, chargeAmount, eventKind, quantity = 1, extraMetadata = {}, context }) {
    if (session.allowance.status === "none") {
      await this._authorizeAgainstGateway({ session, user });
    }

    const proposedAtomic = Number(toUsdcAtomic(chargeAmount));
    const decision = await agentPaymentProvider.decide({ session, content, proposedAtomic, context });

    if (!decision.approve || decision.stop) {
      session.activityState = decision.stop ? "left" : "paused";
      await session.save();
      const err = new Error(
        decision.reason === "budget_exhausted" || decision.reason === "would_exceed_budget"
          ? "Allowance exhausted. Extend to continue."
          : "Paused by budget policy."
      );
      err.status = 402;
      err.needsReauth = Boolean(decision.stop);
      throw err;
    }

    const draw = await allowanceService.draw({ sessionId: session._id, amountAtomic: decision.drawAtomic });
    if (!draw.ok) {
      session.activityState = "paused";
      session.allowance.status = "exhausted";
      await session.save();
      const err = new Error("Allowance exhausted. Extend to continue.");
      err.status = 402;
      err.needsReauth = true;
      err.remainingAtomic = draw.remainingAtomic;
      throw err;
    }

    session.allowance.spentAtomic = draw.session.allowance.spentAtomic;
    session.settlement.pendingAtomic = draw.session.settlement.pendingAtomic;

    const drawnUsd = fromUsdcAtomic(draw.drawn);
    const split = paymentService.calculateSplit(drawnUsd);
    session.totalChargedUsd = roundMoney(session.totalChargedUsd + drawnUsd);
    session.amountChargedUsd = session.totalChargedUsd;
    session.totalPlatformFeeUsd = roundMoney(session.totalPlatformFeeUsd + split.platformFeeUsd);
    session.totalCreatorPayoutUsd = roundMoney(session.totalCreatorPayoutUsd + split.creatorPayoutUsd);
    session.events.push({
      kind: eventKind,
      quantity,
      amountUsd: drawnUsd,
      metadata: {
        source: "allowance-draw",
        agentReason: decision.reason,
        agentSource: session.agentDecision?.source,
        drawAtomic: draw.drawn,
        platformFeeUsd: split.platformFeeUsd,
        creatorPayoutUsd: split.creatorPayoutUsd,
        ...extraMetadata,
      },
    });

    // Persist the event + totals BEFORE flushing so the batch draw-count includes
    // this draw. Do not save() after maybeFlush — it would clobber settlement.
    await session.save();
    await settlementService.maybeFlush({ sessionId: session._id, content });

    return { drawnUsd, split, decision };
  }

  // Authorization is an atomic CLAIM against the Gateway pool, NOT a read of
  // User.balanceUsd — so concurrent sessions can't each authorize the full
  // balance. The allowance cap == the reserved amount. Seeds the pool once from
  // the Gateway balance (mock: User.balanceUsd; circle: on-chain availableBalance).
  async _authorizeAgainstGateway({ session, user }) {
    const key = await reservationService.poolKeyFor(session.userId);
    // Seed the pool only when it doesn't exist yet: sessions on the same wallet
    // share a pool, so the on-chain balance is read only on first use.
    let pool = await reservationService.getPool(key);
    if (!pool) {
      // The active mode owns the funding source: mock seeds from the local
      // balance, circle reads the wallet's on-chain Gateway available balance.
      const seedAtomic = await paymentMode.seedAtomic({ user });
      pool = await reservationService.ensurePool({ key, seedAtomic });
    }

    // The user picks the cap at approval (requestedCapAtomic); fall back to the
    // env default only if none was chosen. Reservation clamps to what's available.
    const desiredAtomic = Number(session.allowance?.requestedCapAtomic) > 0
      ? Number(session.allowance.requestedCapAtomic)
      : SESSION_CAP_ATOMIC;

    let res = await reservationService.reserve({ key, amountAtomic: desiredAtomic });
    if (!res.ok && res.available > 0) {
      // Couldn't reserve the desired cap — authorize a smaller cap = what's available.
      res = await reservationService.reserve({ key, amountAtomic: res.available });
    }
    if (!res.ok || res.reserved <= 0) {
      session.activityState = "paused";
      await session.save();
      // The session could not reserve ANYTHING: the wallet has no usable Gateway
      // balance. This is a funding problem, not a spent-allowance one, so flag it
      // distinctly (needsFunding) — the client routes here to "fund your wallet",
      // not to the "approve more" extend gate.
      const err = new Error("Your Gateway balance is empty. Add funds to start watching.");
      err.status = 402;
      err.needsFunding = true;
      throw err;
    }

    await allowanceService.authorize({ sessionId: session._id, capAtomic: res.reserved });
    session.allowance.capAtomic = res.reserved;
    session.allowance.status = "authorized";
  }
}

function getVideoRate(content) {
  return Number(content.liveEventPricePerSecondUsd || content.pricePerSecondUsd || 0);
}

export const meterService = new MeterService();
