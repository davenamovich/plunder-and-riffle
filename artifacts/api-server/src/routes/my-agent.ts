import { Router } from "express";
import { db } from "@workspace/db";
import { agentsTable, rotatorSlotsTable, usersTable } from "@workspace/db/schema";
import { eq, and, gt, desc } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";

const router = Router();

// GET /api/my-agent — authenticated user's agent panel
router.get("/my-agent", requireAuth, async (req, res) => {
  try {
    const authUser = (req as any).user;
    const now = new Date();

    const [user, allSlots, availableAgents] = await Promise.all([
      db.select().from(usersTable).where(eq(usersTable.id, authUser.id)).limit(1).then(r => r[0]),
      db.select({ slot: rotatorSlotsTable, agent: agentsTable })
        .from(rotatorSlotsTable)
        .innerJoin(agentsTable, eq(rotatorSlotsTable.agentId, agentsTable.id))
        .where(eq(rotatorSlotsTable.userId, authUser.id))
        .orderBy(desc(rotatorSlotsTable.createdAt))
        .limit(20),
      db.select({
        id: agentsTable.id, slug: agentsTable.slug, name: agentsTable.name,
        description: agentsTable.description, freeSlotCapacity: agentsTable.freeSlotCapacity,
        paidSlotCapacity: agentsTable.paidSlotCapacity, paidSlotPrice: agentsTable.paidSlotPrice,
        slotDurationHours: agentsTable.slotDurationHours,
      }).from(agentsTable).where(eq(agentsTable.isActive, true)),
    ]);

    if (!user) { res.status(404).json({ error: "User not found" }); return; }

    const enrichedSlots = allSlots.map(s => ({
      id: s.slot.id,
      agentId: s.agent.id,
      agentName: s.agent.name,
      agentSlug: s.agent.slug,
      slotType: s.slot.slotType,
      status: s.slot.status,
      expiresAt: s.slot.expiresAt,
      activatedAt: s.slot.activatedAt,
      clickCount: s.slot.clickCount,
      isActive: s.slot.status === "active" && s.slot.expiresAt > now,
    }));

    const activeSlots = enrichedSlots.filter(s => s.isActive);

    res.json({
      user: {
        id: user.id,
        email: user.email,
        slug: user.slug,
        displayName: user.displayName,
        roleLabel: user.roleLabel,
        walletAddress: user.walletAddress ?? null,
        walletStatus: user.walletStatus ?? "none",
        referralCode: user.referralCode ?? user.slug,
      },
      slots: enrichedSlots,
      activeSlotCount: activeSlots.length,
      availableAgents,
      // Composio status — real connection state managed by Composio platform
      composio: {
        isConnected: false,
        tools: [
          { id: "twitter", name: "Twitter / X",   icon: "𝕏",  status: "disconnected" },
          { id: "linkedin", name: "LinkedIn",       icon: "in", status: "disconnected" },
          { id: "gmail",    name: "Gmail",          icon: "✉",  status: "disconnected" },
          { id: "slack",    name: "Slack",          icon: "S",  status: "disconnected" },
          { id: "discord",  name: "Discord",        icon: "D",  status: "disconnected" },
          { id: "calendar", name: "Google Calendar", icon: "📅", status: "disconnected" },
        ],
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/agents — public directory of all active agents
router.get("/agents", async (req, res) => {
  try {
    const now = new Date();
    const agents = await db.select().from(agentsTable).where(eq(agentsTable.isActive, true));

    const enriched = await Promise.all(agents.map(async (agent) => {
      const { count } = await import("drizzle-orm");
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

      const freeAvailable = Math.max(0, agent.freeSlotCapacity - freeSlots);

      return {
        id: agent.id, slug: agent.slug, name: agent.name,
        description: agent.description, isPaused: agent.isPaused,
        freeSlotCapacity: agent.freeSlotCapacity, paidSlotCapacity: agent.paidSlotCapacity,
        activeFreeSlots: freeSlots, activePaidSlots: paidSlots,
        freeAvailable, totalClicks: agent.totalClicks, totalSignups: agent.totalSignups,
        dailyLeadCount: agent.dailyLeadCount, paidSlotPrice: agent.paidSlotPrice,
        slotDurationHours: agent.slotDurationHours,
      };
    }));

    res.json({ agents: enriched });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
