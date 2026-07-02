/**
 * One-time Gateway deposit (Step-4 hard precondition), now also available from the
 * /top-up page. Settle fails on an empty Gateway balance, so the buyer must deposit
 * USDC into the GatewayWallet before the first real settle:
 *   USDC.approve(GatewayWallet, amount)  ->  GatewayWallet.deposit(USDC, amount)
 * Both submitted by the buyer's Circle developer-controlled wallet. The deposit
 * logic lives in gatewayDepositService so the CLI and the HTTP endpoint share it.
 *
 * Run: node src/scripts/gatewayDeposit.js [usdAmount]   (default 0.20)
 */
import { gatewayDepositService } from "../services/gatewayDepositService.js";

const usd = Number(process.argv[2] || 0.2);

async function main() {
  console.log("=== Avalon Gateway deposit ===");
  console.log(`deposit amount: $${usd}`);

  const before = await gatewayDepositService.readAvailable();
  console.log(`\nGateway availableBalance BEFORE: ${before.availableAtomic} atomic ($${before.availableUsd})`);

  const result = await gatewayDepositService.deposit({ amountUsd: usd });
  console.log(`  approve tx: ${result.approveHash || "(none)"}`);
  console.log(`  deposit tx: ${result.depositHash || "(none)"}`);

  console.log(`\nGateway availableBalance AFTER:  ${result.afterAtomic} atomic ($${result.afterAtomic / 1_000_000})`);
  console.log(
    result.afterAtomic > result.beforeAtomic
      ? "\nDEPOSIT CONFIRMED — Gateway balance increased."
      : "\nWARNING: balance did not increase yet (may still be settling)."
  );
}

main()
  .catch((err) => {
    console.error("\nDeposit error:", err?.response?.data ?? err);
    process.exitCode = 1;
  })
  .finally(() => setTimeout(() => process.exit(process.exitCode ?? 0), 250));
