"use client";

import { Check, Copy, CreditCard, ExternalLink, Loader2, Wallet } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "../../components/AppShell";
import { Card, BTN, RefreshButton } from "../../components/ui";
import { api, formatMoney } from "../../lib/api";
import { usePaymentMode } from "../../hooks/usePaymentMode";
import { addressUrl, isTxHash, txUrl } from "../../lib/explorer";

const MOCK_AMOUNTS = [5, 10, 50];
const DEPOSIT_PRESETS = [0.25, 0.5, 1];

export default function TopUpPage() {
  const [user, setUser] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const { circle, network } = usePaymentMode();

  useEffect(() => {
    api("/users/demo").then((p) => setUser(p.user)).catch(() => {});
  }, []);

  async function topUp(amountUsd) {
    setError("");
    setMessage("");
    try {
      const payload = await api("/users/demo/top-up", { method: "POST", body: JSON.stringify({ amountUsd }) });
      setUser(payload.user);
      setMessage(`Added $${amountUsd} test balance.`);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl space-y-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-brand">Funding</span>
            <h1 className="mt-2 text-3xl font-semibold tracking-tighter text-white sm:text-4xl">
              {circle ? "Funded on Arc" : "Top up balance"}
            </h1>
            <p className="mt-2 max-w-[48ch] text-sm leading-relaxed text-zinc-400">
              {circle
                ? "Spending settles from the shared Gateway balance on-chain. Deposit test USDC straight from here."
                : "Add a local test balance. Only the seconds and pages you use are charged."}
            </p>
          </div>
          {circle ? (
            <span className="inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand/10 px-3.5 py-2 text-sm text-brand">
              <Wallet size={15} /> Arc testnet · <span className="font-mono">{network}</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3.5 py-2 text-sm text-zinc-200">
              <Wallet size={15} /> <span className="font-mono tabular-nums">{user ? formatMoney(user.balanceUsd) : "…"}</span>{" "}
              {user?.currency || "USDC"}
            </span>
          )}
        </header>

        {message ? <div className="rounded-xl border border-brand/30 bg-brand/10 px-4 py-3 text-sm text-zinc-200">{message}</div> : null}
        {error ? <div className="rounded-xl border border-stop/40 bg-stop/10 px-4 py-3 text-sm text-zinc-200">{error}</div> : null}

        {circle ? (
          <GatewayDeposit />
        ) : (
          <Card className="p-6">
            <h2 className="text-base font-semibold text-white">Add test balance</h2>
            <p className="mt-1 text-sm text-zinc-400">Instant, local, no chain. Pick an amount.</p>
            <div className="mt-5 grid grid-cols-3 gap-3">
              {MOCK_AMOUNTS.map((amount) => (
                <button key={amount} onClick={() => topUp(amount)} type="button" className={`${BTN} py-3`}>
                  <CreditCard size={16} /> +{amount}
                </button>
              ))}
            </div>
          </Card>
        )}
      </div>
    </AppShell>
  );
}

function GatewayDeposit() {
  const { explorerUrl } = usePaymentMode();
  const [bal, setBal] = useState(null);
  const [loadingBal, setLoadingBal] = useState(true);
  const [sel, setSel] = useState(String(DEPOSIT_PRESETS[1])); // $0.50 default
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const loadBalances = useCallback(async () => {
    setLoadingBal(true);
    try {
      setBal(await api("/users/demo/gateway-balance"));
    } catch {
      setBal(null);
    } finally {
      setLoadingBal(false);
    }
  }, []);

  useEffect(() => {
    loadBalances();
  }, [loadBalances]);

  const amount = Math.max(0, Number(sel) || 0);
  const address = bal?.address || "";
  const walletLow = bal != null && Number(bal.walletUsd) + 1e-9 < amount;

  async function deposit() {
    if (amount <= 0) {
      setError("Enter an amount greater than zero.");
      return;
    }
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const res = await api("/users/demo/gateway-deposit", { method: "POST", body: JSON.stringify({ amountUsd: amount }) });
      setResult(res);
      await loadBalances(); // refresh wallet (down) and Gateway (up)
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-white">Deposit on-chain</h2>
          <p className="mt-1 max-w-[46ch] text-sm leading-relaxed text-zinc-400">
            Deposits test USDC into the Gateway wallet (approve, then deposit). Sessions reserve against the Gateway balance.
          </p>
        </div>
        <RefreshButton onClick={loadBalances} busy={loadingBal} />
      </div>

      {/* Two balances: what's in the wallet (deposit source) vs in Gateway (settle source) */}
      <div className="mt-5 grid grid-cols-2 gap-3">
        <BalanceTile label="In wallet" hint="USDC you can deposit" value={bal?.walletUsd} loading={loadingBal} />
        <BalanceTile label="In Gateway" hint="available to settle" value={bal?.availableUsd} loading={loadingBal} accent />
      </div>

      {/* Address to fund the wallet */}
      <div className="mt-3 rounded-xl border border-white/10 bg-ink-950/50 p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-zinc-500">Fund this wallet</span>
          {address && explorerUrl ? (
            <a
              href={addressUrl(explorerUrl, address)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-mono text-[11px] text-zinc-500 transition-colors hover:text-brand"
            >
              Arcscan <ExternalLink size={11} />
            </a>
          ) : null}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <code className="min-w-0 flex-1 break-all font-mono text-[12.5px] text-zinc-200">{address || "…"}</code>
          <CopyButton value={address} />
        </div>
        <p className="mt-2 text-[12px] leading-relaxed text-zinc-500">
          Send Arc testnet USDC to this address, then deposit it into the Gateway below.
        </p>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {DEPOSIT_PRESETS.map((p) => {
          const on = Math.abs(Number(sel) - p) < 1e-9;
          return (
            <button
              key={p}
              type="button"
              disabled={busy}
              onClick={() => setSel(String(p))}
              className={`rounded-full border px-3.5 py-1.5 font-mono text-sm tabular-nums transition-colors disabled:opacity-50 ${
                on ? "border-brand bg-brand font-semibold text-ink-950" : "border-white/15 text-zinc-300 hover:border-white/30 hover:text-white"
              }`}
            >
              ${p.toFixed(2)}
            </button>
          );
        })}
        <span className="flex items-center rounded-lg border border-white/15 bg-ink-950/60 pl-2.5">
          <span className="text-sm text-zinc-500">$</span>
          <input
            type="number"
            min="0.01"
            step="0.01"
            max="50"
            value={sel}
            disabled={busy}
            onChange={(e) => setSel(e.target.value)}
            className="w-20 bg-transparent px-1.5 py-1.5 font-mono text-sm tabular-nums text-zinc-100 outline-none disabled:opacity-50"
          />
        </span>
      </div>

      <button className={`${BTN} mt-5 w-full py-3`} type="button" onClick={deposit} disabled={busy || amount <= 0}>
        {busy ? (
          <>
            <Loader2 size={16} className="av-spin" /> Depositing on-chain…
          </>
        ) : (
          <>
            <Wallet size={16} /> Deposit ${amount.toFixed(2)} to Gateway
          </>
        )}
      </button>

      {busy ? (
        <p className="mt-3 text-center text-[12px] text-zinc-500">
          Submitting approve and deposit on Arc. This waits for both to confirm and can take a moment.
        </p>
      ) : walletLow ? (
        <p className="mt-3 text-center text-[12px] text-throttle">
          Wallet balance is below {formatMoney(amount)}. Fund the address above first.
        </p>
      ) : null}

      {error ? (
        <div className="mt-4 rounded-xl border border-stop/40 bg-stop/10 px-3.5 py-2.5 text-sm text-zinc-200">{error}</div>
      ) : null}

      {result ? (
        <div className="mt-4 rounded-xl border border-brand/30 bg-brand/[0.07] p-4">
          <p className="text-sm text-zinc-200">
            Deposited <span className="font-mono tabular-nums text-brand">{formatMoney(result.depositedUsd)}</span>. Gateway
            balance is now <span className="font-mono tabular-nums text-brand">{formatMoney(result.availableUsd)}</span>.
          </p>
          <div className="mt-3 grid gap-1.5 font-mono text-[12px]">
            <TxLine label="approve" hash={result.approveHash} explorerUrl={explorerUrl} />
            <TxLine label="deposit" hash={result.depositHash} explorerUrl={explorerUrl} />
          </div>
        </div>
      ) : null}

      <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.12em] text-zinc-600">
        also available as: node src/scripts/gatewayDeposit.js {amount.toFixed(2)}
      </p>
    </Card>
  );
}

function BalanceTile({ label, hint, value, loading, accent = false }) {
  return (
    <div className={`rounded-xl border p-4 ${accent ? "border-brand/20 bg-brand/[0.05]" : "border-white/10 bg-ink-950/50"}`}>
      <div className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-zinc-500">{label}</div>
      <div className={`mt-1.5 font-mono text-xl font-medium tabular-nums ${accent ? "text-brand" : "text-white"}`}>
        {loading ? "…" : value == null ? "—" : formatMoney(value)}
      </div>
      <div className="mt-0.5 text-[12px] text-zinc-600">{hint}</div>
    </div>
  );
}

function CopyButton({ value }) {
  const [copied, setCopied] = useState(false);
  if (!value) return null;
  return (
    <button
      type="button"
      aria-label="Copy address"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        } catch {
          // clipboard may be blocked; the address is shown in full above
        }
      }}
      className="flex-none text-zinc-500 transition-colors hover:text-zinc-200"
    >
      {copied ? <Check size={15} className="text-brand" /> : <Copy size={15} />}
    </button>
  );
}

function TxLine({ label, hash, explorerUrl }) {
  const link = isTxHash(hash) ? txUrl(explorerUrl, hash) : null;
  return (
    <div className="flex items-center gap-2 text-zinc-400">
      <span className="w-14 text-zinc-600">{label}</span>
      {link ? (
        <a
          href={link}
          target="_blank"
          rel="noreferrer"
          title={hash}
          className="inline-flex items-center gap-1.5 text-zinc-300 underline-offset-4 transition-colors hover:text-brand hover:underline"
        >
          {short(hash)} <ExternalLink size={12} />
        </a>
      ) : (
        <span title={hash}>{hash ? short(hash) : "—"}</span>
      )}
    </div>
  );
}

function short(v) {
  if (!v) return "—";
  return v.length > 18 ? `${v.slice(0, 10)}…${v.slice(-6)}` : v;
}
