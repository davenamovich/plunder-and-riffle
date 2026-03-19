import { pgTable, text, timestamp, real, boolean } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { agentsTable } from "./agents";

/**
 * commission_splits — tracks every paid event and how its revenue is divided.
 *
 * Every paid rotator seat purchase fires 4 split records (25% each):
 *   referrer     — the person who brought in the buyer
 *   agent_manager — the person managing the agent's social accounts
 *   bot_ops      — infrastructure / uptime operations
 *   dev          — platform development team
 *
 * Status lifecycle:
 *   pending → approved → paid (USDC on Base)
 *   pending → cancelled (refund / dispute)
 */
export const commissionSplitsTable = pgTable("commission_splits", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),

  // What triggered this split
  eventType: text("event_type").notNull().default("paid_seat"),  // "paid_seat" | "subscription" | "nft"
  sourceId: text("source_id"),           // rotator slot ID or offer signup ID
  agentId: text("agent_id").references(() => agentsTable.id, { onDelete: "set null" }),

  // Who gets paid
  recipientType: text("recipient_type").notNull(),  // "referrer" | "agent_manager" | "bot_ops" | "dev"
  recipientId: text("recipient_id").references(() => usersTable.id, { onDelete: "set null" }),
  recipientAddress: text("recipient_address"),       // on-chain address if paying USDC

  // Amount
  grossAmount: real("gross_amount").notNull(),       // full transaction amount (USD)
  splitPct: real("split_pct").notNull().default(25), // percentage of gross
  splitAmount: real("split_amount").notNull(),        // computed: gross * pct / 100

  // Currency
  currency: text("currency").notNull().default("USDC"),
  network: text("network").notNull().default("base-mainnet"),

  // Payment state
  status: text("status").notNull().default("pending"),  // pending | approved | paid | cancelled
  paidAt: timestamp("paid_at"),
  txHash: text("tx_hash"),          // on-chain tx hash when paid via USDC
  paidFromAddress: text("paid_from_address"),

  // Notes
  notes: text("notes"),
  cancelReason: text("cancel_reason"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type CommissionSplit = typeof commissionSplitsTable.$inferSelect;
export type InsertCommissionSplit = typeof commissionSplitsTable.$inferInsert;

/**
 * usdc_payment_requests — tracks USDC payment requests sent to users.
 * A payment request points to a CDP wallet address and an expected amount.
 * The system polls for incoming transfers to confirm payment.
 */
export const usdcPaymentRequestsTable = pgTable("usdc_payment_requests", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),

  // Who's paying and what for
  payerId: text("payer_id").references(() => usersTable.id, { onDelete: "set null" }),
  payerEmail: text("payer_email"),
  agentId: text("agent_id").references(() => agentsTable.id, { onDelete: "set null" }),
  purpose: text("purpose").notNull().default("paid_seat"), // "paid_seat" | "subscription"

  // Payment details
  amountUsd: real("amount_usd").notNull(),
  amountUsdc: real("amount_usdc").notNull(),   // 1:1 at time of generation
  toAddress: text("to_address").notNull(),      // CDP wallet address to receive payment
  network: text("network").notNull().default("base-mainnet"),

  // Reference code shown to payer
  referenceCode: text("reference_code").notNull().$defaultFn(() =>
    `PR-${Date.now().toString(36).toUpperCase()}`
  ),

  // State
  status: text("status").notNull().default("pending"),  // pending | confirmed | expired | cancelled
  confirmedAt: timestamp("confirmed_at"),
  txHash: text("tx_hash"),
  expiresAt: timestamp("expires_at"),    // payment window (default 24h)

  // Split generation — did we fire the commission splits for this payment?
  splitsGenerated: boolean("splits_generated").notNull().default(false),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type UsdcPaymentRequest = typeof usdcPaymentRequestsTable.$inferSelect;
