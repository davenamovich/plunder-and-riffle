/**
 * CDP module — Coinbase Developer Platform SDK v2
 *
 * Uses @coinbase/cdp-sdk (NOT the deprecated @coinbase/coinbase-sdk).
 * Accounts are identified by name (deterministic, idempotent via getOrCreateAccount).
 * No seed storage needed — CDP manages private keys server-side.
 *
 * Env vars required:
 *   CDP_KEY_ID        — API Key ID from portal.cdp.coinbase.com
 *   CDP_API_KEY       — API Key Secret
 *   CDP_WALLET_SECRET — Wallet Secret (required for signing)
 */

import { CdpClient } from "@coinbase/cdp-sdk";
import {
  createPublicClient, http, formatUnits,
  encodeFunctionData, erc20Abi,
} from "viem";
import { base } from "viem/chains";

// ─── USDC on Base mainnet ─────────────────────────────────────────────────────
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as `0x${string}`;

// ─── Singleton viem public client ─────────────────────────────────────────────
const publicClient = createPublicClient({ chain: base, transport: http() });

// ─── Singleton CDP client ─────────────────────────────────────────────────────
let _cdp: CdpClient | null = null;

function getClient(): CdpClient {
  if (_cdp) return _cdp;
  const apiKeyId     = process.env.CDP_KEY_ID;
  const apiKeySecret = process.env.CDP_API_KEY;
  const walletSecret = process.env.CDP_WALLET_SECRET;
  if (!apiKeyId || !apiKeySecret || !walletSecret) {
    throw new Error("CDP_KEY_ID, CDP_API_KEY, and CDP_WALLET_SECRET must be set");
  }
  _cdp = new CdpClient({ apiKeyId, apiKeySecret, walletSecret });
  return _cdp;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CDPWalletResult {
  walletId: string;   // account name (e.g. "agent-brody-bennett")
  address:  string;   // EVM address (0x...)
  network:  string;
  seed:     string;   // always "" — new SDK manages keys server-side
}

export interface WalletBalance {
  asset:         string;
  amount:        string;
  amountNumber:  number;
}

export interface AgentWalletInfo {
  agentId:   string;
  agentName: string;
  agentSlug: string;
  walletId:  string;
  address:   string;
  network:   string;
  balances:  WalletBalance[];
  totalUsd:  number | null;
  createdAt: Date | null;
}

// ─── Account creation / retrieval (idempotent) ────────────────────────────────

async function getOrCreate(accountName: string): Promise<CDPWalletResult> {
  const cdp = getClient();
  console.log(`[cdp] getOrCreateAccount("${accountName}")…`);
  const account = await cdp.evm.getOrCreateAccount({ name: accountName });
  console.log(`[cdp] account ready: ${account.address} (name: ${account.name})`);
  return {
    walletId: account.name,
    address:  account.address,
    network:  "base-mainnet",
    seed:     "",
  };
}

/** Provision or retrieve agent wallet — idempotent, safe to call any time. */
export function createAgentWallet(
  _network   = "base-mainnet",
  agentLabel?: string,
  agentSlug?:  string,
): Promise<CDPWalletResult> {
  const safeName = agentSlug
    ? `agent-${agentSlug}`
    : `agent-${(agentLabel ?? "unknown").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`;
  console.log(`[cdp] provisioning agent account: "${safeName}"`);
  return getOrCreate(safeName);
}

/** Provision or retrieve user wallet — idempotent, keyed by email. */
export function createUserWallet(email: string, _network = "base-mainnet"): Promise<CDPWalletResult> {
  const safeName = `user-${email.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/(^-|-$)/g, "")}`;
  console.log(`[cdp] provisioning user account: "${safeName}"`);
  return getOrCreate(safeName);
}

/** Generic wallet creation (for one-off uses). */
export function createWallet(_network = "base-mainnet"): Promise<CDPWalletResult> {
  return getOrCreate(`wallet-${Date.now()}`);
}

// ─── Balances ─────────────────────────────────────────────────────────────────

/**
 * Get ETH + USDC balances for a wallet address.
 * @param address  EVM address (0x...) — NOT a seed string.
 */
export async function getWalletBalances(address: string): Promise<WalletBalance[]> {
  if (!address || !address.startsWith("0x")) return [];
  try {
    const addr = address as `0x${string}`;
    const [ethBal, usdcBal] = await Promise.all([
      publicClient.getBalance({ address: addr }),
      publicClient.readContract({
        address: USDC_BASE,
        abi:     erc20Abi,
        functionName: "balanceOf",
        args:    [addr],
      }) as Promise<bigint>,
    ]);

    const balances: WalletBalance[] = [];
    const ethNum = parseFloat(formatUnits(ethBal, 18));
    if (ethNum > 0) {
      balances.push({ asset: "eth", amount: formatUnits(ethBal, 18), amountNumber: ethNum });
    }
    const usdcNum = parseFloat(formatUnits(usdcBal, 6));
    if (usdcNum > 0) {
      balances.push({ asset: "usdc", amount: formatUnits(usdcBal, 6), amountNumber: usdcNum });
    }
    return balances;
  } catch (err) {
    console.warn("[cdp] balance fetch failed:", (err as Error).message);
    return [];
  }
}

// ─── Sweep ────────────────────────────────────────────────────────────────────

export interface SweepResult {
  agentId:   string;
  agentSlug: string;
  address:   string;
  transfers: { asset: string; amount: string; txHash?: string; error?: string }[];
  ok: boolean;
}

/**
 * Sweep USDC (and optionally ETH) from a CDP account to a destination address.
 * @param fromAddress  Source EVM address (0x...)
 * @param toAddress    Destination EVM address
 * @param assets       Assets to sweep (default: ["usdc"])
 */
export async function sweepWallet(
  fromAddress:  string,
  toAddress:    string,
  assets:       string[] = ["usdc"],
): Promise<{ transfers: { asset: string; amount: string; txHash?: string; error?: string }[]; txHash?: string; fromAddress?: string }> {
  if (!fromAddress?.startsWith("0x")) {
    console.warn("[cdp] sweepWallet: invalid fromAddress, skipping");
    return { transfers: [], fromAddress };
  }

  const cdp = getClient();
  const from = fromAddress as `0x${string}`;
  const transfers: { asset: string; amount: string; txHash?: string; error?: string }[] = [];

  for (const asset of assets) {
    try {
      if (asset.toLowerCase() === "usdc") {
        const balance = await publicClient.readContract({
          address: USDC_BASE,
          abi:     erc20Abi,
          functionName: "balanceOf",
          args:    [from],
        }) as bigint;

        if (balance <= 0n) {
          console.log(`[cdp] sweep: no USDC balance at ${from}`);
          continue;
        }

        const data = encodeFunctionData({
          abi:          erc20Abi,
          functionName: "transfer",
          args:         [toAddress as `0x${string}`, balance],
        });

        const { transactionHash } = await cdp.evm.sendTransaction({
          address:  from,
          network:  "base",
          transaction: { to: USDC_BASE, data },
        });

        const amount = formatUnits(balance, 6);
        transfers.push({ asset: "usdc", amount, txHash: transactionHash });
        console.log(`[cdp] swept ${amount} USDC → ${toAddress} | tx: ${transactionHash}`);
      }

      if (asset.toLowerCase() === "eth") {
        const balance = await publicClient.getBalance({ address: from });
        if (balance <= 0n) continue;

        // Reserve ~0.001 ETH for gas
        const GAS_RESERVE = 1_000_000_000_000_000n; // 0.001 ETH
        if (balance <= GAS_RESERVE) {
          console.log(`[cdp] sweep: ETH balance too low to cover gas at ${from}`);
          continue;
        }
        const sendAmount = balance - GAS_RESERVE;

        const { transactionHash } = await cdp.evm.sendTransaction({
          address:  from,
          network:  "base",
          transaction: { to: toAddress as `0x${string}`, value: sendAmount },
        });

        const amount = formatUnits(sendAmount, 18);
        transfers.push({ asset: "eth", amount, txHash: transactionHash });
        console.log(`[cdp] swept ${amount} ETH → ${toAddress} | tx: ${transactionHash}`);
      }
    } catch (err: any) {
      transfers.push({ asset, amount: "0", error: err?.message ?? String(err) });
      console.warn(`[cdp] sweep failed for ${asset}:`, err?.message);
    }
  }

  const firstTx = transfers.find(t => t.txHash)?.txHash;
  return { transfers, txHash: firstTx, fromAddress };
}

// ─── Legacy compat (import wallet by seed) ───────────────────────────────────
// Old SDK used seed JSON. New SDK doesn't need seeds.
// If address is passed directly, return it. If old JSON seed, warn.

export async function importWallet(seedOrAddress: string): Promise<{ address: string; wallet: null }> {
  if (seedOrAddress?.startsWith("0x")) {
    return { address: seedOrAddress, wallet: null };
  }
  try {
    const parsed = JSON.parse(seedOrAddress);
    if (parsed) {
      console.warn("[cdp] importWallet called with old seed JSON — wallet needs re-provisioning with new SDK");
      throw new Error("Old CDP wallet seed format. Re-provision this wallet.");
    }
  } catch (e: any) {
    if (e.message?.includes("Old CDP")) throw e;
  }
  return { address: seedOrAddress, wallet: null };
}

// ─── Config check ─────────────────────────────────────────────────────────────

export function isCDPConfigured(): boolean {
  return !!(process.env.CDP_KEY_ID && process.env.CDP_API_KEY && process.env.CDP_WALLET_SECRET);
}
