import { Router } from "express";
import { db } from "@workspace/db";
import { agentsTable, rotatorSlotsTable, usersTable, offerSignupsTable, leadsTable } from "@workspace/db/schema";
import { eq, and, gt, count } from "drizzle-orm";
import { requireAdmin } from "../lib/auth.js";
import { moltisStatusWithUsage, getDailyUsage } from "../lib/moltis.js";
import { runRalphLoop } from "../lib/ralph.js";

const router = Router();

router.get("/admin/settings", requireAdmin, async (req, res) => {
  try {
    const agent = await db.select().from(agentsTable).where(eq(agentsTable.slug, "ralph")).limit(1).then(r => r[0]);
    if (!agent) {
      res.status(404).json({ error: "Main agent not found" });
      return;
    }
    res.json({
      freeSlotCapacity: agent.freeSlotCapacity,
      paidSlotCapacity: agent.paidSlotCapacity,
      freeSlotWeight: agent.freeSlotWeight,
      paidSlotWeight: agent.paidSlotWeight,
      slotDurationHours: agent.slotDurationHours,
      dailyCap: agent.dailyCap,
      fallbackUrl: agent.fallbackUrl || "",
      isPaused: agent.isPaused,
      leadApprovalMode: agent.leadApprovalMode,
      nftMintEnabled: agent.nftMintEnabled,
      paidSlotPrice: agent.paidSlotPrice,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/admin/settings", requireAdmin, async (req, res) => {
  try {
    const agent = await db.select().from(agentsTable).where(eq(agentsTable.slug, "ralph")).limit(1).then(r => r[0]);
    if (!agent) {
      res.status(404).json({ error: "Main agent not found" });
      return;
    }

    const updates: Partial<typeof agent> = {};
    const allowed = ["freeSlotCapacity", "paidSlotCapacity", "freeSlotWeight", "paidSlotWeight", "slotDurationHours", "dailyCap", "fallbackUrl", "isPaused", "leadApprovalMode", "nftMintEnabled", "paidSlotPrice"];
    for (const key of allowed) {
      if (req.body[key] !== undefined) (updates as any)[key] = req.body[key];
    }

    const [updated] = await db.update(agentsTable).set({ ...updates, updatedAt: new Date() }).where(eq(agentsTable.slug, "ralph")).returning();
    res.json({
      freeSlotCapacity: updated.freeSlotCapacity,
      paidSlotCapacity: updated.paidSlotCapacity,
      freeSlotWeight: updated.freeSlotWeight,
      paidSlotWeight: updated.paidSlotWeight,
      slotDurationHours: updated.slotDurationHours,
      dailyCap: updated.dailyCap,
      fallbackUrl: updated.fallbackUrl || "",
      isPaused: updated.isPaused,
      leadApprovalMode: updated.leadApprovalMode,
      nftMintEnabled: updated.nftMintEnabled,
      paidSlotPrice: updated.paidSlotPrice,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/admin/rotator", requireAdmin, async (req, res) => {
  try {
    const now = new Date();
    const slots = await db.select({
      slot: rotatorSlotsTable,
      user: { id: usersTable.id, email: usersTable.email, slug: usersTable.slug },
    })
    .from(rotatorSlotsTable)
    .innerJoin(usersTable, eq(rotatorSlotsTable.userId, usersTable.id))
    .where(and(eq(rotatorSlotsTable.status, "active"), gt(rotatorSlotsTable.expiresAt, now)));

    const totalActive = slots.length;
    const totalFree = slots.filter(s => s.slot.slotType === "free").length;
    const totalPaid = slots.filter(s => s.slot.slotType === "paid").length;

    res.json({
      slots: slots.map(s => ({
        id: s.slot.id,
        userId: s.slot.userId,
        userEmail: s.user.email,
        userSlug: s.user.slug,
        slotType: s.slot.slotType,
        status: s.slot.status,
        expiresAt: s.slot.expiresAt,
        clickCount: s.slot.clickCount,
      })),
      totalActive,
      totalFree,
      totalPaid,
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

router.get("/admin/users", requireAdmin, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, parseInt(req.query.limit as string) || 20);

    const now = new Date();
    const users = await db.select().from(usersTable).limit(limit).offset((page - 1) * limit);
    const total = await db.select({ count: count() }).from(usersTable).then(r => Number(r[0]?.count ?? 0));

    const enriched = await Promise.all(users.map(async (user) => {
      const [offerSignupCount, activeSlots, referralCount] = await Promise.all([
        db.select({ count: count() }).from(offerSignupsTable).where(eq(offerSignupsTable.userId, user.id)).then(r => Number(r[0]?.count ?? 0)),
        db.select({ count: count() }).from(rotatorSlotsTable).where(
          and(eq(rotatorSlotsTable.userId, user.id), eq(rotatorSlotsTable.status, "active"), gt(rotatorSlotsTable.expiresAt, now))
        ).then(r => Number(r[0]?.count ?? 0)),
        db.select({ count: count() }).from(usersTable).where(eq(usersTable.referredById, user.id)).then(r => Number(r[0]?.count ?? 0)),
      ]);
      return {
        id: user.id,
        email: user.email,
        slug: user.slug,
        displayName: user.displayName,
        role: user.role,
        createdAt: user.createdAt,
        offerSignupCount,
        activeSlots,
        referralCount,
      };
    }));

    res.json({ users: enriched, total });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/admin/leads", requireAdmin, async (req, res) => {
  try {
    const status = req.query.status as string | undefined;
    let query = db.select().from(leadsTable);
    if (status) {
      query = query.where(eq(leadsTable.status, status)) as typeof query;
    }
    const leads = await query.limit(50);
    const total = await db.select({ count: count() }).from(leadsTable).then(r => Number(r[0]?.count ?? 0));
    res.json({
      leads: leads.map(l => ({
        id: l.id,
        source: l.source,
        externalId: l.externalId,
        status: l.status,
        score: l.score,
        draft: l.draft,
        postedAt: l.postedAt,
        createdAt: l.createdAt,
      })),
      total,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Ralph loop status
router.get("/admin/ralph/status", requireAdmin, async (req, res) => {
  try {
    const [moltis, leadCounts] = await Promise.all([
      moltisStatusWithUsage(),
      db.select({ status: leadsTable.status, count: count() }).from(leadsTable).groupBy(leadsTable.status),
    ]);

    res.json({
      moltis,
      leads: Object.fromEntries(leadCounts.map((r) => [r.status, Number(r.count)])),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Quick daily API usage check (no auth needed for lightweight monitoring)
router.get("/admin/usage", requireAdmin, async (req, res) => {
  try {
    const usage = await getDailyUsage();
    res.json(usage);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Manually trigger one full Ralph loop cycle
router.post("/admin/ralph/run", requireAdmin, async (req, res) => {
  try {
    const result = await runRalphLoop();
    res.json({ success: true, ...result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
