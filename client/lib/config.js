"use client";

import { api } from "./api";

let cached; // resolved successful config only
let inflight; // in-flight fetch, cleared on failure so the next call retries

// Fetches the server's payment mode once (cached) so the UI can reflect whether
// we're settling real test USDC on Arc (circle) or running the local mock economy.
// On failure we deliberately do NOT cache a mock fallback: a brief backend hiccup
// would otherwise quietly present the wrong economy. Callers get { unreachable:
// true } and can retry, since getConfig re-fetches until the server answers.
export function getConfig() {
  if (cached) return Promise.resolve(cached);
  if (!inflight) {
    inflight = api("/config")
      .then((config) => {
        cached = config;
        inflight = null;
        return config;
      })
      .catch(() => {
        inflight = null;
        return { unreachable: true };
      });
  }
  return inflight;
}
