"use client";

import { BookOpen, Play } from "lucide-react";

const rate = (v) => `$${Number(v || 0).toFixed(4)}`;

// A horizontal scroller of title cards for "more to watch / read".
export function ContentRail({ title, subtitle, items, onSelect }) {
  if (!items?.length) return null;

  return (
    <section>
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-white">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-sm text-zinc-500">{subtitle}</p> : null}
        </div>
      </div>

      <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2 [scrollbar-width:thin]">
        {items.map((item) => {
          const isVideo = item.type === "video";
          return (
            <button
              key={`${title}-${item._id}`}
              type="button"
              onClick={() => onSelect(item)}
              className="group w-[220px] flex-none snap-start overflow-hidden rounded-2xl border border-white/10 bg-ink-850/60 text-left transition-colors hover:border-white/20"
            >
              <span className="relative block aspect-video w-full overflow-hidden bg-ink-800">
                {item.coverUrl ? (
                  <img alt="" loading="lazy" src={item.coverUrl} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
                ) : null}
                <span className="absolute bottom-2 left-2 inline-flex items-center gap-1.5 rounded-full bg-ink-950/75 px-2.5 py-1 text-[11px] font-medium text-zinc-200 backdrop-blur-sm">
                  {isVideo ? <Play size={12} /> : <BookOpen size={12} />} {isVideo ? "Watch" : "Read"}
                </span>
                {isVideo && item.durationLabel ? (
                  <span className="absolute bottom-2 right-2 rounded-md bg-ink-950/75 px-2 py-1 font-mono text-[11px] tabular-nums text-zinc-200 backdrop-blur-sm">
                    {item.durationLabel}
                  </span>
                ) : null}
              </span>
              <span className="block p-3">
                <span className="block truncate text-sm font-semibold text-white">{item.title}</span>
                <span className="block truncate text-[12px] text-zinc-500">{item.creatorName}</span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
