/**
 * DM sequence service.
 *
 * Stores short, approval-first DM sequences.
 * "Sending" is admin-manual — the system generates and queues the message;
 * the admin copies and sends it on the actual platform.
 *
 * Sequence steps support these placeholders:
 *   {handle}       — author handle without @
 *   {authorHandle} — raw authorHandle field
 *   {trackingLink} — unique tracking URL for this lead
 */

import { db } from "@workspace/db";
import { dmSequencesTable, dmSendsTable, leadsTable } from "@workspace/db/schema";
import { and, eq, inArray, desc } from "drizzle-orm";
import { trackEvent } from "./funnel.js";

export interface DmStep {
  stepIndex:   number;
  delayHours:  number;
  message:     string;
}

// ─── Default sequence (seeded on startup if none exist) ───────────────────────

export const DEFAULT_SEQUENCE_NAME = "Ralph Loop — Default";

export const DEFAULT_SEQUENCE_STEPS: DmStep[] = [
  {
    stepIndex:  0,
    delayHours: 0,
    message:
      "Hey {handle}, saw your post earlier. I've been running something you might find interesting — there's a free way to test it, and you get 24 hours in a live traffic rotator, no credit card or signup hassle. Want me to drop the link?",
  },
  {
    stepIndex:  1,
    delayHours: 48,
    message:
      "Hey {handle}, just circling back from my last message. No pressure at all — just didn't want it to get buried. Still happy to share the link if you're open to it.",
  },
];

// ─── Seed defaults ────────────────────────────────────────────────────────────

export async function seedDefaultSequenceIfNeeded(): Promise<void> {
  const existing = await db.select().from(dmSequencesTable).limit(1).then(r => r[0]);
  if (existing) return;

  await db.insert(dmSequencesTable).values({
    agentSlug: "ralph",
    name:      DEFAULT_SEQUENCE_NAME,
    steps:     JSON.stringify(DEFAULT_SEQUENCE_STEPS),
    isActive:  true,
  });
  console.log("[dm] seeded default DM sequence");
}

// ─── Getters ──────────────────────────────────────────────────────────────────

export async function getActiveSequence() {
  return db
    .select().from(dmSequencesTable)
    .where(eq(dmSequencesTable.isActive, true))
    .limit(1).then(r => r[0] ?? null);
}

export async function getAllSequences() {
  return db.select().from(dmSequencesTable).orderBy(desc(dmSequencesTable.createdAt));
}

export async function getDmQueue(statusFilter?: string) {
  const rows = await db.select({
    id:           dmSendsTable.id,
    leadId:       dmSendsTable.leadId,
    sequenceId:   dmSendsTable.sequenceId,
    stepIndex:    dmSendsTable.stepIndex,
    status:       dmSendsTable.status,
    message:      dmSendsTable.message,
    scheduledAt:  dmSendsTable.scheduledAt,
    sentAt:       dmSendsTable.sentAt,
    createdAt:    dmSendsTable.createdAt,
    updatedAt:    dmSendsTable.updatedAt,
    leadContent:  leadsTable.content,
    leadHandle:   leadsTable.authorHandle,
    leadSource:   leadsTable.source,
    seqName:      dmSequencesTable.name,
  })
    .from(dmSendsTable)
    .leftJoin(leadsTable,       eq(dmSendsTable.leadId,     leadsTable.id))
    .leftJoin(dmSequencesTable, eq(dmSendsTable.sequenceId, dmSequencesTable.id))
    .orderBy(desc(dmSendsTable.createdAt))
    .limit(100);

  return statusFilter
    ? rows.filter(r => r.status === statusFilter)
    : rows;
}

export async function getLeadDmStatus(leadId: string) {
  return db.select().from(dmSendsTable)
    .where(eq(dmSendsTable.leadId, leadId))
    .orderBy(desc(dmSendsTable.createdAt));
}

// ─── Trigger ──────────────────────────────────────────────────────────────────

export interface DmTriggerResult {
  success:     boolean;
  stepsQueued: number;
  error?:      string;
}

