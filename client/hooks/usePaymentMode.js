"use client";

import { useEffect, useState } from "react";
import { getConfig } from "../lib/config";

// Single source of truth in the UI for which economy the server is running.
// Wraps the cached /config fetch so any component can reflect the active mode.
export function usePaymentMode() {
  const [config, setConfig] = useState(null);

  useEffect(() => {
    let alive = true;
    getConfig().then((c) => {
      if (alive) setConfig(c);
    });
    return () => {
      alive = false;
    };
  }, []);

  const circle = config?.paymentMode === "circle";
  return {
    config,
    loaded: Boolean(config),
    mode: config?.paymentMode || "mock",
    circle,
    supportsTopUp: config?.supportsTopUp ?? !circle,
    network: config?.network || "mock",
    explorerUrl: config?.explorerUrl || null,
    platformFeeRate: Number(config?.platformFeeRate) || 0.15,
  };
}
