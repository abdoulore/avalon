import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    balanceUsd: { type: Number, required: true, default: 0 },
    currency: { type: String, enum: ["USD", "USDC"], default: "USDC" },
  },
  { timestamps: true }
);

export const User = mongoose.model("User", userSchema);
