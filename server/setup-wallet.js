// One-time setup: creates a wallet set and one EOA buyer wallet on Arc testnet,
// then prints the IDs/address you need for .env and funding.
//
// Run AFTER register-entity-secret.js, from the server workspace, with both
// CIRCLE_API_KEY and CIRCLE_ENTITY_SECRET in .env:
//
//   node --env-file=.env setup-wallet.js
//
// Notes:
// - "ARC-TESTNET" (uppercase) is the Wallets SDK chain id. This is DISTINCT from
//   the Gateway facilitator's CAIP-2 "eip155:5042002" in circleGatewayService.js.
//   Two Circle subsystems, two conventions for the same chain — keep them apart.
// - accountType "EOA": EIP-3009 TransferWithAuthorization verifies via standard
//   ECDSA recovery (the EOA path). SCA would require EIP-1271 — not used here.

import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";

const apiKey = process.env.CIRCLE_API_KEY;
const entitySecret = process.env.CIRCLE_ENTITY_SECRET;
if (!apiKey || !entitySecret) {
  throw new Error("CIRCLE_API_KEY and CIRCLE_ENTITY_SECRET must both be in .env (run register-entity-secret.js first).");
}

const client = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });

const walletSetResponse = await client.createWalletSet({ name: "Avalon Buyers" });
const walletSet = walletSetResponse.data?.walletSet;
if (!walletSet?.id) {
  throw new Error("Wallet set creation failed: no ID returned");
}

const walletResponse = await client.createWallets({
  walletSetId: walletSet.id,
  blockchains: ["ARC-TESTNET"],
  count: 1,
  accountType: "EOA",
});

const wallet = walletResponse.data?.wallets?.[0];
if (!wallet?.address) {
  throw new Error("Wallet creation failed: no address returned");
}

console.log("\n=== Avalon buyer wallet created ===");
console.log("Wallet set ID :", walletSet.id);
console.log("Wallet ID     :", wallet.id);
console.log("Address       :", wallet.address);
console.log("Blockchain    :", wallet.blockchain);
console.log("\nAdd to .env:");
console.log(`CIRCLE_WALLET_SET_ID=${walletSet.id}`);
console.log("\nNext: fund the Address above at https://faucet.circle.com (Arc Testnet + USDC).");
