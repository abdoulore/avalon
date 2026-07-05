"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, clearGrantPending, getGrantPendingAt } from "../lib/api";
import { usePaymentMode } from "./usePaymentMode";

// Can the signed-in user afford to start this title?
//   mock   -> checked against the local balance passed in (no network).
//   circle -> checked against the on-chain Gateway balance of their wallet.
// A brand-new circle account has a $0 wallet, so without this the video would
// start and die on the first bill. Fail-open on a read error: an RPC hiccup must
// not hard-block a funded user (the server's needsFunding 402 is the backstop).

// Short-lived shared cache so reopening titles doesn't re-read the chain every
// time. Cleared on deposit (see /top-up) and when a grant lands.
const CACHE_TTL_MS = 20000;
let balanceCache = null; // { availableUsd, at }
export function clearGatewayBalanceCache() {
  balanceCache = null;
}

const GRANT_WINDOW_MS = 120000; // how long after signup we keep polling for the grant
const POLL_MS = 5000;

export function useGatewayFunding({ minimumUsd = 0, localBalanceUsd = 0, enabled = true } = {}) {
  const { circle, loaded } = usePaymentMode();
  const [checking, setChecking] = useState(true);
  const [availableUsd, setAvailableUsd] = useState(null);
  const pollRef = useRef(null);

  const fetchBalance = useCallback(async ({ force = false } = {}) => {
    if (!force && balanceCache && Date.now() - balanceCache.at < CACHE_TTL_MS) {
      setAvailableUsd(balanceCache.availableUsd);
      setChecking(false);
      return balanceCache.availableUsd;
    }
    setChecking(true);
    try {
      const balances = await api("/users/me/gateway-balance");
      const usd = Number(balances.availableUsd) || 0;
      balanceCache = { availableUsd: usd, at: Date.now() };
      setAvailableUsd(usd);
      return usd;
    } catch {
      setAvailableUsd(null); // unknown; do not hard-block
      return null;
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    if (!loaded || !enabled) return;
    if (!circle) {
      setChecking(false);
      return;
    }
    fetchBalance();
  }, [loaded, enabled, circle, fetchBalance]);

  const enough = (usd) => usd == null || usd + 1e-9 >= Math.max(0, minimumUsd);

  // A fresh signup's starter grant lands asynchronously; poll for it (force-read,
  // bypassing the cache) until it arrives or the window closes.
  const grantAt = circle ? getGrantPendingAt() : 0;
  const grantActive = grantAt > 0 && Date.now() - grantAt < GRANT_WINDOW_MS;
  const funded = circle ? enough(availableUsd) : (Number(localBalanceUsd) || 0) + 1e-9 >= Math.max(0, minimumUsd);
  const provisioning = circle && grantActive && !funded;

  useEffect(() => {
    if (!provisioning) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    pollRef.current = window.setInterval(async () => {
      const usd = await fetchBalance({ force: true });
      if (enough(usd) || Date.now() - grantAt >= GRANT_WINDOW_MS) {
        if (enough(usd)) clearGrantPending();
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      }
    }, POLL_MS);
    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provisioning, grantAt, minimumUsd]);

  return {
    circle,
    checking: circle && enabled ? checking && availableUsd == null : false,
    funded,
    provisioning,
    availableUsd,
    refresh: () => fetchBalance({ force: true }),
  };
}
