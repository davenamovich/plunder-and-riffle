import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";

const router = Router();

/**
 * POST /api/users/save-referral-link
 * Save user's referral link and grant 1 token for 24-hour access
 */
router.post("/save-referral-link", requireAuth, async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    // Grant 1 token to the user
    const [user] = await db.update(usersTable).set({
      tokens: 1,
      updatedAt: new Date(),
    }).where(eq(usersTable.id, userId)).returning();

    res.json({ success: true, user });
  } catch (err) {
    console.error("[users] failed to save referral link:", err);
    res.status(500).json({ error: "Failed to save referral link" });
  }
});

export default router;
