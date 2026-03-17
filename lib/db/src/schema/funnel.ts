import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const funnelEventsTable = pgTable("funnel_events", {
  id:        text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  leadId:    text("lead_id"),
  eventType: text("event_type").notNull(),
  // candidate_scored | reply_drafted | reply_approved | reply_posted
  // dm_triggered | dm_queued | dm_sent
  // click | signup | slot_activated
  platform:  text("platform"),
  metadata:  text("metadata"),   // JSON blob
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
