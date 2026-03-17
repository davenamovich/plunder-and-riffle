import { pgTable, text, timestamp, boolean, integer, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

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
  totalClicks: integer("total_clicks").notNull().default(0),
  totalSignups: integer("total_signups").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertAgentSchema = createInsertSchema(agentsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAgent = z.infer<typeof insertAgentSchema>;
export type Agent = typeof agentsTable.$inferSelect;
