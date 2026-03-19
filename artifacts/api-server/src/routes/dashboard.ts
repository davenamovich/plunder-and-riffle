import { Router } from "express";
import { db } from "@workspace/db";
import { rotatorSlotsTable, offerSignupsTable, usersTable, commissionSplitsTable } from "@workspace/db/schema";
import { eq, and, gt, count, sql, sum, inArray } from "drizzle-orm";
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

    const baseUrl = (process.env.APP_URL || `https://${process.env.REPLIT_DEV_DOMAIN || "localhost"}`).replace(/\/$/, "");
    res.json({
      referralCode: user.referralCode,
      referralUrl: `${baseUrl}/r/${user.slug}`,
      totalReferrals,
      pendingReferrals: 0,
      upstreamReferrer: upstreamReferrer || null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Wallet / Earnings ────────────────────────────────────────────────────────

router.get("/dashboard/wallet", requireAuth, async (req, res) => {
  try {
    const authUser = (req as any).user;
    const user = await db.select().from(usersTable).where(eq(usersTable.id, authUser.id)).limit(1).then(r => r[0]);
    if (!user) { res.status(404).json({ error: "User not found" }); return; }

    // Commission summary by status
    const splits = await db.select({
      status: commissionSplitsTable.status,
      total: sql<number>`coalesce(sum(${commissionSplitsTable.splitAmount}), 0)`,
      count: count(),
    }).from(commissionSplitsTable)
      .where(eq(commissionSplitsTable.recipientId, user.id))
      .groupBy(commissionSplitsTable.status);

    const summary: Record<string, { total: number; count: number }> = {};
    for (const row of splits) summary[row.status] = { total: Number(row.total), count: Number(row.count) };

    const pending = summary["pending"] ?? { total: 0, count: 0 };
    const approved = summary["approved"] ?? { total: 0, count: 0 };
    const paid = summary["paid"] ?? { total: 0, count: 0 };
    const withdrawable = pending.total + approved.total;

    // Recent splits
    const recent = await db.select({
      id: commissionSplitsTable.id,
      recipientType: commissionSplitsTable.recipientType,
      splitAmount: commissionSplitsTable.splitAmount,
      grossAmount: commissionSplitsTable.grossAmount,
      status: commissionSplitsTable.status,
      paidAt: commissionSplitsTable.paidAt,
      txHash: commissionSplitsTable.txHash,
      createdAt: commissionSplitsTable.createdAt,
    }).from(commissionSplitsTable)
      .where(eq(commissionSplitsTable.recipientId, user.id))
      .orderBy(sql`${commissionSplitsTable.createdAt} desc`)
      .limit(20);

    res.json({
      ok: true,
      walletAddress: user.walletAddress ?? null,
      walletStatus: user.walletStatus,
      earnings: { pending: pending.total, approved: approved.total, paid: paid.total, withdrawable },
      splits: recent,
    });
  } catch (err) {
    console.error("[wallet GET]", err);
    res.status(500).json({ error: "Failed to load wallet data" });
  }
});

router.post("/dashboard/wallet/address", requireAuth, async (req, res) => {
  try {
    const authUser = (req as any).user;
    const { address } = req.body;
    if (!address?.trim()) { res.status(400).json({ error: "address is required" }); return; }
    if (!/^0x[0-9a-fA-F]{40}$/.test(address.trim())) {
      res.status(400).json({ error: "Invalid EVM wallet address (must be 0x + 40 hex chars)" }); return;
    }
    await db.update(usersTable).set({ walletAddress: address.trim(), walletStatus: "active", updatedAt: new Date() }).where(eq(usersTable.id, authUser.id));
    res.json({ ok: true, walletAddress: address.trim() });
  } catch (err) {
    console.error("[wallet address]", err);
    res.status(500).json({ error: "Failed to save wallet address" });
  }
});

router.post("/dashboard/wallet/withdraw", requireAuth, async (req, res) => {
  try {
    const authUser = (req as any).user;
    const user = await db.select({ walletAddress: usersTable.walletAddress, walletStatus: usersTable.walletStatus }).from(usersTable).where(eq(usersTable.id, authUser.id)).limit(1).then(r => r[0]);
    if (!user?.walletAddress) { res.status(400).json({ error: "Set a withdrawal wallet address first" }); return; }

    // Find pending/approved splits for this user
    const eligible = await db.select({ id: commissionSplitsTable.id, splitAmount: commissionSplitsTable.splitAmount })
      .from(commissionSplitsTable)
      .where(and(eq(commissionSplitsTable.recipientId, authUser.id), inArray(commissionSplitsTable.status, ["pending", "approved"])));

    if (eligible.length === 0) { res.json({ ok: true, message: "No pending earnings to withdraw", total: 0 }); return; }

    const total = eligible.reduce((s, r) => s + r.splitAmount, 0);

    // Mark as approved + stamp wallet address for payout
    await db.update(commissionSplitsTable)
      .set({ status: "approved", recipientAddress: user.walletAddress, updatedAt: new Date(), notes: `Withdrawal requested by user to ${user.walletAddress}` })
      .where(inArray(commissionSplitsTable.id, eligible.map(e => e.id)));

    console.log(`[wallet] withdrawal requested by ${authUser.id}: ${eligible.length} splits, $${total.toFixed(2)} USDC → ${user.walletAddress}`);
    res.json({ ok: true, message: `Withdrawal of $${total.toFixed(2)} USDC queued for processing`, total, count: eligible.length, toAddress: user.walletAddress });
  } catch (err) {
    console.error("[wallet withdraw]", err);
    res.status(500).json({ error: "Failed to process withdrawal" });
  }
});

export default router;
