/**
 * Ralph loop — lead processing pipeline.
 *
 * Stages:
 *   raw → scored (score < threshold → rejected_low_score)
 *   scored → pending_approval (or auto-approved if mode = 'auto')
 *   pending_approval → approved → posted
 *
 * Batch design: N leads → 1 API call per stage (not N calls).
 */

import { db } from "@workspace/db";
import { leadsTable, agentsTable, agentKeywordsTable } from "@workspace/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { batchClassifyLeads, batchDraftResponses, classifyLead, draftResponse, hasBudget } from "./moltis.js";

const CLASSIFY_THRESHOLD = 0.35;
const BATCH_SIZE         = 20; // leads per API call

// ─── Agent context ────────────────────────────────────────────────────────────

async function getAgentContext(): Promise<{
  persona: string;
  keywords: string[];
  approvalMode: string;
} | null> {
  const agent = await db
    .select().from(agentsTable)
    .where(and(eq(agentsTable.slug, "ralph"), eq(agentsTable.isActive, true)))
    .limit(1).then(r => r[0]);

  if (!agent) return null;

  const allKeywords = await db.select().from(agentKeywordsTable);
  const merged = Array.from(new Set(allKeywords.flatMap(k => k.keywords || [])));

  const DEFAULT_KEYWORDS = [
    "bitcoin", "btc", "crypto", "cryptocurrency", "passive income",
    "invest", "investing", "digital asset", "blockchain", "wallet",
    "satoshi", "hodl", "bull run", "bear market", "financial freedom",
  ];

  return {
    persona:      agent.persona || "Ralph, the BTC Experiment AI agent",
    keywords:     merged.length > 0 ? merged : DEFAULT_KEYWORDS,
    approvalMode: agent.leadApprovalMode,
  };
}

// ─── Stage 1: Classify raw leads (batch) ──────────────────────────────────────

export async function classifyRawLeads(): Promise<{ processed: number; rejected: number; skipped: number }> {
  const context = await getAgentContext();
  if (!context) {
    console.warn("[ralph] no active ralph agent — skipping classification");
    return { processed: 0, rejected: 0, skipped: 0 };
  }

  if (!(await hasBudget(1))) {
    console.warn("[ralph] daily API budget exhausted — using keyword fallback for classify");
  }

  const rawLeads = await db
    .select().from(leadsTable)
    .where(eq(leadsTable.status, "raw"))
    .limit(BATCH_SIZE);

  if (rawLeads.length === 0) return { processed: 0, rejected: 0, skipped: 0 };

  console.log(`[ralph] batch classifying ${rawLeads.length} raw leads (1 API call)`);

  const inputs  = rawLeads.map(l => ({ id: l.id, content: l.content }));
  const { results, usedFallback } = await batchClassifyLeads(inputs, context.keywords);

  if (usedFallback) {
    console.log("[ralph] classification used keyword fallback (no API key or budget)");
  }

  let rejected = 0;
  const now = new Date();

  for (let i = 0; i < rawLeads.length; i++) {
    const lead   = rawLeads[i];
    const result = results[i];
    if (!result) continue;

    const { score, reason } = result;

    if (score < CLASSIFY_THRESHOLD) {
      await db.update(leadsTable).set({
        status:         "rejected_low_score",
        score,
        scoreReason:    reason,
        rejectedAt:     now,
        rejectedReason: `Score ${score} below threshold ${CLASSIFY_THRESHOLD}`,
        updatedAt:      now,
      }).where(eq(leadsTable.id, lead.id));
      rejected++;
    } else {
      await db.update(leadsTable).set({
        status:      "scored",
        score,
        scoreReason: reason,
        updatedAt:   now,
      }).where(eq(leadsTable.id, lead.id));
    }
  }

  return { processed: rawLeads.length, rejected, skipped: 0 };
}

// ─── Stage 2: Draft for scored leads (batch) ──────────────────────────────────

