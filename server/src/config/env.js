import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.resolve(__dirname, "../../.env") });
dotenv.config();

export const env = {
  port: Number(process.env.PORT || 4000),
  mongoUri: process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/avalon",
  clientOrigin: process.env.CLIENT_ORIGIN || "http://localhost:3000",
  paymentMode: process.env.PAYMENT_MODE || "mock",
  // Gates operator-only endpoints (x-admin-token header) — currently just
  // GET /api/ledger/platform. Fail-closed: when unset, they return 503.
  adminToken: process.env.ADMIN_TOKEN || "",
  // Signs auth tokens (Authorization: Bearer). Fail-closed like ADMIN_TOKEN:
  // when unset, all auth endpoints return 503 instead of signing with a
  // guessable default.
  jwtSecret: process.env.JWT_SECRET || "",
  circleApiKey: process.env.CIRCLE_API_KEY || "",
  circleGatewayBaseUrl: process.env.CIRCLE_GATEWAY_BASE_URL || "https://gateway-api-testnet.circle.com",
  circleGatewayEnv: process.env.CIRCLE_GATEWAY_ENV || "testnet",
  circleSellerWallet: process.env.CIRCLE_SELLER_WALLET || "0xYOUR_SELLER_WALLET",
  circleSupportedChain: process.env.CIRCLE_SUPPORTED_CHAIN || "arc-testnet",
  // Arc testnet block explorer (Blockscout): used to turn settled batch tx hashes
  // and payer addresses into verify-on-chain links. Override per deploy/chain.
  arcExplorerUrl: (process.env.ARC_EXPLORER_URL || "https://testnet.arcscan.app").replace(/\/+$/, ""),
  arcChainId: Number(process.env.ARC_CHAIN_ID || 5042002),
  // Developer-controlled wallet signing (Step 4). entitySecret is the registered
  // 32-byte hex; the SDK encrypts it per request.
  circleEntitySecret: process.env.CIRCLE_ENTITY_SECRET || "",
  circleWalletSetId: process.env.CIRCLE_WALLET_SET_ID || "",
  circleBuyerWalletId: process.env.CIRCLE_BUYER_WALLET_ID || "",
  circleBuyerAddress: process.env.CIRCLE_BUYER_ADDRESS || "",
  // Budget agent (Step 5). AGENT_REASONING gates the model path on/off (off ->
  // deterministic guards only). DeepSeek is OpenAI-compatible.
  agentReasoning: String(process.env.AGENT_REASONING).toLowerCase() === "true",
  deepseekApiKey: process.env.DEEPSEEK_API_KEY || "",
  deepseekBaseUrl: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
};
