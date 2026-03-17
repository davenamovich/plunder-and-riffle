/**
 * Agent Engine Routes
 *
 * Public (when agent.enginePublic = true):
 *   GET  /api/engine/:slug          — status, recent runs + feed
 *   GET  /api/engine/:slug/feed     — post activity feed
 *
 * Admin only:
 *   POST /api/admin/engine/:slug/run        — trigger manual run
 *   PUT  /api/admin/engine/:slug/settings   — toggle enabled/public/schedule
 */

import { Router } from "express";
import { db } from "@workspace/db";
import {
  agentsTable,
  agentEngineRunsTable,
  agentEnginePostsTable,
  usersTable,
} from "@workspace/db/schema";
import { eq, and, desc, count, sql } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../lib/auth.js";
import { runEngineForAgent } from "../lib/agent-engine.js";

const router = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getAgentOrFail(slug: string) {
  return db.select().from(agentsTable)
    .where(eq(agentsTable.slug, slug)).limit(1).then(r => r[0] ?? null);
}

function canView(agent: typeof agentsTable.$inferSelect, isAdmin: boolean) {
  return isAdmin || agent.enginePublic;
}

// ─── GET /api/engine/:slug — full status snapshot ────────────────────────────

router.get("/engine/:slug", async (req, res) => {
  try {
    const agent = await getAgentOrFail(req.params.slug);
    if (!agent) { res.status(404).json({ error: "Agent not found" }); return; }

    const user = (req as any).user ?? null;
    const isAdmin = user?.role === "admin";
    if (!canView(agent, isAdmin)) {
      res.status(403).json({ error: "Engine dashboard is not public for this agent" });
      return;
    }

    const [recentRuns, recentPosts, todayStats] = await Promise.all([
      db.select().from(agentEngineRunsTable)
        .where(eq(agentEngineRunsTable.agentId, agent.id))
        .orderBy(desc(agentEngineRunsTable.startedAt))
        .limit(10),

      db.select({
        post: agentEnginePostsTable,
        userEmail: usersTable.email,
        userSlug: usersTable.slug,
        displayName: usersTable.displayName,
      })
        .from(agentEnginePostsTable)
        .innerJoin(usersTable, eq(agentEnginePostsTable.userId, usersTable.id))
        .where(eq(agentEnginePostsTable.agentId, agent.id))
        .orderBy(desc(agentEnginePostsTable.createdAt))
        .limit(50),

      db.select({
        generated: sql<number>`count(*) filter (where date(created_at) = current_date)`,
        posted: sql<number>`count(*) filter (where date(created_at) = current_date and status = 'posted')`,
        total: count(),
      }).from(agentEnginePostsTable)
        .where(eq(agentEnginePostsTable.agentId, agent.id))
        .then(r => r[0]),
    ]);

    const lastRun = recentRuns[0] ?? null;
    const isRunning = lastRun?.status === "running";

    res.json({
      agent: {
        id: agent.id,
        slug: agent.slug,
        name: agent.name,
        engineEnabled: agent.engineEnabled,
        enginePublic: agent.enginePublic,
        engineScheduleHours: agent.engineScheduleHours,
        engineLastRunAt: agent.engineLastRunAt,
        engineNextRunAt: agent.engineNextRunAt,
      },
      status: {
        isRunning,
        state: !agent.engineEnabled ? "disabled" : isRunning ? "running" : "idle",
        lastRunAt: lastRun?.startedAt ?? null,
        lastRunStatus: lastRun?.status ?? null,
        nextRunAt: agent.engineNextRunAt ?? null,
      },
      stats: {
        generatedToday: Number(todayStats?.generated ?? 0),
        postedToday: Number(todayStats?.posted ?? 0),
        totalPosts: Number(todayStats?.total ?? 0),
        totalRuns: recentRuns.length,
      },
      recentRuns: recentRuns.map(r => ({
        id: r.id,
        triggeredBy: r.triggeredBy,
        status: r.status,
        slotsProcessed: r.slotsProcessed,
        postsGenerated: r.postsGenerated,
        postsPosted: r.postsPosted,
        startedAt: r.startedAt,
        completedAt: r.completedAt,
        durationMs: r.completedAt
          ? new Date(r.completedAt).getTime() - new Date(r.startedAt).getTime()
          : null,
        errors: r.errors ? JSON.parse(r.errors) : [],
      })),
      feed: recentPosts.map(({ post, userEmail, userSlug, displayName }) => ({
        id: post.id,
        platform: post.platform,
        content: post.content,
        status: post.status,
        postUrl: post.postUrl,
        error: isAdmin ? post.error : null,
        createdAt: post.createdAt,
        postedAt: post.postedAt,
        user: isAdmin
          ? { email: userEmail, slug: userSlug, displayName }
          : { slug: userSlug, displayName },
      })),
    });
  } catch (err) {
    console.error("[engine] GET status error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /api/engine/:slug/feed — public activity feed ───────────────────────

router.get("/engine/:slug/feed", async (req, res) => {
  try {
    const agent = await getAgentOrFail(req.params.slug);
    if (!agent) { res.status(404).json({ error: "Agent not found" }); return; }

    const user = (req as any).user ?? null;
    const isAdmin = user?.role === "admin";
    if (!canView(agent, isAdmin)) {
      res.status(403).json({ error: "Feed not public" }); return;
    }

    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const platform = req.query.platform as string | undefined;

    const rows = await db.select({
      post: agentEnginePostsTable,
      userSlug: usersTable.slug,
      displayName: usersTable.displayName,
    })
      .from(agentEnginePostsTable)
      .innerJoin(usersTable, eq(agentEnginePostsTable.userId, usersTable.id))
      .where(
        and(
          eq(agentEnginePostsTable.agentId, agent.id),
          ...(platform ? [eq(agentEnginePostsTable.platform, platform)] : []),
        )
      )
      .orderBy(desc(agentEnginePostsTable.createdAt))
      .limit(limit);

    res.json({
      feed: rows.map(({ post, userSlug, displayName }) => ({
        id: post.id,
        platform: post.platform,
        content: post.content,
        status: post.status,
        postUrl: post.postUrl,
        createdAt: post.createdAt,
        postedAt: post.postedAt,
        user: { slug: userSlug, displayName },
      })),
    });
  } catch (err) {
    console.error("[engine] GET feed error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── POST /api/admin/engine/:slug/run — manual trigger ───────────────────────

router.post("/admin/engine/:slug/run", requireAdmin, async (req, res) => {
  try {
    const agent = await getAgentOrFail(req.params.slug);
    if (!agent) { res.status(404).json({ error: "Agent not found" }); return; }

    // Fire async — don't await so the response returns immediately
    runEngineForAgent(agent.slug, "admin").catch(err =>
      console.error("[engine] manual run error:", err)
    );

    res.json({ success: true, message: `Engine run triggered for ${agent.name}` });
  } catch (err) {
    console.error("[engine] manual trigger error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── PUT /api/admin/engine/:slug/settings ────────────────────────────────────

router.put("/admin/engine/:slug/settings", requireAdmin, async (req, res) => {
  try {
    const agent = await getAgentOrFail(req.params.slug);
    if (!agent) { res.status(404).json({ error: "Agent not found" }); return; }

    const { engineEnabled, enginePublic, engineScheduleHours } = req.body;
    const updates: Record<string, unknown> = { updatedAt: new Date() };

    if (engineEnabled !== undefined) updates.engineEnabled = Boolean(engineEnabled);
    if (enginePublic !== undefined) updates.enginePublic = Boolean(enginePublic);
    if (engineScheduleHours !== undefined) {
      const h = Number(engineScheduleHours);
      if (h >= 1 && h <= 24) updates.engineScheduleHours = h;
    }

    const [updated] = await db.update(agentsTable)
      .set(updates as any)
      .where(eq(agentsTable.id, agent.id))
      .returning();

    res.json({
      success: true,
      engineEnabled: updated.engineEnabled,
      enginePublic: updated.enginePublic,
      engineScheduleHours: updated.engineScheduleHours,
    });
  } catch (err) {
    console.error("[engine] settings update error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
