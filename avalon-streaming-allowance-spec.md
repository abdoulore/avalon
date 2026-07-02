# Avalon — Streaming Allowance + Budget Agent Spec

The problem you hit: per-transaction signing is incompatible with per-second billing. Signing every heartbeat is the fatigue. This spec replaces the per-heartbeat signature with a **sign-once allowance** that the meter draws against, and adds a **budget agent** that decides how that allowance gets spent. It maps to the code as it exists in `package.zip` / `hooks.zip`.

The metering spine does not change. Atomic deduction, the 6s heartbeat cap, the activity-state machine, the 15% split, free-preview handling — all stay. You are swapping the **authorization layer** only.

---

## Core idea

```
OLD (fatiguing):
  every heartbeat -> client signs -> server verifies signature -> charge

NEW (sign once):
  session start -> user authorizes an allowance ONCE (cap + optional rate)
  every heartbeat -> meter asks the agent "draw $X?" -> agent decides -> draw against allowance (no signature)
  allowance exhausted -> pause + ONE re-auth prompt to extend (rare, intentional)
  session end (or every N draws) -> ONE batched Gateway settlement to the creator
```

Two things change: **when** money is authorized (once, up front) and **when** it settles on-chain (batched, not per-second). Between those two points the meter does pure off-chain accounting against a pre-authorized balance. That is exactly what Circle Gateway is — `deposit once, draw many` — and your `circle-nanopayments.md` already says "deposit once into Gateway."

---

## Authorization model: Gateway deposit + drawdown (recommended)

The user deposits USDC into their Gateway balance once (or tops it up occasionally — think loading a transit card). That single deposit is the only human wallet popup. After that:

- The session carries an **allowance** (a cap the user agrees to for this session, bounded by their Gateway balance).
- Each heartbeat draws against the allowance as off-chain accounting.
- Settlement to the creator is **batched** via `BatchFacilitatorClient` (already in `circleGatewayService.js`) — one settlement per N draws or per session, not per second.

Why this over the alternatives:
- **Sign-per-batch** (re-sign every few minutes) reduces fatigue but does not remove it. Rejected.
- **Session wallet held by the agent** (Circle embedded wallet, agent signs programmatically) is the maximal-agency version and removes popups entirely, but adds custody/key complexity. Treat it as a stretch goal; the deposit+drawdown model gets you a clean demo first and the agent still scores because it owns the *spend decision*, not the keys.

---

## Data model changes

### `UsageSession` — add an allowance block

`src/models/UsageSession.js`, new fields on `usageSessionSchema`:

```js
allowance: {
  capUsd:        { type: Number, default: 0, min: 0 },   // max the user authorized this session
  spentUsd:      { type: Number, default: 0, min: 0 },   // drawn down so far (off-chain accounting)
  ratePerSecondCapUsd: { type: Number, default: 0, min: 0 }, // optional: max rate user will tolerate (0 = no rate cap)
  authRef:       { type: String, default: "" },          // Gateway deposit / authorization reference
  status:        { type: String, enum: ["none","authorized","exhausted","revoked"], default: "none" },
},
settlement: {
  pendingUsd:    { type: Number, default: 0, min: 0 },   // accrued draws not yet settled on-chain
  settledUsd:    { type: Number, default: 0, min: 0 },   // already batched to creator
  lastBatchAt:   { type: Date },
  batchRefs:     { type: [String], default: [] },        // Gateway settlement tx refs
},
agentPolicy: {
  budgetUsd:     { type: Number, default: 0, min: 0 },   // agent's spend ceiling (<= allowance.capUsd)
  enabled:       { type: Boolean, default: false },
  notes:         { type: String, default: "" },
},
```

`allowance.spentUsd` is the source of truth for "how much of the authorization is used." `User.balanceUsd` stays as the mock-mode path. In circle mode the allowance cap is what gates spend, not `balanceUsd`.

---

## New service: `allowanceService`

`src/services/allowanceService.js` — owns drawdown accounting. This is the piece that replaces per-heartbeat signature verification with a balance check against the pre-authorized cap.

