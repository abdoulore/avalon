import { createPublicClient, http } from "viem";
import { env } from "../config/env.js";
import { getCircleWalletClient } from "../payments/circleWalletSigner.js";
import { readGatewayAvailableAtomic } from "./circleGatewayService.js";

const ARC_RPC = "https://rpc.testnet.arc.network";
const ERC20_BALANCE_OF_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
];

/**
 * On-chain Gateway deposit, shared by the CLI script and the /top-up endpoint.
 *
 * Settle fails on an empty Gateway balance, so the buyer must deposit USDC into
 * the GatewayWallet before settling. Two contract executions, each submitted by
 * the buyer's Circle developer-controlled wallet and awaited to CONFIRMED:
 *   USDC.approve(GatewayWallet, amount)  ->  GatewayWallet.deposit(USDC, amount)
 * Both txHashes are REAL Arc EVM tx hashes (unlike the batched settle ref).
 */
const USDC = "0x3600000000000000000000000000000000000000";
const GATEWAY_WALLET = "0x0077777d7EBA4688BDeF3E311b846F25870A19B9";
const FINAL_STATES = new Set(["FAILED", "DENIED", "CANCELLED"]);

async function execContract(client, { contractAddress, abiFunctionSignature, abiParameters }) {
  const res = await client.createContractExecutionTransaction({
    walletId: env.circleBuyerWalletId,
    contractAddress,
    abiFunctionSignature,
    abiParameters,
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  });
  const id = res.data?.id;
  const done = await client.getTransaction({ id, waitForState: "CONFIRMED", pollingInterval: 3000 });
  const tx = done.data?.transaction;
  if (FINAL_STATES.has(tx?.state)) {
    throw new Error(`${abiFunctionSignature} ${tx?.state}: ${tx?.errorReason || "transaction did not confirm"}`);
  }
  return tx;
}

class GatewayDepositService {
  // Current on-chain Gateway available balance for the buyer (atomic + dollars).
  async readAvailable() {
    const atomic = Number(await readGatewayAvailableAtomic(env.circleBuyerAddress));
    return { availableAtomic: atomic, availableUsd: atomic / 1_000_000 };
  }

  // The buyer wallet's own USDC balance (the source you deposit FROM, distinct
  // from the Gateway available balance you settle from). ERC-20 balanceOf.
  async readWalletUsdcAtomic() {
    const pub = createPublicClient({ transport: http(ARC_RPC) });
    const raw = await pub.readContract({
      address: USDC,
      abi: ERC20_BALANCE_OF_ABI,
      functionName: "balanceOf",
      args: [env.circleBuyerAddress],
    });
    return Number(raw);
  }

  // Both balances + the address to fund: wallet USDC (deposit source), Gateway
  // available (settle source), and the buyer address to send test USDC to.
  async readBalances() {
    const [availableAtomic, walletAtomic] = await Promise.all([
      readGatewayAvailableAtomic(env.circleBuyerAddress),
      this.readWalletUsdcAtomic(),
    ]);
    return {
      address: env.circleBuyerAddress,
      walletAtomic: Number(walletAtomic),
      walletUsd: Number(walletAtomic) / 1_000_000,
      availableAtomic: Number(availableAtomic),
      availableUsd: Number(availableAtomic) / 1_000_000,
    };
  }

  // approve -> deposit -> reread. Returns before/after balances + both tx hashes.
  async deposit({ amountUsd }) {
    const usd = Number(amountUsd);
    if (!Number.isFinite(usd) || usd <= 0) {
      const err = new Error("Deposit amount must be greater than zero.");
      err.status = 400;
      throw err;
    }
    const amountAtomic = String(Math.round(usd * 1_000_000));
    const client = getCircleWalletClient();

    const before = Number(await readGatewayAvailableAtomic(env.circleBuyerAddress));
    const approveTx = await execContract(client, {
      contractAddress: USDC,
      abiFunctionSignature: "approve(address,uint256)",
      abiParameters: [GATEWAY_WALLET, amountAtomic],
    });
    const depositTx = await execContract(client, {
      contractAddress: GATEWAY_WALLET,
      abiFunctionSignature: "deposit(address,uint256)",
      abiParameters: [USDC, amountAtomic],
    });
    const after = Number(await readGatewayAvailableAtomic(env.circleBuyerAddress));

    return {
      depositedAtomic: Number(amountAtomic),
      depositedUsd: usd,
      beforeAtomic: before,
      afterAtomic: after,
      approveHash: approveTx?.txHash || "",
      depositHash: depositTx?.txHash || "",
    };
  }
}

export const gatewayDepositService = new GatewayDepositService();
