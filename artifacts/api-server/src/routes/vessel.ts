/**
 * VESSEL PROTOCOL — Express Routes
 * Mount in routes/index.ts: import vesselRouter from "./vessel.js"; router.use(vesselRouter);
 */

import { Router } from "express";
import { db } from "@workspace/db";
import { agentsTable, usersTable } from "@workspace/db/schema";
import { vesselAgentConfigTable, vesselSlotsTable, vesselConversionEventsTable, vesselSplitLedgerTable } from "@workspace/db/schema/vessel";
import { eq, desc, sql, and } from "drizzle-orm";
import { requireAuth, optionalAuth } from "../lib/auth.js";
import {
  createPendingSlot, markOfferClicked, activateSlot,
  recordConversion, getVesselUserStats, getActiveRotationSlots, recordRotation,
} from "../lib/vessel.js";
import crypto from "crypto";

const router = Router();

// ── GET /vessel/agents — public agent list ─────────────────────────────────────
router.get("/vessel/agents", async (req, res) => {
  try {
    const agents = await db.select({
      id: agentsTable.id, slug: agentsTable.slug, name: agentsTable.name,
      persona: agentsTable.persona, avatarUrl: agentsTable.avatarUrl,
      offerName:        vesselAgentConfigTable.offerName,
      offerUrl:         vesselAgentConfigTable.offerUrl,
      offerCtaText:     vesselAgentConfigTable.offerCtaText,
      offerTagline:     vesselAgentConfigTable.offerTagline,
      offerLogoUrl:     vesselAgentConfigTable.offerLogoUrl,
      vesselStatus:     vesselAgentConfigTable.vesselStatus,
      totalPaidSeats:   vesselAgentConfigTable.totalPaidSeats,
      filledPaidSeats:  vesselAgentConfigTable.filledPaidSeats,
      paidSeatPriceUsd: vesselAgentConfigTable.paidSeatPriceUsd,
      dailyFreeCap:     vesselAgentConfigTable.dailyFreeCap,
      dailyFreeIssuedToday: vesselAgentConfigTable.dailyFreeIssuedToday,
    })
    .from(agentsTable)
    .innerJoin(vesselAgentConfigTable, eq(vesselAgentConfigTable.agentId, agentsTable.id))
    .where(eq(vesselAgentConfigTable.vesselStatus, "active"));
    res.json({ ok: true, agents });
  } catch (err: any) { res.status(500).json({ ok: false, error: err.message }); }
});

// ── GET /vessel/agents/:slug ───────────────────────────────────────────────────
router.get("/vessel/agents/:slug", async (req, res) => {
  try {
    const rows = await db.select()
      .from(agentsTable)
      .innerJoin(vesselAgentConfigTable, eq(vesselAgentConfigTable.agentId, agentsTable.id))
      .where(eq(agentsTable.slug, req.params.slug))
      .limit(1);
    if (!rows.length) { res.status(404).json({ ok: false, error: "Agent not found" }); return; }
    const { agents: agent, vessel_agent_config: config } = rows[0];
    res.json({ ok: true, agent, config });
  } catch (err: any) { res.status(500).json({ ok: false, error: err.message }); }
});

// ── POST /vessel/slots/start — create pending slot ─────────────────────────────
router.post("/vessel/slots/start", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const { agentId, agentSlug } = req.body;

    let resolvedAgentId = agentId;
    if (!resolvedAgentId && agentSlug) {
      const agent = await db.select({ id: agentsTable.id })
        .from(agentsTable).where(eq(agentsTable.slug, agentSlug)).limit(1).then(r => r[0]);
      if (!agent) { res.status(404).json({ ok: false, error: "Agent not found" }); return; }
      resolvedAgentId = agent.id;
    }

    const result = await createPendingSlot({
      agentId: resolvedAgentId, userId: user.id, referredByUserId: user.referredById ?? undefined,
    });

    res.json({
      ok: true, slotId: result.slot.id, status: result.status,
      waitlistPosition: result.waitlistPosition,
      nextStep: result.status === "waitlisted" ? "waitlisted" : "complete_offer",
      offer: result.offer,
    });
  } catch (err: any) { res.status(400).json({ ok: false, error: err.message }); }
});

