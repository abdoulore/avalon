import { ensureDemoUser } from "./userController.js";
import { ledgerService } from "../services/ledgerService.js";
import { env } from "../config/env.js";
import { paymentMode } from "../payments/paymentMode.js";

export async function getUserTransactions(req, res) {
  const user = await ensureDemoUser();
  const transactions = await ledgerService.getUserHistory(user._id);
  res.json({ transactions });
}

// The full on-chain settlement history for the demo user: one row per settled
// batch, with the Gateway/Arc tx hash, the signed payer->recipient authorization,
// and the explorer base so the UI can link each tx out for verification.
export async function getOnchainTransactions(req, res) {
  const user = await ensureDemoUser();
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
  const transactions = await ledgerService.getCreatorHistory(req.query.creatorId);
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
