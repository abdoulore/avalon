import crypto from "crypto";
import { env } from "../config/env.js";
import { User } from "../models/User.js";
import { roundMoney } from "./paymentAdapter.js";
import { createCircleSigner } from "./circleWalletSigner.js";
import {
  circleGatewayService,
  fromUsdcAtomic,
  readGatewayAvailableAtomic,
  toUsdcAtomic,
} from "../services/circleGatewayService.js";

/**
 * THE payment-mode seam. This is the one place the two economies are kept apart.
 *
 * Mock and Circle are fully separate strategies — they never fall through to each
 * other. The funding source, how a reservation pool is keyed and seeded, and how a
 * batch is settled are all answered by the active strategy, so the rest of the
 * codebase asks `paymentMode.x(...)` instead of branching on env.paymentMode.
 *
 * Mode is chosen once per process from PAYMENT_MODE (single global). Anything
 * unknown is treated as "mock" so a misconfigured deploy fails safe-and-local,
 * never silently pretending to settle on-chain.
 */
export const MODE = env.paymentMode === "circle" ? "circle" : "mock";
export const isCircle = MODE === "circle";
export const isMock = !isCircle;

// Mock economy: a per-user local balance. No chain, no signing.
const mockStrategy = {
  name: "mock",
  network: "mock",
  // Mock top-ups credit User.balanceUsd; circle deposits happen on-chain instead.
  supportsTopUp: true,
  // Session start checks the local balance; circle defers to the on-chain reserve.
  requiresLocalBalance: true,
  // Per-user pool over the mock balance. Namespaced by mode so it can never
  // collide with a circle pool in the same database.
  poolKey: (userId) => `mock:user:${userId}`,
  async seedAtomic({ user }) {
    return Number(toUsdcAtomic(user?.balanceUsd || 0));
  },
  // Settle by decrementing the local balance. Nonce-keyed so a replayed claim is
  // idempotent (mirrors Gateway's nonce de-duplication), not a double-debit.
  async settleBatch({ session, amountAtomic, nonce, mockSettledNonces }) {
    if (mockSettledNonces?.has(nonce)) {
      return { ok: true, duplicate: true, batchRef: mockSettledNonces.get(nonce), gatewayStatus: "mock_settled" };
    }
    const amountUsd = fromUsdcAtomic(amountAtomic);
    const user = await User.findById(session.userId);
    if (user) {
      user.balanceUsd = Math.max(0, roundMoney(user.balanceUsd - amountUsd));
      await user.save();
    }
    const batchRef = `mock_batch_${crypto.randomUUID()}`;
    mockSettledNonces?.set(nonce, batchRef);
    return { ok: true, batchRef, gatewayStatus: "mock_settled" };
  },
};

// Circle economy: one sponsored Gateway wallet on Arc, real EIP-3009 settlement.
const circleStrategy = {
  name: "circle",
  network: env.circleSupportedChain,
  supportsTopUp: false,
  requiresLocalBalance: false,
  // ONE shared wallet pool: every session reserves from the single funded buyer
  // wallet, so concurrent sessions can't collectively over-claim its balance.
  poolKey: () => `circle:wallet:${String(env.circleBuyerAddress || "").toLowerCase()}`,
  async seedAtomic() {
    return Number(await readGatewayAvailableAtomic(env.circleBuyerAddress));
  },
  // Sign + settle one batch through the Gateway facilitator. No mock fallback: if
  // circle mode is misconfigured, createCircleSigner / settleSigned throw or
  // return !ok, and the failure surfaces to the caller instead of "succeeding"
  // as a local debit.
  async settleBatch({ session, amountAtomic, nonce }) {
    const requirements = circleGatewayService.createPaymentRequirements({
      amount: fromUsdcAtomic(amountAtomic),
      resourceUrl: "/api/settlement/batch",
      description: `Avalon batch settlement for session ${session._id}`,
    });
    const signer = createCircleSigner();
    const signed = await circleGatewayService.signAuthorization({ signer, requirements, amountAtomic, nonce });
    return circleGatewayService.settleSigned({ signed, requirements });
  },
};

export const paymentMode = isCircle ? circleStrategy : mockStrategy;