```js
import { UsageSession } from "../models/UsageSession.js";
import { roundMoney } from "../payments/paymentAdapter.js";

export class AllowanceService {
  // Called once at session start after the user authorizes/deposits.
  async authorize({ sessionId, capUsd, ratePerSecondCapUsd = 0, authRef = "" }) {
    return UsageSession.findByIdAndUpdate(
      sessionId,
      {
        "allowance.capUsd": roundMoney(capUsd),
        "allowance.ratePerSecondCapUsd": roundMoney(ratePerSecondCapUsd),
        "allowance.authRef": authRef,
        "allowance.status": "authorized",
      },
      { new: true }
    );
  }

  // Atomic drawdown: only succeeds if remaining allowance covers the amount.
  // Mirrors the atomic guard pattern already used in paymentAdapter.chargeUsage.
  async draw({ sessionId, amount }) {
    const amt = roundMoney(amount);
    if (amt <= 0) return { ok: true, drawn: 0 };

    const session = await UsageSession.findOneAndUpdate(
      {
        _id: sessionId,
        "allowance.status": "authorized",
        $expr: { $lte: [{ $add: ["$allowance.spentUsd", amt] }, "$allowance.capUsd"] },
      },
      {
        $inc: { "allowance.spentUsd": amt, "settlement.pendingUsd": amt },
      },
      { new: true }
    );

    if (!session) {
      // Either not authorized or cap would be exceeded -> mark exhausted, signal re-auth.
      await UsageSession.updateOne(
        { _id: sessionId, "allowance.status": "authorized" },
        { "allowance.status": "exhausted" }
      );
      return { ok: false, reason: "allowance_exhausted" };
    }
    return { ok: true, drawn: amt, session };
  }
}

export const allowanceService = new AllowanceService();
```

The `$expr` + `$inc` is the same race-safe trick you already used for `balanceUsd`. No read-then-write. Two concurrent heartbeats cannot overspend the cap.

---

## The budget agent: fill the `agentPaymentProvider.js` stub

`src/integrations/agentPaymentProvider.js` is currently a stub that throws. It becomes the decision-maker. The meter consults it before every draw. This is what moves the rubric score from "AI-flavored automation" to "meaningful agency."

```js
import { env } from "../config/env.js";

export class AgentPaymentProvider {
  /**
   * Decide whether to keep spending, throttle, or stop.
   * Returns { approve, drawUsd, stop, reason }.
   *
   * Inputs:
   *   session       - UsageSession (has allowance + agentPolicy + progress)
   *   content       - Content (rate, type, length)
   *   proposedUsd   - what the meter wants to charge this tick
   *   context       - { secondsWatched, fractionComplete, queueAhead, ... }
   */
  async decide({ session, content, proposedUsd, context }) {
    const remaining = session.allowance.capUsd - session.allowance.spentUsd;

    // Hard guards (cheap, deterministic) run first.
    if (remaining <= 0) return { approve: false, stop: true, reason: "budget_exhausted" };
    if (proposedUsd > remaining) return { approve: false, stop: true, reason: "would_exceed_budget" };
    if (session.allowance.ratePerSecondCapUsd > 0) {
      const impliedRate = proposedUsd / Math.max(1, context.tickSeconds || 1);
      if (impliedRate > session.allowance.ratePerSecondCapUsd) {
        return { approve: false, stop: false, reason: "rate_above_cap" };
      }
    }

    // Real agency: when a judgment call is warranted, ask the model.
    // e.g. low remaining budget + more content queued = allocate, don't blow it all here.
    if (env.agentReasoning && this.shouldDeliberate(session, context)) {
      return this.deliberate({ session, content, proposedUsd, context, remaining });
    }

    return { approve: true, drawUsd: proposedUsd, stop: false, reason: "within_policy" };
  }

  shouldDeliberate(session, context) {
    const remaining = session.allowance.capUsd - session.allowance.spentUsd;
    const lowBudget = remaining < session.allowance.capUsd * 0.2;
    const moreQueued = (context.queueAhead || 0) > 0;
    return lowBudget && moreQueued;
  }

  async deliberate({ session, content, proposedUsd, context, remaining }) {
    // Calls the Anthropic API to make a genuine allocation decision.
    // Keep the prompt tight; return strict JSON; parse defensively.
    // Fallback to approve-within-policy on any error so billing never stalls.
    // ... (Anthropic /v1/messages call, model claude-sonnet-4-6) ...
    return { approve: true, drawUsd: proposedUsd, stop: false, reason: "deliberated_continue" };
  }
}

export const agentPaymentProvider = new AgentPaymentProvider();
```

