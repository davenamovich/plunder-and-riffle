/**
 * VESSEL PROTOCOL — Core Service
 * Slot state machine, gate mechanic, 25/25/25/25 splits, rotation fairness.
 */

import { db } from "@workspace/db";
import { agentsTable, usersTable } from "@workspace/db/schema";
import {
  vesselAgentConfigTable, vesselSlotsTable, vesselConversionEventsTable,
  vesselSplitLedgerTable, vesselWaitlistTable, vesselRotationLogTable,
} from "@workspace/db/schema/vessel";
import { eq, and, gt, lt, count, sql, desc, asc } from "drizzle-orm";

const APP_URL = process.env.APP_URL || "https://vesselprotocol.xyz";

// ── Create pending slot (step 1) ───────────────────────────────────────────────
export async function createPendingSlot(params: {
  agentId: string; userId: string; referredByUserId?: string;
}): Promise<{
  slot: typeof vesselSlotsTable.$inferSelect;
  status: "created" | "already_active" | "waitlisted";
  waitlistPosition?: number;
  offer?: { name: string; url: string; ctaText: string; tagline: string | null };
}> {
  const { agentId, userId, referredByUserId } = params;

  // Return existing active/pending slot
  const existing = await db.select().from(vesselSlotsTable)
    .where(and(
      eq(vesselSlotsTable.agentId, agentId),
      eq(vesselSlotsTable.userId, userId),
    ))
    .orderBy(desc(vesselSlotsTable.createdAt))
    .limit(1).then(r => r[0]);

  if (existing && ["active", "pending_offer", "pending_link_save"].includes(existing.status)) {
    const config = await db.select().from(vesselAgentConfigTable).where(eq(vesselAgentConfigTable.agentId, agentId)).limit(1).then(r => r[0]);
    return {
      slot: existing, status: "already_active",
      offer: config ? { name: config.offerName, url: config.offerUrl, ctaText: config.offerCtaText, tagline: config.offerTagline } : undefined,
    };
  }

  const config = await db.select().from(vesselAgentConfigTable)
    .where(eq(vesselAgentConfigTable.agentId, agentId)).limit(1).then(r => r[0]);

  if (!config || config.vesselStatus !== "active") throw new Error("Agent is not currently accepting slots");

  // Reset daily counter if needed
  if (config.dailyFreeResetAt < new Date()) {
    const midnight = new Date(); midnight.setHours(24, 0, 0, 0);
    await db.update(vesselAgentConfigTable)
      .set({ dailyFreeIssuedToday: 0, dailyFreeResetAt: midnight })
      .where(eq(vesselAgentConfigTable.agentId, agentId));
    config.dailyFreeIssuedToday = 0;
  }

  // Enforce daily cap → waitlist
  if (config.dailyFreeIssuedToday >= config.dailyFreeCap) {
    const maxPos = await db.select({ m: sql<number>`max(${vesselWaitlistTable.position})` })
      .from(vesselWaitlistTable).where(eq(vesselWaitlistTable.agentId, agentId))
      .then(r => r[0]?.m ?? 0);
    const position = maxPos + 1;
    await db.insert(vesselWaitlistTable).values({ agentId, userId, referredByUserId: referredByUserId ?? null, position }).onConflictDoNothing();
    const [slot] = await db.insert(vesselSlotsTable).values({ agentId, userId, slotType: "free", status: "waitlisted", referredByUserId: referredByUserId ?? null }).returning();
    return { slot, status: "waitlisted", waitlistPosition: position };
  }

  const [slot] = await db.insert(vesselSlotsTable).values({
    agentId, userId, slotType: "free", status: "pending_offer", referredByUserId: referredByUserId ?? null,
  }).returning();

  return {
    slot, status: "created",
    offer: { name: config.offerName, url: config.offerUrl, ctaText: config.offerCtaText, tagline: config.offerTagline },
  };
}

// ── Mark offer clicked (step 2) ────────────────────────────────────────────────
export async function markOfferClicked(slotId: string, userId: string): Promise<void> {
  await db.update(vesselSlotsTable)
    .set({ status: "pending_link_save", offerClickedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(vesselSlotsTable.id, slotId), eq(vesselSlotsTable.userId, userId), eq(vesselSlotsTable.status, "pending_offer")));
}

