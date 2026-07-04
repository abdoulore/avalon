"use client";

import Link from "next/link";
import { ExternalLink, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { AppShell } from "../../components/AppShell";
import { StatTile, Table, Row, Td, BTN, RefreshButton } from "../../components/ui";
import { api, formatMoney } from "../../lib/api";
import { usePaymentMode } from "../../hooks/usePaymentMode";
import { isTxHash, txUrl } from "../../lib/explorer";

export default function DashboardPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { explorerUrl } = usePaymentMode();

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      setData(await api("/users/me/dashboard"));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function topUp() {
    try {
      await api("/users/me/top-up", { method: "POST", body: JSON.stringify({ amountUsd: 10 }) });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  const circle = data?.mode === "circle";
  const settlements = data?.settlements || [];
  const spending = settlements.reduce((sum, b) => sum + Number(b.amount || 0), 0);
  const creatorPayouts = settlements.reduce((sum, b) => sum + Number(b.creatorShare || 0), 0);

  return (
    <AppShell>
      <div className="space-y-10">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-brand">Dashboard</span>
            <h1 className="mt-2 text-3xl font-semibold tracking-tighter text-white sm:text-4xl">Your spending</h1>
            <p className="mt-2 text-sm text-zinc-400">
              {circle ? "On-chain settlement on Arc testnet, scoped to circle mode." : "Local mock economy: balance, usage, and spending."}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <RefreshButton onClick={load} busy={loading} />
            {data && !circle ? (
              <button className={BTN} onClick={topUp} type="button">
                <Plus size={16} /> Mock top-up $10
              </button>
            ) : null}
          </div>
        </header>

        {error ? <div className="rounded-xl border border-stop/40 bg-stop/10 px-4 py-3 text-sm text-zinc-200">{error}</div> : null}

        <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile
            label={circle ? "Funding" : "Balance"}
            value={!data ? "…" : circle ? data.network || "arc-testnet" : `${formatMoney(data.user.balanceUsd)}`}
            sub={circle ? "on-chain Gateway" : data?.user?.currency}
            accent={circle}
          />
          <StatTile label="Settled spend" value={formatMoney(spending)} sub={`${settlements.length} batch${settlements.length === 1 ? "" : "es"}`} />
          <StatTile label="Usage sessions" value={data?.usageSessions?.length || 0} />
          <StatTile label="Creator payouts" value={formatMoney(creatorPayouts)} />
        </section>

        {/* Real settlement batches */}
        <section>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
            <h2 className="text-xl font-semibold tracking-tight text-white">Settlement batches</h2>
            <Link
              href="/transactions"
              className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-500 transition-colors hover:text-brand"
            >
              {circle ? `on-chain · ${data?.network}` : "mock"} · view all <ExternalLink size={12} />
            </Link>
          </div>
          <Table head={["Content", "Draws", "Settled", "Creator", "Status", "Gateway ref", "When"]}>
            {settlements.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-sm text-zinc-500">
                  No settled batches yet. Watch or read a title, then finish the session to settle.
                </td>
              </tr>
            ) : (
              settlements.map((b) => (
                <Row key={b._id}>
                  <Td>{b.contentId?.title || "Untitled"}</Td>
                  <Td mono>{b.drawCount || 0}</Td>
                  <Td mono>{formatMoney(b.amount)}</Td>
                  <Td mono>{formatMoney(b.creatorShare)}</Td>
                  <Td>
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] ${
                        circle ? "border-brand/40 bg-brand/10 text-brand" : "border-white/15 bg-white/5 text-zinc-400"
                      }`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${circle ? "bg-brand" : "bg-zinc-500"}`} />
                      {b.gatewayStatus || "settled"}
                    </span>
                  </Td>
                  <Td mono title={b.batchRef}>
                    {circle && explorerUrl && isTxHash(b.batchRef) ? (
                      <a
                        href={txUrl(explorerUrl, b.batchRef)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-zinc-300 underline-offset-4 transition-colors hover:text-brand hover:underline"
                      >
                        {shortRef(b.batchRef)} <ExternalLink size={12} />
                      </a>
                    ) : (
                      shortRef(b.batchRef)
                    )}
                  </Td>
                  <Td>{formatDate(b.timestamp || b.createdAt)}</Td>
                </Row>
              ))
            )}
          </Table>
        </section>

        {/* Usage history */}
        <section>
          <h2 className="mb-4 text-xl font-semibold tracking-tight text-white">Usage history</h2>
          <Table head={["Content", "Type", "Usage", "Charged", "Started", "Ended"]}>
            {(data?.usageSessions || []).length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-sm text-zinc-500">No sessions yet.</td>
              </tr>
            ) : (
              data.usageSessions.map((s) => (
                <Row key={s._id}>
                  <Td>{s.contentId?.title || "Untitled"}</Td>
                  <Td>{s.contentType}</Td>
                  <Td mono>{s.contentType === "video" ? `${s.secondsWatched}s` : `${s.pagesRead} pages`}</Td>
                  <Td mono>{formatMoney(s.totalChargedUsd)}</Td>
                  <Td>{formatDate(s.startedAt)}</Td>
                  <Td>{s.endedAt ? formatDate(s.endedAt) : <span className="text-brand">Active</span>}</Td>
                </Row>
              ))
            )}
          </Table>
        </section>
      </div>
    </AppShell>
  );
}

function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function shortRef(ref) {
  if (!ref) return "-";
  return ref.length > 18 ? `${ref.slice(0, 10)}…${ref.slice(-4)}` : ref;
}
