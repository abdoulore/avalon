import { Server } from "socket.io";
import { resolveUserFromToken } from "../middleware/userAuth.js";
import { UsageSession } from "../models/UsageSession.js";
import { meterService } from "../services/meterService.js";
import { sessionService } from "../services/sessionService.js";
import { settlementService } from "../services/settlementService.js";
import { reservationService } from "../services/reservationService.js";

export function attachSocketServer(httpServer, { corsOrigin }) {
  const io = new Server(httpServer, {
    cors: { origin: corsOrigin },
  });

  // Billing sessions belong to the authenticated user, so the socket itself
  // must be authenticated: the client sends its bearer token in the handshake
  // (`auth.token`), and an unauthenticated connection is refused outright.
  io.use(async (socket, next) => {
    const user = await resolveUserFromToken(socket.handshake.auth?.token);
    if (!user) {
      return next(new Error("Sign in required."));
    }
    socket.data.userId = user._id;
    next();
  });

  io.on("connection", (socket) => {
    socket.on("session:start", async ({ contentId, capAtomic }, callback) => {
      try {
        const result = await sessionService.startOrResume({ userId: socket.data.userId, contentId, capAtomic });
        const sessionId = String(result.usageSession._id);
        socket.join(sessionId);
        socket.data.sessions = socket.data.sessions || new Set();
        socket.data.sessions.add(sessionId);
        callback?.({
          ok: true,
          session: result.usageSession,
          balanceUsd: result.user.balanceUsd,
        });
      } catch (error) {
        callback?.({ ok: false, error: normalizeError(error) });
      }
    });

    socket.on("usage:heartbeat", async ({ sessionId, state }, callback) => {
      try {
        const result = await meterService.processHeartbeat({ sessionId, state });
        const payload = {
          ok: true,
          session: result.usageSession,
          chargeAmount: result.chargeAmount,
          platformFeeUsd: result.platformFeeUsd,
          creatorShareUsd: result.creatorShareUsd,
          balanceUsd: result.user?.balanceUsd,
          agentDecision: result.agentDecision, // legibility: "agent decided X because Y"
          stopAccess: false,
        };
        io.to(String(sessionId)).emit("billing:update", payload);
        callback?.(payload);
      } catch (error) {
        const payload = {
          ok: false,
          error: normalizeError(error),
          stopAccess: error.status === 402,
          paymentRequired: error.paymentRequirement,
          needsReauth: Boolean(error.needsReauth), // allowance exhausted -> client offers "extend" (step 4)
          needsFunding: Boolean(error.needsFunding), // empty Gateway balance -> client routes to funding
          remainingAtomic: error.remainingAtomic, // atomic units stranded at exhaustion, if any
        };
        if (sessionId) {
          io.to(String(sessionId)).emit("billing:update", payload);
        }
        callback?.(payload);
      }
    });

    socket.on("usage:page", async ({ sessionId, page }, callback) => {
      try {
        const result = await meterService.processPageRead({ sessionId, page });
        const payload = {
          ok: true,
          served: true,
          session: result.usageSession,
          chargeAmount: result.chargeAmount,
          balanceUsd: result.user?.balanceUsd,
          agentDecision: result.agentDecision,
          stopAccess: false,
        };
        io.to(String(sessionId)).emit("billing:update", payload);
        callback?.(payload);
      } catch (error) {
        const payload = {
          ok: false,
          served: false, // page must NOT be rendered when billing is refused
          error: normalizeError(error),
          stopAccess: error.status === 402,
          needsReauth: Boolean(error.needsReauth),
          needsFunding: Boolean(error.needsFunding),
          remainingAtomic: error.remainingAtomic,
        };
        if (sessionId) {
          io.to(String(sessionId)).emit("billing:update", payload);
        }
        callback?.(payload);
      }
    });

    socket.on("session:state", async ({ sessionId, state }, callback) => {
      try {
        const session = await sessionService.markActivity({ sessionId, state });
        callback?.({ ok: true, session });
      } catch (error) {
        callback?.({ ok: false, error: normalizeError(error) });
      }
    });

    // Leak backstop: a session that dies without completing strands its reserved
    // funds. On disconnect, flush pending, release the unused reservation, and
    // CLOSE the session. Once the reservation is released the allowance is no
    // longer backed by pool funds, so the session must not be resumable — a
    // reconnect starts fresh with a new approval (which the client shows anyway).
    socket.on("disconnect", async () => {
      const sessions = socket.data.sessions ? [...socket.data.sessions] : [];
      for (const sessionId of sessions) {
        try {
          await settlementService.flush({ sessionId });
          await reservationService.releaseSession({ sessionId });
          await UsageSession.updateOne(
            { _id: sessionId, status: "active" },
            { $set: { status: "completed", endedAt: new Date(), activityState: "left" } }
          );
        } catch {
          // best-effort
        }
      }
    });
  });

  return io;
}

function normalizeError(error) {
  return error.status === 402 ? "Insufficient balance. Please top up." : error.message || "Request failed";
}
