import { pgTable, text, timestamp, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const leadsTable = pgTable("leads", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  source: text("source").notNull(),
  externalId: text("external_id").notNull().unique(),
  content: text("content").notNull(),
  authorHandle: text("author_handle"),
  authorUrl: text("author_url"),
  postUrl: text("post_url"),
  status: text("status").notNull().default("raw"),
  score: real("score"),
  scoreReason: text("score_reason"),
  scoreDetails: text("score_details"),   // JSON: full multi-dimensional scoring object
  replyStyle: text("reply_style"),        // helpful | curiosity | ask_permission | soft_cta
  draft: text("draft"),
  postedAt: timestamp("posted_at"),
  rejectedAt: timestamp("rejected_at"),
  rejectedReason: text("rejected_reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertLeadSchema = createInsertSchema(leadsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertLead = z.infer<typeof insertLeadSchema>;
export type Lead = typeof leadsTable.$inferSelect;
