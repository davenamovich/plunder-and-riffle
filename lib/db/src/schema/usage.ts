import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";

export const apiUsageTable = pgTable("api_usage", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  date: text("date").notNull().unique(),
  callCount: integer("call_count").notNull().default(0),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type ApiUsage = typeof apiUsageTable.$inferSelect;
