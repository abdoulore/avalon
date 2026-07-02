import cors from "cors";
import express from "express";
import { env } from "./config/env.js";
import { paymentMode } from "./payments/paymentMode.js";
import { paymentService } from "./services/paymentService.js";
import { asyncHandler } from "./middleware/asyncHandler.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { conciergeRouter } from "./routes/conciergeRoutes.js";
import { contentRouter } from "./routes/contentRoutes.js";
import { ledgerRouter } from "./routes/ledgerRoutes.js";
import { paymentRouter } from "./routes/paymentRoutes.js";
import { usageRouter } from "./routes/usageRoutes.js";
import { userRouter } from "./routes/userRoutes.js";

export const app = express();

const localOrigins = new Set([
  env.clientOrigin,
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://[::1]:3000",
]);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || localOrigins.has(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`Origin ${origin} is not allowed by CORS`));
    },
  })
);
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "Avalon API" });
});

app.get("/api/config", (req, res) => {
  const circle = paymentMode.name === "circle";
  res.json({
    paymentMode: paymentMode.name, // "mock" | "circle"
    network: paymentMode.network, // "mock" | "arc-testnet"
    supportsTopUp: paymentMode.supportsTopUp, // mock can top up locally; circle deposits on-chain
    agentReasoning: env.agentReasoning,
    // Single source of truth for the revenue split — the client must derive its
    // 85/15 display from this, never hardcode it.
    platformFeeRate: paymentService.calculateSplit(1).platformFeeRate,
    // Explorer is only meaningful on-chain. Mock refs aren't on any chain, so the
    // UI must not render fake explorer links for them.
    explorerUrl: circle ? env.arcExplorerUrl : null,
    chainId: circle ? env.arcChainId : null,
  });
});

app.use("/api/content", wrapRouter(contentRouter));
app.use("/api/concierge", wrapRouter(conciergeRouter));
app.use("/api/ledger", wrapRouter(ledgerRouter));
app.use("/api", wrapRouter(paymentRouter));
app.use("/api/users", wrapRouter(userRouter));
app.use("/api/usage", wrapRouter(usageRouter));

app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.use(errorHandler);

function wrapRouter(router) {
  const wrapped = express.Router();
  for (const layer of router.stack) {
    if (layer.route) {
      for (const stackLayer of layer.route.stack) {
        stackLayer.handle = asyncHandler(stackLayer.handle);
      }
    }
  }
  wrapped.use(router);
  return wrapped;
}
