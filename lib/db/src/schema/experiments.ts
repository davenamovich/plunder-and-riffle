import { pgTable, text, integer, real, timestamp } from "drizzle-orm/pg-core";

export const experimentsTable = pgTable("experiments", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  // What we're testing
  hook: text("hook").notNull(),
  type: text("type").notNull().default("pain"), // pain | authority | curiosity | social_proof | offer
  platform: text("platform").notNull().default("X"), // X | LinkedIn | Reddit | Threads | TikTok
  cta: text("cta").notNull().default("DM AI"),
  agentSlug: text("agent_slug"),
  // Funnel metrics
  impressions: integer("impressions").notNull().default(0),
  clicks: integer("clicks").notNull().default(0),
  replies: integer("replies").notNull().default(0),
  dms: integer("dms").notNull().default(0),
  leads: integer("leads").notNull().default(0),
  qualifiedLeads: integer("qualified_leads").notNull().default(0),
  // Computed on read (not stored — calculated by scorer)
  status: text("status").notNull().default("active"), // active | paused | archived
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type Experiment = typeof experimentsTable.$inferSelect;
export type InsertExperiment = typeof experimentsTable.$inferInsert;
