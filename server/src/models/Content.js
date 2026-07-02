import mongoose from "mongoose";

const contentSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    creatorId: { type: String, required: true, trim: true },
    creatorName: { type: String, required: true, trim: true },
    type: { type: String, enum: ["video", "book"], required: true },
    description: { type: String, default: "" },
    coverUrl: { type: String, default: "" },
    mediaUrl: { type: String, default: "" },
    durationLabel: { type: String, default: "" }, // human runtime, e.g. "14:48"
    pages: { type: Number, default: 0, min: 0 },
    // Real page text for books (public-domain). Excluded from the list endpoint
    // (heavy) and fetched on demand via GET /content/:id.
    bookPages: { type: [String], default: [], select: false },
    pricePerSecondUsd: { type: Number, default: 0, min: 0 },
    pricePerPageUsd: { type: Number, default: 0, min: 0 },
    freePreviewSeconds: { type: Number, default: 0, min: 0 },
    freePreviewPages: { type: Number, default: 0, min: 0 },
    isPremium: { type: Boolean, default: false },
    liveEventPricePerSecondUsd: { type: Number, default: 0, min: 0 },
    published: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Content = mongoose.model("Content", contentSchema);
