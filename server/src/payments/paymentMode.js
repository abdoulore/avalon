import crypto from "crypto";
import { env } from "../config/env.js";
import { User } from "../models/User.js";
import { roundMoney } from "./paymentAdapter.js";
import { createCircleSigner } from "./circleWalletSigner.js";
import { walletFor } from "../services/userWalletService.js";
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
  // collide with a circle pool in the same database. (Async to match circle,
  // which must look the user's wallet up.)
  poolKey: async (userId) => `mock:user:${userId}`,
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

// Circle economy: Circle developer-controlled wallets on Arc, real EIP-3009
// settlement. Per-user wallets; the demo account uses the project wallet.
const circleStrategy = {
  name: "circle",
  network: env.circleSupportedChain,
  supportsTopUp: false,
  requiresLocalBalance: false,
  // Pool per WALLET: each user's sessions reserve against the on-chain Gateway
  // balance of the wallet they settle from, so concurrent sessions can't
  // collectively over-claim it. The demo account resolves to the shared project
  // wallet (same pool key as before per-user wallets existed); everyone else
  // resolves to their own provisioned wallet.
  poolKey: async (userId) => {
    const { address } = await walletFor(userId);
    return `circle:wallet:${String(address || "").toLowerCase()}`;
  },
  async seedAtomic({ user }) {
    const { address } = await walletFor(user);
    return Number(await readGatewayAvailableAtomic(address));
  },
  // Sign + settle one batch through the Gateway facilitator, as the session
  // user's own wallet. No mock fallback: if circle mode is misconfigured,
  // createCircleSigner / settleSigned throw or return !ok, and the failure
  // surfaces to the caller instead of "succeeding" as a local debit.
  async settleBatch({ session, amountAtomic, nonce }) {
    const requirements = circleGatewayService.createPaymentRequirements({
      amount: fromUsdcAtomic(amountAtomic),
      resourceUrl: "/api/settlement/batch",
      description: `Avalon batch settlement for session ${session._id}`,
    });
    const signer = createCircleSigner(await walletFor(session.userId));
    const signed = await circleGatewayService.signAuthorization({ signer, requirements, amountAtomic, nonce });
    return circleGatewayService.settleSigned({ signed, requirements });
  },
};

export const paymentMode = isCircle ? circleStrategy : mockStrategy;
