import { GatewayPool } from "../models/GatewayPool.js";
import { UsageSession } from "../models/UsageSession.js";
import { paymentMode } from "../payments/paymentMode.js";

/**
 * Reservation over a funding-source pool. Authorization is an atomic CLAIM, so
 * concurrent sessions cannot collectively over-claim the balance.
 *
 * In circle mode the funding source is the ONE sponsored Gateway wallet, so every
 * user shares a single pool (keyed by the wallet). In mock mode each user has
 * their own mock balance, so the pool is per user.
 *
 * Each op is a single guarded findOneAndUpdate (same pattern as
 * allowanceService.draw). Every op is a transfer between buckets, so the invariant
 * holds by construction:
 *   availableAtomic + reservedAtomic + spentAtomic === totalAtomic   (always)
 *   availableAtomic never < 0 (reserve is guarded availableAtomic >= amount).
 */
// The active mode owns how a pool is keyed (mock: per user; circle: the one
// shared wallet). Mode-namespaced so mock and circle pools never collide.
function poolKeyFor(userId) {
  return paymentMode.poolKey(userId);
}

export class ReservationService {
  poolKeyFor(userId) {
    return poolKeyFor(userId);
  }

  getPool(key) {
    return GatewayPool.findOne({ key });
  }

  // Create the pool once, seeding total = available = seed (on insert only, so a
  // shared wallet pool is never reseeded by a later session). Top-ups use credit().
  async ensurePool({ key, seedAtomic = 0 }) {
    const seed = Math.max(0, Math.round(Number(seedAtomic) || 0));
    await GatewayPool.updateOne(
      { key },
      { $setOnInsert: { key, mode: paymentMode.name, totalAtomic: seed, availableAtomic: seed, reservedAtomic: 0, spentAtomic: 0 } },
      { upsert: true }
    );
    return GatewayPool.findOne({ key });
  }

  // A deposit / top-up grows the pool: total += amount, available += amount.
  async credit({ key, amountAtomic }) {
    const amt = Math.round(Number(amountAtomic) || 0);
    if (amt <= 0) return { ok: true, credited: 0 };
    const pool = await GatewayPool.findOneAndUpdate(
      { key },
      { $inc: { totalAtomic: amt, availableAtomic: amt } },
      { new: true, upsert: true }
    );
    return { ok: true, credited: amt, available: pool.availableAtomic };
  }

  // Atomic CLAIM: only succeeds if available >= amount. available -= amount,
  // reserved += amount. On denial, returns what IS available so the caller can
  // authorize a smaller cap (or prompt a deposit).
  async reserve({ key, amountAtomic }) {
    const amt = Math.round(Number(amountAtomic) || 0);
    if (amt <= 0) return { ok: true, reserved: 0 };
    const pool = await GatewayPool.findOneAndUpdate(
      { key, availableAtomic: { $gte: amt } },
      { $inc: { availableAtomic: -amt, reservedAtomic: amt } },
      { new: true }
    );
    if (!pool) {
      const current = await GatewayPool.findOne({ key });
      return { ok: false, reason: "insufficient_gateway_balance", available: current?.availableAtomic || 0 };
    }
    return { ok: true, reserved: amt, available: pool.availableAtomic };
  }

  // Return UNUSED reservation to available: reserved -= amount, available += amount.
  async release({ key, amountAtomic }) {
    const amt = Math.round(Number(amountAtomic) || 0);
    if (amt <= 0) return { ok: true, released: 0 };
    const pool = await GatewayPool.findOneAndUpdate(
      { key, reservedAtomic: { $gte: amt } },
      { $inc: { reservedAtomic: -amt, availableAtomic: amt } },
      { new: true }
    );
    if (!pool) return { ok: false, reason: "nothing_to_release" };
    return { ok: true, released: amt, available: pool.availableAtomic };
  }

  // Settled funds LEAVE the pool: reserved -= amount, spent += amount.
  async settleConvert({ key, amountAtomic }) {
    const amt = Math.round(Number(amountAtomic) || 0);
    if (amt <= 0) return { ok: true, settled: 0 };
    const pool = await GatewayPool.findOneAndUpdate(
      { key, reservedAtomic: { $gte: amt } },
      { $inc: { reservedAtomic: -amt, spentAtomic: amt } },
      { new: true }
    );
    if (!pool) return { ok: false, reason: "insufficient_reserved" };
    return { ok: true, settled: amt, spent: pool.spentAtomic };
  }

  // Idempotent per-session release of the UNUSED remainder (cap - spent) back to
  // whichever pool the session reserved from. The "reservationReleased" transition
  // is the idempotency gate. Call AFTER the final flush, so spent reflects settled.
  async releaseSession({ sessionId }) {
    const session = await UsageSession.findOneAndUpdate(
      {
        _id: sessionId,
        "allowance.reservationReleased": { $ne: true },
        "allowance.status": { $in: ["authorized", "exhausted"] },
      },
      { $set: { "allowance.reservationReleased": true } },
      { new: false }
    );
    if (!session) {
      return { ok: true, released: 0, alreadyReleased: true };
    }
    const unused = Math.max(0, Number(session.allowance.capAtomic || 0) - Number(session.allowance.spentAtomic || 0));
    if (unused > 0) {
      await this.release({ key: poolKeyFor(session.userId), amountAtomic: unused });
    }
    return { ok: true, released: unused };
  }
}

export const reservationService = new ReservationService();
