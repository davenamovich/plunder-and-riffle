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
  seed: string; // encrypted seed JSON for recovery
}

export async function createAgentWallet(network = "base-mainnet"): Promise<CDPWalletResult> {
  configureCDP();
  const wallet = await Wallet.create({ networkId: network });
  const defaultAddress = await wallet.getDefaultAddress();
  const address = defaultAddress.getId();
  const walletId = wallet.getId() ?? "";
  // Export seed for server-side recovery — store encrypted at rest
  const seed = JSON.stringify(await wallet.export());
  return { walletId, address, network, seed };
}

export async function importAgentWallet(seed: string, network = "base-mainnet"): Promise<{ address: string }> {
  configureCDP();
  const data = JSON.parse(seed);
  const wallet = await Wallet.import(data);
  const defaultAddress = await wallet.getDefaultAddress();
  return { address: defaultAddress.getId() };
}

export function isCDPConfigured(): boolean {
  return !!(process.env.CDP_KEY_ID && process.env.CDP_API_KEY);
}
