import { env } from "../config/env.js";
import { gatewayDepositService } from "./gatewayDepositService.js";
import { walletFor } from "./userWalletService.js";

// Keep at least this much test USDC in the treasury wallet; below it, skip the
// grant rather than draining the project dry to a negative balance.
const TREASURY_FLOOR_USD = 1;

// Arc uses USDC as its GAS token, so the deposit's approve+deposit burns a
// sliver of the user's USDC. We therefore transfer the grant PLUS this buffer
// and deposit only the grant, leaving the buffer in-wallet to pay that gas.
// Without it, depositing the exact transferred amount reverts (exceeds balance).
const GAS_BUFFER_USD = 0.05;

// A Circle developer-controlled wallet processes transactions one nonce at a
// time, so two grants transferring from the treasury at once (two simultaneous
// signups) race and one reverts. Serialize every grant through a single promise
// chain: treasury transfers happen strictly one after another.
let grantTail = Promise.resolve();

// One-time starter grant (circle mode): move env.signupGrantUsd of test USDC
// from the treasury to the new user's own wallet and deposit it into Gateway, so
// their first session can reserve against it. Slow (three on-chain txs), so the
// caller runs this in the background and never blocks signup on it.
//
// Best-effort and self-guarding: no-op when grants are off, not circle, or the
// treasury is too low. Errors are the caller's to log; signup already succeeded.
export function grantStarterFunds({ user }) {
  const result = grantTail.then(() => runGrant({ user }), () => runGrant({ user }));
  grantTail = result.catch(() => {}); // keep the chain alive past a failed grant
  return result;
}

async function runGrant({ user }) {
  const grantUsd = env.signupGrantUsd;
  if (grantUsd <= 0) return { ok: false, skipped: "grants_off" };

  // Transfer the grant plus the gas buffer; deposit only the grant.
  const fundUsd = grantUsd + GAS_BUFFER_USD;
  const treasury = await gatewayDepositService.readBalances(); // defaults to project wallet
  if (treasury.walletUsd < fundUsd + TREASURY_FLOOR_USD) {
    console.warn(`Starter grant skipped: treasury low ($${treasury.walletUsd}).`);
    return { ok: false, skipped: "treasury_low" };
  }

  const wallet = await walletFor(user);
  await gatewayDepositService.transferUsdc({ toAddress: wallet.address, amountUsd: fundUsd });
  const dep = await gatewayDepositService.deposit({ amountUsd: grantUsd, ...wallet });
  console.log(`Starter grant: $${grantUsd} to ${user._id} (${wallet.address}), gateway now $${dep.afterAtomic / 1e6}.`);
  return { ok: true, grantedUsd: grantUsd };
}
