/**
 * Ralph loop — lead processing pipeline.
 *
 * Stages:
 *   raw → scored (recommended_action=discard → rejected_low_score)
 *       → scored [review]  — waits for manual approval, no auto-draft
 *       → scored [draft]   — immediately batch-drafted in same classify tick
 *   pending_approval → approved → posted
 *
 * Batch design: N leads → 1 API call per stage (not N calls).
 */

import { db } from "@workspace/db";
import { leadsTable, agentsTable, agentKeywordsTable } from "@workspace/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import {
  batchClassifyLeads,
  batchDraftResponses,
  classifyLead,
  draftResponse,
  hasBudget,
} from "./moltis.js";
import { trackEvent } from "./funnel.js";

const BATCH_SIZE = 30; // increased from 20 — 5000/day budget allows larger batches

// ─── Agent context ────────────────────────────────────────────────────────────

const DEFAULT_KEYWORDS = [
  "bitcoin", "btc", "crypto", "cryptocurrency", "passive income",
  "invest", "investing", "digital asset", "blockchain", "wallet",
  "satoshi", "hodl", "bull run", "bear market", "financial freedom",
];

/**
 * Build context for a given agent (defaults to "ralph").
 * Merges the agent's icpContext keywords + post templates into the context
 * so each agent sends different, ICP-tailored prompts to Moltis.
 */
async function getAgentContext(agentSlug = "ralph"): Promise<{
  agentId: string;
  persona: string;
  keywords: string[];
  postTemplates: string[];
  approvalMode: string;
  composioEntityId: string | null;
} | null> {
  const agent = await db
    .select().from(agentsTable)
    .where(and(eq(agentsTable.slug, agentSlug), eq(agentsTable.isActive, true)))
    .limit(1).then(r => r[0]);

  if (!agent) return null;

  // Merge platform-wide user keywords
  const allKeywords = await db.select().from(agentKeywordsTable);
  const userKws = Array.from(new Set(allKeywords.flatMap(k => k.keywords || [])));

  // Parse agent's own ICP context (if set)
  let icpKws: string[] = [];
  let icpPainPoints: string[] = [];
  if (agent.icpContext) {
    try {
      const icp = JSON.parse(agent.icpContext);
      icpKws = Array.isArray(icp.keywords) ? icp.keywords : [];
      icpPainPoints = Array.isArray(icp.painPoints) ? icp.painPoints : [];
    } catch { /* ignore */ }
  }

  // Parse post templates
  let postTemplates: string[] = [];
  if (agent.postTemplates) {
    try {
      const parsed = JSON.parse(agent.postTemplates);
      postTemplates = Array.isArray(parsed) ? parsed : [];
    } catch { /* ignore */ }
  }

  const keywords = [
    ...new Set([...icpKws, ...userKws, ...DEFAULT_KEYWORDS])
  ];

  // Build persona string incorporating ICP pain points for Moltis
  let persona = agent.persona || "Ralph Loop — Plunder and Riffle Agent";
  if (icpPainPoints.length > 0) {
    persona += `\n\nICP Pain Points (use these to personalise replies):\n${icpPainPoints.map(p => `- ${p}`).join("\n")}`;
  }

  return {
    agentId:          agent.id,
    persona,
    keywords,
    postTemplates,
    approvalMode:     agent.leadApprovalMode,
    composioEntityId: agent.composioEntityId ?? null,
  };
}

// ─── Stage 1: Classify raw leads (batch) ──────────────────────────────────────
//
// recommended_action routing:
//   discard → rejected_low_score immediately
//   review  → scored (no auto-draft — waits for manual action)
//   draft   → scored + batch-draft immediately in same tick

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

  const inputs = rawLeads.map(l => ({ id: l.id, content: l.content }));
  const { results, usedFallback } = await batchClassifyLeads(inputs, context.keywords, context.agentId);

  if (usedFallback) {
    console.log("[ralph] classification used keyword fallback (no API key or budget)");
  }

  let rejected = 0;
  const now = new Date();

  // Separate into buckets
  const draftLeads:      typeof rawLeads = [];
  const draftReplyStyles: string[]       = [];

  for (let i = 0; i < rawLeads.length; i++) {
    const lead   = rawLeads[i];
    const result = results[i];
    if (!lead || !result) continue;

    const { score, reason, recommendedAction, replyStyle, scoreDetails } = result;

    if (recommendedAction === "discard") {
      await db.update(leadsTable).set({
        status:         "rejected_low_score",
        score,
        scoreReason:    reason,
        scoreDetails:   scoreDetails ?? null,
        replyStyle:     replyStyle,
        rejectedAt:     now,
        rejectedReason: `Low relevance — action: discard (score ${score})`,
        updatedAt:      now,
      }).where(eq(leadsTable.id, lead.id));
      rejected++;
    } else {
      // Both "review" and "draft" go to scored first
      await db.update(leadsTable).set({
        status:       "scored",
        score,
        scoreReason:  reason,
        scoreDetails: scoreDetails ?? null,
        replyStyle:   replyStyle,
        updatedAt:    now,
      }).where(eq(leadsTable.id, lead.id));

      await trackEvent("candidate_scored", lead.id, lead.source, { score, recommendedAction, replyStyle });

      if (recommendedAction === "draft") {
        draftLeads.push(lead);
        draftReplyStyles.push(replyStyle);
      }
    }
  }

  // Immediately draft the "draft" bucket in the same classify tick
  if (draftLeads.length > 0) {
    console.log(`[ralph] immediately drafting ${draftLeads.length} high-intent leads`);
    const draftInputs = draftLeads.map(l => ({ id: l.id, content: l.content }));
    const { results: draftResults } = await batchDraftResponses(draftInputs, context.persona, draftReplyStyles, context.agentId);

    const nextStatus = context.approvalMode === "auto" ? "approved" : "pending_approval";

    for (let i = 0; i < draftLeads.length; i++) {
      const lead   = draftLeads[i];
      const result = draftResults[i];
      if (!lead || !result) continue;

      await db.update(leadsTable).set({
        status:    nextStatus,
        draft:     result.draft,
        updatedAt: now,
      }).where(eq(leadsTable.id, lead.id));

      await trackEvent("reply_drafted", lead.id, lead.source, { replyStyle: draftReplyStyles[i], status: nextStatus });
    }
  }

  return { processed: rawLeads.length, rejected, skipped: 0 };
}

