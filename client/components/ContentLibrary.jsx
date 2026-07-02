"use client";

import { BookOpen, Play } from "lucide-react";

const rate = (v) => `$${Number(v || 0).toFixed(4)}`;

// The pickable catalog. A vertical list of title cards; the active one is ringed
// in emerald. Selecting one swaps the focused player.
export function ContentLibrary({ content, selectedId, onSelect }) {
  if (!content.length) {
    return (
      <div className="rounded-2xl border border-white/10 bg-ink-850/60 p-6 text-sm text-zinc-500">
        No titles match this filter yet.
      </div>
    );
  }

  return (
    <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
      {content.map((item) => {
        const active = item._id === selectedId;
        const isVideo = item.type === "video";
        return (
          <button
            key={item._id}
            type="button"
            onClick={() => onSelect(item)}
            className={`group flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition-colors ${
              active ? "border-brand/40 bg-brand/[0.06] ring-1 ring-brand/30" : "border-white/10 bg-white/[0.02] hover:bg-white/[0.04]"
            }`}
          >
            <span className="relative h-14 w-24 flex-none overflow-hidden rounded-lg bg-ink-800">
              {item.coverUrl ? <img alt="" src={item.coverUrl} className="h-full w-full object-cover" /> : null}
              <span className="absolute bottom-1 left-1 grid h-5 w-5 place-items-center rounded-md bg-ink-950/70 text-zinc-200">
                {isVideo ? <Play size={11} /> : <BookOpen size={11} />}
              </span>
              {isVideo && item.durationLabel ? (
                <span className="absolute bottom-1 right-1 rounded bg-ink-950/80 px-1 py-0.5 font-mono text-[9px] tabular-nums text-zinc-200">
                  {item.durationLabel}
                </span>
              ) : null}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-white">{item.title}</span>
              <span className="block truncate text-[12px] text-zinc-500">{item.creatorName}</span>
              <span className="mt-0.5 block font-mono text-[11px] tabular-nums text-zinc-400">
                {isVideo ? `${rate(item.pricePerSecondUsd)} / sec` : `${rate(item.pricePerPageUsd)} / page`}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
