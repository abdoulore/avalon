"use client";

import { Check } from "lucide-react";

const money = (n) => `$${Number(n || 0).toFixed(4)}`;

// The live session meter. Reflects the server's cumulative cost (only ever rises),
// so the allowance only ticks DOWN and never bounces. A throttle shows as smaller
// steps; the streaming sheen runs only while billing is actually live (ticking).
export function MoneyMeter({ rateLabel, cost = 0, cap = null, authorized = false, ticking = false }) {
  const c = Math.max(0, Number(cost) || 0);
  const shownCost = cap != null ? Math.min(cap, c) : c;
  const left = cap != null ? Math.max(0, cap - shownCost) : null;
  const pct = cap ? Math.min(100, (shownCost / cap) * 100) : 0;

  return (
    <div className="rounded-2xl border border-white/10 bg-ink-850/70 p-5 font-mono shadow-2xl shadow-black/40">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-zinc-500">
          <span className={`h-2 w-2 rounded-full ${authorized ? "bg-brand" : "bg-zinc-600"} ${ticking ? "av-ping" : ""}`} />
          Live session
        </span>
        <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-zinc-400">{rateLabel}</span>
      </div>

      <div className="mt-5">
        <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Spent this session</div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-4xl font-medium tabular-nums tracking-tight text-white">{money(shownCost)}</span>
          <span className="text-sm text-zinc-500">USDC</span>
        </div>
      </div>

      {left != null ? (
        <div className="mt-4">
          <div className="relative h-2 w-full overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-brand transition-[width] duration-300 ease-out" style={{ width: `${pct}%` }} />
            {ticking ? <div className="av-stream pointer-events-none absolute inset-0 rounded-full" /> : null}
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px]">
            <span className="text-zinc-500">Allowance left</span>
            <span className="tabular-nums text-zinc-300">{money(left)}</span>
          </div>
        </div>
      ) : null}

      <div className="mt-4 flex items-center gap-2 border-t border-white/10 pt-3 text-[12px]">
        {authorized ? (
          <>
            <Check size={14} className="text-brand" />
            <span className="text-zinc-400">
              Approved{cap != null ? ` ${money(cap)}` : ""} · one signature
            </span>
          </>
        ) : (
          <span className="text-zinc-500">Not approved yet</span>
        )}
      </div>
    </div>
  );
}
