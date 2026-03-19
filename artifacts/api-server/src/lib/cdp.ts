import { Coinbase, Wallet } from "@coinbase/coinbase-sdk";

let configured = false;

function configureCDP() {
  if (configured) return;
  const keyName = process.env.CDP_KEY_ID;
  const privateKey = process.env.CDP_API_KEY;
  if (!keyName || !privateKey) throw new Error("CDP_KEY_ID and CDP_API_KEY must be set");
  Coinbase.configure({
    apiKeyName: keyName,
    privateKey: privateKey.replace(/\\n/g, "\n"),
  });
  configured = true;
}

export interface CDPWalletResult {
  walletId: string;
  address: string;
  network: string;
  seed: string;
}

export interface WalletBalance {
  asset: string;
  amount: string;
  amountNumber: number;
}

export interface AgentWalletInfo {
  agentId: string;
  agentName: string;
  agentSlug: string;
  walletId: string;
  address: string;
  network: string;
  balances: WalletBalance[];
  totalUsd: number | null;
  createdAt: Date | null;
}

// ─── Retry helper ─────────────────────────────────────────────────────────────

function isRateLimitError(err: any): boolean {
  return (
    err?.httpCode === 429 ||
    err?.apiCode === "resource_exhausted" ||
    String(err?.message ?? "").toLowerCase().includes("rate limit") ||
    String(err?.message ?? "").toLowerCase().includes("resource_exhausted")
  );
}

async function withRetry<T>(
  label: string,
  fn: () => Promise<T>,
  maxAttempts = 5,
): Promise<T> {
  const delays = [0, 4000, 12000, 30000, 60000]; // 0s, 4s, 12s, 30s, 60s
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      if (attempt > 0) {
        const delay = delays[attempt] ?? 60000;
        console.log(`[cdp] ${label} — rate limited, retry ${attempt}/${maxAttempts - 1} in ${delay / 1000}s…`);
        await new Promise(r => setTimeout(r, delay));
      }
      return await fn();
    } catch (err: any) {
      const isLast = attempt === maxAttempts - 1;
      if (isRateLimitError(err) && !isLast) continue;
      throw err;
    }
  }
  throw new Error(`[cdp] ${label} — exhausted all retries`);
}

// ─── Wallet creation ──────────────────────────────────────────────────────────

export async function createWallet(network = "base-mainnet"): Promise<CDPWalletResult> {
  configureCDP();
  return withRetry("createWallet", async () => {
    const wallet = await Wallet.create({ networkId: network });
    const defaultAddress = await wallet.getDefaultAddress();
    const address = defaultAddress.getId();
    const walletId = wallet.getId() ?? "";
    const seed = JSON.stringify(await wallet.export());
    return { walletId, address, network, seed };
  });
}

// Create agent wallet — logs agent name for traceability
export async function createAgentWallet(
  network = "base-mainnet",
  agentLabel?: string,
): Promise<CDPWalletResult> {
  if (agentLabel) console.log(`[cdp] provisioning agent wallet for "${agentLabel}" on ${network}`);
  return createWallet(network);
}

// Creates a wallet for a user, tagged with email for traceability
export async function createUserWallet(email: string, network = "base-mainnet"): Promise<CDPWalletResult> {
  console.log(`[cdp] provisioning user wallet for ${email} on ${network}`);
  return createWallet(network);
}

// ─── Wallet import & balances ─────────────────────────────────────────────────

export async function importWallet(seed: string): Promise<{ address: string; wallet: InstanceType<typeof Wallet> }> {
  configureCDP();
  const data = JSON.parse(seed);
  const wallet = await Wallet.import(data);
  const defaultAddress = await wallet.getDefaultAddress();
  return { address: defaultAddress.getId(), wallet };
}

export async function getWalletBalances(seed: string): Promise<WalletBalance[]> {
  try {
    configureCDP();
    const { wallet } = await importWallet(seed);
    const balanceMap = await wallet.listBalances();
    const balances: WalletBalance[] = [];
    balanceMap.forEach((amount, asset) => {
      const amountNum = parseFloat(amount.toString());
      if (amountNum > 0) {
        balances.push({ asset: String(asset), amount: amount.toString(), amountNumber: amountNum });
      }
    });
    return balances;
  } catch (err) {
    console.warn("[cdp] balance fetch failed:", (err as Error).message);
    return [];
  }
}

// ─── Wallet sweep ──────────────────────────────────────────────────────────────

export interface SweepResult {
  agentId: string;
  agentSlug: string;
  address: string;
  transfers: { asset: string; amount: string; txHash?: string; error?: string }[];
  ok: boolean;
}

export async function sweepWallet(
  seed: string,
  toAddress: string,
  assets: string[] = ["eth", "usdc"],
): Promise<{ transfers: { asset: string; amount: string; txHash?: string; error?: string }[] }> {
  configureCDP();
  const { wallet } = await importWallet(seed);
  const balanceMap = await wallet.listBalances();
  const transfers: { asset: string; amount: string; txHash?: string; error?: string }[] = [];

  for (const asset of assets) {
    const balance = balanceMap.get(asset as any);
    if (!balance) continue;
    const amountNum = parseFloat(balance.toString());
    if (amountNum <= 0) continue;

    try {
      const transfer = await wallet.createTransfer({
        amount: balance,
        assetId: asset,
        destination: toAddress,
        gasless: asset.toLowerCase() === "usdc",
      });
      await transfer.wait();
      const txHash = transfer.getTransactionHash() ?? undefined;
      transfers.push({ asset, amount: balance.toString(), txHash });
      console.log(`[cdp] swept ${balance} ${asset} → ${toAddress} | tx: ${txHash}`);
    } catch (err: any) {
      transfers.push({ asset, amount: balance.toString(), error: err?.message ?? String(err) });
      console.warn(`[cdp] sweep failed for ${asset}:`, err?.message);
    }
  }

  return { transfers };
}

export function isCDPConfigured(): boolean {
  return !!(process.env.CDP_KEY_ID && process.env.CDP_API_KEY);
}
