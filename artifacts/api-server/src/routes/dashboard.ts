import { Router } from "express";
import { db } from "@workspace/db";
import { rotatorSlotsTable, offerSignupsTable, usersTable } from "@workspace/db/schema";
import { eq, and, gt, count, sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";

const router = Router();

router.get("/dashboard/stats", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const now = new Date();

    const [activeSlots, totalClicks, totalReferrals, offerSignups] = await Promise.all([
      db.select({ count: count() }).from(rotatorSlotsTable).where(
        and(eq(rotatorSlotsTable.userId, user.id), eq(rotatorSlotsTable.status, "active"), gt(rotatorSlotsTable.expiresAt, now))
      ).then(r => Number(r[0]?.count ?? 0)),

      db.select({ total: sql<number>`coalesce(sum(${rotatorSlotsTable.clickCount}), 0)` }).from(rotatorSlotsTable).where(
        eq(rotatorSlotsTable.userId, user.id)
      ).then(r => Number(r[0]?.total ?? 0)),

      db.select({ count: count() }).from(usersTable).where(
        eq(usersTable.referredById, user.id)
      ).then(r => Number(r[0]?.count ?? 0)),

      db.select({ count: count() }).from(offerSignupsTable).where(
        eq(offerSignupsTable.userId, user.id)
      ).then(r => Number(r[0]?.count ?? 0)),
    ]);

    res.json({
      activeSlots,
      totalClicks,
      totalReferrals,
      personalRotatorViews: 0,
      offerSignups,
      earnedThisCycle: 0,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/referral/my", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const [totalReferrals, upstreamReferrer] = await Promise.all([
      db.select({ count: count() }).from(usersTable).where(eq(usersTable.referredById, user.id)).then(r => Number(r[0]?.count ?? 0)),
      user.referredById ? db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, user.referredById)).limit(1).then(r => r[0]?.email) : Promise.resolve(null),
    ]);

    const baseUrl = process.env.APP_URL || `https://${process.env.REPLIT_DEV_DOMAIN || "localhost"}`;
    res.json({
      referralCode: user.referralCode,
      referralUrl: `${baseUrl}?ref=${user.referralCode}`,
      totalReferrals,
      pendingReferrals: 0,
      upstreamReferrer: upstreamReferrer || null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
