import { Router } from "express";
import { db } from "@workspace/db";
import {
  agentsTable, rotatorSlotsTable, rotatorClicksTable,
  usersTable, offersTable, offerSignupsTable, referralRotatorTable
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

    // Fetch referral rotator entries for this user (their direct referrals)
    const referralEntries = await db.select({
      entry: referralRotatorTable,
      member: {
        id: usersTable.id,
        slug: usersTable.slug,
        displayName: usersTable.displayName,
        email: usersTable.email,
        bio: usersTable.bio,
      },
    })
    .from(referralRotatorTable)
    .innerJoin(usersTable, eq(referralRotatorTable.memberId, usersTable.id))
    .where(eq(referralRotatorTable.ownerId, user.id));

    const referralLinks = referralEntries
      .filter(r => r.entry.isActive)
      .map(r => ({
        memberId: r.member.id,
        memberSlug: r.member.slug,
        displayName: r.member.displayName || r.member.email,
        bio: r.member.bio,
        url: `/r/${r.member.slug}`,
        type: "referral",
        clickCount: r.entry.clickCount,
      }));

    // Fallback: user's own offer links if no referral entries at all
    let ownLinks: any[] = [];
    if (referralEntries.length === 0) {
      const signups = await db.select({ signup: offerSignupsTable, offer: offersTable })
        .from(offerSignupsTable)
        .innerJoin(offersTable, eq(offerSignupsTable.offerId, offersTable.id))
        .where(eq(offerSignupsTable.userId, user.id));
      ownLinks = signups.map((s, i) => ({
        offerId: s.offer.id,
        offerName: s.offer.name,
        url: s.signup.affiliateRef || s.offer.offerUrl,
        logoUrl: s.offer.logoUrl,
        type: "offer",
        displayOrder: i,
      }));
    }

    res.json({
      userId: user.id,
      userSlug: user.slug,
      displayName: user.displayName || user.email,
      bio: user.bio,
      referralLinks,
      links: ownLinks,
      hasReferralRotator: referralEntries.length > 0,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Referral Rotator Management ──────────────────────────────────────────────

// GET /referral-rotator/my — list authenticated user's referral rotator entries
router.get("/referral-rotator/my", requireAuth, async (req, res) => {
  try {
    const authUser = (req as any).user;

    const entries = await db.select({
      entry: referralRotatorTable,
      member: {
        id: usersTable.id,
        slug: usersTable.slug,
        displayName: usersTable.displayName,
        email: usersTable.email,
        bio: usersTable.bio,
      },
    })
    .from(referralRotatorTable)
    .innerJoin(usersTable, eq(referralRotatorTable.memberId, usersTable.id))
    .where(eq(referralRotatorTable.ownerId, authUser.id));

    res.json({
      referrals: entries.map(r => ({
        entryId: r.entry.id,
        memberId: r.member.id,
        memberSlug: r.member.slug,
        displayName: r.member.displayName || r.member.email,
        bio: r.member.bio,
        isActive: r.entry.isActive,
        clickCount: r.entry.clickCount,
        createdAt: r.entry.createdAt,
        rotatorUrl: `/r/${r.member.slug}`,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /referral-rotator/:memberId/toggle — toggle a referral on/off
router.put("/referral-rotator/:memberId/toggle", requireAuth, async (req, res) => {
  try {
    const authUser = (req as any).user;
    const { memberId } = req.params;

    const existing = await db.select().from(referralRotatorTable)
      .where(and(eq(referralRotatorTable.ownerId, authUser.id), eq(referralRotatorTable.memberId, memberId)))
      .limit(1).then(r => r[0]);

    if (!existing) {
      res.status(404).json({ error: "Referral not found in your rotator" });
      return;
    }

    const [updated] = await db.update(referralRotatorTable)
      .set({ isActive: !existing.isActive })
      .where(eq(referralRotatorTable.id, existing.id))
      .returning();

    res.json({ success: true, isActive: updated.isActive });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /referral-rotator/click/:memberSlug — track a click from the rotator
router.post("/referral-rotator/click/:ownerSlug/:memberSlug", async (req, res) => {
  try {
    const owner = await db.select().from(usersTable).where(eq(usersTable.slug, req.params.ownerSlug)).limit(1).then(r => r[0]);
    const member = await db.select().from(usersTable).where(eq(usersTable.slug, req.params.memberSlug)).limit(1).then(r => r[0]);
    if (owner && member) {
      await db.update(referralRotatorTable)
        .set({ clickCount: sql`${referralRotatorTable.clickCount} + 1` })
        .where(and(eq(referralRotatorTable.ownerId, owner.id), eq(referralRotatorTable.memberId, member.id)));
    }
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false });
  }
});

export default router;