// ─── Stage 2: Draft for "review" leads that are waiting ───────────────────────
//
// These are leads the admin has manually upgraded to "scored" for drafting,
// or leads where we deferred the draft (recommended_action=review).

export async function draftScoredLeads(): Promise<{ drafted: number; skipped: number }> {
  const context = await getAgentContext();
  if (!context) return { drafted: 0, skipped: 0 };

  if (!(await hasBudget(1))) {
    console.warn("[ralph] daily API budget exhausted — using fallback for drafting");
  }

  // Only draft scored leads that don't yet have a draft
  const scoredLeads = await db
    .select().from(leadsTable)
    .where(and(eq(leadsTable.status, "scored")))
    .limit(BATCH_SIZE);

  const needsDraft = scoredLeads.filter(l => !l.draft);
  if (needsDraft.length === 0) return { drafted: 0, skipped: scoredLeads.length - needsDraft.length };

  console.log(`[ralph] batch drafting ${needsDraft.length} scored leads (1 API call)`);

  const inputs      = needsDraft.map(l => ({ id: l.id, content: l.content }));
  const replyStyles = needsDraft.map(l => l.replyStyle ?? "helpful");
  const { results, usedFallback } = await batchDraftResponses(inputs, context.persona, replyStyles, context.agentId);

  if (usedFallback) {
    console.log("[ralph] drafting used fallback (no API key or budget)");
  }

  const now        = new Date();
  const nextStatus = context.approvalMode === "auto" ? "approved" : "pending_approval";
  let drafted      = 0;

  for (let i = 0; i < needsDraft.length; i++) {
    const lead   = needsDraft[i];
    const result = results[i];
    if (!lead || !result) continue;

    await db.update(leadsTable).set({
      status:    nextStatus,
      draft:     result.draft,
      updatedAt: now,
    }).where(eq(leadsTable.id, lead.id));

    await trackEvent("reply_drafted", lead.id, lead.source, { status: nextStatus });
    drafted++;
  }

  return { drafted, skipped: scoredLeads.length - needsDraft.length };
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
    classified:         classifyResult.processed,
    classifiedRejected: classifyResult.rejected,
    drafted:            draftResult.drafted,
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
  if (result.length > 0) {
    await trackEvent("reply_approved", leadId, result[0]?.source);
    return true;
  }
  return false;
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
  if (result.length > 0) {
    await trackEvent("reply_posted", leadId, result[0]?.source);
    return true;
  }
  return false;
}

// ─── Manual single-lead reclassify/redraft ─────────────────────────────────────

export async function reclassifyLead(leadId: string): Promise<boolean> {
  const context = await getAgentContext();
  if (!context) return false;

  const lead = await db.select().from(leadsTable).where(eq(leadsTable.id, leadId)).limit(1).then(r => r[0]);
  if (!lead) return false;

  const result = await classifyLead(lead.content, context.keywords);
  const { score, reason, recommendedAction, replyStyle, scoreDetails } = result;
  const now = new Date();

  if (recommendedAction === "discard") {
    await db.update(leadsTable).set({
      status: "rejected_low_score", score, scoreReason: reason,
      scoreDetails: scoreDetails ?? null, replyStyle,
      rejectedAt: now, rejectedReason: `Low relevance — action: discard (score ${score})`, updatedAt: now,
    }).where(eq(leadsTable.id, leadId));
  } else {
    await db.update(leadsTable).set({
      status: "scored", score, scoreReason: reason,
      scoreDetails: scoreDetails ?? null, replyStyle, updatedAt: now,
    }).where(eq(leadsTable.id, leadId));
  }
  return true;
}

export async function redraftLead(leadId: string): Promise<boolean> {
  const context = await getAgentContext();
  if (!context) return false;

  const lead = await db.select().from(leadsTable).where(eq(leadsTable.id, leadId)).limit(1).then(r => r[0]);
  if (!lead) return false;

  const { draft } = await draftResponse(lead.content, context.persona, lead.postUrl, lead.replyStyle ?? undefined);
  await db.update(leadsTable).set({ draft, updatedAt: new Date() }).where(eq(leadsTable.id, leadId));
  return true;
}
