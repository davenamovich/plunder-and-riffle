/**
 * Funnel attribution service.
 * Tracks every step in the lead→reply→click→signup→slot pipeline.
 */

import { db } from "@workspace/db";
import { funnelEventsTable } from "@workspace/db/schema";
import { desc, eq, count } from "drizzle-orm";

export type FunnelEventType =
  | "candidate_scored"
  | "reply_drafted"
  | "reply_approved"
  | "reply_posted"
  | "dm_triggered"
  | "dm_queued"
  | "dm_sent"
  | "click"
  | "signup"
  | "slot_activated";

export async function trackEvent(
  eventType: FunnelEventType,
  leadId?: string | null,
  platform?: string | null,
  metadata?: Record<string, unknown> | null,
): Promise<void> {
  await db.insert(funnelEventsTable).values({
    eventType,
    leadId:   leadId   ?? undefined,
    platform: platform ?? undefined,
    metadata: metadata ? JSON.stringify(metadata) : undefined,
  });
}

export async function getFunnelSummary(): Promise<Record<string, number>> {
  const rows = await db
    .select({ eventType: funnelEventsTable.eventType, cnt: count() })
    .from(funnelEventsTable)
    .groupBy(funnelEventsTable.eventType);
  return Object.fromEntries(rows.map(r => [r.eventType, Number(r.cnt)]));
}

export async function getRecentEvents(limit = 60) {
  const rows = await db
    .select()
    .from(funnelEventsTable)
    .orderBy(desc(funnelEventsTable.createdAt))
    .limit(limit);
  return rows.map(r => ({
    id:        r.id,
    leadId:    r.leadId,
    eventType: r.eventType,
    platform:  r.platform,
    metadata:  r.metadata ? (() => { try { return JSON.parse(r.metadata!); } catch { return null; } })() : null,
    createdAt: r.createdAt,
  }));
}

export async function getLeadFunnelTimeline(leadId: string) {
  return db
    .select()
    .from(funnelEventsTable)
    .where(eq(funnelEventsTable.leadId, leadId))
    .orderBy(desc(funnelEventsTable.createdAt));
}