// ── POST /vessel/slots/offer-clicked ──────────────────────────────────────────
router.post("/vessel/slots/offer-clicked", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const { slotId } = req.body;
    if (!slotId) { res.status(400).json({ ok: false, error: "slotId required" }); return; }
    await markOfferClicked(slotId, user.id);
    res.json({ ok: true, nextStep: "save_link" });
  } catch (err: any) { res.status(400).json({ ok: false, error: err.message }); }
});

// ── POST /vessel/slots/activate — THE GATE ─────────────────────────────────────
router.post("/vessel/slots/activate", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const { slotId } = req.body;
    if (!slotId) { res.status(400).json({ ok: false, error: "slotId required" }); return; }
    const result = await activateSlot(slotId, user.id);
    res.json({ ok: true, ...result, nextStep: "dashboard" });
  } catch (err: any) { res.status(400).json({ ok: false, error: err.message }); }
});

// ── GET /vessel/me — user dashboard data ──────────────────────────────────────
router.get("/vessel/me", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const stats = await getVesselUserStats(user.id);
    const appUrl = process.env.APP_URL || "https://vesselprotocol.xyz";
    res.json({
      ok: true,
      referralLink: `${appUrl}/r/${user.referralCode}`,
      referralCode: user.referralCode,
      ...stats,
    });
  } catch (err: any) { res.status(500).json({ ok: false, error: err.message }); }
});

// ── POST /vessel/conversion — webhook for conversion events ───────────────────
router.post("/vessel/conversion", async (req, res) => {
  try {
    const sig    = req.headers["x-vessel-signature"] as string ?? "";
    const secret = process.env.VESSEL_WEBHOOK_SECRET;
    if (secret) {
      const expected = crypto.createHmac("sha256", secret).update(JSON.stringify(req.body)).digest("hex");
      if (sig !== expected) { res.status(401).json({ ok: false, error: "Invalid signature" }); return; }
    }

    const { referralCode, agentSlug, eventType = "offer_signup", grossAmountUsd = 0, platform, postId, convertedEmail } = req.body;
    if (!referralCode || !agentSlug) { res.status(400).json({ ok: false, error: "referralCode and agentSlug required" }); return; }

    const [affiliateUser, agent] = await Promise.all([
      db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.referralCode, referralCode)).limit(1).then(r => r[0]),
      db.select({ id: agentsTable.id }).from(agentsTable).where(eq(agentsTable.slug, agentSlug)).limit(1).then(r => r[0]),
    ]);

    if (!affiliateUser) { res.status(404).json({ ok: false, error: "Referral code not found" }); return; }
    if (!agent)         { res.status(404).json({ ok: false, error: "Agent not found" }); return; }

    let convertedUserId: string | undefined;
    if (convertedEmail) {
      const cu = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, convertedEmail.toLowerCase())).limit(1).then(r => r[0]);
      convertedUserId = cu?.id;
    }

    const eventId = await recordConversion({ agentId: agent.id, affiliateUserId: affiliateUser.id, convertedUserId, eventType, grossAmountUsd, platform, postId, referralCode });
    res.json({ ok: true, eventId });
  } catch (err: any) { res.status(500).json({ ok: false, error: err.message }); }
});

// ── Internal: get rotator slots for engine ────────────────────────────────────
router.get("/vessel/internal/agents/:id/rotator", async (req, res) => {
  const secret = req.headers["x-internal-secret"];
  if (secret !== (process.env.INTERNAL_SECRET || "dev")) { res.status(401).json({ ok: false }); return; }
  try {
    const slots = await getActiveRotationSlots(req.params.id);
    res.json({ ok: true, slots });
  } catch (err: any) { res.status(500).json({ ok: false, error: err.message }); }
});

// ── Internal: record rotation post ────────────────────────────────────────────
router.post("/vessel/internal/agents/:id/rotation-posted", async (req, res) => {
  const secret = req.headers["x-internal-secret"];
  if (secret !== (process.env.INTERNAL_SECRET || "dev")) { res.status(401).json({ ok: false }); return; }
  try {
    const { slotId, userId, platform, postId, postUrl, linkUsed } = req.body;
    await recordRotation({ slotId, agentId: req.params.id, userId, platform, postId, postUrl, linkUsed });
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ ok: false, error: err.message }); }
});

export default router;
