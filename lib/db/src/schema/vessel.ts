/**
 * VESSEL PROTOCOL — Drizzle Schema
 * lib/db/src/schema/vessel.ts
 *
 * Core mechanic:
 *   User signs up → completes free offer CTA → saves referral link (HARD GATE)
 *   → 24h slot activates → agent posts their link on social 24/7
 *   → every paid-seat conversion splits 25/25/25/25 on-chain
 */

import {
  pgTable, text, timestamp, boolean, integer, real, pgEnum, index, uniqueIndex,
} from "drizzle-orm/pg-core";
import { agentsTable } from "./agents";
import { usersTable } from "./users";

// ── Enums ──────────────────────────────────────────────────────────────────────

export const vesselSlotStatusEnum = pgEnum("vessel_slot_status", [
  "pending_offer",      // user has NOT yet clicked through to the offer
  "pending_link_save",  // user clicked offer CTA, hasn't confirmed link save yet
  "active",             // link saved — agent is now rotating their link
  "expired",            // 24h elapsed or slot ran out
  "waitlisted",         // agent at daily cap, queued for next day
]);

export const vesselSlotTypeEnum = pgEnum("vessel_slot_type", ["free", "paid"]);

export const vesselSplitRecipientEnum = pgEnum("vessel_split_recipient", [
  "referrer",    // the person who referred this user into the protocol
  "agent_ops",   // agent owner / operations
  "bot_ops",     // bot/automation infrastructure
  "protocol",    // vessel protocol treasury
]);

export const vesselAgentStatusEnum = pgEnum("vessel_agent_status", [
  "draft",    // not yet released — invisible to users
  "active",   // live, accepting slots
  "full",     // all paid seats filled
  "paused",   // manually paused by ops
]);

// ── Vessel Agent Config ────────────────────────────────────────────────────────
// One row per agent. Links to existing agentsTable.

