import { Router } from "express";
import { db } from "@workspace/db";
import { agentsTable, rotatorSlotsTable, usersTable, agentAssistantsTable } from "@workspace/db/schema";
import { eq, and, gt, desc } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";

const COMPOSIO_API_KEY = process.env.COMPOSIO_API_KEY || "";
const COMPOSIO_BASE = "https://backend.composio.dev/api/v1";

async function getComposioConnectionStatus(entityId: string): Promise<{ twitter: boolean; linkedin: boolean; tiktok: boolean; reddit: boolean }> {
  if (!COMPOSIO_API_KEY || !entityId) return { twitter: false, linkedin: false, tiktok: false, reddit: false };
  try {
    const resp = await fetch(`${COMPOSIO_BASE}/connectedAccounts?entityId=${encodeURIComponent(entityId)}&limit=50`, {
      headers: { "x-api-key": COMPOSIO_API_KEY },
    });
    if (!resp.ok) return { twitter: false, linkedin: false, tiktok: false, reddit: false };
    const data = await resp.json();
    const items: any[] = data?.items ?? [];
    return {
      twitter:  items.some((a: any) => a.appName?.toLowerCase().includes("twitter")  && a.status === "ACTIVE"),
      linkedin: items.some((a: any) => a.appName?.toLowerCase().includes("linkedin") && a.status === "ACTIVE"),
      tiktok:   items.some((a: any) => a.appName?.toLowerCase().includes("tiktok")   && a.status === "ACTIVE"),
      reddit:   items.some((a: any) => a.appName?.toLowerCase().includes("reddit")   && a.status === "ACTIVE"),
    };
  } catch {
    return { twitter: false, linkedin: false, tiktok: false, reddit: false };
  }
}

async function initiateComposioConnection(entityId: string, appName: string, redirectUrl: string): Promise<string | null> {
  if (!COMPOSIO_API_KEY) return null;
  try {
    const resp = await fetch(`${COMPOSIO_BASE}/connectedAccounts`, {
      method: "POST",
      headers: { "x-api-key": COMPOSIO_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ appName, entityId, redirectUri: redirectUrl }),
    });
    const data = await resp.json();
    return data?.redirectUrl ?? null;
  } catch {
    return null;
  }
}

const router = Router();

// GET /api/my-agent — authenticated user's agent panel
router.get("/my-agent", requireAuth, async (req, res) => {
  try {
    const authUser = (req as any).user;
    const now = new Date();

    const [user, allSlots, availableAgents, ownedAgent, assistantRows] = await Promise.all([
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
      // Check if this user owns any agent
      db.select({ id: agentsTable.id, slug: agentsTable.slug, name: agentsTable.name })
        .from(agentsTable)
        .where(eq(agentsTable.ownerId, authUser.id))
        .limit(1)
        .then(r => r[0] ?? null),
      // Check if this user is an assistant on any agent
      db.select({ assistant: agentAssistantsTable, agent: agentsTable })
        .from(agentAssistantsTable)
        .innerJoin(agentsTable, eq(agentAssistantsTable.agentId, agentsTable.id))
        .where(eq(agentAssistantsTable.userId, authUser.id)),
    ]);

    if (!user) { res.status(404).json({ error: "User not found" }); return; }

    const ownsAgent = !!ownedAgent;
    const assistantAgents = assistantRows.map(r => ({
      id: r.agent.id,
      slug: r.agent.slug,
      name: r.agent.name,
      assistantRecordId: r.assistant.id,
    }));
    // Agent access = owns agent OR is assistant of at least one agent
    const hasAgentAccess = ownsAgent || assistantAgents.length > 0;
    // Primary agent for display: owned first, then first assistant assignment
    const primaryAgent = ownedAgent ?? (assistantAgents[0] ? { id: assistantAgents[0].id, slug: assistantAgents[0].slug, name: assistantAgents[0].name } : null);

    // Only fetch Composio status if user owns an agent and has an entity ID
    const entityId = user.composioEntityId ?? user.id;
    const composioStatus = hasAgentAccess
      ? await getComposioConnectionStatus(entityId)
      : { twitter: false, linkedin: false, tiktok: false, reddit: false };

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
        composioEntityId: user.composioEntityId ?? null,
      },
      ownsAgent,
      ownedAgent,
      isAssistant: !ownsAgent && assistantAgents.length > 0,
      assistantAgents,
      hasAgentAccess,
      primaryAgent,
      slots: enrichedSlots,
      activeSlotCount: activeSlots.length,
      availableAgents,
      composio: {
        entityId,
        isConnected: composioStatus.twitter || composioStatus.linkedin || composioStatus.tiktok || composioStatus.reddit,
        tools: [
          { id: "twitter",  name: "Twitter / X", icon: "𝕏",   status: composioStatus.twitter  ? "connected" : "disconnected" },
          { id: "linkedin", name: "LinkedIn",     icon: "in",  status: composioStatus.linkedin ? "connected" : "disconnected" },
          { id: "tiktok",   name: "TikTok",       icon: "TT",  status: composioStatus.tiktok   ? "connected" : "disconnected" },
          { id: "reddit",   name: "Reddit",       icon: "R",   status: composioStatus.reddit   ? "connected" : "disconnected" },
        ],
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/my-agent/composio/connect — initiate Composio OAuth for a social platform
router.post("/my-agent/composio/connect", requireAuth, async (req, res) => {
  try {
    const authUser = (req as any).user;
    const { platform } = req.body; // "twitter" | "linkedin"

    if (!platform || !["twitter", "linkedin", "tiktok", "reddit"].includes(platform)) {
      res.status(400).json({ error: "platform must be 'twitter', 'linkedin', 'tiktok', or 'reddit'" });
      return;
    }

    // Only agent owners or assistants can connect social accounts
    const [ownedAgent, assistantRow] = await Promise.all([
      db.select({ id: agentsTable.id }).from(agentsTable)
        .where(eq(agentsTable.ownerId, authUser.id)).limit(1).then(r => r[0] ?? null),
      db.select({ id: agentAssistantsTable.id }).from(agentAssistantsTable)
        .where(eq(agentAssistantsTable.userId, authUser.id)).limit(1).then(r => r[0] ?? null),
    ]);

    if (!ownedAgent && !assistantRow) {
      res.status(403).json({ error: "Only agent owners or assistants can connect social accounts" });
      return;
    }

    // Use user's ID as their Composio entity ID, store it if not set
    const user = await db.select().from(usersTable).where(eq(usersTable.id, authUser.id)).limit(1).then(r => r[0]);
    if (!user) { res.status(404).json({ error: "User not found" }); return; }

    let entityId = user.composioEntityId;
    if (!entityId) {
      entityId = `par_user_${user.id}`;
      await db.update(usersTable).set({ composioEntityId: entityId }).where(eq(usersTable.id, user.id));
    }

    const appName = platform; // Composio app names match our platform IDs
    const appUrl = process.env.APP_URL || "https://plunderandriffle.com";
    const redirectUrl = `${appUrl}/my-agent?composio_connected=1`;

    const oauthUrl = await initiateComposioConnection(entityId, appName, redirectUrl);

    if (!oauthUrl) {
      res.status(502).json({ error: "Could not initiate Composio connection. Check COMPOSIO_API_KEY." });
      return;
    }

    res.json({ ok: true, oauthUrl, entityId });
  } catch (err) {
    console.error("[composio-connect]", err);
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
