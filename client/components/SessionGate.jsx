"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Plus, ShieldCheck, Wallet } from "lucide-react";
import { BTN } from "./ui";

const money = (n) => `$${Number(n || 0).toFixed(2)}`;
const PRESETS = [0.06, 0.25, 1, 5];

// One approval moment. mode "approve" lets the user CHOOSE the session cap (preset
// or custom); mode "extend" is the quick top-up after the allowance runs out.
export function SessionGate({ mode = "approve", defaultAmount = 0.25, max = Infinity, overlay = false, onApprove, busy = false, circle = false }) {
  // flex + m-auto (not grid centering): when the host box is shorter than the
  // gate (a 16:9 player on a phone) the content scrolls from the top instead
  // of clipping equally off both ends with the button unreachable.
  const wrap = overlay
    ? "absolute inset-0 z-10 flex overflow-y-auto rounded-[inherit] bg-ink-950/85 p-6 backdrop-blur-sm"
    : "flex p-6";

  if (mode === "fund") {
    return (
      <div className={wrap}>
        <div className="m-auto max-w-sm text-center">
          <div className="mx-auto mb-4 grid h-11 w-11 place-items-center rounded-full border border-brand/40 bg-brand/10 text-brand">
            <Wallet size={18} />
          </div>
          <h3 className="text-lg font-semibold tracking-tight text-white">
            {circle ? "Fund your wallet to start" : "Add balance to start"}
          </h3>
          <p className="mx-auto mt-2 max-w-[38ch] text-sm leading-relaxed text-zinc-400">
            {circle
              ? "Watching settles from your Gateway balance on Arc, and yours is empty. Add test USDC, then come back to press play."
              : "You are out of test balance. Add more on the Top up page, then come back to press play."}
          </p>
          <Link href="/top-up" className={`${BTN} mt-5`}>
            <Wallet size={16} /> {circle ? "Fund your wallet" : "Add balance"} <ArrowRight size={15} />
          </Link>
        </div>
      </div>
    );
  }

  if (mode === "extend") {
    return (
      <div className={wrap}>
        <div className="m-auto max-w-sm text-center">
          <div className="mx-auto mb-4 grid h-11 w-11 place-items-center rounded-full border border-stop/40 bg-stop/10 text-stop">
            <Plus size={18} />
          </div>
          <h3 className="text-lg font-semibold tracking-tight text-white">Allowance used up</h3>
          <p className="mx-auto mt-2 max-w-[34ch] text-sm leading-relaxed text-zinc-400">
            You have spent the budget you approved for this session. Approve more to keep going.
          </p>
          <button className={`${BTN} mt-5`} type="button" onClick={onApprove} disabled={busy}>
            <Plus size={16} /> Approve more
          </button>
        </div>
      </div>
    );
  }

  return <ApproveCard wrap={wrap} defaultAmount={defaultAmount} max={max} onApprove={onApprove} busy={busy} />;
}

// A neutral overlay for transient states (checking balance, grant landing) that
// covers the player like a gate but carries no action.
export function StatusOverlay({ children }) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 rounded-[inherit] bg-ink-950/85 p-6 text-center text-sm text-zinc-400 backdrop-blur-sm">
      {children}
    </div>
  );
}

function ApproveCard({ wrap, defaultAmount, max, onApprove, busy }) {
  const [sel, setSel] = useState(String(defaultAmount));
  const presets = PRESETS.filter((p) => p <= max + 1e-9);
  const clamp = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return 0.01;
    return Math.min(Number.isFinite(max) ? max : n, Math.max(0.01, n));
  };
  const amount = clamp(sel);
  const selNum = Number(sel);

  return (
    <div className={wrap}>
      <div className="m-auto w-full max-w-sm text-center">
        <div className="mx-auto mb-4 grid h-11 w-11 place-items-center rounded-full border border-brand/40 bg-brand/10 text-brand">
          <ShieldCheck size={18} />
        </div>
        <h3 className="text-lg font-semibold tracking-tight text-white">Approve a budget for this session</h3>
        <p className="mx-auto mt-2 max-w-[40ch] text-sm leading-relaxed text-zinc-400">
          The meter draws against this until it runs out. One signature, no per-tick prompts.
        </p>

        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {presets.map((p) => {
            const on = Math.abs(selNum - p) < 1e-9;
            return (
              <button
                key={p}
                type="button"
                onClick={() => setSel(String(p))}
                className={`rounded-full border px-3.5 py-1.5 font-mono text-sm tabular-nums transition-colors ${
                  on ? "border-brand bg-brand text-ink-950 font-semibold" : "border-white/15 text-zinc-300 hover:border-white/30 hover:text-white"
                }`}
              >
                {money(p)}
              </button>
            );
          })}
        </div>

        <div className="mt-3 flex items-center justify-center gap-2 text-sm text-zinc-500">
          <span>Custom</span>
          <span className="flex items-center rounded-lg border border-white/15 bg-ink-950/60 pl-2.5">
            <span className="text-zinc-500">$</span>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={sel}
              onChange={(e) => setSel(e.target.value)}
              className="w-24 bg-transparent px-1.5 py-1.5 font-mono tabular-nums text-zinc-100 outline-none"
            />
          </span>
        </div>
        {Number.isFinite(max) ? (
          <p className="mt-2 font-mono text-[11px] text-zinc-600">up to {money(max)} available</p>
        ) : null}

        <button className={`${BTN} mt-5 w-full`} type="button" onClick={() => onApprove(amount)} disabled={busy}>
          <ShieldCheck size={16} /> Approve up to {money(amount)}
        </button>
      </div>
    </div>
  );
}
