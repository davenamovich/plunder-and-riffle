import { Router } from "express";
import { db } from "@workspace/db";
import { agentsTable, rotatorSlotsTable, usersTable, offerSignupsTable, leadsTable, personalRotatorLinksTable, offersTable, inheritedRefLinksTable } from "@workspace/db/schema";
import { eq, and, gt, count, sql } from "drizzle-orm";
import { requireAdmin } from "../lib/auth.js";
import { createAgentWallet, isCDPConfigured } from "../lib/cdp.js";
import { moltisStatusWithUsage, getDailyUsage } from "../lib/moltis.js";
import { runRalphLoop, approveLead, rejectLead as ralphRejectLead, markLeadPosted } from "../lib/ralph.js";
import { getFunnelSummary, getRecentEvents } from "../lib/funnel.js";
import {
  getAllSequences, getDmQueue, triggerDmForLead,
  markDmSent, cancelDmSend, upsertSequence,
} from "../lib/dm.js";

const router = Router();

// ─── Settings ─────────────────────────────────────────────────────────────────

router.get("/admin/settings", requireAdmin, async (req, res) => {
  try {
    const agent = await db.select().from(agentsTable).where(eq(agentsTable.slug, "ralph")).limit(1).then(r => r[0]);
    if (!agent) { res.status(404).json({ error: "Main agent not found" }); return; }
    res.json({
      freeSlotCapacity:  agent.freeSlotCapacity,
      paidSlotCapacity:  agent.paidSlotCapacity,
      freeSlotWeight:    agent.freeSlotWeight,
      paidSlotWeight:    agent.paidSlotWeight,
      slotDurationHours: agent.slotDurationHours,
      dailyCap:          agent.dailyCap,
      fallbackUrl:       agent.fallbackUrl || "",
      isPaused:          agent.isPaused,
      leadApprovalMode:  agent.leadApprovalMode,
      nftMintEnabled:    agent.nftMintEnabled,
      paidSlotPrice:     agent.paidSlotPrice,
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
    const allowed = ["freeSlotCapacity","paidSlotCapacity","freeSlotWeight","paidSlotWeight","slotDurationHours","dailyCap","fallbackUrl","isPaused","leadApprovalMode","nftMintEnabled","paidSlotPrice"];
    for (const key of allowed) {
      if (req.body[key] !== undefined) (updates as any)[key] = req.body[key];
    }

    const [updated] = await db.update(agentsTable).set({ ...updates, updatedAt: new Date() }).where(eq(agentsTable.slug, "ralph")).returning();
    res.json({
      freeSlotCapacity:  updated.freeSlotCapacity,
      paidSlotCapacity:  updated.paidSlotCapacity,
      freeSlotWeight:    updated.freeSlotWeight,
      paidSlotWeight:    updated.paidSlotWeight,
      slotDurationHours: updated.slotDurationHours,
      dailyCap:          updated.dailyCap,
      fallbackUrl:       updated.fallbackUrl || "",
      isPaused:          updated.isPaused,
      leadApprovalMode:  updated.leadApprovalMode,
      nftMintEnabled:    updated.nftMintEnabled,
      paidSlotPrice:     updated.paidSlotPrice,
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
      };
    }));
    res.json({ agents: enriched });
  } catch (err) { console.error(err); res.status(500).json({ error: "Internal server error" }); }
});

router.post("/admin/agents", requireAdmin, async (req, res) => {
  try {
    const { slug, name, description, offerUrl, freeSlotCapacity, paidSlotCapacity, slotDurationHours, dailyCap, paidSlotPrice } = req.body;
    if (!slug || !name || !offerUrl) { res.status(400).json({ error: "slug, name, offerUrl required" }); return; }
    const [agent] = await db.insert(agentsTable).values({
      slug: slug.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
      name, description: description || null, offerUrl,
      freeSlotCapacity: freeSlotCapacity || 25, paidSlotCapacity: paidSlotCapacity || 25,
      slotDurationHours: slotDurationHours || 24, dailyCap: dailyCap || 100, paidSlotPrice: paidSlotPrice || 9.99,
    }).returning();
    res.json({ success: true, agent });
  } catch (err: any) {
    if (err.code === "23505") { res.status(400).json({ error: "Agent slug already exists" }); return; }
    console.error(err); res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/admin/agents/:id", requireAdmin, async (req, res) => {
  try {
    const agent = await db.select().from(agentsTable).where(eq(agentsTable.id, req.params.id)).limit(1).then(r => r[0]);
    if (!agent) { res.status(404).json({ error: "Agent not found" }); return; }
    const allowed = ["name","description","offerUrl","fallbackUrl","freeSlotCapacity","paidSlotCapacity",
                     "slotDurationHours","dailyCap","paidSlotPrice","leadApprovalMode","isPaused","isActive"];
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
    console.error("[cdp] wallet creation error:", err);
    res.status(500).json({ error: err?.message ?? "Failed to create CDP wallet" });
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

export default router;
