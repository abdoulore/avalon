import mongoose from "mongoose";

// Reservation pool over a funding source. The `key` identifies that source:
//   - circle mode: "wallet:<buyerAddress>" -> ONE shared pool, so every user's
//     session draws from the single sponsored Gateway wallet without over-claiming.
//   - mock mode:   "user:<userId>"         -> a per-user pool over the mock balance.
//
// INVARIANT at all times: availableAtomic + reservedAtomic + spentAtomic === totalAtomic
// and availableAtomic never goes below zero. All amounts are integer atomic USDC.
const gatewayPoolSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    // The economy this pool funds. The key is already mode-namespaced; this field
    // makes the separation explicit and queryable.
    mode: { type: String, enum: ["mock", "circle"], default: "mock", index: true },
    totalAtomic: { type: Number, default: 0, min: 0 }, // deposited / seeded
    availableAtomic: { type: Number, default: 0, min: 0 }, // free to reserve
    reservedAtomic: { type: Number, default: 0, min: 0 }, // committed to active session allowances
    spentAtomic: { type: Number, default: 0, min: 0 }, // settled out of the pool
  },
  { timestamps: true }
);

export const GatewayPool = mongoose.model("GatewayPool", gatewayPoolSchema);
