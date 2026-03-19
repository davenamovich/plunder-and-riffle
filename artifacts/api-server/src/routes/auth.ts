import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable, referralRotatorTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";
import { signToken } from "../lib/auth.js";
import { generateReferralCode, generateRandomSlug } from "../lib/slugify.js";
import { createUserWallet, isCDPConfigured } from "../lib/cdp.js";

// Canonical admin emails — always guaranteed admin role on login
const ADMIN_EMAILS = new Set([
  "admin@btc-experiment.com",
  "dnamovich@gmail.com",
]);

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
    walletAddress: user.walletAddress,
    walletStatus: user.walletStatus,
  });
});

router.post("/auth/login", async (req, res) => {
  try {
    const { email, referralCode, walletAddress } = req.body;
    if (!email || typeof email !== "string" || !email.includes("@")) {
      res.status(400).json({ error: "Valid email required" });
      return;
    }
    const normalizedEmail = email.toLowerCase().trim();
    const normalizedWallet = typeof walletAddress === "string" && walletAddress ? walletAddress : null;

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
        walletAddress: normalizedWallet,
        walletStatus: normalizedWallet ? "active" : "none",
      }).returning();
      user = newUser;

      // Auto-add new user to their referrer's rotator
      if (referredById) {
        await db.insert(referralRotatorTable).values({
          ownerId: referredById,
          memberId: newUser.id,
          isActive: true,
        }).onConflictDoNothing();
      }

      // Auto-provision a CDP wallet for this new user (background — does not block login response)
      if (isCDPConfigured() && !normalizedWallet) {
        setImmediate(async () => {
          try {
            const wallet = await createUserWallet(normalizedEmail);
            await db.update(usersTable).set({
              walletAddress: wallet.address,
              walletStatus: "active",
              cdpWalletId: wallet.walletId,
              cdpWalletSeed: wallet.seed,
              cdpWalletCreatedAt: new Date(),
              updatedAt: new Date(),
            }).where(eq(usersTable.id, newUser.id));
            console.log(`[cdp] auto-provisioned wallet for ${normalizedEmail}: ${wallet.address}`);
          } catch (err) {
            console.error(`[cdp] failed to auto-provision wallet for ${normalizedEmail}:`, err);
          }
        });
      }

    } else if (normalizedWallet && user.walletAddress !== normalizedWallet) {
      const [updated] = await db.update(usersTable)
        .set({ walletAddress: normalizedWallet, walletStatus: "active", updatedAt: new Date() })
        .where(eq(usersTable.id, user.id))
        .returning();
      if (updated) user = updated;
    }

    // Always ensure canonical admin emails have admin role (self-healing)
    if (ADMIN_EMAILS.has(normalizedEmail) && user.role !== "admin") {
      const [promoted] = await db.update(usersTable)
        .set({ role: "admin", updatedAt: new Date() })
        .where(eq(usersTable.id, user.id))
        .returning();
      if (promoted) user = promoted;
      console.log(`[auth] promoted ${normalizedEmail} to admin`);
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
        walletAddress: user.walletAddress,
        walletStatus: user.walletStatus,
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
