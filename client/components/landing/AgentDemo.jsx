"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Cpu, ShieldAlert, WifiOff } from "lucide-react";

/**
 * Explains Ember, the budget agent: every tick, deterministic guards run first;
 * genuine judgment calls go to Ember's model (DeepSeek); a model failure falls back
 * to "approve within policy" so billing never blocks. Auto-cycles, pauses on hover.
 */
const STATES = [
  {
    id: "continue",
    source: "EMBER",
    kind: "model decision",
    Icon: Cpu,
    label: "Continue at full rate",
    rate: "1.0×",
    ctx: [["remaining", "64%"], ["item consumed", "30%"], ["queued", "1 item"]],
    reason: "Plenty of headroom. Keep drawing per second, no reason to conserve yet.",
  },
  {
    id: "throttle",
    source: "EMBER",
    kind: "model decision",
    Icon: Cpu,
    label: "Throttle to stretch the budget",
    rate: "0.6×",
    ctx: [["remaining", "22%"], ["item consumed", "55%"], ["queued", "2 items"]],
    reason: "More content queued than budget. Slow the draw so the session reaches the end instead of stopping mid-chapter.",
  },
  {
    id: "stop",
    source: "RULE",
    kind: "deterministic guard",
    Icon: ShieldAlert,
    label: "Stop and conserve",
    rate: "0×",
    ctx: [["remaining", "3%"], ["item consumed", "80%"], ["check", "would-exceed"]],
    reason: "A draw would exceed the approved cap. The guard halts before the model is even consulted, then settles the open batch.",
  },
  {
    id: "offline",
    source: "MODEL OFFLINE",
    kind: "safe fallback",
    Icon: WifiOff,
    label: "Approve within policy",
    rate: "1.0×",
    ctx: [["model", "timeout"], ["within cap", "yes"], ["billing", "continues"]],
    reason: "The model errored or timed out. Avalon never blocks billing; it falls back to approve-within-policy and keeps playing.",
  },
];

const TONE = {
  continue: { text: "text-brand", edge: "border-l-brand", dot: "bg-brand", chip: "border-brand/40 bg-brand/10 text-brand", ring: "ring-brand/40 bg-brand/[0.06]" },
  throttle: { text: "text-throttle", edge: "border-l-throttle", dot: "bg-throttle", chip: "border-throttle/40 bg-throttle/10 text-throttle", ring: "ring-throttle/40 bg-throttle/[0.06]" },
  stop: { text: "text-stop", edge: "border-l-stop", dot: "bg-stop", chip: "border-stop/40 bg-stop/10 text-stop", ring: "ring-stop/40 bg-stop/[0.06]" },
  offline: { text: "text-zinc-200", edge: "border-l-zinc-500", dot: "bg-zinc-500", chip: "border-white/15 bg-white/5 text-zinc-400", ring: "ring-white/15 bg-white/[0.04]" },
};

export function AgentDemo() {
  const reduce = useReducedMotion();
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (reduce || paused) return;
    const id = setInterval(() => setI((v) => (v + 1) % STATES.length), 3400);
    return () => clearInterval(id);
  }, [reduce, paused]);

  const active = STATES[i];
  const tone = TONE[active.id];

  return (
    <div
      className="grid gap-5 lg:grid-cols-[300px_1fr]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* selector list */}
      <div className="flex flex-col gap-2">
        {STATES.map((s, idx) => {
          const t = TONE[s.id];
          const on = idx === i;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setI(idx)}
              className={`flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors ${
                on ? `border-white/10 ring-1 ${t.ring}` : "border-white/10 bg-white/[0.02] hover:bg-white/[0.04]"
              }`}
            >
              <span className={`inline-flex h-2 w-2 flex-none rounded-full ${t.dot} ${on && !reduce ? "av-ping" : ""}`} />
              <span className="min-w-0">
                <span className={`block text-sm font-semibold ${on ? t.text : "text-zinc-200"}`}>{s.label}</span>
                <span className="block font-mono text-[10.5px] uppercase tracking-[0.12em] text-zinc-500">{s.kind}</span>
              </span>
            </button>
          );
        })}
      </div>

      {/* decision card */}
      <AnimatePresence mode="wait">
        <motion.div
          key={active.id}
          initial={reduce ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? undefined : { opacity: 0, y: -10 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className={`rounded-2xl border border-white/10 border-l-2 ${tone.edge} bg-ink-850/70 p-5 sm:p-7`}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="flex items-center gap-2.5">
              <active.Icon size={18} className={tone.text} />
              <span className={`text-lg font-semibold tracking-tight ${tone.text}`}>{active.label}</span>
            </span>
            <span className={`rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] ${tone.chip}`}>
              {active.source}
            </span>
          </div>

          <p className="mt-3 max-w-[60ch] text-[15px] leading-relaxed text-zinc-400">{active.reason}</p>

          <div className="mt-6 grid grid-cols-3 gap-3 border-t border-white/10 pt-5">
            {active.ctx.map(([k, v]) => (
              <div key={k}>
                <div className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-zinc-500">{k}</div>
                <div className="mt-1 font-mono text-base tabular-nums text-zinc-200">{v}</div>
              </div>
            ))}
          </div>

          <div className="mt-5 flex items-center justify-between rounded-xl bg-white/[0.03] px-4 py-3">
            <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-500">Target draw rate</span>
            <span className={`font-mono text-2xl font-medium tabular-nums ${tone.text}`}>{active.rate}</span>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
