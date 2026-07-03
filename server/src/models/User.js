import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    // bcrypt hash; absent on the demo account (which logs in via /auth/demo only).
    // select:false keeps it out of every query that doesn't explicitly ask.
    passwordHash: { type: String, select: false },
    balanceUsd: { type: Number, required: true, default: 0 },
    currency: { type: String, enum: ["USD", "USDC"], default: "USDC" },
    // Circle developer-controlled wallet (circle mode): each user signs and
    // settles from their own EOA. Empty until provisioned; the demo account
    // maps to the project wallet from env instead.
    circleWalletId: { type: String, default: "" },
    circleWalletAddress: { type: String, default: "" },
  },
  { timestamps: true }
);

export const User = mongoose.model("User", userSchema);