// ── ACTIVATE SLOT — THE GATE (step 3) ─────────────────────────────────────────
// This is the most important function. Link saved = slot active = agent posts your link.
export async function activateSlot(slotId: string, userId: string): Promise<{
  slot: typeof vesselSlotsTable.$inferSelect;
  referralLink: string; agentName: string; expiresAt: Date;
}> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const [slot] = await db.update(vesselSlotsTable)
    .set({ status: "active", linkSavedAt: now, activatedAt: now, expiresAt, updatedAt: now })
    .where(and(eq(vesselSlotsTable.id, slotId), eq(vesselSlotsTable.userId, userId), eq(vesselSlotsTable.status, "pending_link_save")))
    .returning();

  if (!slot) throw new Error("Slot not found or not in pending_link_save state");

  // Increment daily counter
  await db.update(vesselAgentConfigTable)
    .set({ dailyFreeIssuedToday: sql`${vesselAgentConfigTable.dailyFreeIssuedToday} + 1`, updatedAt: new Date() })
    .where(eq(vesselAgentConfigTable.agentId, slot.agentId));

  const [user, agent] = await Promise.all([
    db.select({ referralCode: usersTable.referralCode }).from(usersTable).where(eq(usersTable.id, userId)).limit(1).then(r => r[0]),
    db.select({ name: agentsTable.name }).from(agentsTable).where(eq(agentsTable.id, slot.agentId)).limit(1).then(r => r[0]),
  ]);

  return {
    slot,
    referralLink: `${APP_URL}/r/${user.referralCode}`,
    agentName: agent.name,
    expiresAt,
  };
}

// ── Get active slots for agent engine (rotation) ───────────────────────────────
export async function getActiveRotationSlots(agentId: string) {
  return db.select({
    slotId:       vesselSlotsTable.id,
    userId:       vesselSlotsTable.userId,
    referralCode: usersTable.referralCode,
    displayName:  usersTable.displayName,
    email:        usersTable.email,
    timesRotated: vesselSlotsTable.timesRotated,
  })
  .from(vesselSlotsTable)
  .innerJoin(usersTable, eq(vesselSlotsTable.userId, usersTable.id))
  .where(and(
    eq(vesselSlotsTable.agentId, agentId),
    eq(vesselSlotsTable.status, "active"),
    gt(vesselSlotsTable.expiresAt, new Date()),
  ))
  .orderBy(asc(vesselSlotsTable.timesRotated), asc(vesselSlotsTable.lastRotatedAt))
  .then(rows => rows.map(r => ({
    ...r,
    referralLink: `${APP_URL}/r/${r.referralCode}`,
  })));
}

// ── Record a rotation (called by agent engine after posting) ───────────────────
export async function recordRotation(params: {
  slotId: string; agentId: string; userId: string;
  platform: string; postId?: string; postUrl?: string; linkUsed: string;
}) {
  await Promise.all([
    db.update(vesselSlotsTable)
      .set({ timesRotated: sql`${vesselSlotsTable.timesRotated} + 1`, lastRotatedAt: new Date(), updatedAt: new Date() })
      .where(eq(vesselSlotsTable.id, params.slotId)),
    db.insert(vesselRotationLogTable).values({
      agentId: params.agentId, userId: params.userId, slotId: params.slotId,
      platform: params.platform, postId: params.postId ?? null,
      postUrl: params.postUrl ?? null, linkUsed: params.linkUsed,
    }),
  ]);
}