export const vesselAgentConfigTable = pgTable("vessel_agent_config", {
  id:       text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  agentId:  text("agent_id").notNull().unique()
            .references(() => agentsTable.id, { onDelete: "cascade" }),

  // The offer this agent promotes
  offerName:    text("offer_name").notNull(),
  offerUrl:     text("offer_url").notNull(),
  offerCtaText: text("offer_cta_text").notNull().default("Sign Up Free — Takes 2 Minutes"),
  offerTagline: text("offer_tagline"),
  offerLogoUrl: text("offer_logo_url"),

  // Vessel status
  vesselStatus: vesselAgentStatusEnum("vessel_status").notNull().default("draft"),

  // Seat economics
  totalPaidSeats:    integer("total_paid_seats").notNull().default(50),
  filledPaidSeats:   integer("filled_paid_seats").notNull().default(0),
  paidSeatPriceUsd:  real("paid_seat_price_usd").notNull().default(50.00),

  // Daily free slot cap (controls viral growth rate — default 1/day)
  dailyFreeCap:           integer("daily_free_cap").notNull().default(1),
  dailyFreeIssuedToday:   integer("daily_free_issued_today").notNull().default(0),
  dailyFreeResetAt:       timestamp("daily_free_reset_at").notNull().defaultNow(),

  // 25/25/25/25 split destinations (Base mainnet USDC addresses)
  agentOpsWallet:  text("agent_ops_wallet"),
  botOpsWallet:    text("bot_ops_wallet"),
  protocolWallet:  text("protocol_wallet"),

  // Phase 2
  tokenSymbol:     text("token_symbol"),
  tokenContract:   text("token_contract"),
  tokenLaunchedAt: timestamp("token_launched_at"),
  ctvEnabled:      boolean("ctv_enabled").notNull().default(false),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type VesselAgentConfig       = typeof vesselAgentConfigTable.$inferSelect;
export type InsertVesselAgentConfig = typeof vesselAgentConfigTable.$inferInsert;

// ── Vessel Slots ───────────────────────────────────────────────────────────────
// Core table. One row = one user in one agent's rotator.
// Status: pending_offer → pending_link_save → active → expired

export const vesselSlotsTable = pgTable("vessel_slots", {
  id:      text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  agentId: text("agent_id").notNull()
           .references(() => agentsTable.id, { onDelete: "cascade" }),
  userId:  text("user_id").notNull()
           .references(() => usersTable.id,  { onDelete: "cascade" }),

  slotType: vesselSlotTypeEnum("slot_type").notNull().default("free"),
  status:   vesselSlotStatusEnum("status").notNull().default("pending_offer"),

  // THE GATE — slot is dormant until linkSavedAt is set
  offerClickedAt: timestamp("offer_clicked_at"),
  linkSavedAt:    timestamp("link_saved_at"),   // THIS activates the slot

  // Slot lifetime
  activatedAt: timestamp("activated_at"),
  expiresAt:   timestamp("expires_at"),

  // Paid slots
  paidAmountUsd:   real("paid_amount_usd"),
  stripeSessionId: text("stripe_session_id"),
  paidAt:          timestamp("paid_at"),

  // Attribution
  referredByUserId: text("referred_by_user_id")
                    .references(() => usersTable.id, { onDelete: "set null" }),

  // Rotation tracking
  timesRotated:  integer("times_rotated").notNull().default(0),
  lastRotatedAt: timestamp("last_rotated_at"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  agentUserIdx: index("vessel_slots_agent_user_idx").on(t.agentId, t.userId),
  statusIdx:    index("vessel_slots_status_idx").on(t.status),
  expiresIdx:   index("vessel_slots_expires_idx").on(t.expiresAt),
}));

export type VesselSlot = typeof vesselSlotsTable.$inferSelect;

// ── Conversion Events ──────────────────────────────────────────────────────────
// Logged every time a referral link drives a conversion.
// Triggers the 25/25/25/25 split payment flow.

export const vesselConversionEventsTable = pgTable("vessel_conversion_events", {
  id:              text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  agentId:         text("agent_id").notNull()
                   .references(() => agentsTable.id, { onDelete: "cascade" }),
  affiliateUserId: text("affiliate_user_id").notNull()
                   .references(() => usersTable.id, { onDelete: "cascade" }),
  convertedUserId: text("converted_user_id")
                   .references(() => usersTable.id, { onDelete: "set null" }),

  eventType:      text("event_type").notNull().default("offer_signup"),
  grossAmountUsd: real("gross_amount_usd").notNull().default(0),
  referralCode:   text("referral_code"),
  platform:       text("platform"),
  postId:         text("post_id"),

  splitProcessed: boolean("split_processed").notNull().default(false),
  splitBatchId:   text("split_batch_id"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  affiliateIdx: index("vessel_conv_affiliate_idx").on(t.affiliateUserId),
  agentIdx:     index("vessel_conv_agent_idx").on(t.agentId),
}));

export type VesselConversionEvent = typeof vesselConversionEventsTable.$inferSelect;

// ── Split Ledger ───────────────────────────────────────────────────────────────
// 4 rows per conversion — one per 25% recipient.

export const vesselSplitLedgerTable = pgTable("vessel_split_ledger", {
  id:          text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  eventId:     text("event_id").notNull()
               .references(() => vesselConversionEventsTable.id, { onDelete: "cascade" }),
  agentId:     text("agent_id").notNull()
               .references(() => agentsTable.id, { onDelete: "cascade" }),

  recipient:        vesselSplitRecipientEnum("recipient").notNull(),
  recipientUserId:  text("recipient_user_id")
                    .references(() => usersTable.id, { onDelete: "set null" }),
  recipientAddress: text("recipient_address"),

  splitPct:       real("split_pct").notNull().default(25.0),
  grossUsd:       real("gross_usd").notNull(),
  splitAmountUsd: real("split_amount_usd").notNull(),

  status:     text("status").notNull().default("pending"),
  txHash:     text("tx_hash"),
  paidAt:     timestamp("paid_at"),
  failReason: text("fail_reason"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  eventIdx:     index("vessel_split_event_idx").on(t.eventId),
  recipientIdx: index("vessel_split_recipient_idx").on(t.recipientUserId),
}));

export type VesselSplitLedger = typeof vesselSplitLedgerTable.$inferSelect;

// ── Rotation Log ───────────────────────────────────────────────────────────────
// Every post an agent makes with a user's referral link.

export const vesselRotationLogTable = pgTable("vessel_rotation_log", {
  id:       text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  agentId:  text("agent_id").notNull()
            .references(() => agentsTable.id, { onDelete: "cascade" }),
  userId:   text("user_id").notNull()
            .references(() => usersTable.id, { onDelete: "cascade" }),
  slotId:   text("slot_id").notNull()
            .references(() => vesselSlotsTable.id, { onDelete: "cascade" }),

  platform:  text("platform").notNull(),
  postId:    text("post_id"),
  postUrl:   text("post_url"),
  linkUsed:  text("link_used").notNull(),

  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  agentDayIdx: index("vessel_rotation_agent_day_idx").on(t.agentId, t.createdAt),
}));

// ── Waitlist ───────────────────────────────────────────────────────────────────

export const vesselWaitlistTable = pgTable("vessel_waitlist", {
  id:      text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  agentId: text("agent_id").notNull()
           .references(() => agentsTable.id, { onDelete: "cascade" }),
  userId:  text("user_id").notNull()
           .references(() => usersTable.id, { onDelete: "cascade" }),

  referredByUserId: text("referred_by_user_id")
                    .references(() => usersTable.id, { onDelete: "set null" }),
  position:    integer("position").notNull(),
  notifiedAt:  timestamp("notified_at"),
  convertedAt: timestamp("converted_at"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  agentPositionIdx: uniqueIndex("vessel_waitlist_agent_pos_idx").on(t.agentId, t.position),
}));
