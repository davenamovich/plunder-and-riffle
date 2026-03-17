import { pgTable, text, timestamp, integer, boolean } from "drizzle-orm/pg-core";

export const dmSequencesTable = pgTable("dm_sequences", {
  id:        text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  agentSlug: text("agent_slug").notNull().default("ralph"),
  name:      text("name").notNull(),
  steps:     text("steps").notNull(),           // JSON: DmStep[]
  isActive:  boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const dmSendsTable = pgTable("dm_sends", {
  id:          text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  leadId:      text("lead_id").notNull(),
  sequenceId:  text("sequence_id").notNull(),
  stepIndex:   integer("step_index").notNull().default(0),
  status:      text("status").notNull().default("queued"), // queued | sent | cancelled
  message:     text("message"),
  scheduledAt: timestamp("scheduled_at"),
  sentAt:      timestamp("sent_at"),
  createdAt:   timestamp("created_at").notNull().defaultNow(),
  updatedAt:   timestamp("updated_at").notNull().defaultNow(),
});
