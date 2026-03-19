import { pgTable, text, timestamp, integer } from "drizzle-orm/pg-core";
import { agentsTable } from "./agents";

export const agentTokenUsageTable = pgTable("agent_token_usage", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  agentId: text("agent_id").references(() => agentsTable.id, { onDelete: "cascade" }),
  task: text("task").notNull(), // classify | draft | engine | icp | tip
  model: text("model").notNull(),
  promptTokens: integer("prompt_tokens").notNull().default(0),
  completionTokens: integer("completion_tokens").notNull().default(0),
  totalTokens: integer("total_tokens").notNull().default(0),
  leadsInBatch: integer("leads_in_batch").notNull().default(1),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type AgentTokenUsage = typeof agentTokenUsageTable.$inferSelect;
