"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api, formatMoney } from "../lib/api";
import { getSocket } from "../lib/socket";
import { usePaymentMode } from "../hooks/usePaymentMode";
import { MoneyMeter } from "./MoneyMeter";
import { AgentBanner } from "./AgentBanner";
import { SessionGate } from "./SessionGate";
import { UsageReceipt } from "./UsageReceipt";
import { BTN, BTN_GHOST } from "./ui";

const DEFAULT_CAP_USD = 0.25; // pre-selected budget; the user can change it at approval

export function BookReader({ content, user, onBalanceChange }) {
  const sessionRef = useRef(null);
  const socketRef = useRef(null);
  const [page, setPage] = useState(1);
  const [activeReadingDuration, setActiveReadingDuration] = useState(0);
  const [liveBalance, setLiveBalance] = useState(user?.balanceUsd || 0);
  const [chargedUsd, setChargedUsd] = useState(0);
  const [creatorEarned, setCreatorEarned] = useState(0);
  const [agentNote, setAgentNote] = useState(null);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState(null);
  const [approved, setApproved] = useState(false);
  const [allowanceCapUsd, setAllowanceCapUsd] = useState(null);
  const [needsExtend, setNeedsExtend] = useState(false);
  const [extendBusy, setExtendBusy] = useState(false);
  const [bookText, setBookText] = useState([]);
  const [capUsd, setCapUsd] = useState(DEFAULT_CAP_USD);
  const capAtomicRef = useRef(Math.round(DEFAULT_CAP_USD * 1e6));

  const { circle, supportsTopUp, network } = usePaymentMode();
  const ratePerPage = Number(content.pricePerPageUsd || 0);
  const pageText = bookText[page - 1];
  // The user picks the cap at approval. Mock can't exceed the local balance;
  // circle has no client-side ceiling (the server clamps to the Gateway pool).
  const capMaxUsd = circle ? Infinity : Math.max(0.01, Number(liveBalance) || 0);
  const meterCap = allowanceCapUsd ?? capUsd;

  useEffect(() => {
    setLiveBalance(user?.balanceUsd || 0);
  }, [user?.balanceUsd]);

  // Pull the real page text on demand (bookPages is excluded from the list).
  useEffect(() => {
    let alive = true;
    setBookText([]);
    api(`/content/${content._id}`)
      .then((p) => { if (alive) setBookText(p.content?.bookPages || []); })
      .catch(() => {});
    return () => { alive = false; };
  }, [content._id]);

  useEffect(() => {
    sessionRef.current = null;
    setPage(1);
    setActiveReadingDuration(0);
    setChargedUsd(0);
    setCreatorEarned(0);
    setAgentNote(null);
    setError("");
    setReceipt(null);
    setApproved(false);
    setAllowanceCapUsd(null);
    setNeedsExtend(false);
  }, [content._id]);

  useEffect(() => {
    const socket = getSocket();
    socketRef.current = socket;

    const handleBillingUpdate = (payload) => {
      if (payload?.agentDecision) setAgentNote(payload.agentDecision);
      if (payload?.session?.allowance?.capAtomic) setAllowanceCapUsd(payload.session.allowance.capAtomic / 1e6);
      if (!payload?.ok) {
        if (payload?.needsReauth) {
          setNeedsExtend(true);
          setError("");
        }
        return;
      }
      if (typeof payload.balanceUsd === "number") setLiveBalance(payload.balanceUsd);
      if (payload.session) {
        setActiveReadingDuration(payload.session.activeReadingDuration || 0);
        setChargedUsd(payload.session.amountChargedUsd || payload.session.totalChargedUsd || 0);
        setCreatorEarned(payload.session.totalCreatorPayoutUsd || 0);
      }
    };
    socket.on("billing:update", handleBillingUpdate);

    // Reading-time heartbeats accrue active reading duration (billed $0; pages are
    // what gets charged, through the same allowance the video path uses).
    const interval = window.setInterval(() => {
      if (sessionRef.current && document.visibilityState === "visible" && document.hasFocus()) {
        socket.emit("usage:heartbeat", { sessionId: sessionRef.current, state: "active" }, (response) => {
          if (response?.session) setActiveReadingDuration(response.session.activeReadingDuration || 0);
        });
      }
    }, 5000);

    return () => {
      socket.off("billing:update", handleBillingUpdate);
      window.clearInterval(interval);
      completeSession();
    };
  }, [content._id]);

  async function ensureSession() {
    if (sessionRef.current) return sessionRef.current;
    return new Promise((resolve, reject) => {
      socketRef.current.emit("session:start", { contentId: content._id, capAtomic: capAtomicRef.current }, (response) => {
        if (!response?.ok) {
          reject(new Error(response?.error || "Unable to start session"));
          return;
        }
        sessionRef.current = response.session._id;
        if (typeof response.balanceUsd === "number") setLiveBalance(response.balanceUsd);
        resolve(sessionRef.current);
      });
    });
  }

  // Bill the page through the allowance BEFORE rendering it. On refusal (402) the
  // reader pauses at the current page; the next page is not served.
  async function goToPage(nextPage) {
    setError("");
    try {
      const sessionId = await ensureSession();
      const result = await new Promise((resolve) => {
        socketRef.current.emit("usage:page", { sessionId, page: nextPage }, resolve);
      });

      if (result?.agentDecision) setAgentNote(result.agentDecision);
      if (result?.session?.allowance?.capAtomic) setAllowanceCapUsd(result.session.allowance.capAtomic / 1e6);

      if (!result?.ok || !result.served) {
        if (result?.needsReauth) setNeedsExtend(true);
        else setError(result?.error || "Could not turn the page.");
        return; // do NOT advance
      }

      setPage(nextPage);
      if (typeof result.balanceUsd === "number") setLiveBalance(result.balanceUsd);
      setChargedUsd(result.session?.amountChargedUsd || result.session?.totalChargedUsd || 0);
      setCreatorEarned(result.session?.totalCreatorPayoutUsd || 0);
      onBalanceChange?.();
    } catch (err) {
      setError(err.message);
    }
  }

  function changePage(direction) {
    // Exhausted or not yet approved: do not attempt the page turn. The gate is the
    // action; this also prevents flashing the next page before the refusal lands.
    if (needsExtend || !approved) return;
    const nextPage = Math.min(Math.max(page + direction, 1), content.pages);
    if (nextPage === page) return;
    goToPage(nextPage);
  }

  async function completeSession() {
    if (!sessionRef.current) return;
    try {
      socketRef.current?.emit("usage:heartbeat", { sessionId: sessionRef.current, state: "left" });
      const payload = await api(`/usage/sessions/${sessionRef.current}/complete`, { method: "POST" });
      setReceipt(payload.receipt);
    } catch {
      // Receipt display is best-effort on page switches and unmounts.
    }
  }

  function handleApprove(amountUsd) {
    const amt = Math.max(0.01, Number(amountUsd) || DEFAULT_CAP_USD);
    setCapUsd(amt);
    capAtomicRef.current = Math.round(amt * 1e6);
    setApproved(true);
    setError("");
  }

  async function extendAllowance() {
    setExtendBusy(true);
    try {
      // Mock tops up the local balance before re-approving. Circle has no local
      // balance: re-approving reserves a fresh cap from the Gateway pool.
      if (supportsTopUp) {
        await api("/users/demo/top-up", { method: "POST", body: JSON.stringify({ amountUsd: capUsd }) });
      }
      await completeSession();
      sessionRef.current = null;
      setNeedsExtend(false);
      setAgentNote(null);
      setChargedUsd(0);
      setAllowanceCapUsd(null);
      setApproved(false);
      onBalanceChange?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setExtendBusy(false);
    }
  }

  return (
    <section className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
      {/* Reader column */}
      <div className="min-w-0">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-white">{content.title}</h2>
            <p className="mt-1 text-sm leading-relaxed text-zinc-400">{content.description}</p>
          </div>
          <span className="flex-none rounded-full border border-white/10 bg-white/5 px-3 py-1 font-mono text-[12px] tabular-nums text-zinc-300">
            {formatMoney(content.pricePerPageUsd)} / page
          </span>
        </div>

        <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-ink-900">
          {!approved ? <SessionGate mode="approve" defaultAmount={capUsd} max={capMaxUsd} overlay onApprove={handleApprove} /> : null}
          {needsExtend ? <SessionGate mode="extend" overlay onApprove={extendAllowance} busy={extendBusy} /> : null}
          <article className="min-h-[420px] p-7 sm:p-10" style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}>
            <div className="mb-6 flex items-center justify-between font-sans">
              <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-zinc-500">
                Page {page}{content.pages ? ` of ${content.pages}` : ""}
              </span>
              <span className="text-[12px] text-zinc-600">{content.title}</span>
            </div>
            {pageText ? (
              pageText.split("\n\n").map((para, i) => (
                <p key={i} className="mt-4 text-[17px] leading-[1.85] text-zinc-300 first:mt-0">
                  {para}
                </p>
              ))
            ) : (
              <p className="text-[15px] text-zinc-500">Loading this page…</p>
            )}
          </article>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <button className={BTN_GHOST} disabled={page === 1 || !approved || needsExtend} onClick={() => changePage(-1)} type="button">
            <ChevronLeft size={16} /> Previous
          </button>
          <p className="font-mono text-[12px] tabular-nums text-zinc-500">
            {activeReadingDuration}s reading · creator earned <span className="text-zinc-300">{formatMoney(creatorEarned)}</span> ·{" "}
            {circle ? (
              <>settling on <span className="text-zinc-300">{network}</span></>
            ) : (
              <>balance <span className="text-zinc-300">{formatMoney(liveBalance)}</span></>
            )}
          </p>
          <button className={BTN} disabled={page === content.pages || !approved || needsExtend} onClick={() => changePage(1)} type="button">
            Next <ChevronRight size={16} />
          </button>
        </div>

        <button
          className="mt-3 text-sm text-zinc-500 underline-offset-4 transition-colors hover:text-zinc-300 hover:underline"
          onClick={completeSession}
          type="button"
        >
          Finish session
        </button>

        {error && !needsExtend ? (
          <div className="mt-3 rounded-xl border border-throttle/40 bg-throttle/10 px-3.5 py-2.5 text-sm text-zinc-200">{error}</div>
        ) : null}
      </div>

      {/* Session panel */}
      <aside className="grid content-start gap-4 lg:sticky lg:top-24 lg:self-start">
        <MoneyMeter
          rateLabel={`$${ratePerPage.toFixed(4)} /pg`}
          cost={chargedUsd}
          cap={meterCap}
          authorized={approved}
          ticking={false}
        />
        <AgentBanner decision={agentNote} />
        {receipt ? <UsageReceipt receipt={receipt} /> : null}
      </aside>
    </section>
  );
}
