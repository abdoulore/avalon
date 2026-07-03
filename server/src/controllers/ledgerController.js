import { ledgerService } from "../services/ledgerService.js";
import { env } from "../config/env.js";
import { paymentMode } from "../payments/paymentMode.js";

export async function getUserTransactions(req, res) {
  const transactions = await ledgerService.getUserHistory(req.user._id);
  res.json({ transactions });
}

// The full on-chain settlement history for the signed-in user: one row per
// settled batch, with the Gateway/Arc tx hash, the signed payer->recipient
// authorization, and the explorer base so the UI can link each tx out.
export async function getOnchainTransactions(req, res) {
  const user = req.user;
  const circle = paymentMode.name === "circle";
  const [transactions, total] = await Promise.all([
    ledgerService.getAllSettlements(user._id),
    ledgerService.countSettlements(user._id),
  ]);
  res.json({
    mode: paymentMode.name,
    network: paymentMode.network,
    explorerUrl: circle ? env.arcExplorerUrl : null,
    chainId: circle ? env.arcChainId : null,
    sellerWallet: circle ? env.circleSellerWallet : null,
    total,
    transactions,
  });
}

export async function getCreatorTransactions(req, res) {
  // Creators only see their own payout history — the id comes from the token,
  // never from the query string.
  const transactions = await ledgerService.getCreatorHistory(String(req.user._id));
  res.json({ transactions });
}

export async function getPlatformRevenue(req, res) {
  const transactions = await ledgerService.getPlatformRevenueHistory();
  const totalPlatformRevenueUsd = transactions.reduce(
    (sum, entry) => sum + Number(entry.platformFee || 0),
    0
  );
  res.json({ totalPlatformRevenueUsd, transactions });
}
