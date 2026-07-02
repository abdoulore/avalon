"use client";

// Strip em-dashes from any model-authored string before it renders (the design
// brief bans them in every visible UI string; the model can emit them).
const clean = (s) => String(s || "").replace(/\s*[—–]\s*/g, " - ").trim();

const ACTION_TITLE = {
  throttle: "Ember throttled to a lower rate",
  stop: "Ember paused spending",
  continue: "Spending within policy",
};

// Deterministic reasons are machine codes; humanize them. Ember's model reasons
// are its own words, shown verbatim (cleaned).
const RULE_REASON = {
  budget_exhausted: "Budget for this session is used up",
  would_exceed_budget: "This charge would exceed the budget",
  rate_throttled: "Above the rate you set",
  within_policy: "Comfortably inside the budget",
};

// "Ember" = the model reasoned this call; "rule" = a fast deterministic guard;
// "model offline" = the model was unavailable and Ember fell back within policy.
const SOURCE_LABEL = { deepseek: "Ember", cache: "Ember", deterministic: "rule", fallback: "model offline" };

const TONE = {
  continue: { text: "text-zinc-200", edge: "border-l-white/20", dot: "bg-zinc-500", chip: "border-white/15 bg-white/5 text-zinc-400" },
  throttle: { text: "text-throttle", edge: "border-l-throttle", dot: "bg-throttle", chip: "border-throttle/40 bg-throttle/10 text-throttle" },
  stop: { text: "text-stop", edge: "border-l-stop", dot: "bg-stop", chip: "border-stop/40 bg-stop/10 text-stop" },
};

// THE signature element. An Ember (model) throttle/stop shouts (tint + colored
// stripe + live dot); deterministic and fallback stay muted so a viewer can see
// this is an agent decision, not a static threshold.
export function AgentBanner({ decision }) {
  if (!decision || !decision.action) {
    return (
      <div className="rounded-xl border border-white/10 border-l-2 border-l-white/20 bg-white/[0.03] p-3.5">
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-zinc-500" />
            <span className="text-sm font-semibold text-zinc-300">Ember is watching the budget</span>
          </span>
          <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-400">
            Ember
          </span>
        </div>
      </div>
    );
  }

  const { action, reason, source } = decision;
  const isModel = source === "deepseek" || source === "cache";
  const live = isModel && (action === "throttle" || action === "stop");
  const title = ACTION_TITLE[action] || "Spending within policy";
  const body = isModel ? clean(reason) : RULE_REASON[reason] || clean(reason);
  const tone = TONE[action] || TONE.continue;
  const tint = live ? (action === "stop" ? "bg-stop/[0.06]" : "bg-throttle/[0.06]") : "bg-white/[0.03]";

  return (
    <div className={`rounded-xl border border-white/10 border-l-2 ${tone.edge} ${tint} p-3.5`} role="status" aria-live="polite">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2">
          <span className={`h-2 w-2 flex-none rounded-full ${tone.dot} ${live ? "av-ping" : ""}`} />
          <span className={`text-sm font-semibold ${tone.text}`}>{title}</span>
        </span>
        <span className={`flex-none rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] ${tone.chip}`}>
          {SOURCE_LABEL[source] || "agent"}
        </span>
      </div>
      {body ? <p className="mt-1.5 text-[12.5px] leading-relaxed text-zinc-400">{body}</p> : null}
    </div>
  );
}
