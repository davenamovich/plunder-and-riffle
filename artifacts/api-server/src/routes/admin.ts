import { Router } from "express";
import { db } from "@workspace/db";
import { agentsTable, rotatorSlotsTable, usersTable, offerSignupsTable, leadsTable, personalRotatorLinksTable, offersTable, inheritedRefLinksTable, agentAssistantsTable, agentTokenUsageTable, ralphBrainMemoryTable, agentEnginePostsTable, experimentsTable } from "@workspace/db/schema";
import { scoreExperiment, funnelRates } from "../lib/scorer.js";
import { eq, and, gt, count, sql, desc, gte, isNull as isNullDrizzle } from "drizzle-orm";
import { requireAdmin } from "../lib/auth.js";
import { createAgentWallet, isCDPConfigured, getWalletBalances, sweepWallet } from "../lib/cdp.js";
import { moltisStatusWithUsage, getDailyUsage, chatOnce } from "../lib/moltis.js";
import { runRalphLoop, approveLead, rejectLead as ralphRejectLead, markLeadPosted } from "../lib/ralph.js";
import { runSportsTipsEngine, pingTelegram } from "../lib/sports-tips.js";
import { buildPersonaGenerationPrompt, buildHookGenerationPrompt, PERSONA_ARCHETYPES, SKILL_TAGS, LEAD_GEN_SKILL_SUMMARY } from "../lib/lead-gen-skill.js";
import { getEntityConnections, initiateConnection, isComposioConfigured, COMPOSIO_APPS, executeAction } from "../lib/composio.js";
import { getFunnelSummary, getRecentEvents } from "../lib/funnel.js";
import {
  getAllSequences, getDmQueue, triggerDmForLead,
  markDmSent, cancelDmSend, upsertSequence,
} from "../lib/dm.js";
import {
  generateSplits,
  listSplits,
  createUsdcPaymentRequest,
  confirmPaymentAndSplit,
  payApprovedSplit,
} from "../lib/commission-splitter.js";
import { commissionSplitsTable, usdcPaymentRequestsTable } from "@workspace/db/schema";
import { calculateCurrentPrice } from "../lib/pricing.js";

const router = Router();

// ─── Settings ─────────────────────────────────────────────────────────────────

