import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { env } from "../config/env.js";

// EIP-712 domain type entry. Circle's signTypedData requires the EIP712Domain
// type to be present in `data.types` (the x402 scheme's `types` omits it).
const EIP712_DOMAIN_TYPE = [
  { name: "name", type: "string" },
  { name: "version", type: "string" },
  { name: "chainId", type: "uint256" },
  { name: "verifyingContract", type: "address" },
];

let client;
export function getCircleWalletClient() {
  if (!client) {
    if (!env.circleApiKey || !env.circleEntitySecret) {
      throw new Error("Circle wallet signing requires CIRCLE_API_KEY and CIRCLE_ENTITY_SECRET");
    }
    // The SDK encrypts the entity secret into a fresh ciphertext per request.
    client = initiateDeveloperControlledWalletsClient({
      apiKey: env.circleApiKey,
      entitySecret: env.circleEntitySecret,
    });
  }
  return client;
}

/**
 * A signer compatible with x402-batching's BatchEvmScheme:
 *   { address, signTypedData({ domain, types, primaryType, message }) -> hex sig }
 *
 * Signing is performed programmatically by the buyer's Circle developer-controlled
 * wallet (an EOA on ARC-TESTNET) via the Signing API — no browser popup, no
 * window.ethereum. This is the whole point of the Step-4 redirect: silent
 * per-batch EIP-3009 authorization.
 *
 * uint256 fields (value/validAfter/validBefore) are serialized as DECIMAL STRINGS
 * (validated: matches x402-batching, encoding-agnostic for EIP-712 hashing).
 */
export function createCircleSigner({
  walletId = env.circleBuyerWalletId,
  address = env.circleBuyerAddress,
} = {}) {
  if (!walletId || !address) {
    throw new Error("Circle signer requires CIRCLE_BUYER_WALLET_ID and CIRCLE_BUYER_ADDRESS");
  }

  const wallets = getCircleWalletClient();

  return {
    address,
    async signTypedData({ domain, types, primaryType, message }) {
      const data = JSON.stringify(
        {
          types: { EIP712Domain: EIP712_DOMAIN_TYPE, ...types },
          domain: { ...domain, chainId: Number(domain.chainId) },
          primaryType,
          message,
        },
        // BatchEvmScheme builds the message with BigInt uint256 values; emit them
        // as decimal strings (JSON has no BigInt).
        (_key, value) => (typeof value === "bigint" ? value.toString() : value)
      );

      const res = await wallets.signTypedData({ walletId, data });
      const signature = res?.data?.signature;
      if (!signature) {
        throw new Error(`Circle signTypedData returned no signature: ${JSON.stringify(res?.data)}`);
      }
      return signature;
    },
  };
}
