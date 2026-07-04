import { env } from "../config/env.js";
import { User } from "../models/User.js";
import { getCircleWalletClient } from "../payments/circleWalletSigner.js";

/**
 * Resolves which Circle wallet a user signs and settles with (circle mode).
 *
 * Every user — including the demo account — has their own EOA; the project
 * wallet from env is pure treasury (sponsors fees, funds the demo allowance
 * via scripts/setupDemoWallet.js) and no user settles from it. Users are
 * provisioned lazily on first need (normally signup already did it; this
 * covers earlier accounts or a failed signup provisioning). NOTE: circle-mode
 * setup must run setupDemoWallet.js once, or the demo account auto-provisions
 * an EMPTY wallet and can't watch anything.
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