Design notes that matter for scoring and for not breaking billing:
- **Deterministic guards first, model second.** The model is consulted only on genuine judgment calls (low budget + more content queued, an unusual rate spike), never on every tick — otherwise you add latency and cost to a 5s loop. This is defensible as "meaningful agency": the AI decides allocation, not arithmetic.
- **The model decision must never block the meter.** Any API error falls back to within-policy approve. Billing correctness does not depend on the model being up.
- **The agent owns the *decision*, the allowance owns the *accounting*.** Clean separation. The agent says "spend $X / stop"; `allowanceService.draw` enforces it atomically.

---

## Wiring it into `meterService.processHeartbeat`

`src/services/meterService.js`. Today the charge path is: compute `chargeAmount` -> `billingService.charge` (which re-verifies a signature in circle mode). New path: compute `chargeAmount` -> ask agent -> draw against allowance -> accrue for batched settlement. No signature per tick.

Replace the `if (chargeAmount > 0)` block with:

```js
if (chargeAmount > 0) {
  const decision = await agentPaymentProvider.decide({
    session: usageSession,
    content,
    proposedUsd: chargeAmount,
    context: {
      tickSeconds: elapsedSeconds,
      secondsWatched: usageSession.secondsWatched,
      fractionComplete: estimateFraction(usageSession, content),
      queueAhead: 0, // wire to the user's playlist when available
    },
  });

  if (!decision.approve || decision.stop) {
    usageSession.activityState = decision.stop ? "left" : "paused";
    await usageSession.save();
    const err = new Error(decision.reason === "budget_exhausted" || decision.reason === "would_exceed_budget"
      ? "Allowance exhausted. Extend to continue."
      : "Paused by budget policy.");
    err.status = 402;                       // client already handles 402 -> pause
    err.needsReauth = decision.stop;        // signal the client to offer "extend allowance"
    throw err;
  }

  const draw = await allowanceService.draw({ sessionId: usageSession._id, amount: decision.drawUsd });
  if (!draw.ok) {
    const err = new Error("Allowance exhausted. Extend to continue.");
    err.status = 402;
    err.needsReauth = true;
    throw err;
  }

  // Ledger + session accounting (split is unchanged).
  const split = paymentService.calculateSplit(decision.drawUsd);
  usageSession.totalChargedUsd = roundMoney(usageSession.totalChargedUsd + decision.drawUsd);
  usageSession.amountChargedUsd = usageSession.totalChargedUsd;
  usageSession.totalPlatformFeeUsd = roundMoney(usageSession.totalPlatformFeeUsd + split.platformFeeUsd);
  usageSession.totalCreatorPayoutUsd = roundMoney(usageSession.totalCreatorPayoutUsd + split.creatorPayoutUsd);
  usageSession.events.push({
    kind: content.type === "video" ? "video_watch" : "book_page",
    quantity: elapsedSeconds,
    amountUsd: decision.drawUsd,
    metadata: { source: "allowance-draw", agentReason: decision.reason, ...split },
  });

  // Settle in batches, not per tick (see next section).
  await settlementService.maybeFlush({ session: usageSession, content });
}
```

`billingService.charge` is no longer on the per-heartbeat hot path in circle mode. It (or the new `settlementService`) is called only at flush time.

---

## Batched settlement

New `src/services/settlementService.js`. Accrued `settlement.pendingUsd` is flushed to the creator via the Gateway facilitator either every N seconds, every $ threshold, or at session end — whichever you pick. One on-chain settlement per flush, gas-free per Gateway batching.

```js
const FLUSH_THRESHOLD_USD = 0.05;   // tune: trade settlement frequency vs on-chain calls
const FLUSH_INTERVAL_MS = 60_000;

export class SettlementService {
  async maybeFlush({ session, content }) {
    const due =
      session.settlement.pendingUsd >= FLUSH_THRESHOLD_USD ||
      (session.settlement.lastBatchAt &&
        Date.now() - session.settlement.lastBatchAt.getTime() >= FLUSH_INTERVAL_MS);
    if (!due) return;
    return this.flush({ session, content });
  }

  async flush({ session, content }) {
    const amount = session.settlement.pendingUsd;
    if (amount <= 0) return;

    // Uses the existing facilitator + payment requirements you already built.
    // In mock mode this is a no-op accounting move; in circle mode it batches on-chain.
    const result = await x402PaymentService.settleBatched({
      userId: session.userId,
      creatorId: content.creatorId,
      contentId: content._id,
      sessionId: session._id,
      amount,
      authRef: session.allowance.authRef,
    });

    if (result.ok) {
      session.settlement.settledUsd = roundMoney(session.settlement.settledUsd + amount);
      session.settlement.pendingUsd = 0;
      session.settlement.lastBatchAt = new Date();
      session.settlement.batchRefs.push(result.batchRef);
      await session.save();
      // Write ONE ledger entry per batch (not per tick) with the batch proof.
      await ledgerService.recordMicrocharge({ /* ...batch fields... */ });
    }
  }
}
```

