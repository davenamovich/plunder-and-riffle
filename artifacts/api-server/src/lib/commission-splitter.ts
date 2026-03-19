/**
 * Commission Splitter — Plunder & Riffle
 *
 * Every paid event creates 4 split records (25% each).
 * Recipients are identified by role; on-chain address is resolved from CDP wallet if available.
 * Splits are paid out via USDC sweep on Base mainnet.
 */

import { db } from "@workspace/db";
import { commissionSplitsTable, usdcPaymentRequestsTable, agentsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { sweepWallet } from "./cdp";

/** Distribution config — who gets what percentage */
const SPLIT_CONFIG: Array<{ recipientType: string; pct: number }> = [
  { recipientType: "referrer",      pct: 25 },
  { recipientType: "agent_manager", pct: 25 },
  { recipientType: "bot_ops",       pct: 25 },
  { recipientType: "dev",           pct: 25 },
];

export interface SplitEvent {
  eventType: "paid_seat" | "subscription" | "nft";
  sourceId: string;
  agentId?: string;
  grossAmount: number;
  /** Map of recipientType → { userId?, walletAddress? } */
  recipients?: Record<string, { recipientId?: string; recipientAddress?: string }>;
  notes?: string;
}

/**
 * Generate commission splits for a paid event.
 * Creates one DB record per split recipient.
 */
export async function generateSplits(event: SplitEvent): Promise<typeof commissionSplitsTable.$inferSelect[]> {
  const splits: (typeof commissionSplitsTable.$inferInsert)[] = SPLIT_CONFIG.map(({ recipientType, pct }) => {
    const recipient = event.recipients?.[recipientType];
    return {
      eventType:        event.eventType,
      sourceId:         event.sourceId,
      agentId:          event.agentId ?? null,
      recipientType,
      recipientId:      recipient?.recipientId ?? null,
      recipientAddress: recipient?.recipientAddress ?? null,
      grossAmount:      event.grossAmount,
      splitPct:         pct,
      splitAmount:      parseFloat(((event.grossAmount * pct) / 100).toFixed(6)),
      currency:         "USDC",
      network:          "base-mainnet",
      status:           "pending",
      notes:            event.notes ?? null,
    };
  });

  const inserted = await db.insert(commissionSplitsTable).values(splits).returning();
  return inserted;
}

/**
 * Approve + pay a single split — sweeps from treasury CDP wallet to recipient address.
 * Marks the split as paid and records the tx hash.
 */
export async function payApprovedSplit(splitId: string, fromWalletId: string): Promise<void> {
  const [split] = await db.select().from(commissionSplitsTable)
    .where(and(eq(commissionSplitsTable.id, splitId), eq(commissionSplitsTable.status, "approved")));

  if (!split) throw new Error(`Split ${splitId} not found or not in approved state`);
  if (!split.recipientAddress) throw new Error(`Split ${splitId} has no on-chain recipient address`);

  const result = await sweepWallet(fromWalletId, split.recipientAddress);

  await db.update(commissionSplitsTable)
    .set({
      status:          "paid",
      paidAt:          new Date(),
      txHash:          result.txHash ?? null,
      paidFromAddress: result.fromAddress ?? null,
      updatedAt:       new Date(),
    })
    .where(eq(commissionSplitsTable.id, splitId));
}

/**
 * Create a USDC payment request.
 * Resolves a CDP wallet address for the agent to receive payment.
 */
export async function createUsdcPaymentRequest(opts: {
  agentId: string;
  payerId?: string;
  payerEmail?: string;
  amountUsd: number;
  purpose?: "paid_seat" | "subscription";
}): Promise<typeof usdcPaymentRequestsTable.$inferSelect> {
  const { agentId, payerId, payerEmail, amountUsd, purpose = "paid_seat" } = opts;

  // Resolve CDP wallet address for this agent
  const [agent] = await db.select().from(agentsTable).where(eq(agentsTable.id, agentId));
  if (!agent) throw new Error(`Agent ${agentId} not found`);

  const toAddress = (agent as any).walletAddress ?? (agent as any).cdpWalletAddress;
  if (!toAddress) throw new Error(`Agent ${agentId} has no CDP wallet address`);

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

  const [request] = await db.insert(usdcPaymentRequestsTable).values({
    payerId:    payerId ?? null,
    payerEmail: payerEmail ?? null,
    agentId,
    purpose,
    amountUsd,
    amountUsdc: amountUsd,   // 1 USDC = 1 USD at generation time
    toAddress,
    network: "base-mainnet",
    status:  "pending",
    expiresAt,
  }).returning();

  return request;
}

/**
 * Confirm a USDC payment request and fire commission splits.
 */
export async function confirmPaymentAndSplit(requestId: string, txHash: string, opts?: {
  referrerId?: string;
  referrerAddress?: string;
  agentManagerId?: string;
  agentManagerAddress?: string;
  botOpsAddress?: string;
  devAddress?: string;
}): Promise<void> {
  const [req] = await db.select().from(usdcPaymentRequestsTable)
    .where(eq(usdcPaymentRequestsTable.id, requestId));
  if (!req) throw new Error(`Payment request ${requestId} not found`);
  if (req.status !== "pending") throw new Error(`Payment request ${requestId} is ${req.status}`);

  // Mark confirmed
  await db.update(usdcPaymentRequestsTable)
    .set({ status: "confirmed", confirmedAt: new Date(), txHash, updatedAt: new Date() })
    .where(eq(usdcPaymentRequestsTable.id, requestId));

  // Only generate splits once
  if (req.splitsGenerated) return;

  await generateSplits({
    eventType: req.purpose as "paid_seat" | "subscription",
    sourceId:  requestId,
    agentId:   req.agentId ?? undefined,
    grossAmount: req.amountUsdc,
    recipients: {
      referrer:      { recipientId: opts?.referrerId,       recipientAddress: opts?.referrerAddress },
      agent_manager: { recipientId: opts?.agentManagerId,   recipientAddress: opts?.agentManagerAddress },
      bot_ops:       { recipientAddress: opts?.botOpsAddress ?? process.env.CDP_TREASURY_ADDRESS },
      dev:           { recipientAddress: opts?.devAddress   ?? process.env.CDP_TREASURY_ADDRESS },
    },
    notes: `Auto-split from confirmed payment ${requestId} (${txHash})`,
  });

  await db.update(usdcPaymentRequestsTable)
    .set({ splitsGenerated: true, updatedAt: new Date() })
    .where(eq(usdcPaymentRequestsTable.id, requestId));
}

/**
 * List all splits — with optional status filter.
 */
export async function listSplits(status?: string) {
  if (status) {
    return db.select().from(commissionSplitsTable)
      .where(eq(commissionSplitsTable.status, status))
      .orderBy(commissionSplitsTable.createdAt);
  }
  return db.select().from(commissionSplitsTable).orderBy(commissionSplitsTable.createdAt);
}
