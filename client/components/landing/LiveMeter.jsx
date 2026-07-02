"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, ShieldCheck } from "lucide-react";

/**
 * The hero signature: a live, self-running miniature of Avalon's money UI.
 * It simulates one metered session — approve once, draw per tick, the agent
 * decides continue → throttle → stop, then a batch settles on Arc — and loops.
 * Not a fake screenshot: it's a real, smaller version of the in-app MoneyMeter
 * + AgentBanner. Honest about being a demo via the "Live session" label.
 */
const CAP = 60_000; // atomic USDC (6dp) → $0.0600 approved cap
const TX = ["0d6b7b71", "b81b1a28", "b3d8de1c"];

const DECISION = {
  continue: {
    source: "EMBER",
    label: "Continue at full rate",
    reason: "Budget healthy. Drawing per second, one chapter still queued.",
  },
  throttle: {
    source: "EMBER",
    label: "Throttle to stretch the budget",
    reason: "Spend trending past the cap. Easing to 0.6× to reach the end.",
  },
  stop: {
    source: "RULE",
    label: "Stop and conserve",
    reason: "Cap reached. Holding draws and settling the open batch on Arc.",
  },
};

const TONE = {
  continue: { text: "text-brand", bar: "bg-brand", chip: "border-brand/40 bg-brand/10 text-brand", edge: "border-l-brand", dot: "bg-brand" },
  throttle: { text: "text-throttle", bar: "bg-throttle", chip: "border-throttle/40 bg-throttle/10 text-throttle", edge: "border-l-throttle", dot: "bg-throttle" },
  stop: { text: "text-stop", bar: "bg-stop", chip: "border-stop/40 bg-stop/10 text-stop", edge: "border-l-stop", dot: "bg-stop" },
};

const fmt = (atomic) => (atomic / 1e6).toFixed(4);
const nextTx = (cur) => TX[(TX.indexOf(cur) + 1) % TX.length];

function step(s) {
  if (s.phase === "stop") {
    if (s.hold >= 24) return { spent: 0, phase: "continue", settled: false, hold: 0, txRef: nextTx(s.txRef) };
    return { ...s, settled: true, hold: s.hold + 1 };
  }
  const rate = s.phase === "continue" ? 480 : 240;
  let spent = Math.min(CAP, s.spent + rate);
  let phase = s.phase;
  if (phase === "continue" && spent >= CAP * 0.6) phase = "throttle";
  if (spent >= CAP * 0.9) phase = "stop";
  return { ...s, spent, phase };
}

export function LiveMeter() {
  const reduce = useReducedMotion();
  const [sim, setSim] = useState(() =>
    reduce
      ? { spent: 41_760, phase: "throttle", settled: false, hold: 0, txRef: TX[0] }
      : { spent: 0, phase: "continue", settled: false, hold: 0, txRef: TX[0] }
  );

  useEffect(() => {
    if (reduce) return;
    const id = setInterval(() => setSim(step), 60);
    return () => clearInterval(id);
  }, [reduce]);

  const tone = TONE[sim.phase];
  const d = DECISION[sim.phase];
  const pct = Math.min(100, (sim.spent / CAP) * 100);
  const streaming = sim.phase !== "stop";

  return (
    <div className="relative">
      <div aria-hidden className="av-glow pointer-events-none absolute -inset-12 -z-10" />
      <div className="rounded-2xl border border-white/10 bg-ink-850/85 p-5 font-mono shadow-2xl shadow-black/50 backdrop-blur-sm sm:p-6">
        {/* header */}
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-zinc-500">
            <span className={`inline-flex h-2 w-2 rounded-full ${tone.dot} ${streaming ? "av-ping" : ""}`} />
            Live session
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-zinc-400">
            <ShieldCheck size={12} className="text-brand" /> Arc testnet
          </span>
        </div>

        {/* spent / remaining */}
        <div className="mt-5 flex items-end justify-between gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Spent this session</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-4xl font-medium tabular-nums tracking-tight text-white sm:text-5xl">${fmt(sim.spent)}</span>
              <span className="text-sm text-zinc-500">USDC</span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Remaining</div>
            <div className="mt-1 text-lg tabular-nums text-zinc-300">${fmt(CAP - sim.spent)}</div>
          </div>
        </div>

        {/* progress bar with streaming sheen */}
        <div className="mt-4">
          <div className="relative h-2 w-full overflow-hidden rounded-full bg-white/10">
            <div className={`h-full rounded-full ${tone.bar} transition-[width] duration-200 ease-out`} style={{ width: `${pct}%` }} />
            {streaming ? <div className="av-stream pointer-events-none absolute inset-0 rounded-full" /> : null}
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-zinc-500">
            <span>of ${fmt(CAP)} approved · one signature</span>
            <span className="tabular-nums">{Math.round(pct)}%</span>
          </div>
        </div>

        {/* agent decision */}
        <AnimatePresence mode="wait">
          <motion.div
            key={sim.phase}
            initial={reduce ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0, y: -6 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className={`mt-5 rounded-xl border border-white/10 border-l-2 ${tone.edge} bg-white/[0.03] p-3.5`}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2">
                <span className={`inline-flex h-2 w-2 rounded-full ${tone.dot} ${streaming ? "av-ping" : ""}`} />
                <span className={`text-sm font-semibold ${tone.text}`}>{d.label}</span>
              </span>
              <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] ${tone.chip}`}>{d.source}</span>
            </div>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-zinc-400">{d.reason}</p>
          </motion.div>
        </AnimatePresence>

        {/* settlement ledger row */}
        <AnimatePresence>
          {sim.settled ? (
            <motion.div
              initial={reduce ? false : { opacity: 0, height: 0, marginTop: 0 }}
              animate={{ opacity: 1, height: "auto", marginTop: 12 }}
              exit={reduce ? undefined : { opacity: 0, height: 0, marginTop: 0 }}
              transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
              className="overflow-hidden"
            >
              <div className="flex items-center justify-between gap-2 rounded-lg border border-brand/20 bg-brand/[0.06] px-3 py-2 text-[11px]">
                <span className="flex items-center gap-1.5 text-brand">
                  <Check size={12} /> Batch settled on Gateway
                </span>
                <span className="tabular-nums text-zinc-400">gw_{sim.txRef} · 85% → creator</span>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}
