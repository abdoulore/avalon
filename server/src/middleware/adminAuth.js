import crypto from "crypto";
import { env } from "../config/env.js";

/**
 * Fail-closed gate for endpoints that mutate shared state or move funds
 * (publishing content, on-chain Gateway deposits). Stopgap until real user
 * accounts land; the client sends the token as an `x-admin-token` header.
 *
 * ADMIN_TOKEN unset -> 503, never fail-open: a deploy that forgets the env var
 * must surface loudly instead of silently exposing the endpoints.
 */
export function adminRequired(req, res, next) {
  if (!env.adminToken) {
    return res.status(503).json({ error: "ADMIN_TOKEN is not configured on the server." });
  }
  const provided = String(req.header("x-admin-token") || "");
  const expected = String(env.adminToken);
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  // timingSafeEqual requires equal lengths; the length check itself leaks only
  // the token's length, which is acceptable for this gate.
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: "Admin token required." });
  }
  next();
}