export function buildTrackingLink(leadId: string, baseUrl?: string): string {
  const base = baseUrl || process.env.PUBLIC_BASE_URL || "";
  return `${base}/api/track/${leadId}`;
}

function personalize(template: string, handle: string, authorHandle: string, trackingLink: string): string {
  return template
    .replace(/{handle}/g,       handle)
    .replace(/{authorHandle}/g, authorHandle)
    .replace(/{trackingLink}/g, trackingLink)
    .replace(/{link}/g,         trackingLink);
}

export async function triggerDmForLead(leadId: string): Promise<DmTriggerResult> {
  const [seq, lead] = await Promise.all([
    getActiveSequence(),
    db.select().from(leadsTable).where(eq(leadsTable.id, leadId)).limit(1).then(r => r[0] ?? null),
  ]);

  if (!seq) return { success: false, stepsQueued: 0, error: "No active DM sequence found" };
  if (!lead) return { success: false, stepsQueued: 0, error: "Lead not found" };

  // Idempotency: only trigger once per lead per sequence
  const existing = await db.select().from(dmSendsTable)
    .where(and(eq(dmSendsTable.leadId, leadId), eq(dmSendsTable.sequenceId, seq.id)))
    .limit(1).then(r => r[0] ?? null);

  if (existing) return { success: false, stepsQueued: 0, error: "DM already triggered for this lead" };

  const steps: DmStep[] = (() => { try { return JSON.parse(seq.steps); } catch { return []; } })();
  const handle       = (lead.authorHandle || "there").replace(/^@/, "");
  const authorHandle = lead.authorHandle || "there";
  const trackingLink = buildTrackingLink(leadId);
  const now = new Date();

  for (const step of steps) {
    const scheduledAt = new Date(now.getTime() + step.delayHours * 60 * 60 * 1000);
    const message     = personalize(step.message, handle, authorHandle, trackingLink);

    await db.insert(dmSendsTable).values({
      leadId,
      sequenceId:  seq.id,
      stepIndex:   step.stepIndex,
      status:      "queued",
      message,
      scheduledAt,
    });

    await trackEvent("dm_queued", leadId, lead.source);
  }

  await trackEvent("dm_triggered", leadId, lead.source, {
    sequenceId:  seq.id,
    stepsQueued: steps.length,
    handle,
  });

  return { success: true, stepsQueued: steps.length };
}

// ─── Mark as sent ─────────────────────────────────────────────────────────────

export async function markDmSent(dmSendId: string): Promise<boolean> {
  const dmSend = await db.select().from(dmSendsTable)
    .where(eq(dmSendsTable.id, dmSendId)).limit(1).then(r => r[0] ?? null);
  if (!dmSend || dmSend.status !== "queued") return false;

  await db.update(dmSendsTable).set({
    status:    "sent",
    sentAt:    new Date(),
    updatedAt: new Date(),
  }).where(eq(dmSendsTable.id, dmSendId));

  await trackEvent("dm_sent", dmSend.leadId, undefined, { stepIndex: dmSend.stepIndex });
  return true;
}

export async function cancelDmSend(dmSendId: string): Promise<boolean> {
  const result = await db.update(dmSendsTable).set({
    status:    "cancelled",
    updatedAt: new Date(),
  }).where(and(eq(dmSendsTable.id, dmSendId), eq(dmSendsTable.status, "queued")))
    .returning();
  return result.length > 0;
}

// ─── Update sequence ──────────────────────────────────────────────────────────

export async function upsertSequence(id: string | null, name: string, steps: DmStep[]): Promise<{ id: string }> {
  if (id) {
    await db.update(dmSequencesTable).set({
      name,
      steps:     JSON.stringify(steps),
      updatedAt: new Date(),
    }).where(eq(dmSequencesTable.id, id));
    return { id };
  } else {
    const [row] = await db.insert(dmSequencesTable).values({
      name,
      agentSlug: "ralph",
      steps:     JSON.stringify(steps),
      isActive:  true,
    }).returning({ id: dmSequencesTable.id });
    return { id: row.id };
  }
}
