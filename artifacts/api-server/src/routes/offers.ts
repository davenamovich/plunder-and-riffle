import { Router } from "express";
import { db } from "@workspace/db";
import { agentsTable, offersTable, offerSignupsTable, rotatorSlotsTable } from "@workspace/db/schema";
import { eq, and, gt } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";

const router = Router();

router.get("/offers", async (req, res) => {
  try {
    const offers = await db.select().from(offersTable).where(eq(offersTable.isActive, true));
    res.json({ offers: offers.map(o => ({
      id: o.id,
      slug: o.slug,
      name: o.name,
      description: o.description,
      offerUrl: o.offerUrl,
      logoUrl: o.logoUrl,
      isActive: o.isActive,
      isQualifying: o.isQualifying,
    })) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/offers/signup", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const { offerId, affiliateRef } = req.body;
    if (!offerId) {
      res.status(400).json({ error: "offerId required" });
      return;
    }

    const offer = await db.select().from(offersTable).where(and(eq(offersTable.id, offerId), eq(offersTable.isActive, true))).limit(1).then(r => r[0]);
    if (!offer) {
      res.status(404).json({ error: "Offer not found" });
      return;
    }

    const existing = await db.select().from(offerSignupsTable).where(
      and(eq(offerSignupsTable.userId, user.id), eq(offerSignupsTable.offerId, offerId))
    ).limit(1).then(r => r[0]);

    if (!existing) {
      await db.insert(offerSignupsTable).values({ userId: user.id, offerId, affiliateRef });
    }

    if (offer.isQualifying) {
      const mainAgent = await db.select().from(agentsTable).where(eq(agentsTable.slug, "ralph")).limit(1).then(r => r[0]);
      if (mainAgent) {
        const existingSlot = await db.select().from(rotatorSlotsTable).where(
          and(
            eq(rotatorSlotsTable.userId, user.id),
            eq(rotatorSlotsTable.agentId, mainAgent.id),
            eq(rotatorSlotsTable.slotType, "free"),
            gt(rotatorSlotsTable.expiresAt, new Date())
          )
        ).limit(1).then(r => r[0]);

        if (!existingSlot) {
          const expiresAt = new Date(Date.now() + mainAgent.slotDurationHours * 3600 * 1000);
          const [slot] = await db.insert(rotatorSlotsTable).values({
            userId: user.id,
            agentId: mainAgent.id,
            slotType: "free",
            status: "active",
            expiresAt,
            activatedAt: new Date(),
          }).returning();

          res.json({ success: true, message: "Signed up and free rotator slot activated!", rotatorSlot: {
            id: slot.id,
            userId: slot.userId,
            agentId: slot.agentId,
            slotType: slot.slotType,
            status: slot.status,
            expiresAt: slot.expiresAt,
            createdAt: slot.createdAt,
            clickCount: slot.clickCount,
          }});
          return;
        }
      }
    }

    const placeholderSlot = {
      id: "",
      userId: user.id,
      agentId: "",
      slotType: "free" as const,
      status: "pending" as const,
      expiresAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      clickCount: 0,
    };
    res.json({ success: true, message: "Signed up for offer!", rotatorSlot: placeholderSlot });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/offers/my", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const signups = await db.select({
      signup: offerSignupsTable,
      offer: offersTable,
    })
    .from(offerSignupsTable)
    .innerJoin(offersTable, eq(offerSignupsTable.offerId, offersTable.id))
    .where(eq(offerSignupsTable.userId, user.id));

    res.json({ offers: signups.map(s => ({
      offerId: s.offer.id,
      offerName: s.offer.name,
      offerUrl: s.offer.offerUrl,
      inheritedRefUrl: s.signup.affiliateRef || s.offer.offerUrl,
      signedUpAt: s.signup.signedUpAt,
    })) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
