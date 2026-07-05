"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api, formatMoney } from "../lib/api";
import { getSocket } from "../lib/socket";
import { usePaymentMode } from "../hooks/usePaymentMode";
import { useGatewayFunding } from "../hooks/useGatewayFunding";
import { MoneyMeter } from "./MoneyMeter";
import { AgentBanner } from "./AgentBanner";
import { SessionGate } from "./SessionGate";
import { UsageReceipt } from "./UsageReceipt";
import { BTN } from "./ui";

const DEFAULT_CAP_USD = 0.25; // pre-selected budget; the user can change it at approval

// Continuous-scroll reader over the per-page billing spine: pages you've paid
// for render stacked; scrolling near the bottom bills the NEXT page through
// usage:page and appends it. Refusal (allowance out) shows an inline extend
// card instead of more text; the page is never served unbilled.
export function BookReader({ content, user, onBalanceChange }) {
  const sessionRef = useRef(null);
  const socketRef = useRef(null);
  const sentinelRef = useRef(null);
  const unlockingRef = useRef(false);
  const [unlocked, setUnlocked] = useState(1); // highest page billed/rendered (page 1 is the free opener)
  const [unlocking, setUnlocking] = useState(false);
  const [activeReadingDuration, setActiveReadingDuration] = useState(0);
  const [liveBalance, setLiveBalance] = useState(user?.balanceUsd || 0);
  const [chargedUsd, setChargedUsd] = useState(0);
  const [creatorEarned, setCreatorEarned] = useState(0);
  const [agentNote, setAgentNote] = useState(null);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState(null);
  const [approved, setApproved] = useState(false);
  const [hasSession, setHasSession] = useState(false); // mirrors sessionRef for rendering
  const [allowanceCapUsd, setAllowanceCapUsd] = useState(null);
  const [needsExtend, setNeedsExtend] = useState(false);
  const [needsFunding, setNeedsFunding] = useState(false);
  const [extendBusy, setExtendBusy] = useState(false);
  const [bookText, setBookText] = useState([]);
  const [capUsd, setCapUsd] = useState(DEFAULT_CAP_USD);
  const capAtomicRef = useRef(Math.round(DEFAULT_CAP_USD * 1e6));

  const { circle, supportsTopUp, network } = usePaymentMode();
  const ratePerPage = Number(content.pricePerPageUsd || 0);
  const totalPages = Number(content.pages) || bookText.length;
  // Circle mode: is the wallet funded enough to bill even one page? Blocks the
  // approve gate until funded, so reading never starts on an empty wallet.
  const { checking: checkingFunds, funded } = useGatewayFunding({ minimumUsd: ratePerPage });
  const showFundGate = circle && (!funded || needsFunding);
  // The user picks the cap at approval. Mock can't exceed the local balance;
  // circle has no client-side ceiling (the server clamps to the Gateway pool).
  const capMaxUsd = circle ? Infinity : Math.max(0.01, Number(liveBalance) || 0);
  const meterCap = allowanceCapUsd ?? capUsd;
  const finished = totalPages > 0 && unlocked >= totalPages;

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
    unlockingRef.current = false;
    setUnlocked(1);
    setUnlocking(false);
    setActiveReadingDuration(0);
    setChargedUsd(0);
    setCreatorEarned(0);
    setAgentNote(null);
    setError("");
    setReceipt(null);
    setApproved(false);
    setHasSession(false);
    setAllowanceCapUsd(null);
    setNeedsExtend(false);
    setNeedsFunding(false);
  }, [content._id]);

  useEffect(() => {
    const socket = getSocket();
    socketRef.current = socket;

    const handleBillingUpdate = (payload) => {
      if (payload?.agentDecision) setAgentNote(payload.agentDecision);
      if (payload?.session?.allowance?.capAtomic) setAllowanceCapUsd(payload.session.allowance.capAtomic / 1e6);
      if (!payload?.ok) {
        if (payload?.needsFunding) {
          setNeedsFunding(true);
          setError("");
        } else if (payload?.needsReauth) {
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

  // The scroll trigger: when the sentinel under the last unlocked page comes
  // into view, bill and append the next page. unlockingRef serializes bills;
  // after a refusal or error the observer won't refire until the reader
  // scrolls again or state (extend/approve) changes.
  useEffect(() => {
    if (!approved || needsExtend || needsFunding || finished || bookText.length === 0) return;
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      async (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        if (unlockingRef.current) return;
        unlockingRef.current = true;
        setUnlocking(true);
        try {
          await unlockNextPage();
        } finally {
          unlockingRef.current = false;
          setUnlocking(false);
        }
      },
      { rootMargin: "240px 0px" } // start the bill just before the reader hits the end
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [approved, needsExtend, needsFunding, finished, unlocked, bookText.length]);

  async function ensureSession() {
    if (sessionRef.current) return sessionRef.current;
    return new Promise((resolve, reject) => {
      socketRef.current.emit("session:start", { contentId: content._id, capAtomic: capAtomicRef.current }, (response) => {
        if (!response?.ok) {
          reject(new Error(response?.error || "Unable to start session"));
          return;
        }
        sessionRef.current = response.session._id;
        setHasSession(true);
        if (typeof response.balanceUsd === "number") setLiveBalance(response.balanceUsd);
        resolve(sessionRef.current);
      });
    });
  }

  // Bill the next page through the allowance BEFORE rendering it. On refusal
  // (402) the reader stops at the current page; the next page is not served.
  async function unlockNextPage() {
    const nextPage = unlocked + 1;
    if (totalPages && nextPage > totalPages) return;
    setError("");
    try {
      const sessionId = await ensureSession();
      const result = await new Promise((resolve) => {
        socketRef.current.emit("usage:page", { sessionId, page: nextPage }, resolve);
      });

      if (result?.agentDecision) setAgentNote(result.agentDecision);
      if (result?.session?.allowance?.capAtomic) setAllowanceCapUsd(result.session.allowance.capAtomic / 1e6);

      if (!result?.ok || !result.served) {
        if (result?.needsFunding) setNeedsFunding(true);
        else if (result?.needsReauth) setNeedsExtend(true);
        else setError(result?.error || "Could not unlock the next page.");
        return; // do NOT advance
      }

      setUnlocked(nextPage);
      if (typeof result.balanceUsd === "number") setLiveBalance(result.balanceUsd);
      setChargedUsd(result.session?.amountChargedUsd || result.session?.totalChargedUsd || 0);
      setCreatorEarned(result.session?.totalCreatorPayoutUsd || 0);
      onBalanceChange?.();
    } catch (err) {
      setError(err.message);
    }
  }

  async function completeSession() {
    // Claim the id and clear the ref synchronously (like VideoViewer): a page
    // unlock after finishing must start a fresh session, not reuse the dead id.
    const sessionId = sessionRef.current;
    if (!sessionId) return;
    sessionRef.current = null;
    setHasSession(false);
    try {
      socketRef.current?.emit("usage:heartbeat", { sessionId, state: "left" });
      const payload = await api(`/usage/sessions/${sessionId}/complete`, { method: "POST" });
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
        await api("/users/me/top-up", { method: "POST", body: JSON.stringify({ amountUsd: capUsd }) });
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

        {/* No overflow-hidden here: it would turn this card into the sticky
            containing block and the progress bar would never stick. Corners are
            rounded per-element instead. */}
        <div className={`relative rounded-2xl border border-white/10 bg-ink-900 ${checkingFunds || showFundGate || !approved ? "min-h-[470px]" : ""}`}>
          {/* Funding beats approval: an empty wallet is directed to /top-up
              instead of an approve gate that would fail on the first page. */}
          {showFundGate ? (
            <SessionGate mode="fund" overlay />
          ) : checkingFunds ? (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-[inherit] bg-ink-950/85 p-6 text-sm text-zinc-400 backdrop-blur-sm">
              Checking your wallet…
            </div>
          ) : !approved ? (
            <SessionGate mode="approve" defaultAmount={capUsd} max={capMaxUsd} overlay onApprove={handleApprove} />
          ) : null}

          <div className="sticky top-16 z-[5] flex items-center justify-between rounded-t-2xl border-b border-white/[0.06] bg-ink-900/90 px-7 py-3 backdrop-blur-sm sm:px-10">
            <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-zinc-500">
              {unlocked}{totalPages ? ` of ${totalPages}` : ""} pages unlocked
            </span>
            <span className="text-[12px] text-zinc-600">{content.title}</span>
          </div>

          <article className="p-7 sm:p-10" style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}>
            {bookText.length === 0 ? (
              <p className="text-[15px] text-zinc-500">Loading the book…</p>
            ) : (
              bookText.slice(0, unlocked).map((text, idx) => (
                <section key={idx}>
                  {idx > 0 ? (
                    <div className="my-8 flex items-center gap-4 font-sans">
                      <span className="h-px flex-1 bg-white/[0.06]" />
                      <span className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-zinc-600">page {idx + 1}</span>
                      <span className="h-px flex-1 bg-white/[0.06]" />
                    </div>
                  ) : null}
                  {String(text).split("\n\n").map((para, i) => (
                    <p key={i} className="mt-4 text-[17px] leading-[1.85] text-zinc-300 first:mt-0">
                      {para}
                    </p>
                  ))}
                </section>
              ))
            )}

            {/* Scroll frontier: billing indicator, refusal card, or the end. */}
            <div ref={sentinelRef} />
            {approved && !finished && bookText.length > 0 ? (
              <div className="mt-8 flex items-center justify-center gap-2 font-sans text-[12.5px] text-zinc-500">
                {needsExtend ? null : unlocking ? (
                  <>
                    <Loader2 size={14} className="av-spin" /> Unlocking page {unlocked + 1} ({formatMoney(ratePerPage)})…
                  </>
                ) : (
                  <>Keep scrolling. The next page bills {formatMoney(ratePerPage)} as it loads.</>
                )}
              </div>
            ) : null}
            {needsExtend ? (
              <div className="mt-6 rounded-xl border border-stop/30 bg-ink-950/60 font-sans">
                <SessionGate mode="extend" onApprove={extendAllowance} busy={extendBusy} />
              </div>
            ) : null}
            {finished ? (
              <div className="mt-10 text-center font-sans">
                <div className="mx-auto flex max-w-[240px] items-center gap-4">
                  <span className="h-px flex-1 bg-white/10" />
                  <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-zinc-500">The end</span>
                  <span className="h-px flex-1 bg-white/10" />
                </div>
              </div>
            ) : null}
          </article>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="font-mono text-[12px] tabular-nums text-zinc-500">
            {activeReadingDuration}s reading · creator earned <span className="text-zinc-300">{formatMoney(creatorEarned)}</span> ·{" "}
            {circle ? (
              <>settling on <span className="text-zinc-300">{network}</span></>
            ) : (
              <>balance <span className="text-zinc-300">{formatMoney(liveBalance)}</span></>
            )}
          </p>
          {hasSession ? (
            <button className={BTN} onClick={completeSession} type="button">
              Finish session &amp; settle
            </button>
          ) : null}
        </div>

        <p className="mt-2 text-[11.5px] text-zinc-600">
          Each page bills once as you reach it; unlocked pages stay free to re-read this session.
        </p>

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
