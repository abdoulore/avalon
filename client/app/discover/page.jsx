"use client";

import Link from "next/link";
import { ArrowRight, BookOpen, Clock, Film, Loader2, Play, Sparkles, Wallet } from "lucide-react";
import { useState } from "react";
import { AppShell } from "../../components/AppShell";
import { Card, BTN, INPUT } from "../../components/ui";
import { api, formatMoney } from "../../lib/api";

const EXAMPLES = [
  { label: "Short sci-fi under $1", q: "a short sci-fi film", b: "1", m: "30" },
  { label: "A classic horror movie", q: "a classic horror movie", b: "2", m: "90" },
  { label: "Something to read for 20 min", q: "a short story to read", b: "1", m: "20" },
];

export default function DiscoverPage() {
  const [query, setQuery] = useState("");
  const [budget, setBudget] = useState("");
  const [minutes, setMinutes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  async function ask(over = {}) {
    const q = over.q ?? query;
    const b = over.b ?? budget;
    const m = over.m ?? minutes;
    if (!String(q).trim() && !(Number(b) > 0)) {
      setError("Tell Ember what you feel like, or set a budget.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const payload = await api("/concierge", {
        method: "POST",
        body: JSON.stringify({ query: q, budgetUsd: Number(b) || undefined, minutes: Number(m) || undefined }),
      });
      setResult(payload);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function runExample(ex) {
    setQuery(ex.q);
    setBudget(ex.b);
    setMinutes(ex.m);
    ask(ex);
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-8">
        <header>
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-brand">Discover</span>
          <h1 className="mt-2 flex items-center gap-2.5 text-3xl font-semibold tracking-tighter text-white sm:text-4xl">
            <Sparkles size={26} className="text-brand" /> Ask Ember
          </h1>
          <p className="mt-2 max-w-[56ch] text-sm leading-relaxed text-zinc-400">
            Tell Ember what you feel like, your budget, and how long you have. It finds what fits and shows exactly what it
            costs, then links you straight in.
          </p>
        </header>

        {/* Ask panel */}
        <Card className="p-5 sm:p-6">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              ask();
            }}
            className="space-y-4"
          >
            <input
              className={`${INPUT} text-base`}
              placeholder="What do you feel like? e.g. a short sci-fi film"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
            <div className="flex flex-wrap items-end gap-3">
              <label className="grid gap-1.5">
                <span className="flex items-center gap-1.5 text-[12px] text-zinc-500"><Wallet size={13} /> Budget</span>
                <span className="flex items-center rounded-lg border border-white/15 bg-ink-950/60 pl-2.5">
                  <span className="text-sm text-zinc-500">$</span>
                  <input
                    className="w-24 bg-transparent px-1.5 py-2 font-mono text-sm tabular-nums text-zinc-100 outline-none"
                    type="number" min="0" step="0.25" placeholder="1.00" value={budget} onChange={(e) => setBudget(e.target.value)}
                  />
                </span>
              </label>
              <label className="grid gap-1.5">
                <span className="flex items-center gap-1.5 text-[12px] text-zinc-500"><Clock size={13} /> Minutes</span>
                <input
                  className={`${INPUT} w-28`}
                  type="number" min="0" step="5" placeholder="30" value={minutes} onChange={(e) => setMinutes(e.target.value)}
                />
              </label>
              <button className={`${BTN} ml-auto py-2.5`} type="submit" disabled={busy}>
                {busy ? <><Loader2 size={16} className="av-spin" /> Ember is thinking…</> : <><Sparkles size={16} /> Ask Ember</>}
              </button>
            </div>
          </form>

          <div className="mt-4 flex flex-wrap gap-2 border-t border-white/10 pt-4">
            <span className="self-center font-mono text-[11px] uppercase tracking-[0.12em] text-zinc-600">Try</span>
            {EXAMPLES.map((ex) => (
              <button
                key={ex.label}
                type="button"
                disabled={busy}
                onClick={() => runExample(ex)}
                className="rounded-full border border-white/15 px-3 py-1.5 text-[12.5px] text-zinc-300 transition-colors hover:border-brand/50 hover:text-white disabled:opacity-50"
              >
                {ex.label}
              </button>
            ))}
          </div>
        </Card>

        {error ? <div className="rounded-xl border border-stop/40 bg-stop/10 px-4 py-3 text-sm text-zinc-200">{error}</div> : null}

        {/* Results */}
        {result ? (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold tracking-tight text-white">
                {result.picks?.length ? "Ember suggests" : "Nothing matched"}
              </h2>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-400">
                <span className={`h-1.5 w-1.5 rounded-full ${result.source === "ember" ? "bg-brand av-ping" : "bg-zinc-500"}`} />
                {result.source === "ember" ? "picked by Ember" : "matched by rules"}
              </span>
            </div>

            {result.picks?.length ? (
              result.picks.map((p) => <PickCard key={p.contentId} pick={p} />)
            ) : (
              <Card className="px-6 py-10 text-center text-sm text-zinc-400">
                Nothing fit that. Try a higher budget or a broader wish.
              </Card>
            )}
          </section>
        ) : (
          <p className="px-1 text-[13px] text-zinc-600">
            Ember weighs your budget and time against per-second and per-page prices, so it only suggests what you can
            actually afford to enjoy.
          </p>
        )}
      </div>
    </AppShell>
  );
}

function PickCard({ pick }) {
  const video = pick.type === "video";
  const Icon = video ? Film : BookOpen;
  const fit = video
    ? pick.fitsFully
      ? `Full ${pick.durationLabel} runtime`
      : Number.isFinite(pick.watchableMinutes)
      ? `~${pick.watchableMinutes} min on your budget`
      : pick.durationLabel
      ? `${pick.durationLabel} runtime`
      : "runtime not listed"
    : pick.fitsFully
    ? `All ${pick.pages} pages`
    : `~${pick.affordablePages} of ${pick.pages} pages`;

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-4 p-5 sm:flex-row">
        <div className="relative aspect-video w-full flex-none overflow-hidden rounded-xl bg-ink-950 sm:w-44">
          {pick.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={pick.coverUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-zinc-700"><Icon size={26} /></div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="inline-flex flex-none items-center gap-1 rounded-full border border-white/15 bg-white/5 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-zinc-400">
              <Icon size={11} /> {video ? "video" : "book"}
            </span>
            <h3 className="truncate text-base font-semibold text-white">{pick.title}</h3>
          </div>

          {pick.reason ? <p className="mt-2 text-[14px] leading-relaxed text-zinc-300">{pick.reason}</p> : null}

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[12px] tabular-nums text-zinc-500">
            <span>{formatMoney(pick.rateUsd)} /{pick.rateUnit}</span>
            {pick.fullCostUsd != null ? <span>full {formatMoney(pick.fullCostUsd)}</span> : null}
            <span className={pick.fitsFully ? "text-brand" : "text-throttle"}>{fit}</span>
          </div>

          <Link
            href={pick.link}
            className={`${BTN} mt-4`}
          >
            {video ? <Play size={15} /> : <BookOpen size={15} />} {video ? "Watch now" : "Read now"} <ArrowRight size={15} />
          </Link>
        </div>
      </div>
    </Card>
  );
}