router.get("/admin/settings", requireAdmin, async (req, res) => {
  try {
    const agent = await db.select().from(agentsTable).where(eq(agentsTable.slug, "ralph")).limit(1).then(r => r[0]);
    if (!agent) { res.status(404).json({ error: "Main agent not found" }); return; }
    res.json({
      freeSlotCapacity:        agent.freeSlotCapacity,
      paidSlotCapacity:        agent.paidSlotCapacity,
      freeSlotWeight:          agent.freeSlotWeight,
      paidSlotWeight:          agent.paidSlotWeight,
      slotDurationHours:       agent.slotDurationHours,
      dailyCap:                agent.dailyCap,
      fallbackUrl:             agent.fallbackUrl || "",
      isPaused:                agent.isPaused,
      leadApprovalMode:        agent.leadApprovalMode,
      nftMintEnabled:          agent.nftMintEnabled,
      paidSlotPrice:           agent.paidSlotPrice,
      nftReferralThreshold:    agent.nftReferralThreshold,
      nftViralThreshold:       agent.nftViralThreshold,
      botOpsSweepThresholdUsd: agent.botOpsSweepThresholdUsd,
      protocolWalletAddress:   agent.protocolWalletAddress || "",
      adminWalletAddress:      agent.adminWalletAddress || "",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/admin/settings", requireAdmin, async (req, res) => {
  try {
    const agent = await db.select().from(agentsTable).where(eq(agentsTable.slug, "ralph")).limit(1).then(r => r[0]);
    if (!agent) { res.status(404).json({ error: "Main agent not found" }); return; }

    const updates: Partial<typeof agent> = {};
    const allowed = ["freeSlotCapacity","paidSlotCapacity","freeSlotWeight","paidSlotWeight","slotDurationHours","dailyCap","fallbackUrl","isPaused","leadApprovalMode","nftMintEnabled","paidSlotPrice","nftReferralThreshold","nftViralThreshold","botOpsSweepThresholdUsd","protocolWalletAddress","adminWalletAddress"];
    for (const key of allowed) {
      if (req.body[key] !== undefined) (updates as any)[key] = req.body[key];
    }

    const [updated] = await db.update(agentsTable).set({ ...updates, updatedAt: new Date() }).where(eq(agentsTable.slug, "ralph")).returning();
    res.json({
      freeSlotCapacity:        updated.freeSlotCapacity,
      paidSlotCapacity:        updated.paidSlotCapacity,
      freeSlotWeight:          updated.freeSlotWeight,
      paidSlotWeight:          updated.paidSlotWeight,
      slotDurationHours:       updated.slotDurationHours,
      dailyCap:                updated.dailyCap,
      fallbackUrl:             updated.fallbackUrl || "",
      isPaused:                updated.isPaused,
      leadApprovalMode:        updated.leadApprovalMode,
      nftMintEnabled:          updated.nftMintEnabled,
      paidSlotPrice:           updated.paidSlotPrice,
      nftReferralThreshold:    updated.nftReferralThreshold,
      nftViralThreshold:       updated.nftViralThreshold,
      botOpsSweepThresholdUsd: updated.botOpsSweepThresholdUsd,
      protocolWalletAddress:   updated.protocolWalletAddress || "",
      adminWalletAddress:      updated.adminWalletAddress || "",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Rotator ──────────────────────────────────────────────────────────────────

router.get("/admin/rotator", requireAdmin, async (req, res) => {
  try {
    const now   = new Date();
    const slots = await db.select({
      slot: rotatorSlotsTable,
      user: { id: usersTable.id, email: usersTable.email, slug: usersTable.slug },
    }).from(rotatorSlotsTable)
      .innerJoin(usersTable, eq(rotatorSlotsTable.userId, usersTable.id))
      .where(and(eq(rotatorSlotsTable.status, "active"), gt(rotatorSlotsTable.expiresAt, now)));

    res.json({
      slots: slots.map(s => ({
        id:         s.slot.id,
        userId:     s.slot.userId,
        userEmail:  s.user.email,
        userSlug:   s.user.slug,
        slotType:   s.slot.slotType,
        status:     s.slot.status,
        expiresAt:  s.slot.expiresAt,
        clickCount: s.slot.clickCount,
      })),
      totalActive: slots.length,
      totalFree:   slots.filter(s => s.slot.slotType === "free").length,
      totalPaid:   slots.filter(s => s.slot.slotType === "paid").length,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/rotator/:slotId/expire", requireAdmin, async (req, res) => {
  try {
    await db.update(rotatorSlotsTable).set({ status: "expired", expiredAt: new Date() }).where(eq(rotatorSlotsTable.id, req.params.slotId));
    res.json({ success: true, message: "Slot expired" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Users ────────────────────────────────────────────────────────────────────

router.get("/admin/users", requireAdmin, async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, parseInt(req.query.limit as string) || 20);
    const now   = new Date();

    const users = await db.select().from(usersTable).limit(limit).offset((page - 1) * limit);
    const total = await db.select({ count: count() }).from(usersTable).then(r => Number(r[0]?.count ?? 0));

    const enriched = await Promise.all(users.map(async (user) => {
      const [offerSignupCount, activeSlots, referralCount, walletLinks, referrer] = await Promise.all([
        db.select({ count: count() }).from(offerSignupsTable).where(eq(offerSignupsTable.userId, user.id)).then(r => Number(r[0]?.count ?? 0)),
        db.select({ count: count() }).from(rotatorSlotsTable).where(and(eq(rotatorSlotsTable.userId, user.id), eq(rotatorSlotsTable.status, "active"), gt(rotatorSlotsTable.expiresAt, now))).then(r => Number(r[0]?.count ?? 0)),
        db.select({ count: count() }).from(usersTable).where(eq(usersTable.referredById, user.id)).then(r => Number(r[0]?.count ?? 0)),
        db.select({ url: personalRotatorLinksTable.url, displayName: personalRotatorLinksTable.displayName, linkType: personalRotatorLinksTable.linkType })
          .from(personalRotatorLinksTable)
          .where(and(eq(personalRotatorLinksTable.userId, user.id), eq(personalRotatorLinksTable.isActive, true)))
          .limit(5),
        // Resolve the referrer's slug + wallet so we can track slug→wallet chain
        user.referredById
          ? db.select({ slug: usersTable.slug, walletAddress: usersTable.walletAddress, email: usersTable.email })
              .from(usersTable).where(eq(usersTable.id, user.referredById)).limit(1).then(r => r[0] ?? null)
          : Promise.resolve(null),
      ]);
      return {
        id: user.id, email: user.email, slug: user.slug, displayName: user.displayName,
        role: user.role, createdAt: user.createdAt, roleLabel: user.roleLabel,
        walletAddress: user.walletAddress ?? null, walletStatus: user.walletStatus,
        referralCode: user.referralCode,
        offerSignupCount, activeSlots, referralCount,
        walletLinks,
        primaryWalletUrl: walletLinks[0]?.url ?? null,
        // Referral attribution chain: slug → referrer wallet
        referredBy: referrer ? {
          slug:          referrer.slug,
          email:         referrer.email,
          walletAddress: referrer.walletAddress ?? null,
        } : null,
      };
    }));

    res.json({ users: enriched, total });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Leads ────────────────────────────────────────────────────────────────────

router.get("/admin/leads", requireAdmin, async (req, res) => {
  try {
    const status = req.query.status as string | undefined;
    let query = db.select().from(leadsTable);
    if (status) query = query.where(eq(leadsTable.status, status)) as typeof query;

    const leads = await query.limit(50);
    const total = await db.select({ count: count() }).from(leadsTable).then(r => Number(r[0]?.count ?? 0));

    res.json({
      leads: leads.map(l => ({
        id:             l.id,
        source:         l.source,
        externalId:     l.externalId,
        content:        l.content,
        authorHandle:   l.authorHandle,
        postUrl:        l.postUrl,
        status:         l.status,
        score:          l.score,
        scoreReason:    l.scoreReason,
        scoreDetails:   l.scoreDetails ? (() => { try { return JSON.parse(l.scoreDetails!); } catch { return null; } })() : null,
        replyStyle:     l.replyStyle,
        draft:          l.draft,
        rejectedReason: l.rejectedReason,
        postedAt:       l.postedAt,
        rejectedAt:     l.rejectedAt,
        createdAt:      l.createdAt,
        updatedAt:      l.updatedAt,
      })),
      total,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Ralph ────────────────────────────────────────────────────────────────────

router.get("/admin/ralph/status", requireAdmin, async (req, res) => {
  try {
    const [moltis, leadCounts] = await Promise.all([
      moltisStatusWithUsage(),
      db.select({ status: leadsTable.status, count: count() }).from(leadsTable).groupBy(leadsTable.status),
    ]);
    res.json({
      moltis,
      leads: Object.fromEntries(leadCounts.map(r => [r.status, Number(r.count)])),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/admin/usage", requireAdmin, async (req, res) => {
  try {
    res.json(await getDailyUsage());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/ralph/run", requireAdmin, async (req, res) => {
  try {
    const result = await runRalphLoop();
    res.json({ success: true, ...result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Ralph Brain Memory ────────────────────────────────────────────────────────

const RALPH_BRAIN_SYSTEM = `You are Ralph Brain — the optimization and learning engine for a referral-powered AI-agent lead generation platform called Plunder & Riffle.

Your ONLY job is to analyze performance data, extract patterns, and output a structured JSON memory update. 

Respond with ONLY a valid JSON object — no markdown, no explanation.

JSON shape:
{
  "report": "string — concise deadpan 3-5 sentence performance summary",
  "topHooks": [{"text": "...", "score": 8, "tag": "WINNER", "reason": "..."}],
  "failedHooks": [{"text": "...", "tag": "KILL", "reason": "..."}],
  "bestPersonas": [{"name": "...", "reason": "..."}],
  "weakPersonas": [{"name": "...", "reason": "..."}],
  "bestPlatforms": [{"platform": "...", "reason": "..."}],
  "weakPlatforms": [{"platform": "...", "reason": "..."}],
  "bestCTAs": [{"text": "...", "reason": "..."}],
  "weakCTAs": [{"text": "...", "reason": "..."}],
  "recurringObjections": [{"objection": "...", "frequency": "...", "counter": "..."}],
  "provenPatterns": ["..."],
  "currentHypotheses": ["Hypothesis: If we [X], then [Y] because [Z]"],
  "nextExperiments": ["..."]
}

Tone: deadpan. Precise. Actionable. No filler. If data is limited, say so in the report and make conservative pattern calls.`;

router.get("/admin/ralph/brain-memory", requireAdmin, async (req, res) => {
  try {
    const memory = await db.select().from(ralphBrainMemoryTable).limit(1).then(r => r[0] ?? null);
    res.json({ ok: true, memory });
  } catch (err) {
    console.error("[brain-memory]", err);
    res.status(500).json({ error: "Failed to fetch brain memory" });
  }
});

router.post("/admin/ralph/brain-run", requireAdmin, async (req, res) => {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Gather last 7 days of data
    const [leadCounts, recentLeads, recentPosts, agentList] = await Promise.all([
      db.select({ status: leadsTable.status, count: count() })
        .from(leadsTable).groupBy(leadsTable.status),
      db.select({ platform: leadsTable.source, niche: leadsTable.niche, score: leadsTable.score, status: leadsTable.status, content: leadsTable.content })
        .from(leadsTable).where(gte(leadsTable.createdAt, sevenDaysAgo))
        .orderBy(desc(leadsTable.createdAt)).limit(50),
      db.select({ platform: agentEnginePostsTable.platform, postType: agentEnginePostsTable.postType, status: agentEnginePostsTable.status, content: agentEnginePostsTable.content })
        .from(agentEnginePostsTable).where(gte(agentEnginePostsTable.createdAt, sevenDaysAgo))
        .orderBy(desc(agentEnginePostsTable.createdAt)).limit(40),
      db.select({ slug: agentsTable.slug, name: agentsTable.name, totalClicks: agentsTable.totalClicks, totalSignups: agentsTable.totalSignups, engineEnabled: agentsTable.engineEnabled })
        .from(agentsTable).where(eq(agentsTable.isActive, true)),
    ]);

    // Existing memory for continuity
    const existingMemory = await db.select().from(ralphBrainMemoryTable).limit(1).then(r => r[0] ?? null);

    const leadBreakdown = Object.fromEntries(leadCounts.map(r => [r.status, Number(r.count)]));
    const platformPostCounts: Record<string, number> = {};
    for (const p of recentPosts) {
      platformPostCounts[p.platform] = (platformPostCounts[p.platform] ?? 0) + 1;
    }

    const userPrompt = `## PERFORMANCE DATA (last 7 days)

### Lead Pipeline
${JSON.stringify(leadBreakdown, null, 2)}

### Recent Leads Sample (${recentLeads.length} leads)
${recentLeads.slice(0, 15).map(l => `- [${l.status}] score=${l.score ?? "?"} platform=${l.platform ?? "?"} niche="${l.niche ?? "?"}" | "${(l.content ?? "").slice(0, 120)}"`).join("\n")}

### Engine Posts by Platform
${JSON.stringify(platformPostCounts, null, 2)}

### Recent Post Samples (${recentPosts.length} posts)
${recentPosts.slice(0, 10).map(p => `- [${p.platform}/${p.postType}] status=${p.status}: "${(p.content ?? "").slice(0, 150)}"`).join("\n")}

### Active Agents
${agentList.map(a => `${a.name} (${a.slug}): clicks=${a.totalClicks} signups=${a.totalSignups} engine=${a.engineEnabled}`).join("\n")}

### Previous Memory (for continuity)
${existingMemory ? `Top hooks: ${existingMemory.topHooks ?? "none"}\nHypotheses: ${existingMemory.currentHypotheses ?? "none"}` : "No prior memory — first run."}

Analyze this data. Fill all memory fields. Generate at least 3 hypotheses and 3 next experiments.`;

    const raw = await chatOnce(RALPH_BRAIN_SYSTEM, userPrompt, 0.4, { agentId: "system", task: "ralph_brain" });
    const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned);

    const memoryUpdate = {
      topHooks: JSON.stringify(parsed.topHooks ?? []),
      failedHooks: JSON.stringify(parsed.failedHooks ?? []),
      bestPersonas: JSON.stringify(parsed.bestPersonas ?? []),
      weakPersonas: JSON.stringify(parsed.weakPersonas ?? []),
      bestPlatforms: JSON.stringify(parsed.bestPlatforms ?? []),
      weakPlatforms: JSON.stringify(parsed.weakPlatforms ?? []),
      bestCTAs: JSON.stringify(parsed.bestCTAs ?? []),
      weakCTAs: JSON.stringify(parsed.weakCTAs ?? []),
      recurringObjections: JSON.stringify(parsed.recurringObjections ?? []),
      provenPatterns: JSON.stringify(parsed.provenPatterns ?? []),
      currentHypotheses: JSON.stringify(parsed.currentHypotheses ?? []),
      nextExperiments: JSON.stringify(parsed.nextExperiments ?? []),
      lastReport: parsed.report ?? "",
      lastRunAt: new Date(),
      updatedAt: new Date(),
    };

    if (existingMemory) {
      await db.update(ralphBrainMemoryTable).set(memoryUpdate).where(eq(ralphBrainMemoryTable.id, existingMemory.id));
    } else {
      await db.insert(ralphBrainMemoryTable).values(memoryUpdate);
    }

    console.log("[ralph-brain] memory updated");
    res.json({ ok: true, memory: memoryUpdate, report: parsed.report });
  } catch (err: any) {
    console.error("[ralph-brain] error:", err?.message);
    res.status(500).json({ error: "Brain run failed", detail: err?.message });
  }
});

// ─── Experiments ──────────────────────────────────────────────────────────────

router.get("/admin/experiments", requireAdmin, async (req, res) => {
  try {
    const rows = await db.select().from(experimentsTable).orderBy(desc(experimentsTable.createdAt));
    const enriched = rows.map(r => {
      const scored = scoreExperiment({
        impressions: r.impressions, clicks: r.clicks, replies: r.replies,
        dms: r.dms, leads: r.leads, qualifiedLeads: r.qualifiedLeads,
      });
      return { ...r, score: scored.score, decision: scored.decision, breakdown: scored.breakdown, rates: funnelRates(r) };
    });
    res.json({ ok: true, experiments: enriched });
  } catch (err) {
    console.error("[experiments] GET error:", err);
    res.status(500).json({ error: "Failed to fetch experiments" });
  }
});

router.post("/admin/experiments", requireAdmin, async (req, res) => {
  try {
    const { hook, type, platform, cta, agentSlug, impressions, clicks, replies, dms, leads, qualifiedLeads, notes } = req.body;
    if (!hook?.trim()) { res.status(400).json({ error: "hook is required" }); return; }
    const [row] = await db.insert(experimentsTable).values({
      hook: hook.trim(), type: type ?? "pain", platform: platform ?? "X",
      cta: cta ?? "DM AI", agentSlug: agentSlug ?? null,
      impressions: impressions ?? 0, clicks: clicks ?? 0, replies: replies ?? 0,
      dms: dms ?? 0, leads: leads ?? 0, qualifiedLeads: qualifiedLeads ?? 0,
      notes: notes ?? null,
    }).returning();
    const scored = scoreExperiment(row);
    res.json({ ok: true, experiment: { ...row, score: scored.score, decision: scored.decision } });
  } catch (err) {
    console.error("[experiments] POST error:", err);
    res.status(500).json({ error: "Failed to create experiment" });
  }
});

router.put("/admin/experiments/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const allowed = ["hook","type","platform","cta","agentSlug","impressions","clicks","replies","dms","leads","qualifiedLeads","status","notes"] as const;
    const updates: Record<string, any> = { updatedAt: new Date() };
    for (const key of allowed) if (req.body[key] !== undefined) updates[key] = req.body[key];
    const [row] = await db.update(experimentsTable).set(updates).where(eq(experimentsTable.id, id)).returning();
    if (!row) { res.status(404).json({ error: "Experiment not found" }); return; }
    const scored = scoreExperiment(row);
    res.json({ ok: true, experiment: { ...row, score: scored.score, decision: scored.decision, breakdown: scored.breakdown, rates: funnelRates(row) } });
  } catch (err) {
    console.error("[experiments] PUT error:", err);
    res.status(500).json({ error: "Failed to update experiment" });
  }
});

router.delete("/admin/experiments/:id", requireAdmin, async (req, res) => {
  try {
    await db.delete(experimentsTable).where(eq(experimentsTable.id, req.params.id));
    res.json({ ok: true });
  } catch (err) {
    console.error("[experiments] DELETE error:", err);
    res.status(500).json({ error: "Failed to delete experiment" });
  }
});

// ─── Sports Tips ───────────────────────────────────────────────────────────────

router.post("/admin/sports-tips/run", requireAdmin, async (req, res) => {
  try {
    const result = await runSportsTipsEngine("admin");
    res.json({ success: true, ...result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/sports-tips/ping", requireAdmin, async (req, res) => {
  try {
    const ok = await pingTelegram();
    res.json({ success: ok });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Lead actions ─────────────────────────────────────────────────────────────

router.post("/admin/leads/:id/approve", requireAdmin, async (req, res) => {
  try {
    const ok = await approveLead(req.params.id);
    ok ? res.json({ success: true }) : res.status(404).json({ error: "Lead not found or not in approvable state" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/leads/:id/reject", requireAdmin, async (req, res) => {
  try {
    const reason = (req.body?.reason as string) || "Rejected by admin";
    const ok = await ralphRejectLead(req.params.id, reason);
    ok ? res.json({ success: true }) : res.status(404).json({ error: "Lead not found" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/leads/:id/mark-posted", requireAdmin, async (req, res) => {
  try {
    const ok = await markLeadPosted(req.params.id);
    ok ? res.json({ success: true }) : res.status(404).json({ error: "Lead not found or not in approved state" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Trigger the DM sequence for a lead (approval-first gate)
router.post("/admin/leads/:id/trigger-dm", requireAdmin, async (req, res) => {
  try {
    const result = await triggerDmForLead(req.params.id);
    result.success
      ? res.json({ success: true, stepsQueued: result.stepsQueued })
      : res.status(400).json({ success: false, error: result.error });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Funnel attribution ───────────────────────────────────────────────────────

router.get("/admin/funnel", requireAdmin, async (req, res) => {
  try {
    const [summary, recentEvents] = await Promise.all([
      getFunnelSummary(),
      getRecentEvents(60),
    ]);
    res.json({ summary, recentEvents });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── DM queue ─────────────────────────────────────────────────────────────────

router.get("/admin/dm-queue", requireAdmin, async (req, res) => {
  try {
    const status = req.query.status as string | undefined;
    const queue  = await getDmQueue(status);
    res.json({ queue, total: queue.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/dm-sends/:dmSendId/mark-sent", requireAdmin, async (req, res) => {
  try {
    const ok = await markDmSent(req.params.dmSendId);
    ok ? res.json({ success: true }) : res.status(404).json({ error: "DM send not found or already sent" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/dm-sends/:dmSendId/cancel", requireAdmin, async (req, res) => {
  try {
    const ok = await cancelDmSend(req.params.dmSendId);
    ok ? res.json({ success: true }) : res.status(404).json({ error: "DM send not found or not queued" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── DM sequences ─────────────────────────────────────────────────────────────

router.get("/admin/dm-sequences", requireAdmin, async (req, res) => {
  try {
    const sequences = await getAllSequences();
    res.json({
      sequences: sequences.map(s => ({
        id:        s.id,
        name:      s.name,
        agentSlug: s.agentSlug,
        steps:     (() => { try { return JSON.parse(s.steps); } catch { return []; } })(),
        isActive:  s.isActive,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/admin/dm-sequences/:id", requireAdmin, async (req, res) => {
  try {
    const { name, steps } = req.body;
    if (!name || !Array.isArray(steps)) {
      res.status(400).json({ error: "name and steps[] required" });
      return;
    }
    const result = await upsertSequence(req.params.id === "new" ? null : req.params.id, name, steps);
    res.json({ success: true, id: result.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Agent Fleet Management ────────────────────────────────────────────────────

router.get("/admin/agents-fleet", requireAdmin, async (req, res) => {
  try {
    const adminUser = (req as any).user;
    const agents = await db.select().from(agentsTable);
    const now = new Date();
    const enriched = await Promise.all(agents.map(async (agent) => {
      const [freeSlots, paidSlots] = await Promise.all([
        db.select({ count: count() }).from(rotatorSlotsTable).where(
          and(eq(rotatorSlotsTable.agentId, agent.id), eq(rotatorSlotsTable.slotType, "free"),
              eq(rotatorSlotsTable.status, "active"), gt(rotatorSlotsTable.expiresAt, now))
        ).then(r => Number(r[0]?.count ?? 0)),
        db.select({ count: count() }).from(rotatorSlotsTable).where(
          and(eq(rotatorSlotsTable.agentId, agent.id), eq(rotatorSlotsTable.slotType, "paid"),
              eq(rotatorSlotsTable.status, "active"), gt(rotatorSlotsTable.expiresAt, now))
        ).then(r => Number(r[0]?.count ?? 0)),
      ]);
      return {
        id: agent.id, slug: agent.slug, name: agent.name, description: agent.description,
        persona: agent.persona, avatarUrl: agent.avatarUrl,
        twitterHandle: agent.twitterHandle, linkedinUrl: agent.linkedinUrl,
        composioEntityId: agent.composioEntityId, icpContext: agent.icpContext,
        isActive: agent.isActive, isPaused: agent.isPaused,
        freeSlotCapacity: agent.freeSlotCapacity, paidSlotCapacity: agent.paidSlotCapacity,
        activeFreeSlots: freeSlots, activePaidSlots: paidSlots,
        dailyCap: agent.dailyCap, dailyLeadCount: agent.dailyLeadCount,
        totalClicks: agent.totalClicks, totalSignups: agent.totalSignups,
        paidSlotPrice: agent.paidSlotPrice, slotDurationHours: agent.slotDurationHours,
        leadApprovalMode: agent.leadApprovalMode, offerUrl: agent.offerUrl,
        fallbackUrl: agent.fallbackUrl, createdAt: agent.createdAt,
        nftMintEnabled: agent.nftMintEnabled, nftMintedAt: agent.nftMintedAt, nftTokenId: agent.nftTokenId,
        cdpWalletId: agent.cdpWalletId, cdpWalletAddress: agent.cdpWalletAddress,
        cdpWalletNetwork: agent.cdpWalletNetwork, cdpWalletCreatedAt: agent.cdpWalletCreatedAt,
        characterName: agent.characterName, characterStyle: agent.characterStyle,
        characterImageUrl: agent.characterImageUrl, characterPrompt: agent.characterPrompt,
        discordWebhookUrl: agent.discordWebhookUrl,
        engineEnabled: agent.engineEnabled, engineLastRunAt: agent.engineLastRunAt, engineNextRunAt: agent.engineNextRunAt,
        botOpsSweepThresholdUsd: agent.botOpsSweepThresholdUsd,
        ownerId: agent.ownerId,
        ownsAgent: adminUser?.id ? agent.ownerId === adminUser.id : false,
      };
    }));
    res.json({ agents: enriched, cdpConfigured: isCDPConfigured() });
  } catch (err) { console.error(err); res.status(500).json({ error: "Internal server error" }); }
});

router.post("/admin/agents", requireAdmin, async (req, res) => {
  try {
    const {
      slug, name, description, offerUrl,
      freeSlotCapacity, paidSlotCapacity, slotDurationHours, dailyCap, paidSlotPrice, email,
      persona, icpContext, postTemplates, characterPrompt, twitterHandle,
    } = req.body;
    if (!slug || !name || !offerUrl) { res.status(400).json({ error: "slug, name, offerUrl required" }); return; }

    // Ensure slug is unique by appending suffix if needed
    let finalSlug = slug.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/^-+|-+$/g, "");
    const existing = await db.select({ id: agentsTable.id }).from(agentsTable).where(eq(agentsTable.slug, finalSlug)).limit(1).then(r => r[0]);
    if (existing) finalSlug = `${finalSlug}-${Math.random().toString(36).slice(2, 5)}`;

    const adminUser = (req as any).user;
    const [agent] = await db.insert(agentsTable).values({
      slug: finalSlug,
      name, description: description || null, offerUrl,
      freeSlotCapacity: freeSlotCapacity || 25, paidSlotCapacity: paidSlotCapacity || 25,
      slotDurationHours: slotDurationHours || 24, dailyCap: dailyCap || 100, paidSlotPrice: paidSlotPrice || 9.99,
      persona: persona || null,
      icpContext: icpContext || null,
      postTemplates: postTemplates || null,
      characterPrompt: characterPrompt || null,
      twitterHandle: twitterHandle || null,
      ownerId: adminUser?.id ?? null,
    }).returning();

    // Wallet is provisioned asynchronously by the background worker (every 5 min).
    // Avoids CDP rate-limit errors caused by inline creation at request time.
    if (isCDPConfigured()) {
      console.log(`[cdp] agent ${agent.slug} queued for wallet provisioning (background worker)`);
    }

    res.json({ success: true, agent, walletProvisioned: false, walletPending: isCDPConfigured() });
  } catch (err: any) {
    if (err.code === "23505") { res.status(400).json({ error: "Agent slug already exists" }); return; }
    console.error(err); res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/admin/agents/:id", requireAdmin, async (req, res) => {
  try {
    const agent = await db.select().from(agentsTable).where(eq(agentsTable.id, req.params.id)).limit(1).then(r => r[0]);
    if (!agent) { res.status(404).json({ error: "Agent not found" }); return; }
    const allowed = [
      "name","description","offerUrl","fallbackUrl","freeSlotCapacity","paidSlotCapacity",
      "slotDurationHours","dailyCap","paidSlotPrice","leadApprovalMode","isPaused","isActive",
      "persona","icpContext","postTemplates","characterPrompt","twitterHandle",
      "engineEnabled","engineScheduleHours","avatarUrl","discordWebhookUrl","botOpsSweepThresholdUsd",
    ];
    const updates: any = {};
    for (const key of allowed) { if (req.body[key] !== undefined) updates[key] = req.body[key]; }
    const [updated] = await db.update(agentsTable).set({ ...updates, updatedAt: new Date() })
      .where(eq(agentsTable.id, req.params.id)).returning();
    res.json({ success: true, agent: updated });
  } catch (err) { console.error(err); res.status(500).json({ error: "Internal server error" }); }
});

router.post("/admin/agents/:id/toggle-pause", requireAdmin, async (req, res) => {
  try {
    const agent = await db.select().from(agentsTable).where(eq(agentsTable.id, req.params.id)).limit(1).then(r => r[0]);
    if (!agent) { res.status(404).json({ error: "Agent not found" }); return; }
    const [updated] = await db.update(agentsTable).set({ isPaused: !agent.isPaused, updatedAt: new Date() })
      .where(eq(agentsTable.id, req.params.id)).returning();
    res.json({ success: true, isPaused: updated.isPaused });
  } catch (err) { console.error(err); res.status(500).json({ error: "Internal server error" }); }
});

router.delete("/admin/agents/:id", requireAdmin, async (req, res) => {
  try {
    const agent = await db.select().from(agentsTable).where(eq(agentsTable.id, req.params.id)).limit(1).then(r => r[0]);
    if (!agent) { res.status(404).json({ error: "Agent not found" }); return; }
    if (agent.slug === "ralph") { res.status(400).json({ error: "Cannot delete the main agent" }); return; }
    await db.delete(agentsTable).where(eq(agentsTable.id, req.params.id));
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: "Internal server error" }); }
});

// ─── Agent Ownership & Wallet Provisioning ────────────────────────────────────

const ADMIN_OWNER_EMAIL = "dnamovich@gmail.com";

/** Claim all ownerless agents for the platform admin (dnamovich@gmail.com) */
router.post("/admin/agents/claim-all", requireAdmin, async (req, res) => {
  try {
    const admin = await db.select({ id: usersTable.id }).from(usersTable)
      .where(eq(usersTable.email, ADMIN_OWNER_EMAIL)).limit(1).then(r => r[0]);
    if (!admin) return res.status(404).json({ error: `Admin user ${ADMIN_OWNER_EMAIL} not found` });

    const result = await db.update(agentsTable)
      .set({ ownerId: admin.id, updatedAt: new Date() })
      .where(eq(agentsTable.ownerId, null as any));

    res.json({ ok: true, message: `All ownerless agents claimed by ${ADMIN_OWNER_EMAIL}` });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

/** Transfer an agent to another user by email */
router.post("/admin/agents/:id/transfer", requireAdmin, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "email required" });

    const [agent, newOwner] = await Promise.all([
      db.select({ id: agentsTable.id, slug: agentsTable.slug })
        .from(agentsTable).where(eq(agentsTable.id, req.params.id)).limit(1).then(r => r[0]),
      db.select({ id: usersTable.id, email: usersTable.email })
        .from(usersTable).where(eq(usersTable.email, email)).limit(1).then(r => r[0]),
    ]);

    if (!agent) return res.status(404).json({ error: "Agent not found" });
    if (!newOwner) return res.status(404).json({ error: `User ${email} not found` });

    await db.update(agentsTable)
      .set({ ownerId: newOwner.id, updatedAt: new Date() })
      .where(eq(agentsTable.id, req.params.id));

    res.json({ ok: true, message: `Agent ${agent.slug} transferred to ${newOwner.email}` });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

/** Provision CDP wallets for all agents that don't have one (sequential, 1/s to avoid rate limit) */
router.post("/admin/agents/provision-all-wallets", requireAdmin, async (req, res) => {
  try {
    if (!isCDPConfigured()) return res.status(503).json({ error: "CDP not configured" });

    const agents = await db.select({
      id: agentsTable.id, slug: agentsTable.slug, cdpWalletId: agentsTable.cdpWalletId,
    }).from(agentsTable);

    const needsWallet = agents.filter(a => !a.cdpWalletId);

    if (needsWallet.length === 0) {
      return res.json({ ok: true, message: "All agents already have wallets", provisioned: 0 });
    }

    // Respond immediately — provision in background
    res.json({ ok: true, message: `Provisioning wallets for ${needsWallet.length} agent(s) in background`, provisioning: needsWallet.map(a => a.slug) });

    // Background loop — queue serializes all creation calls with a 70s cool-down
    for (const agent of needsWallet) {
      try {
        const wallet = await createAgentWallet("base-mainnet", agent.slug);
        await db.update(agentsTable).set({
          cdpWalletId: wallet.walletId,
          cdpWalletAddress: wallet.address,
          cdpWalletNetwork: wallet.network,
          cdpWalletSeed: wallet.seed ?? null,
          cdpWalletCreatedAt: new Date(),
          updatedAt: new Date(),
        }).where(eq(agentsTable.id, agent.id));
        console.log(`[cdp] provisioned wallet for agent ${agent.slug}: ${wallet.address}`);
      } catch (e: any) {
        console.error(`[cdp] failed to provision wallet for ${agent.slug}:`, e?.message);
      }
    }
  } catch (err: any) {
    if (!res.headersSent) res.status(500).json({ error: err?.message });
  }
});

// POST /api/admin/agents/:id/create-wallet — manually provision wallet for a single agent
router.post("/admin/agents/:id/create-wallet", requireAdmin, async (req, res) => {
  try {
    if (!isCDPConfigured()) { res.status(503).json({ error: "CDP not configured — set CDP_KEY_ID and CDP_API_KEY" }); return; }

    const agent = await db.select({
      id: agentsTable.id, slug: agentsTable.slug, name: agentsTable.name,
      cdpWalletId: agentsTable.cdpWalletId, cdpWalletAddress: agentsTable.cdpWalletAddress,
    }).from(agentsTable).where(eq(agentsTable.id, req.params.id)).limit(1).then(r => r[0]);

    if (!agent) { res.status(404).json({ error: "Agent not found" }); return; }
    if (agent.cdpWalletId) {
      res.json({ ok: true, message: "Wallet already exists", address: agent.cdpWalletAddress });
      return;
    }

    console.log(`[cdp] manual wallet creation for agent ${agent.slug} (${agent.id})`);
    const wallet = await createAgentWallet("base-mainnet", `${agent.name} [${agent.slug}]`);

    await db.update(agentsTable).set({
      cdpWalletId: wallet.walletId,
      cdpWalletAddress: wallet.address,
      cdpWalletNetwork: wallet.network,
      cdpWalletSeed: wallet.seed ?? null,
      cdpWalletCreatedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(agentsTable.id, agent.id));

    console.log(`[cdp] wallet created for agent ${agent.slug}: ${wallet.address}`);
    res.json({ ok: true, address: wallet.address, walletId: wallet.walletId, network: wallet.network });
  } catch (err: any) {
    const isRateLimit = err?.httpCode === 429 || err?.apiCode === "resource_exhausted";
    console.error(`[cdp] wallet creation failed for agent ${req.params.id}:`, err?.message);
    res.status(isRateLimit ? 429 : 500).json({
      error: isRateLimit ? "CDP rate limit hit. The system will retry automatically — wait 60s and try again." : (err?.message ?? "Wallet creation failed"),
      retryAfter: isRateLimit ? 60 : undefined,
    });
  }
});

// ─── Agent Assistants ─────────────────────────────────────────────────────────

// GET /api/admin/agents/:id/assistants
router.get("/admin/agents/:id/assistants", requireAdmin, async (req, res) => {
  try {
    const rows = await db
      .select({ assistant: agentAssistantsTable, user: usersTable })
      .from(agentAssistantsTable)
      .innerJoin(usersTable, eq(agentAssistantsTable.userId, usersTable.id))
      .where(eq(agentAssistantsTable.agentId, req.params.id));
    res.json({
      assistants: rows.map(r => ({
        id: r.assistant.id,
        userId: r.user.id,
        email: r.user.email,
        displayName: r.user.displayName,
        slug: r.user.slug,
        addedAt: r.assistant.addedAt,
      })),
    });
  } catch (err) { console.error(err); res.status(500).json({ error: "Internal server error" }); }
});

// POST /api/admin/agents/:id/assistants — add by email (creates user if needed)
router.post("/admin/agents/:id/assistants", requireAdmin, async (req, res) => {
  try {
    const agent = await db.select().from(agentsTable).where(eq(agentsTable.id, req.params.id)).limit(1).then(r => r[0]);
    if (!agent) { res.status(404).json({ error: "Agent not found" }); return; }

    const { email } = req.body;
    if (!email || typeof email !== "string" || !email.includes("@")) {
      res.status(400).json({ error: "Valid email required" }); return;
    }
    const normalizedEmail = email.toLowerCase().trim();

    // Find or create the user
    let user = await db.select().from(usersTable).where(eq(usersTable.email, normalizedEmail)).limit(1).then(r => r[0]);
    if (!user) {
      // Create a placeholder user so they can log in later
      const { generateReferralCode } = await import("../lib/slugify.js");
      const slug = normalizedEmail.split("@")[0].replace(/[^a-z0-9]/g, "") + Math.random().toString(36).slice(2, 5);
      const [newUser] = await db.insert(usersTable).values({
        email: normalizedEmail,
        slug,
        displayName: normalizedEmail.split("@")[0],
        referralCode: generateReferralCode(),
      }).returning();
      user = newUser;
    }

    // Prevent duplicate
    const existing = await db.select().from(agentAssistantsTable)
      .where(and(eq(agentAssistantsTable.agentId, agent.id), eq(agentAssistantsTable.userId, user.id)))
      .limit(1).then(r => r[0]);
    if (existing) { res.status(409).json({ error: "Already an assistant of this agent" }); return; }

    const [row] = await db.insert(agentAssistantsTable).values({
      agentId: agent.id,
      userId: user.id,
    }).returning();

    res.json({
      ok: true,
      assistant: {
        id: row.id,
        userId: user.id,
        email: user.email,
        displayName: user.displayName,
        slug: user.slug,
        addedAt: row.addedAt,
      },
    });
  } catch (err: any) {
    if (err.code === "23505") { res.status(409).json({ error: "Already an assistant" }); return; }
    console.error(err); res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/admin/agents/:id/assistants/:assistantId
router.delete("/admin/agents/:id/assistants/:assistantId", requireAdmin, async (req, res) => {
  try {
    await db.delete(agentAssistantsTable).where(
      and(eq(agentAssistantsTable.id, req.params.assistantId), eq(agentAssistantsTable.agentId, req.params.id))
    );
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: "Internal server error" }); }
});

// ─── Agent Character ───────────────────────────────────────────────────────────

// PUT /api/admin/agents/:id/character — set UGC character
router.put("/admin/agents/:id/character", requireAdmin, async (req, res) => {
  try {
    const agent = await db.select().from(agentsTable).where(eq(agentsTable.id, req.params.id)).limit(1).then(r => r[0]);
    if (!agent) { res.status(404).json({ error: "Agent not found" }); return; }
    const { characterName, characterStyle, characterImageUrl, characterPrompt } = req.body;
    const [updated] = await db.update(agentsTable).set({
      characterName: characterName || null,
      characterStyle: characterStyle || null,
      characterImageUrl: characterImageUrl || null,
      characterPrompt: characterPrompt || null,
      updatedAt: new Date(),
    }).where(eq(agentsTable.id, req.params.id)).returning();
    res.json({ ok: true, characterName: updated.characterName, characterImageUrl: updated.characterImageUrl });
  } catch (err) { console.error(err); res.status(500).json({ error: "Internal server error" }); }
});

// ─── Agent Mint ────────────────────────────────────────────────────────────────

router.post("/admin/agents/:id/mint", requireAdmin, async (req, res) => {
  try {
    const agent = await db.select().from(agentsTable).where(eq(agentsTable.id, req.params.id)).limit(1).then(r => r[0]);
    if (!agent) { res.status(404).json({ error: "Agent not found" }); return; }

    // Toggle: if already minted, un-mint; otherwise enable minting
    const now = new Date();
    const wasMinted = agent.nftMintEnabled && agent.nftMintedAt;
    const [updated] = await db.update(agentsTable).set({
      nftMintEnabled: !wasMinted,
      nftMintedAt:    wasMinted ? null : now,
      nftTokenId:     wasMinted ? null : (agent.nftTokenId || `mint-${agent.id.slice(0, 8)}-${Date.now()}`),
      updatedAt:      now,
    }).where(eq(agentsTable.id, req.params.id)).returning();

    console.log(`[mint] agent ${agent.slug} nftMintEnabled=${updated.nftMintEnabled} token=${updated.nftTokenId}`);
    // TODO: call on-chain NFT contract via Privy server wallet API to mint real token

    res.json({
      success: true,
      nftMintEnabled: updated.nftMintEnabled,
      nftMintedAt:    updated.nftMintedAt,
      nftTokenId:     updated.nftTokenId,
      message: updated.nftMintEnabled
        ? `Agent ${agent.name} NFT minting enabled. Token: ${updated.nftTokenId}`
        : `Agent ${agent.name} NFT mint revoked.`,
    });
  } catch (err) { console.error(err); res.status(500).json({ error: "Internal server error" }); }
});

// ─── Wallet Management ─────────────────────────────────────────────────────────

router.get("/admin/wallets", requireAdmin, async (req, res) => {
  try {
    const users = await db.select({
      id: usersTable.id, email: usersTable.email, slug: usersTable.slug,
      displayName: usersTable.displayName, walletAddress: usersTable.walletAddress,
      walletStatus: usersTable.walletStatus, roleLabel: usersTable.roleLabel,
      cdpWalletId: usersTable.cdpWalletId, cdpWalletCreatedAt: usersTable.cdpWalletCreatedAt,
      createdAt: usersTable.createdAt,
    }).from(usersTable);

    res.json({
      wallets: users.map(u => ({
        ...u,
        walletStatus: u.walletStatus ?? "none",
        walletAddress: u.walletAddress ?? null,
      })),
      totalWithAddress: users.filter(u => u.walletAddress).length,
      totalPending: users.filter(u => u.walletStatus === "pending").length,
      totalActive: users.filter(u => u.walletStatus === "active").length,
    });
  } catch (err) { console.error(err); res.status(500).json({ error: "Internal server error" }); }
});

router.post("/admin/wallets/sweep", requireAdmin, async (req, res) => {
  try {
    const { userIds } = req.body;
    const ids: string[] = Array.isArray(userIds) ? userIds : [];
    console.log("[wallet-sweep] triggered for", ids.length, "wallets by admin", (req as any).user?.email);
    // TODO: integrate Privy server-side wallet API or on-chain provider to sweep balances
    res.json({
      success: true,
      swept: ids.length,
      message: ids.length
        ? `Sweep initiated for ${ids.length} wallet(s). Wire Privy server wallet API to execute.`
        : "No wallet IDs provided.",
    });
  } catch (err) { console.error(err); res.status(500).json({ error: "Internal server error" }); }
});

// ─── CDP Wallet — status, user wallets, agent wallets ─────────────────────────

router.get("/admin/cdp/status", requireAdmin, async (_req, res) => {
  res.json({ configured: isCDPConfigured() });
});

// Create CDP wallet for an existing user (manual provisioning from admin)
router.post("/admin/users/:id/cdp-wallet", requireAdmin, async (req, res) => {
  try {
    const user = await db.select().from(usersTable).where(eq(usersTable.id, req.params.id)).limit(1).then(r => r[0]);
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    if (user.cdpWalletId) {
      res.status(409).json({ error: "User already has a CDP wallet", walletId: user.cdpWalletId, address: user.walletAddress });
      return;
    }
    if (!isCDPConfigured()) {
      res.status(503).json({ error: "CDP credentials not configured on server" });
      return;
    }
    const { createUserWallet: createW } = await import("../lib/cdp.js");
    console.log(`[cdp] admin creating wallet for user ${user.email}…`);
    const wallet = await createW(user.email);
    const [updated] = await db.update(usersTable).set({
      walletAddress: wallet.address,
      walletStatus: "active",
      cdpWalletId: wallet.walletId,
      cdpWalletSeed: wallet.seed,
      cdpWalletCreatedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(usersTable.id, req.params.id)).returning();
    console.log(`[cdp] wallet created for ${user.email}: ${wallet.address}`);
    res.json({ success: true, address: updated.walletAddress, walletId: updated.cdpWalletId, network: wallet.network });
  } catch (err: any) {
    console.error("[cdp] user wallet error:", err);
    res.status(500).json({ error: err?.message ?? "Failed to create wallet" });
  }
});

router.post("/admin/agents/:id/cdp-wallet", requireAdmin, async (req, res) => {
  try {
    const agent = await db.select().from(agentsTable).where(eq(agentsTable.id, req.params.id)).limit(1).then(r => r[0]);
    if (!agent) { res.status(404).json({ error: "Agent not found" }); return; }
    if (agent.cdpWalletId) {
      res.status(409).json({ error: "Agent already has a CDP wallet", walletId: agent.cdpWalletId, address: agent.cdpWalletAddress });
      return;
    }
    if (!isCDPConfigured()) {
      res.status(503).json({ error: "CDP credentials not configured on server" });
      return;
    }

    const network = (req.body?.network as string) || "base-mainnet";
    console.log(`[cdp] creating wallet for agent ${agent.slug} on ${network}…`);
    const wallet = await createAgentWallet(network);

    const [updated] = await db.update(agentsTable).set({
      cdpWalletId: wallet.walletId,
      cdpWalletAddress: wallet.address,
      cdpWalletNetwork: wallet.network,
      cdpWalletSeed: wallet.seed,
      cdpWalletCreatedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(agentsTable.id, req.params.id)).returning();

    console.log(`[cdp] wallet created for ${agent.slug}: ${wallet.address}`);
    res.json({
      success: true,
      walletId: updated.cdpWalletId,
      address: updated.cdpWalletAddress,
      network: updated.cdpWalletNetwork,
      createdAt: updated.cdpWalletCreatedAt,
    });
  } catch (err: any) {
    console.error("[cdp] wallet creation error:", err?.apiCode ?? err?.message);
    const isRateLimit = err?.httpCode === 429 || err?.apiCode === "resource_exhausted";
    res.status(isRateLimit ? 429 : 500).json({
      error: isRateLimit
        ? "CDP rate limit exhausted after retries. Wait a few minutes before trying again."
        : (err?.message ?? "Failed to create CDP wallet"),
    });
  }
});

router.delete("/admin/agents/:id/cdp-wallet", requireAdmin, async (req, res) => {
  try {
    const agent = await db.select().from(agentsTable).where(eq(agentsTable.id, req.params.id)).limit(1).then(r => r[0]);
    if (!agent) { res.status(404).json({ error: "Agent not found" }); return; }
    await db.update(agentsTable).set({
      cdpWalletId: null, cdpWalletAddress: null, cdpWalletNetwork: "base-mainnet",
      cdpWalletSeed: null, cdpWalletCreatedAt: null, updatedAt: new Date(),
    }).where(eq(agentsTable.id, req.params.id));
    res.json({ success: true, message: "CDP wallet record cleared (on-chain wallet still exists)" });
  } catch (err) { console.error(err); res.status(500).json({ error: "Internal server error" }); }
});

// ─── Agent fleet wallet balances ──────────────────────────────────────────────

router.get("/admin/agent-wallets", requireAdmin, async (_req, res) => {
  try {
    const agents = await db.select({
      id: agentsTable.id, name: agentsTable.name, slug: agentsTable.slug,
      cdpWalletId: agentsTable.cdpWalletId, cdpWalletAddress: agentsTable.cdpWalletAddress,
      cdpWalletNetwork: agentsTable.cdpWalletNetwork, cdpWalletSeed: agentsTable.cdpWalletSeed,
      cdpWalletCreatedAt: agentsTable.cdpWalletCreatedAt,
    }).from(agentsTable).where(eq(agentsTable.isActive, true));

    const walleted = agents.filter(a => a.cdpWalletId && a.cdpWalletSeed);

    const walletData = await Promise.all(walleted.map(async (agent) => {
      const balances = await getWalletBalances(agent.cdpWalletSeed!);
      return {
        agentId: agent.id,
        agentName: agent.name,
        agentSlug: agent.slug,
        walletId: agent.cdpWalletId,
        address: agent.cdpWalletAddress,
        network: agent.cdpWalletNetwork ?? "base-mainnet",
        balances,
        createdAt: agent.cdpWalletCreatedAt,
      };
    }));

    res.json({
      wallets: walletData,
      totalAgents: agents.length,
      walletsProvisioned: walleted.length,
      walletsWithBalance: walletData.filter(w => w.balances.length > 0).length,
    });
  } catch (err) { console.error(err); res.status(500).json({ error: "Internal server error" }); }
});

// ─── Sweep agent wallets to treasury ─────────────────────────────────────────

router.post("/admin/agent-wallets/sweep", requireAdmin, async (req, res) => {
  const { agentIds, toAddress, assets } = req.body as {
    agentIds?: string[];
    toAddress: string;
    assets?: string[];
  };

  if (!toAddress) { res.status(400).json({ error: "toAddress required" }); return; }
  if (!isCDPConfigured()) { res.status(503).json({ error: "CDP not configured" }); return; }

  try {
    let query = db.select({
      id: agentsTable.id, name: agentsTable.name, slug: agentsTable.slug,
      cdpWalletSeed: agentsTable.cdpWalletSeed, cdpWalletAddress: agentsTable.cdpWalletAddress,
    }).from(agentsTable).where(eq(agentsTable.isActive, true));

    const agents = await query;
    const targets = (agentIds?.length
      ? agents.filter(a => agentIds.includes(a.id))
      : agents
    ).filter(a => a.cdpWalletSeed);

    console.log(`[cdp-sweep] initiated by admin — ${targets.length} wallets → ${toAddress}`);

    const results = await Promise.all(targets.map(async (agent) => {
      try {
        const { transfers } = await sweepWallet(agent.cdpWalletSeed!, toAddress, assets ?? ["eth", "usdc"]);
        return { agentId: agent.id, agentSlug: agent.slug, address: agent.cdpWalletAddress, transfers, ok: true };
      } catch (err: any) {
        return { agentId: agent.id, agentSlug: agent.slug, address: agent.cdpWalletAddress, transfers: [], ok: false, error: err?.message };
      }
    }));

    const swept = results.filter(r => r.ok && r.transfers.length > 0).length;
    res.json({ success: true, results, swept, total: targets.length });
  } catch (err: any) {
    console.error("[cdp-sweep] error:", err);
    res.status(500).json({ error: err?.message ?? "Sweep failed" });
  }
});

// ─── Per-agent comprehensive metrics ─────────────────────────────────────────

router.get("/admin/agents/:id/metrics", requireAdmin, async (req, res) => {
  try {
    const agent = await db.select().from(agentsTable).where(eq(agentsTable.id, req.params.id)).limit(1).then(r => r[0]);
    if (!agent) { res.status(404).json({ error: "Agent not found" }); return; }

    // Leads pipeline breakdown
    const leadCounts = await db
      .select({ status: leadsTable.status, count: count() })
      .from(leadsTable)
      .where(eq(leadsTable.agentId, req.params.id))
      .groupBy(leadsTable.status);

    const leadsByStatus = Object.fromEntries(leadCounts.map(r => [r.status, r.count]));
    const totalLeads = leadCounts.reduce((sum, r) => sum + r.count, 0);

    // Token usage
    const tokenStats = await db
      .select({
        task: agentTokenUsageTable.task,
        calls: count(agentTokenUsageTable.id),
        totalTokens: sql<number>`sum(${agentTokenUsageTable.totalTokens})::int`,
        totalLeads:  sql<number>`sum(${agentTokenUsageTable.leadsInBatch})::int`,
      })
      .from(agentTokenUsageTable)
      .where(eq(agentTokenUsageTable.agentId, req.params.id))
      .groupBy(agentTokenUsageTable.task);

    const totalTokens = tokenStats.reduce((sum, r) => sum + (r.totalTokens ?? 0), 0);

    // Wallet balance (if available)
    let walletBalances: any[] = [];
    if (agent.cdpWalletSeed) {
      walletBalances = await getWalletBalances(agent.cdpWalletSeed);
    }

    // Referral signups via this agent's rotator links
    const signupCount = await db
      .select({ count: count() })
      .from(offerSignupsTable)
      .where(eq(offerSignupsTable.agentId, req.params.id))
      .then(r => r[0]?.count ?? 0);

    res.json({
      agent: {
        id: agent.id, name: agent.name, slug: agent.slug,
        isPaused: agent.isPaused, isActive: agent.isActive,
        createdAt: agent.createdAt,
        cdpWalletAddress: agent.cdpWalletAddress,
        cdpWalletNetwork: agent.cdpWalletNetwork,
        cdpWalletCreatedAt: agent.cdpWalletCreatedAt,
        engineEnabled: agent.engineEnabled,
        engineLastRunAt: agent.engineLastRunAt,
      },
      leads: { total: totalLeads, byStatus: leadsByStatus },
      tokens: { byTask: tokenStats, totalTokens },
      wallet: { balances: walletBalances, hasWallet: !!agent.cdpWalletId },
      referrals: { signups: signupCount },
    });
  } catch (err) { console.error(err); res.status(500).json({ error: "Internal server error" }); }
});

// ─── Offers CRUD ──────────────────────────────────────────────────────────────

router.get("/admin/offers", requireAdmin, async (_req, res) => {
  try {
    const offers = await db.select({
      id: offersTable.id,
      slug: offersTable.slug,
      name: offersTable.name,
      description: offersTable.description,
      offerUrl: offersTable.offerUrl,
      logoUrl: offersTable.logoUrl,
      agentId: offersTable.agentId,
      commissionNotes: offersTable.commissionNotes,
      isActive: offersTable.isActive,
      isQualifying: offersTable.isQualifying,
      createdAt: offersTable.createdAt,
      updatedAt: offersTable.updatedAt,
    }).from(offersTable).orderBy(offersTable.createdAt);

    const agents = await db.select({
      id: agentsTable.id,
      slug: agentsTable.slug,
      name: agentsTable.name,
      avatarUrl: agentsTable.avatarUrl,
    }).from(agentsTable);

    const refCounts = await db.select({
      offerId: inheritedRefLinksTable.offerId,
      count: count(),
    }).from(inheritedRefLinksTable).groupBy(inheritedRefLinksTable.offerId);

    const signupCounts = await db.select({
      offerId: offerSignupsTable.offerId,
      count: count(),
    }).from(offerSignupsTable).groupBy(offerSignupsTable.offerId);

    const agentMap = Object.fromEntries(agents.map(a => [a.id, a]));
    const refMap = Object.fromEntries(refCounts.map(r => [r.offerId, Number(r.count)]));
    const signupMap = Object.fromEntries(signupCounts.map(s => [s.offerId, Number(s.count)]));

    res.json({
      offers: offers.map(o => ({
        ...o,
        agent: o.agentId ? agentMap[o.agentId] ?? null : null,
        referrerLinkCount: refMap[o.id] ?? 0,
        signupCount: signupMap[o.id] ?? 0,
      })),
      agents,
    });
  } catch (err) { console.error(err); res.status(500).json({ error: "Internal server error" }); }
});

router.post("/admin/offers", requireAdmin, async (req, res) => {
  try {
    const { name, slug, description, offerUrl, logoUrl, agentId, commissionNotes, isActive, isQualifying } = req.body;
    if (!name || !slug || !offerUrl) { res.status(400).json({ error: "name, slug, offerUrl required" }); return; }
    const [offer] = await db.insert(offersTable).values({
      name, slug, offerUrl,
      description: description || null,
      logoUrl: logoUrl || null,
      agentId: agentId || null,
      commissionNotes: commissionNotes || null,
      isActive: isActive !== false,
      isQualifying: !!isQualifying,
    }).returning();
    res.json({ success: true, offer });
  } catch (err: any) {
    if (err?.code === "23505") { res.status(409).json({ error: "Slug already exists" }); return; }
    console.error(err); res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/admin/offers/:id", requireAdmin, async (req, res) => {
  try {
    const { name, slug, description, offerUrl, logoUrl, agentId, commissionNotes, isActive, isQualifying } = req.body;
    const [updated] = await db.update(offersTable).set({
      ...(name && { name }),
      ...(slug && { slug }),
      ...(offerUrl && { offerUrl }),
      description: description ?? null,
      logoUrl: logoUrl ?? null,
      agentId: agentId || null,
      commissionNotes: commissionNotes ?? null,
      ...(isActive !== undefined && { isActive }),
      ...(isQualifying !== undefined && { isQualifying }),
      updatedAt: new Date(),
    }).where(eq(offersTable.id, req.params.id)).returning();
    if (!updated) { res.status(404).json({ error: "Offer not found" }); return; }
    res.json({ success: true, offer: updated });
  } catch (err: any) {
    if (err?.code === "23505") { res.status(409).json({ error: "Slug already exists" }); return; }
    console.error(err); res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/admin/offers/:id", requireAdmin, async (req, res) => {
  try {
    await db.delete(offersTable).where(eq(offersTable.id, req.params.id));
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: "Internal server error" }); }
});

// ─── Token usage ──────────────────────────────────────────────────────────────

router.get("/admin/token-usage", requireAdmin, async (req, res) => {
  try {
    // Fleet-wide totals grouped by agent + task
    const rows = await db
      .select({
        agentId:          agentTokenUsageTable.agentId,
        agentName:        agentsTable.name,
        agentSlug:        agentsTable.slug,
        task:             agentTokenUsageTable.task,
        totalCalls:       count(agentTokenUsageTable.id),
        totalPrompt:      sql<number>`sum(${agentTokenUsageTable.promptTokens})::int`,
        totalCompletion:  sql<number>`sum(${agentTokenUsageTable.completionTokens})::int`,
        totalTokens:      sql<number>`sum(${agentTokenUsageTable.totalTokens})::int`,
        totalLeads:       sql<number>`sum(${agentTokenUsageTable.leadsInBatch})::int`,
      })
      .from(agentTokenUsageTable)
      .leftJoin(agentsTable, eq(agentTokenUsageTable.agentId, agentsTable.id))
      .groupBy(
        agentTokenUsageTable.agentId,
        agentsTable.name,
        agentsTable.slug,
        agentTokenUsageTable.task,
      )
      .orderBy(sql`sum(${agentTokenUsageTable.totalTokens}) desc`);

    // Grand total
    const grandTotal = await db
      .select({
        totalCalls:      count(agentTokenUsageTable.id),
        totalTokens:     sql<number>`sum(${agentTokenUsageTable.totalTokens})::int`,
        totalPrompt:     sql<number>`sum(${agentTokenUsageTable.promptTokens})::int`,
        totalCompletion: sql<number>`sum(${agentTokenUsageTable.completionTokens})::int`,
        totalLeads:      sql<number>`sum(${agentTokenUsageTable.leadsInBatch})::int`,
      })
      .from(agentTokenUsageTable)
      .then(r => r[0]);

    res.json({ rows, grandTotal });
  } catch (err) { console.error(err); res.status(500).json({ error: "Internal server error" }); }
});

// ─── Lead Gen Skill — persona archetypes & skill catalog ─────────────────────

router.get("/admin/lead-gen-skill", requireAdmin, (_req, res) => {
  res.json({
    archetypes: PERSONA_ARCHETYPES.map(a => ({
      id: a.id, name: a.name, role: a.role, description: a.description,
      voice: a.voice, strengths: a.strengths, defaultHookStyles: a.defaultHookStyles,
      defaultPlatforms: a.defaultPlatforms, exampleHooks: a.exampleHooks,
    })),
    skillTags: SKILL_TAGS,
    summary: LEAD_GEN_SKILL_SUMMARY,
  });
});

// ─── AI Persona Generation ────────────────────────────────────────────────────

router.post("/admin/agents/generate-persona", requireAdmin, async (req, res) => {
  const { niche, targetMarket, offerType, platforms, archetypeId, skills, urgencyLevel } = req.body;
  if (!niche || !targetMarket || !offerType) {
    res.status(400).json({ error: "niche, targetMarket, and offerType are required" }); return;
  }

  const archetype = PERSONA_ARCHETYPES.find(a => a.id === archetypeId) ?? PERSONA_ARCHETYPES[0];
  const prompt = buildPersonaGenerationPrompt({
    niche, targetMarket, offerType,
    platforms: platforms ?? ["twitter", "linkedin"],
    archetype,
    skills: skills ?? archetype.strengths,
    urgencyLevel: urgencyLevel ?? "medium",
  });

  try {
    const raw = await chatOnce(
      "You are an AI agent persona architect. Respond with valid JSON only — no markdown, no code fences, no explanation. Just the raw JSON object.",
      prompt,
      0.75,
      { agentId: "system", task: "persona_gen" },
    );
    const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned);
    res.json({
      ok: true,
      persona: parsed,
      archetype: { id: archetype.id, name: archetype.name, imagePrompt: archetype.imagePrompt },
    });
  } catch (err: any) {
    console.error("[persona-gen] error:", err?.message);
    res.status(500).json({ error: "Persona generation failed", detail: err?.message });
  }
});

// ─── AI Hook Generation ───────────────────────────────────────────────────────

router.post("/admin/agents/generate-hooks", requireAdmin, async (req, res) => {
  const { niche, targetMarket, offerType, painPoints, urgencyLevel } = req.body;
  if (!niche || !targetMarket || !offerType) {
    res.status(400).json({ error: "niche, targetMarket, and offerType are required" }); return;
  }

  const prompt = buildHookGenerationPrompt({
    niche, targetMarket, offerType,
    painPoints: painPoints ?? "time, money, status, fear of being left behind",
    urgencyLevel: urgencyLevel ?? "high",
  });

  try {
    const raw = await chatOnce(
      "You are a hook-writing specialist. Respond with valid JSON only — no markdown, no code fences, no explanation. Just the raw JSON object.",
      prompt,
      0.85,
      { agentId: "system", task: "hook_gen" },
    );
    const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned);
    res.json({ ok: true, hooks: parsed.hooks ?? [] });
  } catch (err: any) {
    console.error("[hook-gen] error:", err?.message);
    res.status(500).json({ error: "Hook generation failed", detail: err?.message });
  }
});

// ─── Composio integration ─────────────────────────────────────────────────────

router.get("/admin/composio/status", requireAdmin, (_req, res) => {
  res.json({
    configured: isComposioConfigured(),
    apps: COMPOSIO_APPS,
  });
});

router.get("/admin/agents/:id/composio/connections", requireAdmin, async (req, res) => {
  try {
    const agent = await db.select({ id: agentsTable.id, composioEntityId: agentsTable.composioEntityId })
      .from(agentsTable).where(eq(agentsTable.id, req.params.id)).limit(1).then(r => r[0]);
    if (!agent) { res.status(404).json({ error: "Agent not found" }); return; }
    if (!agent.composioEntityId) {
      res.json({ connections: [], entityId: null, configured: isComposioConfigured() }); return;
    }
    const connections = await getEntityConnections(agent.composioEntityId);
    res.json({ connections, entityId: agent.composioEntityId, configured: isComposioConfigured() });
  } catch (err) { console.error(err); res.status(500).json({ error: "Internal server error" }); }
});

router.post("/admin/agents/:id/composio/connect", requireAdmin, async (req, res) => {
  const { appName, redirectUrl } = req.body;
  if (!appName) { res.status(400).json({ error: "appName required" }); return; }
  if (!isComposioConfigured()) { res.status(503).json({ error: "Composio not configured" }); return; }

  try {
    const agent = await db.select().from(agentsTable).where(eq(agentsTable.id, req.params.id)).limit(1).then(r => r[0]);
    if (!agent) { res.status(404).json({ error: "Agent not found" }); return; }

    // Auto-create entityId from agent slug if not set
    let entityId = agent.composioEntityId ?? `pr_agent_${agent.slug}`;
    if (!agent.composioEntityId) {
      await db.update(agentsTable).set({ composioEntityId: entityId, updatedAt: new Date() })
        .where(eq(agentsTable.id, agent.id));
    }

    const result = await initiateConnection(entityId, appName, redirectUrl);
    res.json({ ...result, entityId });
  } catch (err: any) {
    console.error("[composio-connect]", err);
    res.status(500).json({ error: err?.message ?? "Connection failed" });
  }
});

router.post("/admin/agents/:id/composio/test-post", requireAdmin, async (req, res) => {
  const { platform, content } = req.body;
  if (!platform || !content) { res.status(400).json({ error: "platform and content required" }); return; }

  try {
    const agent = await db.select({ composioEntityId: agentsTable.composioEntityId })
      .from(agentsTable).where(eq(agentsTable.id, req.params.id)).limit(1).then(r => r[0]);
    if (!agent?.composioEntityId) { res.status(400).json({ error: "Agent has no Composio entityId" }); return; }

    const app = COMPOSIO_APPS.find(a => a.id === platform);
    if (!app) { res.status(400).json({ error: `Unknown platform: ${platform}` }); return; }

    const result = await executeAction(agent.composioEntityId, app.action, { text: content, message: content });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// ─── Commission Splits & USDC Payments ─────────────────────────────────────

/** List all commission splits (optionally filter by status) */
router.get("/commission-splits", async (req, res) => {
  try {
    const { status } = req.query as { status?: string };
    const splits = await listSplits(status);
    res.json({ ok: true, splits });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

/** Manually generate splits for a custom event (testing / backfill) */
router.post("/commission-splits/generate", async (req, res) => {
  try {
    const { eventType, sourceId, agentId, grossAmount, recipients, notes } = req.body;
    const splits = await generateSplits({ eventType, sourceId, agentId, grossAmount, recipients, notes });
    res.json({ ok: true, splits });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

/** Approve a single split (moves it to approved, ready for payout) */
router.patch("/commission-splits/:id/approve", async (req, res) => {
  try {
    await db.update(commissionSplitsTable)
      .set({ status: "approved", updatedAt: new Date() })
      .where(eq(commissionSplitsTable.id, req.params.id));
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

/** Pay an approved split via USDC from treasury wallet */
router.post("/commission-splits/:id/pay", async (req, res) => {
  try {
    const { fromWalletId } = req.body;
    if (!fromWalletId) return res.status(400).json({ error: "fromWalletId required" });
    await payApprovedSplit(req.params.id, fromWalletId);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

/** Cancel a split */
router.patch("/commission-splits/:id/cancel", async (req, res) => {
  try {
    await db.update(commissionSplitsTable)
      .set({ status: "cancelled", cancelReason: req.body.reason ?? "Admin cancelled", updatedAt: new Date() })
      .where(eq(commissionSplitsTable.id, req.params.id));
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// ─── USDC Payment Requests ──────────────────────────────────────────────────

/** Create a new USDC payment request for a user/agent */
router.post("/usdc-payment-requests", async (req, res) => {
  try {
    const { agentId, payerId, payerEmail, amountUsd, purpose } = req.body;
    if (!agentId || !amountUsd) return res.status(400).json({ error: "agentId and amountUsd required" });
    const request = await createUsdcPaymentRequest({ agentId, payerId, payerEmail, amountUsd, purpose });
    res.json({ ok: true, request });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

/** List all USDC payment requests */
router.get("/usdc-payment-requests", async (req, res) => {
  try {
    const requests = await db.select().from(usdcPaymentRequestsTable).orderBy(usdcPaymentRequestsTable.createdAt);
    res.json({ ok: true, requests });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

/** Confirm a USDC payment (manual admin confirmation or webhook) */
router.post("/usdc-payment-requests/:id/confirm", async (req, res) => {
  try {
    const { txHash, referrerId, referrerAddress, agentManagerId, agentManagerAddress, botOpsAddress, devAddress } = req.body;
    if (!txHash) return res.status(400).json({ error: "txHash required" });
    await confirmPaymentAndSplit(req.params.id, txHash, {
      referrerId, referrerAddress, agentManagerId, agentManagerAddress, botOpsAddress, devAddress
    });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

/** Expire a payment request */
router.patch("/usdc-payment-requests/:id/expire", async (req, res) => {
  try {
    await db.update(usdcPaymentRequestsTable)
      .set({ status: "expired", updatedAt: new Date() })
      .where(eq(usdcPaymentRequestsTable.id, req.params.id));
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

export default router;
