import { pgTable, text, timestamp, pgEnum, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const userRoleEnum = pgEnum("user_role", ["user", "admin"]);

export const usersTable = pgTable("users", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  email: text("email").notNull().unique(),
  slug: text("slug").notNull().unique(),
  displayName: text("display_name"),
  bio: text("bio"),
  role: userRoleEnum("role").notNull().default("user"),
  referralCode: text("referral_code").notNull().unique(),
  referredById: text("referred_by_id"),
  isAbuseFlagged: boolean("is_abuse_flagged").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;

export const agentKeywordsTable = pgTable("agent_keywords", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  keywords: text("keywords").array().notNull().default([]),
  painPoints: text("pain_points").array().notNull().default([]),
  buyerIntentPhrases: text("buyer_intent_phrases").array().notNull().default([]),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertAgentKeywordsSchema = createInsertSchema(agentKeywordsTable).omit({ id: true });
export type InsertAgentKeywords = z.infer<typeof insertAgentKeywordsSchema>;
export type AgentKeywords = typeof agentKeywordsTable.$inferSelect;