// ── Record conversion + create 4 splits ───────────────────────────────────────
export async function recordConversion(params: {
  agentId: string; affiliateUserId: string; convertedUserId?: string;
  eventType: string; grossAmountUsdc: number;
  platform?: string; postId?: string; referralCode?: string;
}) {
  const config = await db.select().from(vesselAgentConfigTable)
    .where(eq(vesselAgentConfigTable.agentId, params.agentId)).limit(1).then(r => r[0]);
  if (!config) throw new Error("Agent config not found");

  // Find who referred the affiliate
  const affiliate = await db.select({ referredById: usersTable.referredById, walletAddress: usersTable.walletAddress })
    .from(usersTable).where(eq(usersTable.id, params.affiliateUserId)).limit(1).then(r => r[0]);

  const [event] = await db.insert(vesselConversionEventsTable).values({
    agentId: params.agentId, affiliateUserId: params.affiliateUserId,
    convertedUserId: params.convertedUserId ?? null,
    eventType: params.eventType, grossAmountUsdc: params.grossAmountUsdc,
    platform: params.platform ?? null, postId: params.postId ?? null,
    referralCode: params.referralCode ?? null,
  }).returning();

  const splitAmount = params.grossAmountUsdc * 0.25;

  // Referrer = person who referred the affiliate (or affiliate themselves as fallback)
  const referrerUser = affiliate?.referredById
    ? await db.select({ id: usersTable.id, walletAddress: usersTable.walletAddress })
        .from(usersTable).where(eq(usersTable.id, affiliate.referredById)).limit(1).then(r => r[0])
    : null;

  await db.insert(vesselSplitLedgerTable).values([
    { eventId: event.id, agentId: params.agentId, recipient: "referrer",
      recipientUserId: referrerUser?.id ?? params.affiliateUserId,
      recipientAddress: referrerUser?.walletAddress ?? affiliate?.walletAddress ?? null,
      splitPct: 25, grossUsd: params.grossAmountUsdc, splitAmountUsd: splitAmount, status: "pending" },
    { eventId: event.id, agentId: params.agentId, recipient: "agent_ops",
      recipientUserId: null, recipientAddress: config.agentOpsWallet ?? null,
      splitPct: 25, grossUsd: params.grossAmountUsdc, splitAmountUsd: splitAmount, status: "pending" },
    { eventId: event.id, agentId: params.agentId, recipient: "bot_ops",
      recipientUserId: null, recipientAddress: config.botOpsWallet ?? null,
      splitPct: 25, grossUsd: params.grossAmountUsdc, splitAmountUsd: splitAmount, status: "pending" },
    { eventId: event.id, agentId: params.agentId, recipient: "protocol",
      recipientUserId: null, recipientAddress: config.protocolWallet ?? null,
      splitPct: 25, grossUsd: params.grossAmountUsdc, splitAmountUsd: splitAmount, status: "pending" },
  ]);

  await db.update(vesselConversionEventsTable)
    .set({ splitProcessed: true, splitBatchId: event.id })
    .where(eq(vesselConversionEventsTable.id, event.id));

  return event.id;
}

// ── Expire old slots (called by cron) ─────────────────────────────────────────
export async function expireVesselSlots() {
  const result = await db.update(vesselSlotsTable)
    .set({ status: "expired", updatedAt: new Date() })
    .where(and(eq(vesselSlotsTable.status, "active"), lt(vesselSlotsTable.expiresAt, new Date())));
  return result.rowCount ?? 0;
}

// ── User dashboard data ────────────────────────────────────────────────────────
export async function getVesselUserStats(userId: string) {
  const [slots, earningsRows, rotationsRow] = await Promise.all([
    db.select({ slot: vesselSlotsTable, agent: agentsTable, config: vesselAgentConfigTable })
      .from(vesselSlotsTable)
      .innerJoin(agentsTable, eq(vesselSlotsTable.agentId, agentsTable.id))
      .leftJoin(vesselAgentConfigTable, eq(vesselAgentConfigTable.agentId, agentsTable.id))
      .where(eq(vesselSlotsTable.userId, userId))
      .orderBy(desc(vesselSlotsTable.createdAt)).limit(20),

    db.select({
      total: sql<number>`coalesce(sum(${vesselSplitLedgerTable.splitAmountUsd}), 0)`,
      paid:  sql<number>`coalesce(sum(case when ${vesselSplitLedgerTable.status} = 'paid' then ${vesselSplitLedgerTable.splitAmountUsd} else 0 end), 0)`,
    }).from(vesselSplitLedgerTable).where(eq(vesselSplitLedgerTable.recipientUserId, userId)),

    db.select({ c: count() }).from(vesselRotationLogTable).where(eq(vesselRotationLogTable.userId, userId)),
  ]);

  return {
    slots,
    totalEarned:  Number(earningsRows[0]?.total ?? 0),
    paidOut:      Number(earningsRows[0]?.paid  ?? 0),
    timesRotated: Number(rotationsRow[0]?.c     ?? 0),
  };
}
