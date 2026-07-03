import bcrypt from "bcryptjs";
import { env } from "../config/env.js";
import { User } from "../models/User.js";
import { paymentMode } from "../payments/paymentMode.js";
import { ensureDemoUser } from "./userController.js";
import { signUserToken } from "../middleware/userAuth.js";

// Mock mode hands new users test money so they can watch immediately; circle
// mode ignores the local balance entirely (funds live in the Gateway pool).
const STARTER_BALANCE_USD = 10;

function jwtConfigured(res) {
  if (!env.jwtSecret) {
    res.status(503).json({ error: "JWT_SECRET is not configured on the server." });
    return false;
  }
  return true;
}

function publicUser(user) {
  const { passwordHash, ...rest } = user.toObject();
  return rest;
}

export async function signup(req, res) {
  if (!jwtConfigured(res)) return;
  const name = String(req.body.name || "").trim();
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");

  if (!name || !email || !password) {
    return res.status(400).json({ error: "Name, email, and password are required." });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Enter a valid email address." });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters." });
  }

  const existing = await User.findOne({ email });
  if (existing) {
    return res.status(409).json({ error: "An account with this email already exists." });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({
    name,
    email,
    passwordHash,
    balanceUsd: paymentMode.supportsTopUp ? STARTER_BALANCE_USD : 0,
    currency: "USDC",
  });

  res.status(201).json({ token: signUserToken(user), user: publicUser(user) });
}

export async function login(req, res) {
  if (!jwtConfigured(res)) return;
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  const user = await User.findOne({ email }).select("+passwordHash");
  // Same error for wrong email and wrong password — don't confirm which
  // addresses have accounts. Accounts without a hash (the demo user) can't
  // password-login at all.
  if (!user?.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ error: "Invalid email or password." });
  }

  res.json({ token: signUserToken(user), user: publicUser(user) });
}

// One-click demo access: issues a normal token for the shared demo account.
export async function demoLogin(req, res) {
  if (!jwtConfigured(res)) return;
  const user = await ensureDemoUser();
  res.json({ token: signUserToken(user), user });
}

export async function me(req, res) {
  res.json({ user: req.user });
}
