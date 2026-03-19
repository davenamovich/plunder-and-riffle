import { pgTable, text, timestamp, boolean, integer, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const agentsTable = pgTable("agents", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  persona: text("persona"),
  offerUrl: text("offer_url").notNull(),
  fallbackUrl: text("fallback_url"),
  isActive: boolean("is_active").notNull().default(true),
  isPaused: boolean("is_paused").notNull().default(false),
  freeSlotCapacity: integer("free_slot_capacity").notNull().default(25),
  paidSlotCapacity: integer("paid_slot_capacity").notNull().default(25),
  freeSlotWeight: integer("free_slot_weight").notNull().default(1),
  paidSlotWeight: integer("paid_slot_weight").notNull().default(3),
  slotDurationHours: integer("slot_duration_hours").notNull().default(24),
  dailyCap: integer("daily_cap").notNull().default(100),
  dailyLeadCount: integer("daily_lead_count").notNull().default(0),
  dailyCapResetAt: timestamp("daily_cap_reset_at").notNull().defaultNow(),
  paidSlotPrice: real("paid_slot_price").notNull().default(9.99),
  leadApprovalMode: text("lead_approval_mode").notNull().default("manual"),
  nftMintEnabled: boolean("nft_mint_enabled").notNull().default(false),
  nftMintedAt: timestamp("nft_minted_at"),
  nftTokenId: text("nft_token_id"),
  totalClicks: integer("total_clicks").notNull().default(0),
  totalSignups: integer("total_signups").notNull().default(0),
  // Profile fields
  ownerId: text("owner_id").references(() => usersTable.id, { onDelete: "set null" }),
  avatarUrl: text("avatar_url"),
  twitterHandle: text("twitter_handle"),
  linkedinUrl: text("linkedin_url"),
  composioEntityId: text("composio_entity_id"),
  // Per-agent ICP context used by Moltis (JSON string)
  icpContext: text("icp_context"),
  // Post templates for this agent (JSON array of strings)
  postTemplates: text("post_templates"),
  // Farcaster social identity
  farcasterFid: text("farcaster_fid"),
  farcasterHandle: text("farcaster_handle"),
  // CDP wallet (Coinbase Developer Platform)
  cdpWalletId: text("cdp_wallet_id"),
  cdpWalletAddress: text("cdp_wallet_address"),
  cdpWalletNetwork: text("cdp_wallet_network").default("base-mainnet"),
  cdpWalletSeed: text("cdp_wallet_seed"),      // encrypted seed export for wallet recovery
  cdpWalletCreatedAt: timestamp("cdp_wallet_created_at"),
  // Agent Engine
  engineEnabled: boolean("engine_enabled").notNull().default(false),
  enginePublic: boolean("engine_public").notNull().default(false),
  engineScheduleHours: integer("engine_schedule_hours").notNull().default(4),
  engineLastRunAt: timestamp("engine_last_run_at"),
  engineNextRunAt: timestamp("engine_next_run_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertAgentSchema = createInsertSchema(agentsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAgent = z.infer<typeof insertAgentSchema>;
export type Agent = typeof agentsTable.$inferSelect;

// ─── Agent ↔ Offer rotation junction ─────────────────────────────────────────

import { offersTable } from "./offers";

export const agentOffersTable = pgTable("agent_offers", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  agentId: text("agent_id").notNull().references(() => agentsTable.id, { onDelete: "cascade" }),
  offerId: text("offer_id").notNull().references(() => offersTable.id, { onDelete: "cascade" }),
  weight: integer("weight").notNull().default(1),
  sortOrder: integer("sort_order").notNull().default(0),
  clickCount: integer("click_count").notNull().default(0),
  conversionCount: integer("conversion_count").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type AgentOffer = typeof agentOffersTable.$inferSelect;

// ─── Agent Assistants ─────────────────────────────────────────────────────────

export const agentAssistantsTable = pgTable("agent_assistants", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  agentId: text("agent_id").notNull().references(() => agentsTable.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  addedAt: timestamp("added_at").notNull().defaultNow(),
});

export type AgentAssistant = typeof agentAssistantsTable.$inferSelect;
