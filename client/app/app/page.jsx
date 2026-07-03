"use client";

import dynamic from "next/dynamic";
import { WalletCards } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "../../components/AppShell";
import { ContentLibrary } from "../../components/ContentLibrary";
import { ContentRail } from "../../components/ContentRail";
import { Toast } from "../../components/Toast";
import { api, formatMoney } from "../../lib/api";
import { useToast } from "../../hooks/useToast";
import { usePaymentMode } from "../../hooks/usePaymentMode";

const VideoViewer = dynamic(() => import("../../components/VideoViewer").then((mod) => mod.VideoViewer), {
  ssr: false,
  loading: () => <PlayerSkeleton label="Preparing player…" />,
});
const BookReader = dynamic(() => import("../../components/BookReader").then((mod) => mod.BookReader), {
  ssr: false,
  loading: () => <PlayerSkeleton label="Opening reader…" />,
});

const FILTERS = [
  { id: "all", label: "All" },
  { id: "video", label: "Video" },
  { id: "book", label: "Books" },
];

function PlayerSkeleton({ label }) {
  return (
    <div className="grid place-items-center rounded-2xl border border-white/10 bg-ink-850/60 py-24 text-sm text-zinc-500">
      {label}
    </div>
  );
}

export default function AppHomePage() {
  const [content, setContent] = useState([]);
  const [selected, setSelected] = useState(null);
  const [user, setUser] = useState(null);
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const { message, showToast } = useToast();
  const { circle, network } = usePaymentMode();

  const filteredContent = useMemo(() => {
    if (filter === "all") return content;
    return content.filter((item) => item.type === filter);
  }, [content, filter]);
  const videos = useMemo(() => content.filter((item) => item.type === "video"), [content]);
  const books = useMemo(() => content.filter((item) => item.type === "book"), [content]);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      setLoading(true);
      const [contentPayload, userPayload] = await Promise.all([api("/content"), api("/users/me")]);
      const items = contentPayload.content;
      setContent(items);
      // Deep link from Ember: /app?play=<id> opens that title; else the first.
      const playId = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("play") : null;
      const initial = (playId && items.find((c) => c._id === playId)) || items[0] || null;
      setSelected(initial);
      setUser(userPayload.user);
      if (playId && initial) {
        window.setTimeout(() => document.getElementById("now-playing")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
        showToast(`Opening ${initial.title}. Approve a budget to start.`);
      } else {
        showToast("You're set. Only the seconds and pages you use are charged.");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function refreshUser() {
    const payload = await api("/users/me");
    setUser(payload.user);
  }

  function selectAndScroll(item) {
    setSelected(item);
    window.setTimeout(() => document.getElementById("now-playing")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  return (
    <AppShell>
      <div className="space-y-12">
        {/* Header */}
        <header className="flex flex-wrap items-end justify-between gap-4" id="now-playing">
          <div>
            <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-brand">Watch &amp; read</span>
            <h1 className="mt-2 text-3xl font-semibold tracking-tighter text-white sm:text-4xl">Billed by the moment</h1>
            <p className="mt-2 max-w-[52ch] text-sm leading-relaxed text-zinc-400">
              Approve once, then watch per second and read per page. The meter and the agent stay live as you go.
            </p>
          </div>
          {circle ? (
            <span className="inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand/10 px-3.5 py-2 text-sm text-brand">
              <WalletCards size={15} /> Funded on <span className="font-mono">{network}</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3.5 py-2 text-sm text-zinc-200">
              <WalletCards size={15} /> <span className="font-mono tabular-nums">{user ? formatMoney(user.balanceUsd) : "…"}</span> USDC
            </span>
          )}
        </header>

        {error ? (
          <div className="rounded-xl border border-stop/40 bg-stop/10 px-4 py-3 text-sm text-zinc-200">{error}</div>
        ) : null}

        {/* The focus: player + live money panel */}
        <section>
          {selected?.type === "video" ? (
            <VideoViewer content={selected} user={user} onBalanceChange={refreshUser} />
          ) : selected?.type === "book" ? (
            <BookReader content={selected} user={user} onBalanceChange={refreshUser} />
          ) : loading ? (
            <PlayerSkeleton label="Loading Avalon…" />
          ) : (
            <div className="grid place-items-center rounded-2xl border border-white/10 bg-ink-850/60 py-24 text-sm text-zinc-500">
              Pick a title to start.
            </div>
          )}
        </section>

        {/* Browse */}
        <section>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-semibold tracking-tight text-white">Library</h2>
            <div className="flex gap-1.5">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilter(f.id)}
                  className={`rounded-full px-3.5 py-1.5 text-sm transition-colors ${
                    filter === f.id ? "bg-brand text-ink-950 font-semibold" : "border border-white/10 text-zinc-400 hover:text-white"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          <ContentLibrary content={filteredContent} selectedId={selected?._id} onSelect={selectAndScroll} />
        </section>

        <ContentRail title="More to watch" subtitle="Usage-based titles you can sample safely" items={videos.slice(0, 8)} onSelect={selectAndScroll} />
        <ContentRail title="More to read" subtitle="Per-page billing on the same rail" items={books.slice(0, 8)} onSelect={selectAndScroll} />
      </div>
      <Toast message={message} />
    </AppShell>
  );
}
