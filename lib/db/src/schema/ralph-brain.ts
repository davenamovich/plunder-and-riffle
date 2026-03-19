import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Single-row memory document for Ralph Brain strategic state
export const ralphBrainMemoryTable = pgTable("ralph_brain_memory", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  // Each field is a JSON string (array of objects)
  topHooks: text("top_hooks"),
  failedHooks: text("failed_hooks"),
  bestPersonas: text("best_personas"),
  weakPersonas: text("weak_personas"),
  bestPlatforms: text("best_platforms"),
  weakPlatforms: text("weak_platforms"),
  bestCTAs: text("best_ctas"),
  weakCTAs: text("weak_ctas"),
  recurringObjections: text("recurring_objections"),
  provenPatterns: text("proven_patterns"),
  currentHypotheses: text("current_hypotheses"),
  nextExperiments: text("next_experiments"),
  // Full markdown report from last analysis run
  lastReport: text("last_report"),
  lastRunAt: timestamp("last_run_at"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type RalphBrainMemory = typeof ralphBrainMemoryTable.$inferSelect;
