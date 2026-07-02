"use client";

import Link from "next/link";
import { ArrowRight, Check, Copy, ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import { AppShell } from "../../components/AppShell";
import { StatTile, ModeChip, RefreshButton } from "../../components/ui";
import { api, formatMoney } from "../../lib/api";
import { addressUrl, isTxHash, shortHash, txUrl } from "../../lib/explorer";

export default function TransactionsPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      setData(await api("/ledger/transactions"));
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const circle = data?.mode === "circle";
  const explorerUrl = data?.explorerUrl || null;
  const txns = data?.transactions || [];
  const settled = txns.reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const draws = txns.reduce((sum, t) => sum + Number(t.drawCount || 0), 0);
  const creator = txns.reduce((sum, t) => sum + Number(t.creatorShare || 0), 0);

  return (
    <AppShell>
      <div className="space-y-10">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-brand">
              {circle ? "On-chain" : "Settlement"}
            </span>
            <h1 className="mt-2 text-3xl font-semibold tracking-tighter text-white sm:text-4xl">Transactions</h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-zinc-400">
              {circle
                ? "Every batch settled on Arc testnet through Circle Gateway. Each row is a real on-chain transaction you can open and verify."
                : "Every settlement batch in the local mock economy. These are simulated locally and are not recorded on any chain."}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {data ? <ModeChip circle={circle} network={data.network} /> : null}
            <RefreshButton onClick={load} busy={loading} />
          </div>
        </header>

        {error ? (
          <div className="rounded-xl border border-stop/40 bg-stop/10 px-4 py-3 text-sm text-zinc-200">{error}</div>
        ) : null}

        <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile label="Settled" value={formatMoney(settled)} sub={circle ? "on Arc testnet" : "mock economy"} accent={circle} />
          <StatTile label="Transactions" value={data?.total ?? txns.length} sub={circle ? "Gateway batches" : "mock batches"} />
          <StatTile label="Draws folded" value={draws} sub="per-tick draws batched" />
          <StatTile label="Creator payouts" value={formatMoney(creator)} sub="paid to creators" />
        </section>

        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h2 className="text-xl font-semibold tracking-tight text-white">
              {circle ? "On-chain settlements" : "Settlement batches"}
            </h2>
            {circle && explorerUrl ? (
              <a
                href={explorerUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-500 transition-colors hover:text-brand"
              >
                Arcscan <ExternalLink size={12} />
              </a>
            ) : (
              <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-500">simulated · local</span>
            )}
          </div>

          {txns.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-ink-850/60 px-6 py-14 text-center">
              <p className="text-sm text-zinc-400">
                {loading ? "Loading transactions…" : "No settled transactions yet."}
              </p>
              {!loading ? (
                <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed text-zinc-600">
                  Watch a video or read a book, then finish the session. Draws batch up and settle{" "}
                  {circle ? "on Arc testnet" : "in the mock economy"}, and each batch lands here.
                </p>
              ) : null}
            </div>
          ) : (
            <ul className="space-y-3">
              {txns.map((t) => (
                <TxCard key={t._id} tx={t} circle={circle} explorerUrl={explorerUrl} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function TxCard({ tx, circle, explorerUrl }) {
  const hash = tx.batchRef || tx.circlePaymentId || "";
  const auth = tx.paymentProof?.authorization || null;
  const link = circle ? txUrl(explorerUrl, hash) : null;
  const status = tx.gatewayStatus || (circle ? "settled" : "mock_settled");
  const replay = /replay|duplicate/i.test(status);
  // Circle settles in async batches: at settle time the ref is a Gateway batch id,
  // and the EVM tx hash posts on-chain when the batch flushes. Only call it "tx"
  // (and link it) once it's a real hash; until then it's the Gateway batch ref.
  const onchainHash = isTxHash(hash);
  const refLabel = onchainHash ? "tx" : circle ? "batch" : "ref";

  return (
    <li className="rounded-2xl border border-white/10 bg-ink-850/60 p-5 transition-colors hover:border-white/20">
      <div className="flex flex-wrap items-start justify-between gap-4">
        {/* Left: identity */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] ${
                circle && !replay
                  ? "border-brand/40 bg-brand/10 text-brand"
                  : replay
                  ? "border-amber-400/40 bg-amber-400/10 text-amber-300"
                  : "border-white/15 bg-white/5 text-zinc-400"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${circle && !replay ? "bg-brand" : replay ? "bg-amber-300" : "bg-zinc-500"}`} />
              {status}
            </span>
            <span className="text-[12px] text-zinc-500">{formatDate(tx.timestamp || tx.createdAt)}</span>
          </div>

          {/* Tx hash / Gateway batch ref */}
          <div className="mt-3 flex items-center gap-2 font-mono text-sm">
            <span className="text-[11px] uppercase tracking-[0.1em] text-zinc-600">{refLabel}</span>
            {link ? (
              <a
                href={link}
                target="_blank"
                rel="noreferrer"
                title={hash}
                className="inline-flex items-center gap-1.5 text-zinc-200 underline-offset-4 transition-colors hover:text-brand hover:underline"
              >
                {shortHash(hash)} <ExternalLink size={13} className="flex-none" />
              </a>
            ) : (
              <span className="text-zinc-300" title={hash}>{shortHash(hash)}</span>
            )}
            <CopyButton value={hash} />
          </div>

          <p className="mt-2.5 truncate text-sm text-zinc-300">{tx.contentId?.title || "Untitled"}</p>

          {/* Payer -> recipient (only when we have the signed authorization) */}
          {auth?.from || auth?.to ? (
            <div className="mt-2.5 flex flex-wrap items-center gap-2 font-mono text-[12px] text-zinc-500">
              <AddressTag address={auth?.from} label="from" explorerUrl={circle ? explorerUrl : null} />
              <ArrowRight size={13} className="flex-none text-zinc-600" />
              <AddressTag address={auth?.to} label="to" explorerUrl={circle ? explorerUrl : null} />
            </div>
          ) : null}

          {circle && !onchainHash ? (
            <p className="mt-2 text-[11px] leading-relaxed text-zinc-600">
              Settled through Circle Gateway. The EVM tx hash posts when the batch flushes on-chain; verify the wallet
              activity via the payer address above.
            </p>
          ) : null}
        </div>

        {/* Right: money */}
        <div className="text-right">
          <div className="font-mono text-xl font-medium tabular-nums text-brand">{formatMoney(tx.amount)}</div>
          <div className="mt-1 text-[12px] text-zinc-500">
            {tx.drawCount || 0} draw{tx.drawCount === 1 ? "" : "s"} batched
          </div>
          <div className="text-[12px] text-zinc-600">{formatMoney(tx.creatorShare)} to creator</div>
        </div>
      </div>
    </li>
  );
}

function AddressTag({ address, label, explorerUrl }) {
  if (!address) return <span className="text-zinc-600">{label} —</span>;
  const link = addressUrl(explorerUrl, address);
  const inner = (
    <>
      <span className="text-zinc-600">{label}</span> {shortHash(address, 6, 4)}
    </>
  );
  if (!link) return <span title={address}>{inner}</span>;
  return (
    <a href={link} target="_blank" rel="noreferrer" title={address} className="transition-colors hover:text-brand">
      {inner}
    </a>
  );
}

function CopyButton({ value }) {
  const [copied, setCopied] = useState(false);
  if (!value) return null;
  return (
    <button
      type="button"
      aria-label="Copy transaction hash"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        } catch {
          // clipboard may be blocked; the full hash is still in the title tooltip
        }
      }}
      className="text-zinc-600 transition-colors hover:text-zinc-300"
    >
      {copied ? <Check size={13} className="text-brand" /> : <Copy size={13} />}
    </button>
  );
}

function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
