import { Router } from "express";
import { db } from "@workspace/db";
import { agentsTable, rotatorSlotsTable, leadsTable } from "@workspace/db/schema";
import { eq, and, gt, count, sql } from "drizzle-orm";
import { optionalAuth } from "../lib/auth.js";
import { buildAgentRegistrationJson } from "../lib/erc8004.js";

const router = Router();

router.get("/agent/:slug", optionalAuth, async (req, res) => {
  try {
    const agent = await db.select().from(agentsTable).where(eq(agentsTable.slug, req.params.slug)).limit(1).then(r => r[0]);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    const activeSlots = await db.select({ count: count() }).from(rotatorSlotsTable).where(
      and(eq(rotatorSlotsTable.agentId, agent.id), eq(rotatorSlotsTable.status, "active"), gt(rotatorSlotsTable.expiresAt, new Date()))
    ).then(r => r[0]?.count ?? 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    res.json({
      id: agent.id,
      slug: agent.slug,
      name: agent.name,
      description: agent.description,
      characterName: (agent as any).characterName ?? null,
      persona: (agent as any).persona ?? null,
      avatarUrl: (agent as any).avatarUrl ?? null,
      icpContext: (agent as any).icpContext ?? null,
      pricingMode: (agent as any).pricingMode ?? "flat",
      basePrice: (agent as any).basePrice ?? null,
      paidSlotPrice: (agent as any).paidSlotPrice ?? null,
      slotDurationHours: (agent as any).slotDurationHours ?? 24,
      offerUrl: agent.offerUrl,
      fallbackUrl: agent.fallbackUrl,
      isPaused: agent.isPaused,
      freeSlotCapacity: agent.freeSlotCapacity,
      paidSlotCapacity: agent.paidSlotCapacity,
      activeSlotCount: Number(activeSlots),
      dailyCap: agent.dailyCap,
      dailyLeadCount: agent.dailyLeadCount,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/agent/:slug/stats", async (req, res) => {
  try {
    const agent = await db.select().from(agentsTable).where(eq(agentsTable.slug, req.params.slug)).limit(1).then(r => r[0]);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    const freeSlots = await db.select({ count: count() }).from(rotatorSlotsTable).where(
      and(eq(rotatorSlotsTable.agentId, agent.id), eq(rotatorSlotsTable.status, "active"), eq(rotatorSlotsTable.slotType, "free"), gt(rotatorSlotsTable.expiresAt, new Date()))
    ).then(r => Number(r[0]?.count ?? 0));

    const paidSlots = await db.select({ count: count() }).from(rotatorSlotsTable).where(
      and(eq(rotatorSlotsTable.agentId, agent.id), eq(rotatorSlotsTable.status, "active"), eq(rotatorSlotsTable.slotType, "paid"), gt(rotatorSlotsTable.expiresAt, new Date()))
    ).then(r => Number(r[0]?.count ?? 0));

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    res.json({
      totalSignups: agent.totalSignups,
      activeFreeSlots: freeSlots,
      activePaidSlots: paidSlots,
      todayLeads: agent.dailyLeadCount,
      totalClicks: agent.totalClicks,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /agent/:slug/.well-known/agent.json — ERC-8004 agent identity card ──
// Served publicly so the IdentityRegistry can verify the agent URI on-chain.

router.get("/agent/:slug/.well-known/agent.json", async (req, res) => {
  try {
    const agent = await db.select().from(agentsTable)
      .where(eq(agentsTable.slug, req.params.slug)).limit(1).then(r => r[0]);
    if (!agent) { res.status(404).json({ error: "Agent not found" }); return; }

    const platformUrl = process.env.PLATFORM_URL
      ?? (process.env.REPLIT_DEV_DOMAIN
        ? `https://${process.env.REPLIT_DEV_DOMAIN}`
        : "https://plunderandriffle.replit.app");

    const json = buildAgentRegistrationJson({
      name:        agent.name,
      description: agent.description,
      avatarUrl:   agent.avatarUrl,
      slug:        agent.slug,
      isPaused:    agent.isPaused,
      platformUrl,
    });

    // Cache 60s in dev, 5min in prod
    res.setHeader("Cache-Control", "public, max-age=60");
    res.setHeader("Content-Type", "application/json");
    res.json(json);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
