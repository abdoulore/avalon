"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { usePaymentMode } from "./usePaymentMode";

// Circle mode only: does the signed-in user's Gateway wallet hold enough to
// start this title? A brand-new account has a $0 wallet, so without this check
// the video would start and die on the first bill. Mock mode is always "funded"
// here (its local-balance gate lives on the server's session:start).
//
// Fail-open on a read error: an on-chain RPC hiccup should not hard-block a
// funded user. The reactive needsFunding path (server 402) is the backstop.
export function useGatewayFunding({ minimumUsd = 0, enabled = true } = {}) {
  const { circle, loaded } = usePaymentMode();
  const [checking, setChecking] = useState(true);
  const [availableUsd, setAvailableUsd] = useState(null);

  const refresh = useCallback(async () => {
    if (!circle) {
      setAvailableUsd(null);
      setChecking(false);
      return;
    }
    setChecking(true);
    try {
      const balances = await api("/users/me/gateway-balance");
      setAvailableUsd(Number(balances.availableUsd) || 0);
    } catch {
      setAvailableUsd(null); // unknown; do not hard-block
    } finally {
      setChecking(false);
    }
  }, [circle]);

  useEffect(() => {
    if (!loaded || !enabled) return;
    refresh();
  }, [loaded, enabled, refresh]);

  const funded =
    !circle || availableUsd == null || availableUsd + 1e-9 >= Math.max(0, minimumUsd);

  return {
    circle,
    checking: circle && enabled ? checking : false,
    funded,
    availableUsd,
    refresh,
  };
}
