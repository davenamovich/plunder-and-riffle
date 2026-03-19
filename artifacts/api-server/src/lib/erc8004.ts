/**
 * ERC-8004 — Onchain Agent Identity Registry
 *
 * Deployed January 29, 2026 on Base (and 20+ other chains).
 * Contract: 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432
 *
 * Registers an autonomous agent with a globally unique onchain identity (ERC-721 token).
 * The token ID is returned from register() and stored in the DB.
 *
 * Prerequisites:
 *   - Agent must have a CDP wallet provisioned (cdpWalletAddress set)
 *   - Agent wallet must hold Base ETH for gas (~$0.01 or less on Base)
 */

import { CdpClient } from "@coinbase/cdp-sdk";
import {
  createPublicClient, http,
  encodeFunctionData, decodeEventLog,
  type PublicClient,
} from "viem";
import { base } from "viem/chains";

// ─── Contract addresses ───────────────────────────────────────────────────────
export const IDENTITY_REGISTRY_ADDRESS = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432" as `0x${string}`;
export const REPUTATION_REGISTRY_ADDRESS = "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63" as `0x${string}`;

// ─── Minimal ABI ─────────────────────────────────────────────────────────────
export const IDENTITY_REGISTRY_ABI = [
  {
    name: "register",
    type: "function",
    inputs: [
      { name: "agentURI", type: "string" },
      { name: "metadata", type: "bytes" },
    ],
    outputs: [{ name: "agentId", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    name: "AgentRegistered",
    type: "event",
    inputs: [
      { name: "agentId", type: "uint256", indexed: true },
      { name: "owner",   type: "address", indexed: true },
    ],
  },
  {
    name: "ownerOf",
    type: "function",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    name: "tokenURI",
    type: "function",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
  },
] as const;

// ─── Agent registration JSON (ERC-8004 compliant) ────────────────────────────

export interface AgentRegistrationJson {
  type:           string;
  name:           string;
  description:    string;
  image?:         string;
  services:       Array<{ name: string; endpoint: string; version?: string }>;
  x402Support:    boolean;
  active:         boolean;
  supportedTrust: string[];
}

/**
 * Build the ERC-8004 compliant agent registration JSON.
 * This is served at GET /api/agent/:slug/.well-known/agent.json
 * and used as the agentURI passed to register() on-chain.
 */
export function buildAgentRegistrationJson(agent: {
  name:        string;
  description: string | null;
  avatarUrl:   string | null;
  slug:        string;
  isPaused:    boolean;
  platformUrl: string;   // e.g. "https://your-app.replit.app"
}): AgentRegistrationJson {
  return {
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    name: agent.name,
    description: agent.description
      ?? `${agent.name} — AI lead generation agent on Plunder and Riffle`,
    image: agent.avatarUrl ?? undefined,
    services: [
      {
        name:     "Rotator",
        endpoint: `${agent.platformUrl}/api/agent/${agent.slug}`,
        version:  "1.0.0",
      },
      {
        name:     "Identity",
        endpoint: `${agent.platformUrl}/api/agent/${agent.slug}/.well-known/agent.json`,
        version:  "0.1.0",
      },
    ],
    x402Support:    false,   // future: x402 micropayments for lead slots
    active:         !agent.isPaused,
    supportedTrust: ["reputation"],
  };
}

// ─── Registration result ──────────────────────────────────────────────────────

export interface RegistrationResult {
  agentId:  string;    // ERC-721 token ID (uint256 as string)
  txHash:   string;
  agentUri: string;    // URI that was registered
}

/**
 * Register an agent on the ERC-8004 IdentityRegistry (Base mainnet).
 *
 * Requires:
 *   - `cdp`         — initialised CdpClient (from cdp.ts)
 *   - `publicClient`— viem public client on Base
 *   - `agentAddress`— the agent's EVM wallet address (pays gas)
 *   - `agentUri`    — URL to the agent registration JSON
 *
 * Gas: ~$0.005–0.02 on Base mainnet. Wallet must hold Base ETH.
 */
export async function registerAgentIdentity(
  cdp:           CdpClient,
  publicClient:  PublicClient,
  agentAddress:  `0x${string}`,
  agentUri:      string,
): Promise<RegistrationResult> {
  console.log(`[erc8004] registering "${agentUri}" from ${agentAddress}…`);

  const data = encodeFunctionData({
    abi:          IDENTITY_REGISTRY_ABI,
    functionName: "register",
    args:         [agentUri, "0x"],
  });

  const { transactionHash } = await cdp.evm.sendTransaction({
    address:     agentAddress,
    network:     "base",
    transaction: { to: IDENTITY_REGISTRY_ADDRESS, data },
  });

  console.log(`[erc8004] tx sent: ${transactionHash} — waiting for receipt…`);

  const receipt = await publicClient.waitForTransactionReceipt({
    hash:    transactionHash as `0x${string}`,
    timeout: 90_000,
  });

  if (receipt.status === "reverted") {
    throw new Error(`ERC-8004 registration reverted (tx: ${transactionHash})`);
  }

  // Extract agentId from AgentRegistered event
  let agentId: string | null = null;
  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({
        abi:       IDENTITY_REGISTRY_ABI,
        eventName: "AgentRegistered",
        topics:    log.topics,
        data:      log.data,
      });
      agentId = (decoded.args as any).agentId.toString();
      break;
    } catch {
      // not our event, continue
    }
  }

  if (!agentId) {
    throw new Error(
      `AgentRegistered event not found in receipt. Tx: ${transactionHash}`
    );
  }

  console.log(`[erc8004] registered! agentId=${agentId}, tx=${transactionHash}`);
  return { agentId, txHash: transactionHash, agentUri };
}

// ─── Lookup helpers ───────────────────────────────────────────────────────────

/** Resolve the owner address of an ERC-8004 token ID on Base */
export async function getAgentOwner(
  publicClient: PublicClient,
  tokenId: bigint,
): Promise<string> {
  return publicClient.readContract({
    address:      IDENTITY_REGISTRY_ADDRESS,
    abi:          IDENTITY_REGISTRY_ABI,
    functionName: "ownerOf",
    args:         [tokenId],
  }) as Promise<string>;
}

/** Get the agentURI registered for a token ID */
export async function getAgentUri(
  publicClient: PublicClient,
  tokenId: bigint,
): Promise<string> {
  return publicClient.readContract({
    address:      IDENTITY_REGISTRY_ADDRESS,
    abi:          IDENTITY_REGISTRY_ABI,
    functionName: "tokenURI",
    args:         [tokenId],
  }) as Promise<string>;
}