export async function draftScoredLeads(): Promise<{ drafted: number; skipped: number }> {
  const context = await getAgentContext();
  if (!context) return { drafted: 0, skipped: 0 };

  if (!(await hasBudget(1))) {
    console.warn("[ralph] daily API budget exhausted — using fallback for drafting");
  }

  const scoredLeads = await db
    .select().from(leadsTable)
    .where(eq(leadsTable.status, "scored"))
    .limit(BATCH_SIZE);

  if (scoredLeads.length === 0) return { drafted: 0, skipped: 0 };

  console.log(`[ralph] batch drafting ${scoredLeads.length} scored leads (1 API call)`);

  const inputs  = scoredLeads.map(l => ({ id: l.id, content: l.content }));
  const { results, usedFallback } = await batchDraftResponses(inputs, context.persona);

  if (usedFallback) {
    console.log("[ralph] drafting used fallback (no API key or budget)");
  }

  const now        = new Date();
  const nextStatus = context.approvalMode === "auto" ? "approved" : "pending_approval";
  let drafted      = 0;

  for (let i = 0; i < scoredLeads.length; i++) {
    const lead   = scoredLeads[i];
    const result = results[i];
    if (!result) continue;

    await db.update(leadsTable).set({
      status:    nextStatus,
      draft:     result.draft,
      updatedAt: now,
    }).where(eq(leadsTable.id, lead.id));

    drafted++;
  }

  return { drafted, skipped: 0 };
}

// ─── Full cycle ────────────────────────────────────────────────────────────────

export async function runRalphLoop(): Promise<{
  classified: number;
  classifiedRejected: number;
  drafted: number;
}> {
  const [classifyResult, draftResult] = await Promise.all([
    classifyRawLeads(),
    draftScoredLeads(),
  ]);

  const summary = {
    classified:          classifyResult.processed,
    classifiedRejected:  classifyResult.rejected,
    drafted:             draftResult.drafted,
  };

  if (summary.classified > 0 || summary.drafted > 0) {
    console.log("[ralph] loop tick:", summary);
  }

  return summary;
}

// ─── Manual approve/reject/post ───────────────────────────────────────────────

export async function approveLead(leadId: string): Promise<boolean> {
  const result = await db.update(leadsTable)
    .set({ status: "approved", updatedAt: new Date() })
    .where(and(eq(leadsTable.id, leadId), inArray(leadsTable.status, ["pending_approval", "scored"])))
    .returning();
  return result.length > 0;
}

export async function rejectLead(leadId: string, reason: string): Promise<boolean> {
  const result = await db.update(leadsTable)
    .set({ status: "rejected", rejectedAt: new Date(), rejectedReason: reason, updatedAt: new Date() })
    .where(eq(leadsTable.id, leadId))
    .returning();
  return result.length > 0;
}

export async function markLeadPosted(leadId: string): Promise<boolean> {
  const result = await db.update(leadsTable)
    .set({ status: "posted", postedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(leadsTable.id, leadId), eq(leadsTable.status, "approved")))
    .returning();
  return result.length > 0;
}

// ─── Manual single-lead classify/draft (used by UI endpoints) ─────────────────

export async function reclassifyLead(leadId: string): Promise<boolean> {
  const context = await getAgentContext();
  if (!context) return false;

  const lead = await db.select().from(leadsTable).where(eq(leadsTable.id, leadId)).limit(1).then(r => r[0]);
  if (!lead) return false;

  const { score, reason } = await classifyLead(lead.content, context.keywords);
  const now = new Date();

  if (score < CLASSIFY_THRESHOLD) {
    await db.update(leadsTable).set({
      status: "rejected_low_score", score, scoreReason: reason,
      rejectedAt: now, rejectedReason: `Score ${score} below threshold`, updatedAt: now,
    }).where(eq(leadsTable.id, leadId));
  } else {
    await db.update(leadsTable).set({ status: "scored", score, scoreReason: reason, updatedAt: now })
      .where(eq(leadsTable.id, leadId));
  }
  return true;
}

export async function redraftLead(leadId: string): Promise<boolean> {
  const context = await getAgentContext();
  if (!context) return false;

  const lead = await db.select().from(leadsTable).where(eq(leadsTable.id, leadId)).limit(1).then(r => r[0]);
  if (!lead) return false;

  const { draft } = await draftResponse(lead.content, context.persona, lead.postUrl);
  await db.update(leadsTable).set({ draft, updatedAt: new Date() }).where(eq(leadsTable.id, leadId));
  return true;
}
