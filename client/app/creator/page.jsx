"use client";

import { BookOpen, Film, Save, Sparkles, Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import { AppShell } from "../../components/AppShell";
import { AdminTokenField, Card, StatTile, Table, Row, Td, Field, INPUT, BTN, RefreshButton, SectionHeading } from "../../components/ui";
import { api, formatMoney } from "../../lib/api";
import { usePaymentMode } from "../../hooks/usePaymentMode";

const initialForm = {
  title: "",
  creatorName: "",
  type: "video",
  description: "",
  coverUrl: "",
  mediaUrl: "",
  durationLabel: "",
  pages: 12,
  pricePerSecondUsd: 0.002,
  pricePerPageUsd: 0.03,
  freePreviewSeconds: 0,
  freePreviewPages: 0,
  isPremium: false,
  liveEventPricePerSecondUsd: 0,
};

export default function CreatorPage() {
  const [form, setForm] = useState(initialForm);
  const [content, setContent] = useState([]);
  const [dash, setDash] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { circle, network, platformFeeRate } = usePaymentMode();
  // The split comes from /api/config (the server's PLATFORM_FEE_RATE) so a fee
  // change can never silently falsify what this page promises creators.
  const creatorShare = 1 - platformFeeRate;
  const creatorPct = Math.round(creatorShare * 100);
  const platformPct = 100 - creatorPct;

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const [contentPayload, dashboardPayload] = await Promise.all([api("/content"), api("/content/creator/dashboard")]);
      setContent(contentPayload.content);
      setDash(dashboardPayload);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      await api("/content", { method: "POST", body: JSON.stringify(form) });
      setForm(initialForm);
      setMessage("Published. It is live in the catalog and starts earning the moment someone watches or reads.");
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  const set = (field, value) => setForm((c) => ({ ...c, [field]: value }));

  const totals = dash?.totals || {};
  const earners = (dash?.content || []).filter((c) => Number(c.creatorPayoutUsd) > 0);
  const maxPayout = earners.reduce((m, c) => Math.max(m, Number(c.creatorPayoutUsd || 0)), 0) || 1;
  const gross = Number(totals.grossAmountUsd || 0);
  const earned = Number(totals.totalEarningsUsd || 0);

  return (
    <AppShell>
      <div className="space-y-12">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-brand">Creator</span>
            <h1 className="mt-2 text-3xl font-semibold tracking-tighter text-white sm:text-4xl">Earn by the moment</h1>
            <p className="mt-2 max-w-[52ch] text-sm leading-relaxed text-zinc-400">
              Publish once, then earn every second watched and every page read. You keep {creatorPct}%, settled per batch.
            </p>
            <p className="mt-1 text-[12px] text-zinc-600">Demo instance: stats aggregate all usage on this deployment.</p>
          </div>
          <RefreshButton onClick={load} busy={loading} />
        </header>

        {message ? <div className="rounded-xl border border-brand/30 bg-brand/10 px-4 py-3 text-sm text-zinc-200">{message}</div> : null}
        {error ? <div className="rounded-xl border border-stop/40 bg-stop/10 px-4 py-3 text-sm text-zinc-200">{error}</div> : null}

        {/* Earnings cockpit */}
        <section className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <Card className="relative overflow-hidden p-6">
            <div aria-hidden className="av-glow pointer-events-none absolute -right-16 -top-16 h-56 w-56 opacity-60" />
            <div className="relative">
              <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-zinc-500">You have earned</div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="font-mono text-4xl font-medium tabular-nums tracking-tight text-brand sm:text-5xl">
                  {formatMoney(earned)}
                </span>
                <span className="text-sm text-zinc-500">USDC</span>
              </div>
              <p className="mt-1.5 text-[13px] text-zinc-500">
                from {formatMoney(gross)} charged ·{" "}
                {circle ? <>settles to your wallet on <span className="text-zinc-300">{network}</span></> : "mock economy"}
              </p>

              {/* creator / platform split (rate served by /api/config) */}
              <div className="mt-6">
                <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-white/10">
                  <div className="bg-brand" style={{ width: `${creatorPct}%` }} />
                  <div className="bg-white/20" style={{ width: `${platformPct}%` }} />
                </div>
                <div className="mt-2 flex items-center justify-between font-mono text-[11px]">
                  <span className="flex items-center gap-1.5 text-brand">
                    <span className="h-1.5 w-1.5 rounded-full bg-brand" /> {creatorPct}% you
                  </span>
                  <span className="flex items-center gap-1.5 text-zinc-500">
                    <span className="h-1.5 w-1.5 rounded-full bg-white/30" /> {platformPct}% platform
                  </span>
                </div>
              </div>
            </div>
          </Card>

          <div className="grid grid-cols-2 gap-4">
            <StatTile label="Pending payout" value={formatMoney(totals.pendingPayoutUsd || 0)} accent />
            <StatTile label="Platform fee" value={formatMoney(totals.platformFeeUsd || 0)} />
            <StatTile label="Watch time" value={`${totals.secondsWatched || 0}s`} />
            <StatTile label="Pages read" value={totals.pagesRead || 0} />
          </div>
        </section>

        {/* Publish: form + live preview & projection */}
        <section>
          <SectionHeading title="Publish new content" hint="Set per-moment pricing and see what it earns before you ship." />
          <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
            <Card className="p-6">
              <form className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit}>
                <Field label="Title">
                  <input className={INPUT} required value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Untitled" />
                </Field>
                <Field label="Creator">
                  <input className={INPUT} required value={form.creatorName} onChange={(e) => set("creatorName", e.target.value)} placeholder="Your name" />
                </Field>
                <Field label="Type">
                  <select className={INPUT} value={form.type} onChange={(e) => set("type", e.target.value)}>
                    <option value="video">Video</option>
                    <option value="book">Book</option>
                  </select>
                </Field>
                <Field label="Cover URL">
                  <input className={INPUT} value={form.coverUrl} onChange={(e) => set("coverUrl", e.target.value)} placeholder="https://…" />
                </Field>
                <Field label="Description" full>
                  <textarea className={`${INPUT} min-h-[84px] resize-y`} value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="One or two lines about the content." />
                </Field>

                {form.type === "video" ? (
                  <>
                    <Field label="Video URL">
                      <input className={INPUT} value={form.mediaUrl} onChange={(e) => set("mediaUrl", e.target.value)} placeholder="https://…/video.mp4" />
                    </Field>
                    <Field label="Duration (MM:SS)">
                      <input className={INPUT} value={form.durationLabel} onChange={(e) => set("durationLabel", e.target.value)} placeholder="14:48" pattern="^(\d+:)?\d{1,2}:\d{2}$" />
                    </Field>
                    <Field label="Price per second">
                      <input className={INPUT} min="0" step="0.0001" type="number" value={form.pricePerSecondUsd} onChange={(e) => set("pricePerSecondUsd", e.target.value)} />
                    </Field>
                    <Field label="Free preview seconds">
                      <input className={INPUT} min="0" step="1" type="number" value={form.freePreviewSeconds} onChange={(e) => set("freePreviewSeconds", e.target.value)} />
                    </Field>
                    <Field label="Live-event price / second">
                      <input className={INPUT} min="0" step="0.0001" type="number" value={form.liveEventPricePerSecondUsd} onChange={(e) => set("liveEventPricePerSecondUsd", e.target.value)} />
                    </Field>
                  </>
                ) : (
                  <>
                    <Field label="Pages">
                      <input className={INPUT} min="1" step="1" type="number" value={form.pages} onChange={(e) => set("pages", e.target.value)} />
                    </Field>
                    <Field label="Price per page">
                      <input className={INPUT} min="0" step="0.001" type="number" value={form.pricePerPageUsd} onChange={(e) => set("pricePerPageUsd", e.target.value)} />
                    </Field>
                    <Field label="Free preview pages">
                      <input className={INPUT} min="0" step="1" type="number" value={form.freePreviewPages} onChange={(e) => set("freePreviewPages", e.target.value)} />
                    </Field>
                  </>
                )}

                <Field label="Premium content">
                  <select className={INPUT} value={form.isPremium ? "yes" : "no"} onChange={(e) => set("isPremium", e.target.value === "yes")}>
                    <option value="no">No</option>
                    <option value="yes">Yes</option>
                  </select>
                </Field>

                <div className="sm:col-span-2">
                  <AdminTokenField hint="Publishing to the shared catalog requires the admin token." />
                </div>

                <div className="sm:col-span-2">
                  <button className={BTN} type="submit">
                    <Save size={16} /> Publish
                  </button>
                </div>
              </form>
            </Card>

            <div className="grid content-start gap-4 lg:sticky lg:top-24 lg:self-start">
              <PreviewCard form={form} />
              <Projection form={form} creatorShare={creatorShare} platformPct={platformPct} />
            </div>
          </div>
        </section>

        {/* Top earning titles */}
        <section>
          <SectionHeading title="Top earning titles" hint="Creator payout per title, highest first." />
          {earners.length === 0 ? (
            <Card className="px-6 py-12 text-center">
              <p className="text-sm text-zinc-400">No earnings yet.</p>
              <p className="mx-auto mt-1.5 max-w-sm text-[13px] leading-relaxed text-zinc-600">
                Publish a title and it shows here as viewers watch and read, with your 85% share growing in real time.
              </p>
            </Card>
          ) : (
            <div className="space-y-2.5">
              {earners.map((c, i) => (
                <div key={c.contentId} className="rounded-2xl border border-white/10 bg-ink-850/60 p-4">
                  <div className="flex items-center gap-4">
                    <span className="hidden w-6 flex-none text-center font-mono text-sm tabular-nums text-zinc-600 sm:block">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <TypeBadge type={c.contentType} />
                        <span className="truncate text-sm font-medium text-white">{c.title}</span>
                      </div>
                      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                        <div className="h-full rounded-full bg-brand" style={{ width: `${(Number(c.creatorPayoutUsd) / maxPayout) * 100}%` }} />
                      </div>
                      <div className="mt-1.5 font-mono text-[11px] tabular-nums text-zinc-500">
                        {c.contentType === "video" ? `${c.secondsWatched}s watched` : `${c.pagesRead} pages read`} · {formatMoney(c.grossAmountUsd)} gross
                      </div>
                    </div>
                    <div className="flex-none text-right">
                      <div className="font-mono text-lg font-medium tabular-nums text-brand">{formatMoney(c.creatorPayoutUsd)}</div>
                      <div className="text-[11px] text-zinc-600">your share</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Catalog */}
        <section>
          <SectionHeading title="Your catalog" hint={`${content.length} published title${content.length === 1 ? "" : "s"}.`} />
          <Table head={["Title", "Creator", "Type", "Rate", "Preview", "Premium"]}>
            {content.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-sm text-zinc-500">Nothing published yet.</td>
              </tr>
            ) : (
              content.map((item) => (
                <Row key={item._id}>
                  <Td>{item.title}</Td>
                  <Td>{item.creatorName}</Td>
                  <Td>{item.type}</Td>
                  <Td mono>
                    {item.type === "video" ? `${formatMoney(item.pricePerSecondUsd)} /s` : `${formatMoney(item.pricePerPageUsd)} /pg`}
                  </Td>
                  <Td>{item.type === "video" ? `${item.freePreviewSeconds || 0}s` : `${item.freePreviewPages || 0} pages`}</Td>
                  <Td>{item.isPremium ? "Yes" : "No"}</Td>
                </Row>
              ))
            )}
          </Table>
        </section>
      </div>
    </AppShell>
  );
}

function TypeBadge({ type }) {
  const video = type === "video";
  const Icon = video ? Film : BookOpen;
  return (
    <span className="inline-flex flex-none items-center gap-1 rounded-full border border-white/15 bg-white/5 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-zinc-400">
      <Icon size={11} /> {video ? "video" : "book"}
    </span>
  );
}

// A live mock of how the content will appear, built from the form (not a fake
// screenshot: it reflects exactly what you type).
function PreviewCard({ form }) {
  const video = form.type === "video";
  const rate = video ? `${formatMoney(form.pricePerSecondUsd)} /sec` : `${formatMoney(form.pricePerPageUsd)} /page`;
  const Icon = video ? Film : BookOpen;
  return (
    <Card className="overflow-hidden">
      <div className="relative aspect-video w-full bg-ink-950">
        {form.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={form.coverUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-zinc-700">
            <Icon size={28} />
          </div>
        )}
        <span className="absolute left-3 top-3"><TypeBadge type={form.type} /></span>
        {form.isPremium ? (
          <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full border border-brand/40 bg-brand/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-brand">
            <Sparkles size={10} /> premium
          </span>
        ) : null}
      </div>
      <div className="p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="truncate text-sm font-semibold text-white">{form.title || "Untitled"}</h3>
          <span className="flex-none rounded-full border border-white/10 bg-white/5 px-2 py-0.5 font-mono text-[11px] tabular-nums text-zinc-300">{rate}</span>
        </div>
        <p className="mt-1 truncate text-[12px] text-zinc-500">{form.creatorName || "Creator name"}</p>
        {form.description ? <p className="mt-2 line-clamp-2 text-[12.5px] leading-relaxed text-zinc-400">{form.description}</p> : null}
      </div>
    </Card>
  );
}

// What the creator actually takes home, at the price they just typed.
function Projection({ form, creatorShare, platformPct }) {
  const video = form.type === "video";
  let rows;
  if (video) {
    const ps = Number(form.pricePerSecondUsd) || 0;
    rows = [
      ["Per minute watched", ps * 60 * creatorShare],
      ["Per hour watched", ps * 3600 * creatorShare],
    ];
  } else {
    const pp = Number(form.pricePerPageUsd) || 0;
    const pages = Number(form.pages) || 0;
    rows = [
      ["Per page read", pp * creatorShare],
      [`Full read (${pages} pages)`, pp * pages * creatorShare],
    ];
  }
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2">
        <Wallet size={15} className="text-brand" />
        <h3 className="text-sm font-semibold text-white">You would earn</h3>
      </div>
      <dl className="mt-4 space-y-3">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-3">
            <dt className="text-[13px] text-zinc-400">{label}</dt>
            <dd className="font-mono text-base font-medium tabular-nums text-brand">{formatMoney(value)}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 border-t border-white/10 pt-3 font-mono text-[11px] text-zinc-600">
        after the {platformPct}% platform fee
      </p>
    </Card>
  );
}
