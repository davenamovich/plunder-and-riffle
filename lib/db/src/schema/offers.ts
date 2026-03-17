import { pgTable, text, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const offersTable = pgTable("offers", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  offerUrl: text("offer_url").notNull(),
  logoUrl: text("logo_url"),
  isActive: boolean("is_active").notNull().default(true),
  isQualifying: boolean("is_qualifying").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertOfferSchema = createInsertSchema(offersTable).omit({ id: true, createdAt: true });
export type InsertOffer = z.infer<typeof insertOfferSchema>;
export type Offer = typeof offersTable.$inferSelect;

export const offerSignupsTable = pgTable("offer_signups", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  offerId: text("offer_id").notNull().references(() => offersTable.id, { onDelete: "cascade" }),
  affiliateRef: text("affiliate_ref"),
  signedUpAt: timestamp("signed_up_at").notNull().defaultNow(),
});

export const insertOfferSignupSchema = createInsertSchema(offerSignupsTable).omit({ id: true, signedUpAt: true });
export type InsertOfferSignup = z.infer<typeof insertOfferSignupSchema>;
export type OfferSignup = typeof offerSignupsTable.$inferSelect;

export const inheritedRefLinksTable = pgTable("inherited_ref_links", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  offerId: text("offer_id").notNull().references(() => offersTable.id, { onDelete: "cascade" }),
  referrerUserId: text("referrer_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  inheritedUrl: text("inherited_url").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type InheritedRefLink = typeof inheritedRefLinksTable.$inferSelect;

export const personalRotatorLinksTable = pgTable("personal_rotator_links", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  offerId: text("offer_id").references(() => offersTable.id, { onDelete: "cascade" }),
  displayName: text("display_name").notNull(),
  url: text("url").notNull(),
  logoUrl: text("logo_url"),
  linkType: text("link_type").notNull().default("offer"),
  displayOrder: text("display_order").notNull().default("0"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type PersonalRotatorLink = typeof personalRotatorLinksTable.$inferSelect;

// ─── Referral Rotator ─────────────────────────────────────────────────────────
// Each row = one direct referral the owner has added to their personal rotator.
// Owner can toggle isActive on/off per referral.

export const referralRotatorTable = pgTable("referral_rotator", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  ownerId: text("owner_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  memberId: text("member_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  isActive: boolean("is_active").notNull().default(true),
  clickCount: integer("click_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type ReferralRotatorEntry = typeof referralRotatorTable.$inferSelect;