Add a final `flush` on `session:complete` and on `pagehide`/`completeSession` so nothing is left pending.

---

## Client changes: one signature, then silence

`hooks.zip -> lib/x402Client.js`. The per-request `paidApi(402 -> sign -> retry)` flow stays available for the **reading unlock** path (sign-per-page is fine there), but is removed from the video heartbeat path. Add one new call: authorize the allowance at session start.

```js
// Called once when the user starts a paid session (or when extending after exhaustion).
export async function authorizeAllowance({ capUsd, ratePerSecondCapUsd = 0 }) {
  // 1. Ensure Gateway balance is funded (one deposit; reuse switchToArcTestnet()).
  // 2. Sign ONE authorization for capUsd via BatchEvmScheme.
  // 3. POST the proof to /api/session/authorize -> server calls allowanceService.authorize.
  // Returns { authRef }.
}
```

In `VideoViewer.jsx`, the change is small because the heartbeat machinery already exists:
- On `handlePlay` (first play of a session), call `authorizeAllowance({ capUsd })` once. Show a single "Approve up to $X for this session" prompt.
- Heartbeats keep emitting `state` exactly as they do now. They no longer trigger any signing.
- When a heartbeat returns `402` with `needsReauth`, show "Allowance used up — extend?" and call `authorizeAllowance` again. This is the *only* re-signature, and it is rare and meaningful.

The `paidHeartbeatFallback()` path that signs per heartbeat gets deleted. That function is the literal source of the fatigue you described.

---

## What this buys you

- **Agentic sophistication** — the agent makes a real allocation decision (continue / throttle / stop, allocate across queued content), not a threshold. Deterministic guards keep it safe; the model handles judgment calls. This is the difference between "meaningful agency" and "automation."
- **Traction** — usable for the first time. A viewer watches a whole video with one approval. You can point your bilingual catalog at it and get real reads/watches with test USDC flowing.
- **Circle tooling** — Gateway deposit, `BatchFacilitatorClient` batched settlement, Arc testnet, USDC. All already wired; this spec uses them on the hot path.
- **Innovation** — streaming pre-authorization with an agent-managed budget is exactly the "approve a rate, not a transaction" gap in existing pay-per-use media.

---

## Build order (keeps you shippable at every step)

1. **Model + `allowanceService`** with atomic `draw`. Unit-test the cap guard under concurrent draws. (Spine; no UI yet.)
2. **Rewire `meterService`** to draw against allowance instead of per-tick charge. Deterministic agent guards only (no model yet). Now video bills with zero per-tick signing in mock mode.
3. **`settlementService`** batched flush + final flush on complete. One ledger entry per batch.
4. **Client `authorizeAllowance`** — one signature at session start; delete `paidHeartbeatFallback`. Demo-able end to end.
5. **Fill `agentPaymentProvider.decide`** model path for the low-budget/queued-content judgment call. This is the agency score; do it last so steps 1–4 are already a working submission.
6. **Confirm the read path bills** (the `reading_heartbeat` branch currently sets `chargeAmount = 0`). Either bill reading through the same allowance per page turn, or keep sign-per-page via the existing `paidApi`.

Steps 1–4 give you a working, fatigue-free Avalon. Step 5 is what makes it win.

---

## Two correctness items to fix in passing (from the code review)

- **Preview boundary double-count.** In `meterService`, `secondsWatched += elapsedSeconds` runs regardless, while billing subtracts `previewRemaining`. Add a test for a 10s preview crossed by 6s heartbeats; confirm the first post-preview charge neither double-counts nor skips the boundary second.
- **Read path bills nothing through the meter.** `reading_heartbeat` sets `chargeAmount = 0`. Decide where per-page billing lives and make sure it actually charges; right now the socket meter only bills video.
