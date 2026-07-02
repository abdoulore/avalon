import mongoose from "mongoose";

const ledgerSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    // Which economy this row belongs to. Reads filter by the active mode so mock
    // and circle records never blend in one database.
    mode: { type: String, enum: ["mock", "circle"], default: "mock", index: true },
    creatorId: { type: String, required: true },
    creatorName: { type: String, default: "" },
    contentId: { type: mongoose.Schema.Types.ObjectId, ref: "Content", required: true },
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: "UsageSession", required: true },
    amount: { type: Number, required: true }, // dollars settled in this row
    amountAtomic: { type: Number, default: 0 }, // integer atomic USDC units settled (batch source of truth)
    drawCount: { type: Number, default: 0 }, // number of per-tick draws folded into this batch
    batchRef: { type: String, default: "" }, // Gateway (or mock/dev) settlement batch reference
    platformFee: { type: Number, required: true },
    creatorShare: { type: Number, required: true },
    usageType: {
      type: String,
      enum: ["video_second", "book_page", "reading_heartbeat", "content_unlock", "settlement_batch"],
      required: true,
    },
    circlePaymentId: { type: String, default: "" },
    gatewayStatus: { type: String, default: "mock" },
    paymentProof: { type: Object, default: {} },
    timestamp: { type: Date, default: Date.now },
    reason: { type: String, default: "" },
  },
  { timestamps: true }
);

export const Ledger = mongoose.model("Ledger", ledgerSchema);
