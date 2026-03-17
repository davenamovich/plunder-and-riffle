import { pgTable, text, timestamp, integer, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { agentsTable } from "./agents";

export const slotTypeEnum = pgEnum("slot_type", ["free", "paid"]);
export const slotStatusEnum = pgEnum("slot_status", ["active", "expired", "pending"]);

export const rotatorSlotsTable = pgTable("rotator_slots", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  agentId: text("agent_id").notNull().references(() => agentsTable.id, { onDelete: "cascade" }),
  slotType: slotTypeEnum("slot_type").notNull(),
  status: slotStatusEnum("status").notNull().default("active"),
  clickCount: integer("click_count").notNull().default(0),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  activatedAt: timestamp("activated_at"),
  expiredAt: timestamp("expired_at"),
});

export const insertRotatorSlotSchema = createInsertSchema(rotatorSlotsTable).omit({ id: true, createdAt: true });
export type InsertRotatorSlot = z.infer<typeof insertRotatorSlotSchema>;
export type RotatorSlot = typeof rotatorSlotsTable.$inferSelect;

export const rotatorClicksTable = pgTable("rotator_clicks", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  slotId: text("slot_id").notNull().references(() => rotatorSlotsTable.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  agentId: text("agent_id").notNull().references(() => agentsTable.id, { onDelete: "cascade" }),
  refCode: text("ref_code"),
  ipHash: text("ip_hash"),
  clickedAt: timestamp("clicked_at").notNull().defaultNow(),
});

export type RotatorClick = typeof rotatorClicksTable.$inferSelect;
