import { pgTable, text, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { agentsTable } from "./agents";
import { usersTable } from "./users";
import { rotatorSlotsTable } from "./rotator";

// ─── Engine Runs ──────────────────────────────────────────────────────────────
// One row per engine tick / manual trigger per agent.

export const agentEngineRunsTable = pgTable("agent_engine_runs", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  agentId: text("agent_id").notNull().references(() => agentsTable.id, { onDelete: "cascade" }),
  triggeredBy: text("triggered_by").notNull().default("scheduler"),
  status: text("status").notNull().default("running"),
  slotsProcessed: integer("slots_processed").notNull().default(0),
  postsGenerated: integer("posts_generated").notNull().default(0),
  postsPosted: integer("posts_posted").notNull().default(0),
  errors: text("errors"),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
});

export type AgentEngineRun = typeof agentEngineRunsTable.$inferSelect;

// ─── Engine Posts ─────────────────────────────────────────────────────────────
// One row per generated/posted content piece per user per platform.

export const agentEnginePostsTable = pgTable("agent_engine_posts", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  agentId: text("agent_id").notNull().references(() => agentsTable.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  slotId: text("slot_id").references(() => rotatorSlotsTable.id, { onDelete: "set null" }),
  platform: text("platform").notNull(),
  content: text("content").notNull(),
  postType: text("post_type").notNull().default("promotional"),
  status: text("status").notNull().default("generated"),
  postUrl: text("post_url"),
  error: text("error"),
  runId: text("run_id").references(() => agentEngineRunsTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  postedAt: timestamp("posted_at"),
});

export type AgentEnginePost = typeof agentEnginePostsTable.$inferSelect;
