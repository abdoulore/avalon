"use client";

import { useEffect, useRef, useState } from "react";
import { api, formatMoney } from "../lib/api";
import { getSocket } from "../lib/socket";
import { usePaymentMode } from "../hooks/usePaymentMode";
import { MoneyMeter } from "./MoneyMeter";
import { AgentBanner } from "./AgentBanner";
import { SessionGate } from "./SessionGate";
import { UsageReceipt } from "./UsageReceipt";

const HEARTBEAT_MS = 5000;
const DEFAULT_CAP_USD = 0.25; // pre-selected budget; the user can change it at approval

export function VideoViewer({ content, user, onBalanceChange }) {
  const videoRef = useRef(null);
  const sessionRef = useRef(null);
  const socketRef = useRef(null);
  const stalledRef = useRef(false);
  const [liveBalance, setLiveBalance] = useState(user?.balanceUsd || 0);
  const [secondsWatched, setSecondsWatched] = useState(0);
  const [sessionCost, setSessionCost] = useState(0);
  const [creatorEarned, setCreatorEarned] = useState(0);
  const [status, setStatus] = useState("Ready");
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState(null);
  // hero chrome (derived from the existing payload; billing path untouched)
  const [approved, setApproved] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [agentDecision, setAgentDecision] = useState(null);
  const [allowanceCapUsd, setAllowanceCapUsd] = useState(null);
  const [needsExtend, setNeedsExtend] = useState(false);
  const [extendBusy, setExtendBusy] = useState(false);
  const [capUsd, setCapUsd] = useState(DEFAULT_CAP_USD);
  const capAtomicRef = useRef(Math.round(DEFAULT_CAP_USD * 1e6));

  const { circle, supportsTopUp, network } = usePaymentMode();
  const ratePerSecond = Number(content.pricePerSecondUsd || 0);
  // The user picks the cap at approval. Mock can't exceed the local balance;
  // circle has no client-side ceiling (the server clamps to the Gateway pool).
  const capMaxUsd = circle ? Infinity : Math.max(0.01, Number(liveBalance) || 0);
  const meterCap = allowanceCapUsd ?? capUsd;

  useEffect(() => {
    setLiveBalance(user?.balanceUsd || 0);
  }, [user?.balanceUsd]);

  useEffect(() => {
    sessionRef.current = null;
    stalledRef.current = false;
    setSecondsWatched(0);
    setSessionCost(0);
    setCreatorEarned(0);
    setStatus("Ready");
    setError("");
    setReceipt(null);
    setApproved(false);
    setIsPlaying(false);
    setAgentDecision(null);
    setAllowanceCapUsd(null);
    setNeedsExtend(false);
  }, [content._id]);

  useEffect(() => {
    const socket = getSocket();
    socketRef.current = socket;

    const handleBillingUpdate = (payload) => {
      if (payload.agentDecision) setAgentDecision(payload.agentDecision);
      else if (payload.session?.agentDecision) setAgentDecision(payload.session.agentDecision);
      if (payload.session?.allowance?.capAtomic) setAllowanceCapUsd(payload.session.allowance.capAtomic / 1e6);

      if (!payload.ok) {
        if (payload.stopAccess) {
          videoRef.current?.pause();
          setIsPlaying(false);
        }
        if (payload.error === "Active session not found") {
          sessionRef.current = null;
        }
        if (payload.needsReauth) {
          setNeedsExtend(true);
          setError("");
        } else {
          setError(payload.error || "Billing paused");
        }
        setStatus(payload.stopAccess ? "Paused at boundary" : "Paused");
        return;
      }

      if (typeof payload.balanceUsd === "number") {
        setLiveBalance(payload.balanceUsd);
        onBalanceChange?.();
      }
      setSecondsWatched(payload.session?.secondsWatched || 0);
      setSessionCost(payload.session?.amountChargedUsd || payload.session?.totalChargedUsd || 0);
      setCreatorEarned(payload.session?.totalCreatorPayoutUsd || 0);
      setStatus(payload.session?.activityState || "active");
    };

    socket.on("billing:update", handleBillingUpdate);
    return () => {
      socket.off("billing:update", handleBillingUpdate);
    };
  }, [onBalanceChange]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const state = getActivityState();
      if (sessionRef.current && state !== "paused") {
        sendHeartbeat(state);
      }
    }, HEARTBEAT_MS);

    return () => {
      window.clearInterval(interval);
      // Switching titles (or unmounting) must close the open session, exactly
      // like BookReader does: settle what accrued and release the reserved cap,
      // so an abandoned session can't hold pool funds until socket disconnect.
      completeSession();
    };
  }, [content._id]);

  useEffect(() => {
    const pauseForInactive = () => {
      if (document.visibilityState !== "visible" || !document.hasFocus()) {
        videoRef.current?.pause();
        sendHeartbeat("inactive");
      }
    };
    const completeOnLeave = () => {
      sendHeartbeat("left");
      completeSession();
    };

    document.addEventListener("visibilitychange", pauseForInactive);
    window.addEventListener("blur", pauseForInactive);
    window.addEventListener("pagehide", completeOnLeave);

    return () => {
      document.removeEventListener("visibilitychange", pauseForInactive);
      window.removeEventListener("blur", pauseForInactive);
      window.removeEventListener("pagehide", completeOnLeave);
    };
  }, []);

  function getActivityState() {
    const video = videoRef.current;
    if (!video || video.paused || video.ended) {
      return "paused";
    }
    if (stalledRef.current) {
      return "stalled";
    }
    if (document.visibilityState !== "visible" || !document.hasFocus()) {
      return "inactive";
    }
    return "active";
  }

  async function ensureSocketSession() {
    if (sessionRef.current) {
      return sessionRef.current;
    }

    return new Promise((resolve, reject) => {
      socketRef.current.emit("session:start", { contentId: content._id, capAtomic: capAtomicRef.current }, (response) => {
        if (!response?.ok) {
          reject(new Error(response?.error || "Unable to start session"));
          return;
        }
        sessionRef.current = response.session._id;
        setLiveBalance(response.balanceUsd);
        resolve(sessionRef.current);
      });
    });
  }

  async function sendHeartbeat(state) {
    if (!sessionRef.current || !socketRef.current) {
      return;
    }

    socketRef.current.emit("usage:heartbeat", { sessionId: sessionRef.current, state }, async (response) => {
      if (!response?.ok) {
        if (response?.stopAccess) {
          videoRef.current?.pause();
          setIsPlaying(false);
        }
        if (response?.error === "Active session not found") {
          sessionRef.current = null;
        }
        if (response?.needsReauth) {
          setNeedsExtend(true);
          setError("");
        } else {
          setError(response?.error || "Billing paused");
        }
        setStatus(response?.stopAccess ? "Paused at boundary" : "Paused");
      }
    });
  }

  async function handlePlay() {
    if (needsExtend || !approved) {
      // Exhausted or not yet approved: never resume playback. The gate (extend or
      // approve) is already shown over the player; a play attempt just re-pauses.
      // This catches keyboard play too, which the visual overlay does not block.
      videoRef.current?.pause();
      setIsPlaying(false);
      return;
    }
    setError("");
    setIsPlaying(true);
    try {
      await ensureSocketSession();
      stalledRef.current = false;
      setStatus("active");
      sendHeartbeat("active");
    } catch (err) {
      videoRef.current?.pause();
      setIsPlaying(false);
      setError(err.message);
      setStatus("Paused");
    }
  }

  async function completeSession() {
    // Claim the id and clear the ref SYNCHRONOUSLY: if the user has already
    // started the next session by the time this completes, nulling after the
    // await would clobber the new session's id and silently stop its billing.
    const sessionId = sessionRef.current;
    if (!sessionId) {
      return;
    }
    sessionRef.current = null;

    try {
      const payload = await api(`/usage/sessions/${sessionId}/complete`, { method: "POST" });
      setReceipt(payload.receipt);
      setStatus("Complete");
    } catch {
      // Best effort during unloads.
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
      // balance: re-approving reserves a fresh cap from the Gateway pool, so we
      // just complete + reset and let the next approval re-reserve on-chain.
      if (supportsTopUp) {
        await api("/users/demo/top-up", { method: "POST", body: JSON.stringify({ amountUsd: capUsd }) });
      }
      await completeSession();
      sessionRef.current = null;
      setNeedsExtend(false);
      setAgentDecision(null);
      setSessionCost(0);
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
      {/* Player column */}
      <div className="min-w-0">
        <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-ink-900">
          {!approved ? <SessionGate mode="approve" defaultAmount={capUsd} max={capMaxUsd} overlay onApprove={handleApprove} /> : null}
          {needsExtend ? <SessionGate mode="extend" overlay onApprove={extendAllowance} busy={extendBusy} /> : null}
          <video
            ref={videoRef}
            controls
            poster={content.coverUrl}
            src={content.mediaUrl}
            className="block aspect-video w-full bg-[#05060a]"
            onPlay={handlePlay}
            onPause={() => {
              setIsPlaying(false);
              if (!videoRef.current?.ended) {
                sendHeartbeat("paused");
              }
            }}
            onEnded={() => {
              setIsPlaying(false);
              completeSession();
            }}
            onStalled={() => {
              stalledRef.current = true;
              sendHeartbeat("stalled");
              setStatus("buffering");
            }}
            onWaiting={() => {
              stalledRef.current = true;
              sendHeartbeat("stalled");
              setStatus("buffering");
            }}
            onPlaying={() => {
              stalledRef.current = false;
            }}
          />
        </div>

        <div className="mt-4">
          <h2 className="text-xl font-semibold tracking-tight text-white">{content.title}</h2>
          <p className="mt-1 text-sm leading-relaxed text-zinc-400">{content.description}</p>
          <p className="mt-3 font-mono text-[12px] tabular-nums text-zinc-500">
            {secondsWatched}s watched · creator earned <span className="text-zinc-300">{formatMoney(creatorEarned)}</span> ·{" "}
            {circle ? (
              <>settling on <span className="text-zinc-300">{network}</span></>
            ) : (
              <>balance <span className="text-zinc-300">{formatMoney(liveBalance)}</span></>
            )}{" "}
            · <span className="text-zinc-300">{status}</span>
          </p>
        </div>

        {error && !needsExtend ? (
          <div className="mt-3 rounded-xl border border-throttle/40 bg-throttle/10 px-3.5 py-2.5 text-sm text-zinc-200">{error}</div>
        ) : null}
      </div>

      {/* Session panel: the money-in-motion, beside the player */}
      <aside className="grid content-start gap-4 lg:sticky lg:top-24 lg:self-start">
        <MoneyMeter
          rateLabel={`$${ratePerSecond.toFixed(4)} /s`}
          cost={sessionCost}
          cap={meterCap}
          authorized={approved}
          ticking={isPlaying && approved}
        />
        <AgentBanner decision={agentDecision} />
        {receipt ? <UsageReceipt receipt={receipt} /> : null}
      </aside>
    </section>
  );
}
