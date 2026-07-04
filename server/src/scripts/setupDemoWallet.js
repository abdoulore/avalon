// Gives the demo account its own funded Circle wallet, so it spends a capped
// allowance instead of the project treasury. Idempotent — safe to rerun; also
// the REFILL tool when the demo allowance runs dry.
//
//   node src/scripts/setupDemoWallet.js            (fund to $1 wallet + $5 Gateway)
//   node src/scripts/setupDemoWallet.js 10         (deposit target $10 instead)
//
// Steps (each skipped when already satisfied):
//   1. provision a wallet for demo@avalon.local
//   2. transfer USDC from the project wallet so the demo can cover the deposit
//      plus a $1 in-wallet buffer (keeps the top-up page demo-able)
//   3. approve+deposit into Gateway FROM THE DEMO WALLET
//   4. credit the demo's reservation pool by the deposit delta (only if the
//      pool already exists — a fresh pool seeds from chain on first session)
import { connectDatabase } from "../config/database.js";
import { User } from "../models/User.js";
import { gatewayDepositService } from "../services/gatewayDepositService.js";
import { reservationService } from "../services/reservationService.js";
import { provisionUserWallet, walletFor } from "../services/userWalletService.js";

const DEPOSIT_TARGET_USD = Math.max(0.01, Number(process.argv[2] || 5));
const WALLET_BUFFER_USD = 1;

await connectDatabase();

const demo = await User.findOne({ email: "demo@avalon.local" });
if (!demo) {
  console.error("Demo user not found — run the seed first.");
  process.exit(1);
}

// 1. Own wallet (provision if missing).
if (!demo.circleWalletId) {
  const wallet = await provisionUserWallet(demo);
  console.log(`Provisioned demo wallet ${wallet.walletId} @ ${wallet.address}`);
} else {
  console.log(`Demo wallet already provisioned @ ${demo.circleWalletAddress}`);
}
const wallet = await walletFor(await User.findById(demo._id));

const before = await gatewayDepositService.readBalances({ address: wallet.address });
console.log(`Demo balances: wallet $${before.walletUsd}, Gateway $${before.availableUsd}`);

const missingInGateway = Math.max(0, DEPOSIT_TARGET_USD - before.availableUsd);
if (missingInGateway < 0.01) {
  console.log(`Gateway already at/above the $${DEPOSIT_TARGET_USD} target — nothing to do.`);
  process.exit(0);
}

// 2. Top the demo wallet up from the treasury so it can cover deposit + buffer.
const neededInWallet = missingInGateway + WALLET_BUFFER_USD;
if (before.walletUsd < neededInWallet) {
  const amount = Math.ceil((neededInWallet - before.walletUsd) * 100) / 100;
  console.log(`Transferring $${amount} from the project wallet…`);
  const t = await gatewayDepositService.transferUsdc({ toAddress: wallet.address, amountUsd: amount });
  console.log(`  transfer confirmed: ${t.txHash}`);
}

// 3. Deposit into Gateway from the demo's own wallet.
const key = await reservationService.poolKeyFor(demo._id);
const poolBefore = await reservationService.getPool(key);
console.log(`Depositing $${missingInGateway} into Gateway from the demo wallet…`);
const dep = await gatewayDepositService.deposit({ amountUsd: missingInGateway, ...wallet });
console.log(`  approve: ${dep.approveHash}`);
console.log(`  deposit: ${dep.depositHash}`);

// 4. Same delta-credit rule as the deposit endpoint (see depositToGateway).
if (poolBefore) {
  await reservationService.credit({ key, amountAtomic: dep.depositedAtomic });
  console.log(`  credited existing pool ${key}`);
}

const after = await gatewayDepositService.readBalances({ address: wallet.address });
console.log(`Done. Demo wallet $${after.walletUsd}, Gateway $${after.availableUsd}.`);
process.exit(0);
