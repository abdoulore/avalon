import { env } from "../config/env.js";
import { User } from "../models/User.js";
import { getCircleWalletClient } from "../payments/circleWalletSigner.js";

const DEMO_EMAIL = "demo@avalon.local";

/**
 * Resolves which Circle wallet a user signs and settles with (circle mode).
 *
 * - A user with a provisioned wallet uses their own EOA.
 * - The demo account maps to the funded project wallet from env — it never
 *   gets its own wallet, so the shared demo pool stays exactly as it was.
 * - Anyone else is provisioned lazily on first need (normally signup already
 *   did it; this covers accounts created before Tier B or a failed signup
 *   provisioning).
 *
 * Accepts a user document or a user id.
 */
export async function walletFor(userLike) {
  const user = userLike?.email !== undefined ? userLike : await User.findById(userLike);
  if (!user) {
    throw new Error("Cannot resolve a wallet: user not found.");
  }
  if (user.circleWalletId && user.circleWalletAddress) {
    return { walletId: user.circleWalletId, address: user.circleWalletAddress };
  }
  if (user.email === DEMO_EMAIL) {
    return { walletId: env.circleBuyerWalletId, address: env.circleBuyerAddress };
  }
  return provisionUserWallet(user);
}

// Creates one ARC-TESTNET EOA in the project's wallet set and stores it on the
// user. Guarded write: if two requests race, the first write wins and both
// return the stored wallet (the loser's orphan wallet is unused, never funded).
export async function provisionUserWallet(user) {
  if (!env.circleWalletSetId) {
    throw new Error("CIRCLE_WALLET_SET_ID is not configured — cannot provision user wallets.");
  }
  const client = getCircleWalletClient();
  const res = await client.createWallets({
    walletSetId: env.circleWalletSetId,
    blockchains: ["ARC-TESTNET"],
    accountType: "EOA",
    count: 1,
    metadata: [{ name: `avalon-user-${user._id}` }],
  });
  const wallet = res?.data?.wallets?.[0];
  if (!wallet?.id || !wallet?.address) {
    throw new Error(`Circle createWallets returned no wallet: ${JSON.stringify(res?.data || {})}`);
  }

  const updated = await User.findOneAndUpdate(
    { _id: user._id, $or: [{ circleWalletId: "" }, { circleWalletId: null }] },
    { $set: { circleWalletId: wallet.id, circleWalletAddress: wallet.address } },
    { new: true }
  );
  if (!updated) {
    // Lost the race — use whatever the winner stored.
    const current = await User.findById(user._id);
    return { walletId: current.circleWalletId, address: current.circleWalletAddress };
  }
  return { walletId: updated.circleWalletId, address: updated.circleWalletAddress };
}
