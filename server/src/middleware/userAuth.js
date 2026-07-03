import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { User } from "../models/User.js";

const TOKEN_TTL = "30d";

export function signUserToken(user) {
  return jwt.sign({ sub: String(user._id) }, env.jwtSecret, { expiresIn: TOKEN_TTL });
}

// Verifies a raw JWT and returns the user document, or null. Shared by the
// REST middleware below and the Socket.IO handshake (which has no req/res).
export async function resolveUserFromToken(token) {
  if (!token || !env.jwtSecret) return null;
  try {
    const payload = jwt.verify(token, env.jwtSecret);
    return await User.findById(payload.sub);
  } catch {
    return null;
  }
}

// Bearer token (not an httpOnly cookie) because the client and API live on
// different sites (vercel.app / onrender.com): cross-site cookies are blocked
// by Safari and unreliable elsewhere, and the socket handshake needs the same
// token anyway.
export async function authRequired(req, res, next) {
  if (!env.jwtSecret) {
    return res.status(503).json({ error: "JWT_SECRET is not configured on the server." });
  }
  const header = String(req.header("authorization") || "");
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const user = await resolveUserFromToken(token);
  if (!user) {
    return res.status(401).json({ error: "Sign in required." });
  }
  req.user = user;
  next();
}
