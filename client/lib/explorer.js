// Helpers for turning settled-batch tx hashes and payer addresses into
// verify-on-chain links. `base` is the Arc explorer (Blockscout) root from
// /config — null in mock mode, where refs aren't on any chain.

// Circle's GatewayWallet contract on Arc testnet — where settlement batches
// actually land (`submitBatch`, ~every 15 min). Individual transfers inside a
// batch are NOT separately visible on the explorer; this contract's activity is
// the honest public evidence that the settlement pipeline is live.
export const GATEWAY_WALLET_ADDRESS = "0x0077777d7EBA4688BDeF3E311b846F25870A19B9";

// A real on-chain EVM tx hash: 0x + 64 hex. Circle Gateway settles in async
// batches, so at settle time it often returns a Circle batch UUID (not yet an
// EVM hash) — those must NOT be linked as /tx/{ref} or the explorer 404s.
export function isTxHash(value) {
  return typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value);
}

export function txUrl(base, hash) {
  if (!base || !isTxHash(hash)) return null;
  return `${base}/tx/${hash}`;
}

export function addressUrl(base, address) {
  if (!base || !address) return null;
  return `${base}/address/${address}`;
}

// Middle-truncate a hash/address for dense display: 0x1234…abcd.
export function shortHash(value, lead = 10, tail = 6) {
  if (!value) return "—";
  const v = String(value);
  return v.length > lead + tail + 1 ? `${v.slice(0, lead)}…${v.slice(-tail)}` : v;
}
