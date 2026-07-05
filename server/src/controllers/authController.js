import bcrypt from "bcryptjs";
import { env } from "../config/env.js";
import { User } from "../models/User.js";
import { paymentMode } from "../payments/paymentMode.js";
import { ensureDemoUser } from "./userController.js";
import { signUserToken } from "../middleware/userAuth.js";
import { provisionUserWallet } from "../services/userWalletService.js";
import { grantStarterFunds } from "../services/starterGrantService.js";

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

  // Circle mode: provision the user's own developer-controlled wallet now.
  // Best-effort — on failure the account still works and walletFor() retries
  // lazily the first time the wallet is actually needed.
  let grantPending = false;
  if (paymentMode.name === "circle") {
    try {
      await provisionUserWallet(user);
    } catch (error) {
      console.error(`Wallet provisioning failed for ${user._id}: ${error.message}`);
    }
    // Fund the new wallet in the BACKGROUND: the grant is three on-chain txs
    // (~30s), far too slow to block the signup response on. The client polls the
    // Gateway balance and shows a "setting up your wallet" state until it lands.
    if (env.signupGrantUsd > 0) {
      grantPending = true;
      grantStarterFunds({ user }).catch((error) =>
        console.error(`Starter grant failed for ${user._id}: ${error.message}`)
      );
    }
  }

  const fresh = await User.findById(user._id);
  res.status(201).json({ token: signUserToken(fresh), user: publicUser(fresh), grantPending });
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
