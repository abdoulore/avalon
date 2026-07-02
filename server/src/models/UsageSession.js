import mongoose from "mongoose";

const usageEventSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ["video_watch", "book_page"], required: true },
    quantity: { type: Number, required: true, min: 0 },
    amountUsd: { type: Number, required: true, min: 0 },
    metadata: { type: Object, default: {} },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const usageSessionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    contentId: { type: mongoose.Schema.Types.ObjectId, ref: "Content", required: true },
    contentType: { type: String, enum: ["video", "book"], required: true },
    // The economy this session ran in. Stamped at creation from the active mode so
    // mock and circle sessions never blend in one database.
    mode: { type: String, enum: ["mock", "circle"], default: "mock", index: true },
    status: { type: String, enum: ["active", "completed"], default: "active" },
    secondsWatched: { type: Number, default: 0, min: 0 },
    pagesRead: { type: Number, default: 0, min: 0 },
    activeWatchDuration: { type: Number, default: 0, min: 0 },
    activeReadingDuration: { type: Number, default: 0, min: 0 },
    activityState: {
      type: String,
      enum: ["idle", "active", "paused", "inactive", "stalled", "left"],
      default: "idle",
    },
    lastHeartbeatAt: { type: Date },
    totalChargedUsd: { type: Number, default: 0, min: 0 },
    amountChargedUsd: { type: Number, default: 0, min: 0 },
    totalPlatformFeeUsd: { type: Number, default: 0, min: 0 },
    totalCreatorPayoutUsd: { type: Number, default: 0, min: 0 },
    // capAtomic / spentAtomic / pendingAtomic / settledAtomic hold INTEGER ATOMIC
    // USDC units (6 dp), NOT dollars: $1.00 === 1_000_000. Integer storage keeps
    // draw()'s $inc/$expr exact and atomic (zero rounding drift) and matches how
    // Gateway denominates at settlement. Convert to display dollars at the API edge.
    // Exact under $inc/$add/$lte while values stay < 2^53. Do not raise USDC
    // decimals or allow uncapped balances without revisiting this assumption.
    allowance: {
      // The cap the user CHOSE at approval (atomic), set before authorization.
      // _authorizeAgainstGateway reserves min(this, available); 0 = use the env default.
      requestedCapAtomic: { type: Number, default: 0, min: 0 },
      capAtomic: { type: Number, default: 0, min: 0 }, // atomic units the user authorized this session
      spentAtomic: { type: Number, default: 0, min: 0 }, // atomic units drawn so far; source of truth in circle mode
      // DOLLARS, not atomic — the only dollar/atomic boundary in the design. Step 5
      // MUST convert this to atomic units before any comparison against spentAtomic/capAtomic.
      ratePerSecondCapUsd: { type: Number, default: 0, min: 0 }, // dollar rate cap (0 = none); not on the draw hot path
      authRef: { type: String, default: "" }, // Gateway deposit / authorization reference
      status: { type: String, enum: ["none", "authorized", "exhausted", "revoked"], default: "none" },
      // Idempotency gate for releasing this session's unused Gateway reservation
      // back to the pool (set once; a second release is a no-op).
      reservationReleased: { type: Boolean, default: false },
    },
    settlement: {
      pendingAtomic: { type: Number, default: 0, min: 0 }, // atomic units accrued, not yet claimed
      settledAtomic: { type: Number, default: 0, min: 0 }, // atomic units confirmed-settled to creator
      settledDraws: { type: Number, default: 0, min: 0 }, // count of draws folded into prior batches (for per-batch tick counts)
      // A claimed batch being signed/settled right now. Invariant at all times:
      //   settledAtomic + inFlight.amountAtomic + pendingAtomic === allowance.spentAtomic
      // The nonce is generated at claim time and is STABLE across retries, so a
      // retry of a maybe-settled batch replays the same EIP-3009 nonce and Gateway
      // rejects the duplicate rather than double-settling.
      inFlight: {
        amountAtomic: { type: Number, default: 0, min: 0 },
        draws: { type: Number, default: 0, min: 0 },
        nonce: { type: String, default: "" },
        claimedAt: { type: Date },
      },
      lastBatchAt: { type: Date },
      batchRefs: { type: [String], default: [] }, // Gateway settlement tx refs
    },
    agentPolicy: {
      // DOLLARS, not atomic. Converted to atomic (toUsdcAtomic) before comparing
      // against spentAtomic/capAtomic — the one dollar/atomic boundary in the design.
      budgetUsd: { type: Number, default: 0, min: 0 }, // dollar ceiling (<= allowance cap)
      enabled: { type: Boolean, default: false },
      notes: { type: String, default: "" },
    },
    // Legibility: the agent's latest spend decision, surfaced in the heartbeat
    // response so the UI can show "agent decided X because Y".
    agentDecision: {
      action: { type: String, default: "" }, // continue | throttle | stop
      reason: { type: String, default: "" },
      remainingAtomicAtDecision: { type: Number, default: 0 },
      throttleRateAtomicPerSec: { type: Number, default: 0 },
      source: { type: String, default: "" }, // deterministic | deepseek | cache | fallback
      decidedAt: { type: Date },
    },
    events: { type: [usageEventSchema], default: [] },
    startedAt: { type: Date, default: Date.now },
    endedAt: { type: Date },
  },
  { timestamps: true }
);

export const UsageSession = mongoose.model("UsageSession", usageSessionSchema);
