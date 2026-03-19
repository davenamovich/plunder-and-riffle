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

// ─── Global serial wallet-creation queue ──────────────────────────────────────
// CDP enforces ~1 CreateWallet per 60 seconds per API key.
// We serialize all creation requests through a single promise chain and enforce
// a mandatory 70-second cool-down after each attempt (success or failure) so
// concurrent admin triggers and the background worker never collide.

const CREATION_COOLDOWN_MS = 70_000; // 70 s between any two CreateWallet calls
let _walletCreationChain: Promise<unknown> = Promise.resolve();
let _lastCreationAt = 0;

function queueWalletCreation<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const job = _walletCreationChain.then(async (): Promise<T> => {
    // Enforce minimum gap since last creation attempt
    const elapsed = Date.now() - _lastCreationAt;
    const wait = Math.max(0, CREATION_COOLDOWN_MS - elapsed);
    if (wait > 0) {
      console.log(`[cdp] ${label} — queue cool-down ${Math.ceil(wait / 1000)}s…`);
      await new Promise(r => setTimeout(r, wait));
    }
    _lastCreationAt = Date.now();
    try {
      return await fn();
    } finally {
      // Reset clock after the call regardless of success/failure so the next
      // caller waits a full cooldown from this moment.
      _lastCreationAt = Date.now();
    }
  });
  // Advance the chain regardless of individual success/failure so subsequent
  // jobs are not permanently blocked by a rejected promise.
  _walletCreationChain = job.catch(() => {});
  return job;
}

// ─── Retry helper (used inside the queue, only for transient errors) ──────────

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
  maxAttempts = 3,
): Promise<T> {
  // Retry delays for transient errors other than rate-limit (network blips, etc.)
  const delays = [0, 5000, 15000];
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      if (attempt > 0) {
        const delay = delays[attempt] ?? 15000;
        console.log(`[cdp] ${label} — retry ${attempt}/${maxAttempts - 1} in ${delay / 1000}s…`);
        await new Promise(r => setTimeout(r, delay));
      }
      return await fn();
    } catch (err: any) {
      const isLast = attempt === maxAttempts - 1;
      // Rate-limit errors should not be retried inside withRetry — the queue
      // cool-down handles spacing; just surface the error so the caller backs off.
      if (isRateLimitError(err) || isLast) throw err;
    }
  }
  throw new Error(`[cdp] ${label} — exhausted all retries`);
}

// ─── Wallet creation ──────────────────────────────────────────────────────────

async function _doCreateWallet(network: string, label: string): Promise<CDPWalletResult> {
  configureCDP();
  console.log(`[cdp] creating wallet for ${label} on ${network}…`);
  return withRetry(`createWallet(${label})`, async () => {
    const wallet = await Wallet.create({ networkId: network });
    const defaultAddress = await wallet.getDefaultAddress();
    const address = defaultAddress.getId();
    const walletId = wallet.getId() ?? "";
    const seed = JSON.stringify(await wallet.export());
    console.log(`[cdp] wallet created for ${label}: ${address}`);
    return { walletId, address, network, seed };
  });
}

export function createWallet(network = "base-mainnet"): Promise<CDPWalletResult> {
  return queueWalletCreation("createWallet", () => _doCreateWallet(network, "anonymous"));
}

export function createAgentWallet(
  network = "base-mainnet",
  agentLabel?: string,
): Promise<CDPWalletResult> {
  const label = agentLabel ?? "agent";
  console.log(`[cdp] queueing wallet creation for "${label}"`);
  return queueWalletCreation(`agent:${label}`, () => _doCreateWallet(network, label));
}

export function createUserWallet(email: string, network = "base-mainnet"): Promise<CDPWalletResult> {
  console.log(`[cdp] queueing wallet creation for user ${email}`);
  return queueWalletCreation(`user:${email}`, () => _doCreateWallet(network, email));
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

// ─── Wallet sweep ─────────────────────────────────────────────────────────────

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
