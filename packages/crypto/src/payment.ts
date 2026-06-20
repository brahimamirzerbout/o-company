// =============================================================================
// o.company · on-chain payment verification
// =============================================================================
// When a customer pays in crypto, we need to verify the on-chain transaction
// matches the expected payment. This module handles EVM chains (Ethereum,
// Base, Polygon, Arbitrum, Optimism) and ERC-20 stablecoins (USDC, USDT).
//
// We never hold custody. The customer sends to a payment-address-per-invoice
// we generate, and we watch the chain for the matching transfer.

import { createPublicClient, http, fallback, parseEventLogs, type Hash, type Address, erc20Abi, type PublicClient } from "viem";
import { mainnet, base, polygon, arbitrum, optimism } from "viem/chains";

const CHAIN_BY_ID = { 1: mainnet, 8453: base, 137: polygon, 42161: arbitrum, 10: optimism } as const;

const TRANSPORT = (id: keyof typeof CHAIN_BY_ID) => fallback([
  http(process.env.ALCHEMY_KEY ? `https://${chainSlug(id)}-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_KEY}` : undefined),
  http(),
]);

function chainSlug(id: number): string {
  return { 1: "eth", 8453: "base", 137: "polygon", 42161: "arb", 10: "opt" }[id] ?? "eth";
}

const _clients = new Map<number, PublicClient>();
function clientFor(chainId: number): PublicClient {
  let c = _clients.get(chainId);
  if (!c) {
    const chain = CHAIN_BY_ID[chainId as keyof typeof CHAIN_BY_ID];
    if (!chain) throw new Error(`Unsupported chain ${chainId}`);
    c = createPublicClient({ chain, transport: TRANSPORT(chainId as keyof typeof CHAIN_BY_ID) });
    _clients.set(chainId, c);
  }
  return c;
}

// USDC + USDT have 6 decimals on most chains (18 on some). DAI is always 18.
const TOKEN_DECIMALS: Record<string, number> = {
  USDC: 6,
  USDT: 6,
  DAI:  18,
};

// Known token addresses. Override via env if your deployment uses a custom USDC.
const TOKEN_ADDRESSES: Record<string, Record<number, Address>> = {
  USDC: {
    1:     "0xA0b86991c6218b36c1d142D44E63cDBf6c70b6E3", // Ethereum
    8453:  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // Base
    137:   "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", // Polygon
    42161: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", // Arbitrum
    10:    "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", // Optimism
  },
  USDT: {
    1:     "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    42161: "0xFd086bC7Cd5C481DCC9C85ebE478A1C0b69FCbb9",
  },
  DAI: {
    1:     "0x6B175474E89094C44Da98b954EedeAC495271d0F",
  },
};

const ERC20_TRANSFER_EVENT = {
  type: "event" as const,
  name: "Transfer" as const,
  inputs: [
    { type: "address" as const, name: "from", indexed: true },
    { type: "address" as const, name: "to",   indexed: true },
    { type: "uint256" as const,  name: "value" },
  ],
};

export interface ExpectedPayment {
  /** The chain id where payment is expected. */
  chainId: number;
  /** The recipient address (a per-invoice payment address). */
  to: Address;
  /** Token symbol. */
  token: keyof typeof TOKEN_ADDRESSES;
  /** Expected amount in *atomic units* (e.g. $100 = 100_000_000 for USDC). */
  amountAtomic: bigint;
  /** How long the customer has to pay. After this, the invoice is void. */
  expiresAt: Date;
}

export interface PaymentVerification {
  ok: boolean;
  txHash: Hash | null;
  blockNumber: bigint | null;
  from: Address | null;
  amount: bigint | null;
  reason?: string;
}

/**
 * Verify that `txHash` is a valid ERC-20 Transfer matching `expected`.
 * Reads the receipt, decodes the logs, and matches by recipient + amount.
 */
export async function verifyPayment(
  txHash: Hash,
  expected: ExpectedPayment,
): Promise<PaymentVerification> {
  const client = clientFor(expected.chainId);

  // 1. Wait for the receipt
  let receipt;
  try {
    receipt = await client.getTransactionReceipt({ hash: txHash });
  } catch (e) {
    return { ok: false, txHash, blockNumber: null, from: null, amount: null, reason: "Receipt not found" };
  }
  if (!receipt) {
    return { ok: false, txHash, blockNumber: null, from: null, amount: null, reason: "Receipt pending or not found" };
  }
  if (receipt.status !== "success") {
    return { ok: false, txHash, blockNumber: receipt.blockNumber, from: null, amount: null, reason: "Transaction reverted" };
  }

  // 2. Find a Transfer event to `expected.to` with the right amount
  const tokenAddress = TOKEN_ADDRESSES[expected.token]?.[expected.chainId];
  if (!tokenAddress) {
    return { ok: false, txHash, blockNumber: receipt.blockNumber, from: null, amount: null, reason: "Token not supported on this chain" };
  }

  const logs = parseEventLogs({
    abi: [ERC20_TRANSFER_EVENT],
    eventName: "Transfer",
    logs: receipt.logs,
  });

  for (const log of logs) {
    if (log.address.toLowerCase() !== tokenAddress.toLowerCase()) continue;
    const args = (log as { args: { from: Address; to: Address; value: bigint } }).args;
    if (args.to.toLowerCase() !== expected.to.toLowerCase()) continue;
    if (args.value < expected.amountAtomic) continue;
    return {
      ok: true,
      txHash,
      blockNumber: receipt.blockNumber,
      from: args.from,
      amount: args.value,
    };
  }

  return { ok: false, txHash, blockNumber: receipt.blockNumber, from: null, amount: null, reason: "No matching transfer in receipt" };
}

/** Generate a fresh payment address for an invoice. */
export async function generatePaymentAddress(seed: string, chainId: number): Promise<Address> {
  // In production, this would be a deterministic CREATE2 deployment
  // of a payment-receiver contract. For the MVP, use a hot wallet.
  // TODO: replace with CREATE2-based per-invoice addresses.
  return "0x0000000000000000000000000000000000000000" as Address;
}

/** Atomic units for a token. $100 USDC = 100_000_000. */
export function toAtomic(humanAmount: number, token: keyof typeof TOKEN_DECIMALS): bigint {
  const d = TOKEN_DECIMALS[token] ?? 6;
  return BigInt(Math.round(humanAmount * 10 ** d));
}
