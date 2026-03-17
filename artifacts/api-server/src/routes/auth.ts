import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";
import { signToken } from "../lib/auth.js";
import { slugify, generateReferralCode, generateUserSlug } from "../lib/slugify.js";

const router = Router();

router.get("/auth/me", requireAuth, async (req, res) => {
  const user = (req as any).user;
  res.json({
    id: user.id,
    email: user.email,
    slug: user.slug,
    displayName: user.displayName,
    role: user.role,
    createdAt: user.createdAt,
    referralCode: user.referralCode,
  });
});

router.post("/auth/login", async (req, res) => {
  try {
    const { email, referralCode } = req.body;
    if (!email || typeof email !== "string" || !email.includes("@")) {
      res.status(400).json({ error: "Valid email required" });
      return;
    }
    const normalizedEmail = email.toLowerCase().trim();

    let user = await db.select().from(usersTable).where(eq(usersTable.email, normalizedEmail)).limit(1).then(r => r[0]);

    if (!user) {
      let referredById: string | null = null;
      if (referralCode) {
        const referrer = await db.select().from(usersTable).where(eq(usersTable.referralCode, referralCode.toUpperCase())).limit(1).then(r => r[0]);
        if (referrer) referredById = referrer.id;
      }

      let slug = generateUserSlug(normalizedEmail);
      const existing = await db.select().from(usersTable).where(eq(usersTable.slug, slug)).limit(1).then(r => r[0]);
      if (existing) {
        slug = generateUserSlug(normalizedEmail, Math.random().toString(36).slice(2, 5));
      }

      const [newUser] = await db.insert(usersTable).values({
        email: normalizedEmail,
        slug,
        displayName: normalizedEmail.split("@")[0],
        referralCode: generateReferralCode(),
        referredById,
      }).returning();
      user = newUser;
    }

    const token = signToken(user.id);
    res.json({
      user: {
        id: user.id,
        email: user.email,
        slug: user.slug,
        displayName: user.displayName,
        role: user.role,
        createdAt: user.createdAt,
        referralCode: user.referralCode,
      },
      token,
    });
  } catch (err: any) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/auth/logout", requireAuth, async (req, res) => {
  res.json({ success: true, message: "Logged out" });
});

export default router;
