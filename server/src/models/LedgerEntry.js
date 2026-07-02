import mongoose from "mongoose";

const ledgerEntrySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: "UsageSession" },
    contentId: { type: mongoose.Schema.Types.ObjectId, ref: "Content" },
    // Which economy this row belongs to. Reads filter by the active mode so mock
    // and circle records never blend in one database.
    mode: { type: String, enum: ["mock", "circle"], default: "mock", index: true },
    type: { type: String, enum: ["credit", "usage_debit"], required: true },
    amountUsd: { type: Number, required: true },
    grossAmountUsd: { type: Number, default: 0 },
    platformFeeUsd: { type: Number, default: 0 },
    creatorPayoutUsd: { type: Number, default: 0 },
    creatorId: { type: String, default: "" },
    creatorName: { type: String, default: "" },
    balanceAfterUsd: { type: Number, required: true },
    note: { type: String, default: "" },
  },
  { timestamps: true }
);

export const LedgerEntry = mongoose.model("LedgerEntry", ledgerEntrySchema);
