import crypto from "crypto";
import { createPublicClient, http } from "viem";
import { BatchFacilitatorClient } from "@circle-fin/x402-batching/server";
import { env } from "../config/env.js";
import { roundMoney } from "../payments/paymentAdapter.js";

const ARC_TESTNET_RPC = "https://rpc.testnet.arc.network";
const AVAILABLE_BALANCE_ABI = [
  {
    name: "availableBalance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "token", type: "address" },
      { name: "depositor", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
];

const USDC_DECIMALS = 6;
const ARC_TESTNET_CAIP2 = "eip155:5042002";
const ARC_TESTNET_USDC = "0x3600000000000000000000000000000000000000";
const ARC_TESTNET_GATEWAY_WALLET = "0x0077777d7EBA4688BDeF3E311b846F25870A19B9";

// EIP-3009 authorization typed-data, validated end to end against the live
// GatewayWallet verifier (smoke test: isValid:true, payer recovered to buyer).
const TRANSFER_WITH_AUTHORIZATION_TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
};
// Matches x402-batching: 7 days + 100s buffer, so a signed authorization stays
// valid long enough for Gateway batching.
const GATEWAY_AUTH_VALIDITY_WINDOW_SECONDS = 7 * 24 * 60 * 60 + 100;

export class CircleGatewayService {
  constructor() {
    this.facilitator = new BatchFacilitatorClient({
      url: env.circleGatewayBaseUrl,
      createAuthHeaders: async () => {
        if (!env.circleApiKey) {
          return { verify: {}, settle: {}, supported: {} };
        }
        return {
          verify: { Authorization: `Bearer ${env.circleApiKey}` },
          settle: { Authorization: `Bearer ${env.circleApiKey}` },
          supported: { Authorization: `Bearer ${env.circleApiKey}` },
        };
      },
    });
  }

  createPaymentRequirements({ amount, resourceUrl, description }) {
    const atomicAmount = toUsdcAtomic(amount);
    return {
      x402Version: 2,
      resource: {
        url: resourceUrl,
        description,
        mimeType: "application/json",
      },
      accepts: [
        {
          scheme: "exact",
          network: normalizeNetwork(env.circleSupportedChain),
          asset: ARC_TESTNET_USDC,
          amount: atomicAmount,
          maxTimeoutSeconds: 604900,
          payTo: env.circleSellerWallet,
          extra: {
            name: "GatewayWalletBatched",
            version: "1",
            verifyingContract: ARC_TESTNET_GATEWAY_WALLET,
          },
        },
      ],
    };
  }

  // Build + sign ONE EIP-3009 authorization with a CALLER-PROVIDED nonce. The
  // nonce is owned by the settlement claim so it stays stable across retries
  // (BatchEvmScheme generates its own random nonce, which we cannot reuse).
  async signAuthorization({ signer, requirements, amountAtomic, nonce }) {
    const accepted = requirements.accepts[0];
    const chainId = parseInt(accepted.network.split(":")[1], 10);
    const now = Math.floor(Date.now() / 1000);
    const authorization = {
      from: signer.address,
      to: accepted.payTo,
      value: String(amountAtomic),
      validAfter: String(now - 600),
      validBefore: String(now + GATEWAY_AUTH_VALIDITY_WINDOW_SECONDS),
      nonce,
    };
    const signature = await signer.signTypedData({
      domain: {
        name: "GatewayWalletBatched",
        version: "1",
        chainId,
        verifyingContract: accepted.extra.verifyingContract,
      },
      types: TRANSFER_WITH_AUTHORIZATION_TYPES,
      primaryType: "TransferWithAuthorization",
      message: {
        from: authorization.from,
        to: authorization.to,
        value: BigInt(authorization.value),
        validAfter: BigInt(authorization.validAfter),
        validBefore: BigInt(authorization.validBefore),
        nonce: authorization.nonce,
      },
    });
    return { x402Version: requirements.x402Version, payload: { authorization, signature } };
  }

  // The ONE place the verify/settle envelope is built, so they can't drift.
  // Gateway requires resource + accepted alongside { x402Version, payload }.
  buildSettleEnvelope({ signed, requirements }) {
    return {
      x402Version: signed.x402Version,
      payload: signed.payload,
      resource: requirements.resource,
      accepted: requirements.accepts[0],
    };
  }

  // Settle a signed authorization for one batch through the Gateway facilitator.
  // Classifies a duplicate-nonce rejection as "already settled" (idempotent) so
  // a retry of a maybe-settled batch finalizes instead of double-settling.
  async settleSigned({ signed, requirements }) {
    const envelope = this.buildSettleEnvelope({ signed, requirements });
    const result = await this.facilitator.settle(envelope, requirements.accepts[0]);
    if (result.success) {
      return {
        ok: true,
        batchRef: result.transaction || `settled_${crypto.randomUUID()}`,
        gatewayStatus: "settled",
        payer: result.payer,
        paymentProof: signed.payload,
      };
    }
    const reason = String(result.errorReason || "Gateway settle failed");
    const duplicate = /nonce|already|used|duplicat|replay/i.test(reason);
    return { ok: false, duplicate, reason };
  }
}

function normalizeNetwork(value) {
  if (value === "arc-testnet") {
    return ARC_TESTNET_CAIP2;
  }
  return value;
}

// On-chain Gateway available balance (atomic) for a depositor — seeds the
// reservation pool in circle mode.
export async function readGatewayAvailableAtomic(address) {
  const pub = createPublicClient({ transport: http(ARC_TESTNET_RPC) });
  const raw = await pub.readContract({
    address: ARC_TESTNET_GATEWAY_WALLET,
    abi: AVAILABLE_BALANCE_ABI,
    functionName: "availableBalance",
    args: [ARC_TESTNET_USDC, address],
  });
  return Number(raw);
}

export function toUsdcAtomic(amount) {
  return String(Math.round(Number(amount || 0) * 10 ** USDC_DECIMALS));
}

// Atomic units -> display dollars. The atomic->dollar edge for the API/ledger.
export function fromUsdcAtomic(atomic) {
  return roundMoney(Number(atomic || 0) / 10 ** USDC_DECIMALS);
}

export const circleGatewayService = new CircleGatewayService();
