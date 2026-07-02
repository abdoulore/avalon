"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { getApiUrl } from "../lib/api";

const PROBE_TIMEOUT_MS = 2500; // a healthy API answers in well under this
const RETRY_MS = 3000;
const LONG_WAIT_MS = 90_000; // past this, "waking" is probably "down"

// Free-tier hosting (Render) spins the API down when idle; the first request
// then takes ~30-60s. Without this banner that reads as "the app is broken".
// Probe /health once: fast answer -> render nothing; slow/failed -> show an
// honest "waking up" notice and keep polling until it responds.
export function WakeBanner() {
  const [state, setState] = useState("probing"); // probing | waking | awake
  const [startedAt] = useState(() => Date.now());
  const [, forceTick] = useState(0);

  useEffect(() => {
    let alive = true;
    let timer;

    async function probe() {
      const controller = new AbortController();
      const abortTimer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
      try {
        const res = await fetch(`${getApiUrl()}/health`, { signal: controller.signal, cache: "no-store" });
        if (!alive) return;
        if (res.ok) {
          setState("awake");
          return;
        }
        throw new Error("not ok");
      } catch {
        if (!alive) return;
        setState("waking");
        forceTick((n) => n + 1); // re-render so the long-wait copy can switch
        timer = setTimeout(probe, RETRY_MS);
      } finally {
        clearTimeout(abortTimer);
      }
    }

    probe();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, []);

  if (state !== "waking") return null;

  const longWait = Date.now() - startedAt > LONG_WAIT_MS;

  return (
    <div className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
      <div className="flex items-center gap-3 rounded-full border border-white/15 bg-ink-900/95 px-4 py-2.5 shadow-2xl shadow-black/50 backdrop-blur-md">
        <Loader2 size={15} className="av-spin flex-none text-brand" />
        <span className="text-[13px] text-zinc-300">
          {longWait
            ? "Still waking the server - it may take another moment, or the API may be down."
            : "Waking the server - free hosting sleeps when idle. Usually under a minute."}
        </span>
      </div>
    </div>
  );
}
