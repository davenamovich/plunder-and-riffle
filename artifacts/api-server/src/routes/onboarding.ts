import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable, agentsTable, offersTable, offerSignupsTable, rotatorSlotsTable } from "@workspace/db/schema";
import { eq, and, gt } from "drizzle-orm";
import { signToken } from "../lib/auth.js";
import { generateReferralCode, generateUserSlug } from "../lib/slugify.js";

const router = Router();

function normalizeRole(input: string): string {
  return (input || "").trim().slice(0, 80);
}

router.post("/onboarding/start", async (req, res) => {
  try {
    const { email, role, referralCode } = req.body;

    if (!email || typeof email !== "string" || !email.includes("@")) {
      res.status(400).json({ error: "Valid email required" });
      return;
    }

    const normalizedEmail = email.toLowerCase().trim();
    const roleLabel = normalizeRole(role || "");

    // Resolve referrer
    let referredById: string | null = null;
    if (referralCode && typeof referralCode === "string") {
      const referrer = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.referralCode, referralCode.toUpperCase()))
        .limit(1)
        .then((r) => r[0]);
      if (referrer) referredById = referrer.id;
    }

    // Find or create user
    let user = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, normalizedEmail))
      .limit(1)
      .then((r) => r[0]);

    if (!user) {
      let slug = generateUserSlug(normalizedEmail);
      const existing = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.slug, slug))
        .limit(1)
        .then((r) => r[0]);
      if (existing) {
        slug = generateUserSlug(normalizedEmail, Math.random().toString(36).slice(2, 5));
      }

      const [newUser] = await db
        .insert(usersTable)
        .values({
          email: normalizedEmail,
          slug,
          displayName: normalizedEmail.split("@")[0],
          referralCode: generateReferralCode(),
          referredById,
          roleLabel: roleLabel || null,
          walletStatus: "pending",
          onboardingSource: "icp",
          onboardingCompletedAt: new Date(),
        })
        .returning();
      user = newUser;
    } else {
      // Update ICP fields on returning user
      const updates: Partial<typeof usersTable.$inferInsert> = {
        updatedAt: new Date(),
      };
      if (roleLabel) updates.roleLabel = roleLabel;
      if (user.walletStatus === "none") updates.walletStatus = "pending";
      if (!user.onboardingSource) updates.onboardingSource = "icp";
      if (!user.onboardingCompletedAt) updates.onboardingCompletedAt = new Date();

      const [updated] = await db
        .update(usersTable)
        .set(updates)
        .where(eq(usersTable.id, user.id))
        .returning();
      if (updated) user = updated;
    }

    // Auto-activate free rotator slot via first qualifying offer
    let slotActivated = false;
    const mainAgent = await db
      .select()
      .from(agentsTable)
      .where(eq(agentsTable.slug, "ralph"))
      .limit(1)
      .then((r) => r[0]);

    if (mainAgent) {
      const qualifyingOffer = await db
        .select()
        .from(offersTable)
        .where(and(eq(offersTable.isActive, true), eq(offersTable.isQualifying, true)))
        .limit(1)
        .then((r) => r[0]);

      if (qualifyingOffer) {
        // Record offer signup if not already done
        const existingSignup = await db
          .select()
          .from(offerSignupsTable)
          .where(
            and(
              eq(offerSignupsTable.userId, user.id),
              eq(offerSignupsTable.offerId, qualifyingOffer.id)
            )
          )
          .limit(1)
          .then((r) => r[0]);

        if (!existingSignup) {
          await db.insert(offerSignupsTable).values({
            userId: user.id,
            offerId: qualifyingOffer.id,
          });
        }

        // Activate free slot if not already active
        const existingSlot = await db
          .select()
          .from(rotatorSlotsTable)
          .where(
            and(
              eq(rotatorSlotsTable.userId, user.id),
              eq(rotatorSlotsTable.agentId, mainAgent.id),
              eq(rotatorSlotsTable.slotType, "free"),
              gt(rotatorSlotsTable.expiresAt, new Date())
            )
          )
          .limit(1)
          .then((r) => r[0]);

        if (!existingSlot) {
          const durationHours = mainAgent.slotDurationHours ?? 24;
          const expiresAt = new Date(Date.now() + durationHours * 3600 * 1000);
          await db.insert(rotatorSlotsTable).values({
            userId: user.id,
            agentId: mainAgent.id,
            slotType: "free",
            status: "active",
            expiresAt,
            activatedAt: new Date(),
          });
          slotActivated = true;
        } else {
          slotActivated = true;
        }
      }
    }

    const token = signToken(user.id);

    res.json({
      ok: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        slug: user.slug,
        displayName: user.displayName,
        role: user.role,
        createdAt: user.createdAt,
        referralCode: user.referralCode,
        roleLabel: user.roleLabel,
        walletStatus: user.walletStatus,
      },
      slotActivated,
      agentUrl: `/agent/ralph`,
      personalRotatorUrl: `/r/${user.slug}`,
    });
  } catch (err: any) {
    console.error("[onboarding] error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
