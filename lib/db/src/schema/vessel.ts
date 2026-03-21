/**
 * VESSEL PROTOCOL — Drizzle Schema
 * Extends existing plunder-and-riffle schema without touching any existing tables.
 * Paid seats use USDC on Base mainnet via CDP — no Stripe.
 */

import {
  pgTable, text, timestamp, boolean, integer, real, pgEnum, index, uniqueIndex,
} from "drizzle-orm/pg-core";
import { agentsTable } from "./agents";
import { usersTable } from "./users";

export const vesselSlotStatusEnum = pgEnum("vessel_slot_status", [
  "pending_offer",     // user has not yet clicked the offer CTA
  "pending_link_save", // clicked offer, has not confirmed link saved
  "active",            // link saved — agent is rotating their link NOW
  "expired",
  "waitlisted",
]);

export const vesselSlotTypeEnum   = pgEnum("vessel_slot_type",   ["free", "paid"]);
export const vesselSplitRecipEnum = pgEnum("vessel_split_recipient", ["referrer","agent_ops","bot_ops","protocol"]);
export const vesselAgentStatusEnum = pgEnum("vessel_agent_status", ["draft","active","full","paused"]);

// ── Agent Config ───────────────────────────────────────────────────────────────

export const vesselAgentConfigTable = pgTable("vessel_agent_config", {
  id:      text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  agentId: text("agent_id").notNull().unique().references(() => agentsTable.id, { onDelete: "cascade" }),

  offerName:    text("offer_name").notNull(),
  offerUrl:     text("offer_url").notNull(),
  offerCtaText: text("offer_cta_text").notNull().default("Sign Up Free — Takes 2 Minutes"),
  offerTagline: text("offer_tagline"),
  offerLogoUrl: text("offer_logo_url"),

  vesselStatus:     vesselAgentStatusEnum("vessel_status").notNull().default("draft"),
  totalPaidSeats:   integer("total_paid_seats").notNull().default(50),
  filledPaidSeats:  integer("filled_paid_seats").notNull().default(0),
  paidSeatPriceUsdc: real("paid_seat_price_usdc").notNull().default(50.00), // USDC, not USD

  dailyFreeCap:         integer("daily_free_cap").notNull().default(1),
  dailyFreeIssuedToday: integer("daily_free_issued_today").notNull().default(0),
  dailyFreeResetAt:     timestamp("daily_free_reset_at").notNull().defaultNow(),

  // 25/25/25/25 split — Base mainnet USDC addresses
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

// ── Slots ──────────────────────────────────────────────────────────────────────

export const vesselSlotsTable = pgTable("vessel_slots", {
  id:      text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  agentId: text("agent_id").notNull().references(() => agentsTable.id, { onDelete: "cascade" }),
  userId:  text("user_id").notNull().references(() => usersTable.id,  { onDelete: "cascade" }),

  slotType: vesselSlotTypeEnum("slot_type").notNull().default("free"),
  status:   vesselSlotStatusEnum("status").notNull().default("pending_offer"),

  // Gate
  offerClickedAt: timestamp("offer_clicked_at"),
  linkSavedAt:    timestamp("link_saved_at"),   // SET THIS = slot activates

  // Lifetime
  activatedAt: timestamp("activated_at"),
  expiresAt:   timestamp("expires_at"),

  // Paid slot — USDC payment request (NOT Stripe)
  usdcPaymentRequestId: text("usdc_payment_request_id"), // → usdcPaymentRequestsTable.id
  paidAmountUsdc:       real("paid_amount_usdc"),
  paidAt:               timestamp("paid_at"),

  // Attribution
  referredByUserId: text("referred_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),

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

export const vesselConversionEventsTable = pgTable("vessel_conversion_events", {
  id:              text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  agentId:         text("agent_id").notNull().references(() => agentsTable.id, { onDelete: "cascade" }),
  affiliateUserId: text("affiliate_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  convertedUserId: text("converted_user_id").references(() => usersTable.id, { onDelete: "set null" }),

  eventType:      text("event_type").notNull().default("offer_signup"),
  grossAmountUsdc: real("gross_amount_usdc").notNull().default(0),
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

// ── Rotation Log ───────────────────────────────────────────────────────────────

export const vesselRotationLogTable = pgTable("vessel_rotation_log", {
  id:       text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  agentId:  text("agent_id").notNull().references(() => agentsTable.id, { onDelete: "cascade" }),
  userId:   text("user_id").notNull().references(() => usersTable.id,  { onDelete: "cascade" }),
  slotId:   text("slot_id").notNull().references(() => vesselSlotsTable.id, { onDelete: "cascade" }),
  platform: text("platform").notNull(),
  postId:   text("post_id"),
  postUrl:  text("post_url"),
  linkUsed: text("link_used").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  agentDayIdx: index("vessel_rotation_agent_day_idx").on(t.agentId, t.createdAt),
}));

// ── Waitlist ───────────────────────────────────────────────────────────────────

export const vesselWaitlistTable = pgTable("vessel_waitlist", {
  id:      text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  agentId: text("agent_id").notNull().references(() => agentsTable.id, { onDelete: "cascade" }),
  userId:  text("user_id").notNull().references(() => usersTable.id,  { onDelete: "cascade" }),
  referredByUserId: text("referred_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  position:    integer("position").notNull(),
  notifiedAt:  timestamp("notified_at"),
  convertedAt: timestamp("converted_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  agentPositionIdx: uniqueIndex("vessel_waitlist_agent_pos_idx").on(t.agentId, t.position),
}));
