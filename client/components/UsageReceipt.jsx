"use client";

import { CheckCircle2 } from "lucide-react";
import { formatMoney } from "../lib/api";

function Row({ label, children, mono = false }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <span className="text-sm text-zinc-500">{label}</span>
      <span className={`text-sm text-zinc-200 ${mono ? "font-mono tabular-nums" : ""}`}>{children}</span>
    </div>
  );
}

export function UsageReceipt({ receipt }) {
  if (!receipt) return null;

  const usageLabel =
    receipt.contentType === "video"
      ? `${receipt.secondsWatched || 0}s watched`
      : `${receipt.pagesRead || 0} pages read`;

  const circle = receipt.mode === "circle";
  const lastRef =
    Array.isArray(receipt.batchRefs) && receipt.batchRefs.length
      ? receipt.batchRefs[receipt.batchRefs.length - 1]
      : "";

  return (
    <div className="rounded-2xl border border-white/10 bg-ink-850/60 p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold tracking-tight text-white">Usage receipt</h3>
        <span
          className={`rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] ${
            circle ? "border-brand/40 bg-brand/10 text-brand" : "border-white/15 bg-white/5 text-zinc-400"
          }`}
        >
          {circle ? "on-chain" : "mock"}
        </span>
      </div>

      <div className="mt-2 divide-y divide-white/[0.06]">
        <Row label="Content">{receipt.contentTitle}</Row>
        <Row label="Usage">{usageLabel}</Row>
        <Row label="Total charged" mono>{formatMoney(receipt.totalChargedUsd)}</Row>
        <Row label="Creator earned" mono>{formatMoney(receipt.creatorEarnedUsd)}</Row>
        <Row label="Platform fee" mono>{formatMoney(receipt.platformFeeUsd)}</Row>

        {/* Mode-specific proof: circle shows the on-chain settlement; mock shows
            the remaining local balance. Never both. */}
        {circle ? (
          <>
            <Row label="Settled on-chain" mono>
              <span className="inline-flex items-center gap-1.5 text-brand">
                <CheckCircle2 size={13} /> {formatMoney(receipt.settledUsd)} · {receipt.network}
              </span>
            </Row>
            {lastRef ? (
              <Row label="Gateway tx ref" mono>
                {lastRef.length > 22 ? `${lastRef.slice(0, 12)}…${lastRef.slice(-4)}` : lastRef}
              </Row>
            ) : null}
          </>
        ) : (
          <Row label="Remaining balance" mono>{formatMoney(receipt.remainingUserBalanceUsd)} USDC</Row>
        )}
      </div>
    </div>
  );
}
