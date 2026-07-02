/**
 * Step-4 FIRST-SIGN SMOKE TEST (load-bearing).
 *
 * Signs a known small EIP-3009 TransferWithAuthorization with the buyer's Circle
 * developer-controlled wallet, then runs it THROUGH the real Gateway facilitator
 * `verify` and reports the verdict. Signing succeeding is NOT enough — a
 * well-formed signature is rejected if any domain field (chainId,
 * verifyingContract, name, version) disagrees with what GatewayWallet expects.
 *
 * This calls the facilitator directly, so it works regardless of PAYMENT_MODE
 * (the app stays on mock until this passes). Run: node src/scripts/smokeCircleSign.js
 */
import { BatchEvmScheme } from "@circle-fin/x402-batching/client";
import { env } from "../config/env.js";
import { circleGatewayService } from "../services/circleGatewayService.js";
import { createCircleSigner } from "../payments/circleWalletSigner.js";

const AMOUNT_USD = 0.01; // a known small authorization

async function main() {
  console.log("=== Avalon Step-4 first-sign smoke test ===");
  console.log("app PAYMENT_MODE:", env.paymentMode, "(this script hits the REAL facilitator directly)");
  console.log("buyer wallet :", env.circleBuyerWalletId, env.circleBuyerAddress);
  console.log("seller `to`  :", env.circleSellerWallet);

  const requirements = circleGatewayService.createPaymentRequirements({
    amount: AMOUNT_USD,
    resourceUrl: "/api/smoke/sign",
    description: "Avalon Step-4 first-sign smoke test",
  });
  const accepted = requirements.accepts[0];
  console.log("\n--- payment requirement (accepts[0]) ---");
  console.log(JSON.stringify(accepted, null, 2));

  const signer = createCircleSigner();
  const scheme = new BatchEvmScheme(signer);

  console.log("\n--- signing via Circle developer-controlled wallet (no popup) ---");
  const { x402Version, payload } = await scheme.createPaymentPayload(requirements.x402Version, accepted);

  // Gateway /v1/x402/verify requires the full payload incl. resource + accepted
  // (the same envelope the package's own pay() builds for the PAYMENT-SIGNATURE header).
  const paymentPayload = { x402Version, payload, resource: requirements.resource, accepted };
  console.log("signed payment payload:");
  console.log(JSON.stringify(paymentPayload, null, 2));

  console.log("\n--- running through Gateway facilitator /v1/x402/verify ---");
  const verdict = await circleGatewayService.facilitator.verify(paymentPayload, accepted);
  console.log("FACILITATOR VERDICT:");
  console.log(JSON.stringify(verdict, null, 2));

  if (verdict.isValid) {
    console.log("\nVALID — GatewayWallet accepted the signature + domain. Safe to wire into flush.");
  } else {
    console.log(`\nNOT VALID — invalidReason: ${verdict.invalidReason}`);
    console.log("(A balance/deposit reason means the domain is fine but the buyer needs a Gateway deposit;");
    console.log(" a signature/domain reason means a typed-data field disagrees and must be fixed.)");
  }
}

main()
  .catch((err) => {
    console.error("\nSmoke test error:", err?.response?.data ?? err);
    process.exitCode = 1;
  })
  // Let the SDK's HTTP agent drain so Node exits cleanly (avoids a Windows libuv
  // abort on a forced process.exit while sockets are still open).
  .finally(() => setTimeout(() => process.exit(process.exitCode ?? 0), 250));
