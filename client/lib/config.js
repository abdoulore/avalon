"use client";

import { api } from "./api";

let cached;

// Fetches the server's payment mode once (cached) so the UI can reflect whether
// we're settling real test USDC on Arc (circle) or running the local mock economy.
export function getConfig() {
  if (!cached) {
    cached = api("/config").catch(() => ({
      paymentMode: "mock",
      network: "mock",
      supportsTopUp: true,
      agentReasoning: false,
      explorerUrl: null,
      chainId: null,
      platformFeeRate: 0.15,
    }));
  }
  return cached;
}
