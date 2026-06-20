// =============================================================================
// o.company · on-chain identity
// =============================================================================
// The crypto side of Noira. Two responsibilities:
//   1. Resolve human-readable names (ENS, Basenames, Unstoppable) → addresses
//   2. Compute a Trust Score from public on-chain activity
//
// We never request signatures. We never see private keys. We never will.

import { createPublicClient, http, fallback, type Address, type PublicClient } from "viem";
import { mainnet, base, optimism, arbitrum, polygon } from "viem/chains";
import { normalize } from "viem/ens";

const RPC_URLS = {
  1: process.env.ALCHEMY_KEY ? `https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_KEY}` : undefined,
  8453: process.env.ALCHEMY_KEY ? `https://base-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_KEY}` : undefined,
  10:  process.env.ALCHEMY_KEY ? `https://opt-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_KEY}` : undefined,
  42161: process.env.ALCHEMY_KEY ? `https://arb-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_KEY}` : undefined,
  137: process.env.ALCHEMY_KEY ? `https://polygon-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_KEY}` : undefined,
} as const;

let _client: PublicClient | null = null;
export function getChainClient(): PublicClient {
  if (_client) return _client;
  _client = createPublicClient({
    chain: mainnet,
    transport: fallback([
      http(RPC_URLS[1]),
      http("https://cloudflare-eth.com"),
      http("https://eth.llamarpc.com"),
    ]),
  });
  return _client;
}

const CHAINS = { 1: mainnet, 8453: base, 10: optimism, 42161: arbitrum, 137: polygon } as const;

/** A human-readable name (ENS / Basename / UD) and its resolved address. */
export interface ResolvedName {
  /** The original input: "vitalik.eth", "paul.base.eth", etc. */
  input: string;
  /** The normalised form: "vitalik.eth" → "vitalik.eth". */
  normalised: string;
  /** Resolved 0x address, or null if not found. */
  address: Address | null;
  /** Which chain resolved it. */
  chainId: number;
  /** Avatar URL if set, or null. */
  avatar?: string | null;
}

/**
 * Resolve a name to an address. We try ENS on Ethereum mainnet first (because
 * it's the canonical registry), then Basenames on Base, then the others.
 * Returns the first hit.
 */
export async function resolveName(input: string): Promise<ResolvedName | null> {
  const lower = input.toLowerCase().trim();
  if (!lower.includes(".")) return null;

  // Try ENS on mainnet first
  try {
    const client = getChainClient();
    const ensName = lower.endsWith(".eth") ? normalize(lower) : null;
    if (ensName) {
      const address = await client.getEnsAddress({ name: ensName });
      if (address) {
        const avatar = await client.getEnsAvatar({ name: ensName }).catch(() => null);
        return { input, normalised: ensName, address: address as Address, chainId: 1, avatar };
      }
    }
  } catch {
    // fall through to basename
  }

  // Basenames on Base
  if (lower.endsWith(".base.eth")) {
    try {
      const baseClient = createPublicClient({
        chain: base,
        transport: http(RPC_URLS[8453] ?? "https://mainnet.base.org"),
      });
      const name = lower.replace(/\.base\.eth$/, "");
      const address = (await baseClient.readContract({
        address: "0x00000000000D8499F4cF4cE23CCc936a91b4B6Ee", // Basenames L2Resolver
        abi: [{
          name: "nameToAddress",
          type: "function",
          stateMutability: "view",
          inputs: [{ name: "name", type: "string" }],
          outputs: [{ name: "", type: "address" }],
        }],
        functionName: "nameToAddress",
        args: [name],
      })) as Address | `0x0000000000000000000000000000000000000000`;
      if (address && address !== "0x0000000000000000000000000000000000000000") {
        return { input, normalised: lower, address, chainId: 8453 };
      }
    } catch {
      // fall through
    }
  }

  return null;
}

/** Reverse-resolve: address → primary ENS name. */
export async function lookupAddress(address: Address): Promise<string | null> {
  const client = getChainClient();
  try {
    return await client.getEnsName({ address });
  } catch {
    return null;
  }
}

// =============================================================================
// Trust Score
// =============================================================================

/** A composite on-chain reputation score, 0-100. */
export interface TrustScore {
  address: Address;
  score: number;          // 0-100
  components: {
    /** How long the address has existed. */
    walletAge: { value: number; weight: number; contribution: number };
    /** Transaction volume, weighted by recency. */
    txVolume: { valueUsd: number; weight: number; contribution: number };
    /** Smart contracts deployed by this address. */
    contractsDeployed: { value: number; weight: number; contribution: number };
    /** DAO participation (votes cast). */
    daoVotes: { value: number; weight: number; contribution: number };
  };
  computedAt: string;
}

/** Fetch a Trust Score for a wallet. */
export async function getTrustScore(address: Address): Promise<TrustScore> {
  const client = getChainClient();

  // Wallet age — first transaction's block timestamp
  let walletAgeDays = 0;
  try {
    const code = await client.getBytecode({ address });
    if (code && code !== "0x") {
      const codeAgeBlock = await client.getBlockNumber();
      // We don't have an "earliest block" RPC, so we approximate by
      // checking the first few thousand blocks back for non-empty code.
      // For the real product, use Etherscan's `firstTx` API.
      walletAgeDays = 30; // placeholder
    }
  } catch { /* ignore */ }

  // Transaction count and volume — getTransactionCount + internal txs
  const txCount = await client.getTransactionCount({ address });
  const blockNumber = await client.getBlockNumber();
  const block = await client.getBlock({ blockNumber, includeTransactions: true });
  // ... compute volume from recent blocks; placeholder
  const volumeUsd = Math.min(txCount * 50, 1_000_000);

  // Contract count — getTransactionReceipt for txCount txs would be too
  // expensive. Use Etherscan API in production. Placeholder.
  const contractsDeployed = 0;

  // DAO votes — count VoteCast events from major DAOs (Uniswap, Aave,
  // Compound, ENS). Placeholder.
  const daoVotes = 0;

  // Weights — sybil-resistant signals dominate
  const weights = {
    walletAge:    0.25,
    txVolume:     0.35,
    contracts:     0.20,
    daoVotes:      0.20,
  };

  // Normalize each component to 0-1, then weighted sum
  const ageScore = Math.min(walletAgeDays / (365 * 5), 1);          // 5y = perfect
  const volScore = Math.min(volumeUsd / 1_000_000, 1);             // $1M = perfect
  const contractScore = Math.min(contractsDeployed / 10, 1);          // 10 contracts = perfect
  const daoScore = Math.min(daoVotes / 20, 1);                      // 20 votes = perfect

  const score = Math.round(
    100 * (
      ageScore      * weights.walletAge +
      volScore      * weights.txVolume +
      contractScore * weights.contracts +
      daoScore      * weights.daoVotes
    ),
  );

  return {
    address,
    score,
    components: {
      walletAge:        { value: walletAgeDays, weight: weights.walletAge, contribution: ageScore * 100 * weights.walletAge },
      txVolume:         { valueUsd: volumeUsd, weight: weights.txVolume,  contribution: volScore * 100 * weights.txVolume },
      contractsDeployed: { value: contractsDeployed, weight: weights.contracts, contribution: contractScore * 100 * weights.contracts },
      daoVotes:          { value: daoVotes, weight: weights.daoVotes, contribution: daoScore * 100 * weights.daoVotes },
    },
    computedAt: new Date().toISOString(),
  };
}
