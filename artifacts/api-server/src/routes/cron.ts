import { Router } from "express";
import { db } from "@workspace/db";
import { rotatorSlotsTable, agentsTable } from "@workspace/db/schema";
import { eq, and, lt } from "drizzle-orm";

const router = Router();

router.post("/cron/tick", async (req, res) => {
  try {
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = req.headers.authorization;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const now = new Date();

    const expiredSlots = await db.update(rotatorSlotsTable).set({
      status: "expired",
      expiredAt: now,
    }).where(
      and(
        eq(rotatorSlotsTable.status, "active"),
        lt(rotatorSlotsTable.expiresAt, now)
      )
    ).returning();

    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);

    await db.update(agentsTable).set({
      dailyLeadCount: 0,
      dailyCapResetAt: now,
    }).where(lt(agentsTable.dailyCapResetAt, midnight));

    res.json({ success: true, message: `Expired ${expiredSlots.length} slots, reset daily caps` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
