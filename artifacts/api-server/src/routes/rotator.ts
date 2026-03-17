import { Router } from "express";
import { db } from "@workspace/db";
import {
  agentsTable, rotatorSlotsTable, rotatorClicksTable,
  usersTable, offersTable, offerSignupsTable
} from "@workspace/db/schema";
import { eq, and, gt, count, sql } from "drizzle-orm";
import { requireAuth, optionalAuth } from "../lib/auth.js";

const router = Router();

router.get("/rotator/redirect/:agentSlug", optionalAuth, async (req, res) => {
  try {
    const agent = await db.select().from(agentsTable).where(eq(agentsTable.slug, req.params.agentSlug)).limit(1).then(r => r[0]);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    if (agent.isPaused) {
      const fallback = agent.fallbackUrl || "https://bitcoin.org";
      res.json({ redirectUrl: fallback, slotType: "fallback" });
      return;
    }

    const now = new Date();
    const activeSlots = await db.select({
      slot: rotatorSlotsTable,
      user: { id: usersTable.id, slug: usersTable.slug, email: usersTable.email },
    })
    .from(rotatorSlotsTable)
    .innerJoin(usersTable, eq(rotatorSlotsTable.userId, usersTable.id))
    .where(
      and(eq(rotatorSlotsTable.agentId, agent.id), eq(rotatorSlotsTable.status, "active"), gt(rotatorSlotsTable.expiresAt, now))
    );

    if (!activeSlots.length) {
      const fallback = agent.fallbackUrl || agent.offerUrl;
      res.json({ redirectUrl: fallback, slotType: "fallback" });
      return;
    }

    const weightedPool: typeof activeSlots = [];
    for (const s of activeSlots) {
      const weight = s.slot.slotType === "paid" ? agent.paidSlotWeight : agent.freeSlotWeight;
      for (let i = 0; i < weight; i++) weightedPool.push(s);
    }

    const chosen = weightedPool[Math.floor(Math.random() * weightedPool.length)];

    await db.update(rotatorSlotsTable).set({ clickCount: sql`${rotatorSlotsTable.clickCount} + 1` }).where(eq(rotatorSlotsTable.id, chosen.slot.id));
    await db.update(agentsTable).set({ totalClicks: sql`${agentsTable.totalClicks} + 1` }).where(eq(agentsTable.id, agent.id));

    const qualifying = await db.select({ offers: offersTable }).from(offerSignupsTable)
      .innerJoin(offersTable, eq(offerSignupsTable.offerId, offersTable.id))
      .where(and(eq(offerSignupsTable.userId, chosen.user.id), eq(offersTable.isQualifying, true)))
      .limit(1)
      .then(r => r[0]);

    const redirectUrl = qualifying?.offers?.offerUrl || agent.offerUrl;

    res.json({ redirectUrl, slotType: chosen.slot.slotType, userId: chosen.user.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/rotator/slots", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const slots = await db.select().from(rotatorSlotsTable).where(eq(rotatorSlotsTable.userId, user.id));
    res.json({ slots: slots.map(s => ({
      id: s.id,
      userId: s.userId,
      agentId: s.agentId,
      slotType: s.slotType,
      status: s.status,
      expiresAt: s.expiresAt,
      createdAt: s.createdAt,
      clickCount: s.clickCount,
    })) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/rotator/buy", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const { agentId } = req.body;
    if (!agentId) {
      res.status(400).json({ error: "agentId required" });
      return;
    }
    const agent = await db.select().from(agentsTable).where(eq(agentsTable.id, agentId)).limit(1).then(r => r[0]);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    const now = new Date();
    const existing = await db.select({ count: count() }).from(rotatorSlotsTable).where(
      and(eq(rotatorSlotsTable.agentId, agentId), eq(rotatorSlotsTable.slotType, "paid"), eq(rotatorSlotsTable.status, "active"), gt(rotatorSlotsTable.expiresAt, now))
    ).then(r => Number(r[0]?.count ?? 0));

    if (existing >= agent.paidSlotCapacity) {
      res.status(400).json({ error: "Paid slots are full" });
      return;
    }

    const expiresAt = new Date(Date.now() + agent.slotDurationHours * 3600 * 1000);
    const [slot] = await db.insert(rotatorSlotsTable).values({
      userId: user.id,
      agentId,
      slotType: "paid",
      status: "active",
      expiresAt,
      activatedAt: new Date(),
    }).returning();

    res.json({
      id: slot.id,
      userId: slot.userId,
      agentId: slot.agentId,
      slotType: slot.slotType,
      status: slot.status,
      expiresAt: slot.expiresAt,
      createdAt: slot.createdAt,
      clickCount: slot.clickCount,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/personal-rotator/my", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const signups = await db.select({
      signup: offerSignupsTable,
      offer: offersTable,
    })
    .from(offerSignupsTable)
    .innerJoin(offersTable, eq(offerSignupsTable.offerId, offersTable.id))
    .where(eq(offerSignupsTable.userId, user.id));

    const links = signups.map((s, i) => ({
      offerId: s.offer.id,
      offerName: s.offer.name,
      url: s.signup.affiliateRef ? s.signup.affiliateRef : s.offer.offerUrl,
      logoUrl: s.offer.logoUrl,
      type: "offer",
      displayOrder: i,
    }));

    res.json({
      userId: user.id,
      userSlug: user.slug,
      displayName: user.displayName || user.email,
      bio: user.bio,
      links,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/personal-rotator/:userSlug", async (req, res) => {
  try {
    const user = await db.select().from(usersTable).where(eq(usersTable.slug, req.params.userSlug)).limit(1).then(r => r[0]);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const signups = await db.select({
      signup: offerSignupsTable,
      offer: offersTable,
    })
    .from(offerSignupsTable)
    .innerJoin(offersTable, eq(offerSignupsTable.offerId, offersTable.id))
    .where(eq(offerSignupsTable.userId, user.id));

    const links = signups.map((s, i) => ({
      offerId: s.offer.id,
      offerName: s.offer.name,
      url: s.signup.affiliateRef ? s.signup.affiliateRef : s.offer.offerUrl,
      logoUrl: s.offer.logoUrl,
      type: "offer",
      displayOrder: i,
    }));

    res.json({
      userId: user.id,
      userSlug: user.slug,
      displayName: user.displayName || user.email,
      bio: user.bio,
      links,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
