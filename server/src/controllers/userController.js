import { LedgerEntry } from "../models/LedgerEntry.js";
import { UsageSession } from "../models/UsageSession.js";
import { User } from "../models/User.js";
import { paymentMode } from "../payments/paymentMode.js";
import { ledgerService } from "../services/ledgerService.js";
import { paymentService } from "../services/paymentService.js";
import { gatewayDepositService } from "../services/gatewayDepositService.js";
import { reservationService } from "../services/reservationService.js";

export async function getMe(req, res) {
  res.json({ user: req.user });
}

export async function topUpMe(req, res) {
  // Top-up credits the local mock balance. It has no meaning in circle mode,
  // where funds come from an on-chain Gateway deposit — so reject it there
  // instead of silently mutating a balance the circle flow never reads.
  if (!paymentMode.supportsTopUp) {
    return res.status(400).json({
      error: "Top-up is only available in mock mode. In circle mode, deposit on-chain via Circle Gateway.",
    });
  }
  const amountUsd = Number(req.body.amountUsd || 10);
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
    return res.status(400).json({ error: "Top-up amount must be greater than zero" });
  }
  await paymentService.creditMockBalance({ userId: req.user._id, amountUsd });
  const updatedUser = await User.findById(req.user._id);
  res.json({ user: updatedUser });
}

// Circle-only: the buyer wallet's on-chain Gateway available balance, the funding
// source sessions reserve against. Mock mode has no on-chain balance.
export async function getGatewayBalance(req, res) {
  if (paymentMode.name !== "circle") {
    return res.status(400).json({ error: "Gateway balance is only available in circle mode." });
  }
  const balances = await gatewayDepositService.readBalances();
  res.json({ ...balances, network: paymentMode.network });
}

// Circle-only on-chain top-up: approve + deposit USDC into the GatewayWallet, then
// credit the reservation pool by the same amount so sessions can reserve it. The
// pool seeds from chain only ONCE, so a later deposit must be credited explicitly
// (skip if no pool exists yet — the next session's authorize seeds from chain,
// which already reflects the deposit).
export async function depositToGateway(req, res) {
  if (paymentMode.name !== "circle") {
    return res.status(400).json({ error: "On-chain deposit is only available in circle mode. In mock mode use top-up." });
  }
  const amountUsd = Number(req.body.amountUsd);
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
    return res.status(400).json({ error: "Deposit amount must be greater than zero." });
  }
  if (amountUsd > 50) {
    return res.status(400).json({ error: "Deposit is capped at $50 on testnet." });
  }

  const key = reservationService.poolKeyFor(req.user._id);
  // Snapshot BEFORE the on-chain deposit. Only a pool that already existed gets
  // credited by delta — a pool seeded DURING the multi-second confirmation window
  // reads the post-deposit on-chain balance, so crediting it too would double-
  // count. If no pool pre-existed we skip the credit; at worst the pool briefly
  // undercounts (conservative: can never over-reserve the wallet).
  const poolBefore = await reservationService.getPool(key);

  const result = await gatewayDepositService.deposit({ amountUsd });

  if (poolBefore) {
    await reservationService.credit({ key, amountAtomic: result.depositedAtomic });
  }

  res.json({ ok: true, ...result, availableUsd: result.afterAtomic / 1_000_000, network: paymentMode.network });
}

export async function getUserDashboard(req, res) {
  const user = req.user;
  // Scope the dashboard to the active economy so a mode switch shows a clean,
  // unblended history. `settlements` is the real per-batch history (Gateway tx
  // refs in circle, mock_settled refs in mock); `ledgerEntries` keeps the local
  // mock top-up/credit trail.
  const [usageSessions, ledgerEntries, settlements] = await Promise.all([
    UsageSession.find({ userId: user._id, mode: paymentMode.name }).populate("contentId").sort({ updatedAt: -1 }).limit(30),
    LedgerEntry.find({ userId: user._id, mode: paymentMode.name }).sort({ createdAt: -1 }).limit(30),
    ledgerService.getUserSettlements(user._id),
  ]);

  res.json({ user, mode: paymentMode.name, network: paymentMode.network, usageSessions, ledgerEntries, settlements });
}

export async function ensureDemoUser() {
  let user = await User.findOne({ email: "demo@avalon.local" });
  if (!user) {
    user = await User.create({
      name: "Demo User",
      email: "demo@avalon.local",
      balanceUsd: 25,
      currency: "USDC",
    });
  }
  return user;
}
