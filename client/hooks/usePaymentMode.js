"use client";

import { useEffect, useState } from "react";
import { getConfig } from "../lib/config";

// Single source of truth in the UI for which economy the server is running.
// Wraps the cached /config fetch so any component can reflect the active mode.
// When the server is unreachable we surface `unreachable` (never a fake "mock")
// and keep retrying so the UI recovers on its own once the backend is back.
export function usePaymentMode() {
  const [config, setConfig] = useState(null);

  useEffect(() => {
    let alive = true;
    let timer;
    const load = () => {
      getConfig().then((c) => {
        if (!alive) return;
        setConfig(c);
        if (c?.unreachable) timer = setTimeout(load, 4000);
      });
    };
    load();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, []);

  const unreachable = config?.unreachable === true;
  const circle = config?.paymentMode === "circle";
  return {
    config,
    loaded: Boolean(config) && !unreachable,
    unreachable,
    mode: config?.paymentMode || (unreachable ? "unknown" : "mock"),
    circle,
    supportsTopUp: config?.supportsTopUp ?? !circle,
    network: config?.network || "mock",
    explorerUrl: config?.explorerUrl || null,
    platformFeeRate: Number(config?.platformFeeRate) || 0.15,
  };
}
