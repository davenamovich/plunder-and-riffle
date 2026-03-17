/**
 * Ralph loop — the core lead processing pipeline.
 *
 * Stages:
 *   raw → classifying → scored (score < threshold → rejected_low_score)
 *   scored → drafting → pending_approval (or auto-approved if mode = 'auto')
 *   pending_approval → approved → posted
 */

import { db } from "@workspace/db";
import { leadsTable, agentsTable, agentKeywordsTable } from "@workspace/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { classifyLead, draftResponse } from "./moltis.js";

const CLASSIFY_THRESHOLD = 0.35;
const BATCH_SIZE = 10;

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getAgentContext(): Promise<{
  persona: string;
  keywords: string[];
  approvalMode: string;
} | null> {
  const agent = await db
    .select()
    .from(agentsTable)
    .where(and(eq(agentsTable.slug, "ralph"), eq(agentsTable.isActive, true)))
    .limit(1)
    .then((r) => r[0]);

  if (!agent) return null;

  const allKeywords = await db.select().from(agentKeywordsTable);
  const merged = Array.from(new Set(allKeywords.flatMap((k) => k.keywords || [])));

  const DEFAULT_KEYWORDS = [
    "bitcoin", "btc", "crypto", "cryptocurrency", "passive income",
    "invest", "investing", "digital asset", "blockchain", "wallet",
    "satoshi", "hodl", "bull run", "bear market", "financial freedom",
  ];

  return {
    persona: agent.persona || "Ralph, the BTC Experiment agent",
    keywords: merged.length > 0 ? merged : DEFAULT_KEYWORDS,
    approvalMode: agent.leadApprovalMode,
  };
}

// ─── Stage 1: Classify raw leads ─────────────────────────────────────────────

export async function classifyRawLeads(): Promise<{ processed: number; rejected: number }> {
  const context = await getAgentContext();
  if (!context) {
    console.warn("[ralph] no active ralph agent found — skipping classification");
    return { processed: 0, rejected: 0 };
  }

  const rawLeads = await db
    .select()
    .from(leadsTable)
    .where(eq(leadsTable.status, "raw"))
    .limit(BATCH_SIZE);

  if (rawLeads.length === 0) return { processed: 0, rejected: 0 };

  console.log(`[ralph] classifying ${rawLeads.length} raw leads`);
  let rejected = 0;

  for (const lead of rawLeads) {
    try {
      const { score, reason } = await classifyLead(lead.content, context.keywords);
      const now = new Date();

      if (score < CLASSIFY_THRESHOLD) {
        await db
          .update(leadsTable)
          .set({ status: "rejected_low_score", score, scoreReason: reason, rejectedAt: now, rejectedReason: `Score ${score} below threshold ${CLASSIFY_THRESHOLD}`, updatedAt: now })
          .where(eq(leadsTable.id, lead.id));
        rejected++;
      } else {
        await db
          .update(leadsTable)
          .set({ status: "scored", score, scoreReason: reason, updatedAt: now })
          .where(eq(leadsTable.id, lead.id));
      }
    } catch (err) {
      console.error(`[ralph] classify error for lead ${lead.id}:`, err);
    }
  }

  return { processed: rawLeads.length, rejected };
}

// ─── Stage 2: Draft for scored leads ─────────────────────────────────────────

export async function draftScoredLeads(): Promise<{ drafted: number }> {
  const context = await getAgentContext();
  if (!context) return { drafted: 0 };

  const scoredLeads = await db
    .select()
    .from(leadsTable)
    .where(eq(leadsTable.status, "scored"))
    .limit(BATCH_SIZE);

  if (scoredLeads.length === 0) return { drafted: 0 };

  console.log(`[ralph] drafting ${scoredLeads.length} scored leads`);

  for (const lead of scoredLeads) {
    try {
      const { draft } = await draftResponse(lead.content, context.persona, lead.postUrl);
      const now = new Date();
      const nextStatus = context.approvalMode === "auto" ? "approved" : "pending_approval";

      await db
        .update(leadsTable)
        .set({ status: nextStatus, draft, updatedAt: now })
        .where(eq(leadsTable.id, lead.id));
    } catch (err) {
      console.error(`[ralph] draft error for lead ${lead.id}:`, err);
    }
  }

  return { drafted: scoredLeads.length };
}

// ─── Stage 3: Full cycle ──────────────────────────────────────────────────────

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
    classified: classifyResult.processed,
    classifiedRejected: classifyResult.rejected,
    drafted: draftResult.drafted,
  };

  if (summary.classified > 0 || summary.drafted > 0) {
    console.log("[ralph] loop tick:", summary);
  }

  return summary;
}

// ─── Manual approve/reject ────────────────────────────────────────────────────

export async function approveLead(leadId: string): Promise<boolean> {
  const result = await db
    .update(leadsTable)
    .set({ status: "approved", updatedAt: new Date() })
    .where(and(eq(leadsTable.id, leadId), inArray(leadsTable.status, ["pending_approval", "scored"])))
    .returning();
  return result.length > 0;
}

export async function rejectLead(leadId: string, reason: string): Promise<boolean> {
  const result = await db
    .update(leadsTable)
    .set({ status: "rejected", rejectedAt: new Date(), rejectedReason: reason, updatedAt: new Date() })
    .where(eq(leadsTable.id, leadId))
    .returning();
  return result.length > 0;
}

export async function markLeadPosted(leadId: string): Promise<boolean> {
  const result = await db
    .update(leadsTable)
    .set({ status: "posted", postedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(leadsTable.id, leadId), eq(leadsTable.status, "approved")))
    .returning();
  return result.length > 0;
}
