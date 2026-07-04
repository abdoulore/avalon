"use client";

import { RefreshCw } from "lucide-react";

// Shared dark UI primitives for the app pages, matching the landing language:
// near-black surfaces, one emerald accent, mono tabular numerics.

export const BTN =
  "inline-flex items-center justify-center gap-2 rounded-full bg-brand px-4 py-2.5 text-sm font-semibold text-ink-950 shadow-[0_0_28px_-10px_rgba(52,211,153,0.6)] transition-transform duration-150 hover:-translate-y-px active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0";

export const BTN_GHOST =
  "inline-flex items-center justify-center gap-2 rounded-full border border-white/15 px-4 py-2.5 text-sm font-semibold text-zinc-200 transition-colors hover:border-white/30 hover:text-white disabled:cursor-not-allowed disabled:opacity-50";

export function Card({ className = "", children, ...rest }) {
  return (
    <div className={`rounded-2xl border border-white/10 bg-ink-850/60 ${className}`} {...rest}>
      {children}
    </div>
  );
}

export function StatTile({ label, value, sub, accent = false }) {
  return (
    <div className={`rounded-2xl border p-5 ${accent ? "border-brand/20 bg-brand/[0.05]" : "border-white/10 bg-ink-850/60"}`}>
      <div className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-zinc-500">{label}</div>
      <div className={`mt-2 font-mono text-2xl font-medium tabular-nums tracking-tight ${accent ? "text-brand" : "text-white"}`}>
        {value}
      </div>
      {sub ? <div className="mt-1 text-[12px] leading-snug text-zinc-500">{sub}</div> : null}
    </div>
  );
}

export function SectionHeading({ title, hint, children }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-white">{title}</h2>
        {hint ? <p className="mt-1 text-sm text-zinc-500">{hint}</p> : null}
      </div>
      {children}
    </div>
  );
}

export const INPUT =
  "w-full rounded-lg border border-white/10 bg-ink-950/60 px-3 py-2.5 text-sm text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-brand/50 focus:ring-1 focus:ring-brand/30";

export function Field({ label, children, full = false }) {
  return (
    <label className={`grid gap-1.5 text-sm ${full ? "sm:col-span-2" : ""}`}>
      <span className="font-medium text-zinc-400">{label}</span>
      {children}
    </label>
  );
}

export function Table({ head, children }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-white/10 bg-ink-850/60">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-white/10 text-left">
            {head.map((h) => (
              <th key={h} className="px-4 py-3 font-mono text-[10.5px] font-medium uppercase tracking-[0.12em] text-zinc-500">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Row({ children }) {
  return <tr className="border-b border-white/[0.06] last:border-0 hover:bg-white/[0.02]">{children}</tr>;
}

export function Td({ children, mono = false, title }) {
  return (
    <td className={`px-4 py-3 text-zinc-300 ${mono ? "font-mono tabular-nums" : ""}`} title={title}>
      {children}
    </td>
  );
}

// A clearly-visible refresh control, shared so it reads the same everywhere:
// filled pill, bright label, brand-tinted icon that spins while busy.
export function RefreshButton({ onClick, busy = false, label = "Refresh", className = "" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-label={label}
      title={label}
      className={`inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/[0.08] px-4 py-2 text-[13px] font-semibold text-zinc-100 transition-colors hover:border-brand/60 hover:bg-white/[0.14] hover:text-white disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    >
      <RefreshCw size={15} className={`text-brand ${busy ? "av-spin" : ""}`} />
      {label}
    </button>
  );
}

// A live mode chip (mock vs Arc testnet) reused across the app chrome.
export function ModeChip({ circle, network = "mock" }) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-medium ${
        circle ? "border-brand/40 bg-brand/10 text-brand" : "border-white/10 bg-white/5 text-zinc-400"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${circle ? "bg-brand av-ping" : "bg-zinc-500"}`} />
      {circle ? `Arc testnet · ${network}` : "Mock economy"}
    </span>
  );
}
