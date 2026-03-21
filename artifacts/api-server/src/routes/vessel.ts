/**
 * VESSEL PROTOCOL — Express Routes
 * All payments are USDC on Base mainnet via CDP. No Stripe.
 *
 * Mount in routes/index.ts: router.use(vesselRouter);
 */

import { Router } from "express";
import { db } from "@workspace/db";
import { agentsTable, usersTable } from "@workspace/db/schema";
import { vesselAgentConfigTable, vesselSlotsTable } from "@workspace/db/schema/vessel";
import { eq, desc, sql, and, gt } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";
import {
  createPendingSlot, markOfferClicked, activateSlot,
  recordConversion, getVesselUserStats, getActiveRotationSlots, recordRotation,
} from "../lib/vessel.js";
import {
  createUsdcPaymentRequest, confirmPaymentAndSplit,
} from "../lib/commission-splitter.js";
import crypto from "crypto";

const router = Router();

// ── GET /vessel/agents ─────────────────────────────────────────────────────────
router.get("/vessel/agents", async (req, res) => {
  try {
    const agents = await db.select({
      id: agentsTable.id, slug: agentsTable.slug, name: agentsTable.name,
      persona: agentsTable.persona, avatarUrl: agentsTable.avatarUrl,
      offerName:         vesselAgentConfigTable.offerName,
      offerUrl:          vesselAgentConfigTable.offerUrl,
      offerCtaText:      vesselAgentConfigTable.offerCtaText,
      offerTagline:      vesselAgentConfigTable.offerTagline,
      offerLogoUrl:      vesselAgentConfigTable.offerLogoUrl,
      vesselStatus:      vesselAgentConfigTable.vesselStatus,
      totalPaidSeats:    vesselAgentConfigTable.totalPaidSeats,
      filledPaidSeats:   vesselAgentConfigTable.filledPaidSeats,
      paidSeatPriceUsdc: vesselAgentConfigTable.paidSeatPriceUsdc,
      dailyFreeCap:      vesselAgentConfigTable.dailyFreeCap,
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

// ── POST /vessel/slots/start ───────────────────────────────────────────────────
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
      agentId: resolvedAgentId, userId: user.id,
      referredByUserId: user.referredById ?? undefined,
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

// ── POST /vessel/slots/buy-paid ────────────────────────────────────────────────
// USDC paid seat purchase flow:
//   1. Call this → get a USDC payment address + amount
//   2. User sends USDC to that address on Base
//   3. Call /vessel/slots/confirm-payment with txHash → slot activates + splits fire
router.post("/vessel/slots/buy-paid", requireAuth, async (req, res) => {
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

    // Check seats available
    const config = await db.select()
      .from(vesselAgentConfigTable)
      .where(eq(vesselAgentConfigTable.agentId, resolvedAgentId))
      .limit(1).then(r => r[0]);

    if (!config) { res.status(404).json({ ok: false, error: "Agent config not found" }); return; }
    if (config.filledPaidSeats >= config.totalPaidSeats) {
      res.status(409).json({ ok: false, error: "All paid seats are full" }); return;
    }

    // Create USDC payment request via existing commission-splitter
    const paymentRequest = await createUsdcPaymentRequest({
      agentId:    resolvedAgentId,
      payerId:    user.id,
      payerEmail: user.email,
      amountUsd:  config.paidSeatPriceUsdc,
      purpose:    "paid_seat",
    });

    // Create a pending paid slot linked to this payment request
    const [slot] = await db.insert(vesselSlotsTable).values({
      agentId:              resolvedAgentId,
      userId:               user.id,
      slotType:             "paid",
      status:               "pending_offer",
      usdcPaymentRequestId: paymentRequest.id,
      referredByUserId:     user.referredById ?? null,
    }).returning();

    res.json({
      ok: true,
      slotId:          slot.id,
      paymentRequestId: paymentRequest.id,
      referenceCode:   paymentRequest.referenceCode,
      // User sends exactly this amount to this address on Base mainnet
      amountUsdc:      paymentRequest.amountUsdc,
      toAddress:       paymentRequest.toAddress,
      network:         "base-mainnet",
      expiresAt:       paymentRequest.expiresAt,
      instructions:    `Send exactly ${paymentRequest.amountUsdc} USDC on Base mainnet to ${paymentRequest.toAddress}. Include reference: ${paymentRequest.referenceCode}`,
    });
  } catch (err: any) { res.status(400).json({ ok: false, error: err.message }); }
});

// ── POST /vessel/slots/confirm-payment ────────────────────────────────────────
// Called after user sends USDC. Can be:
//   - Self-reported (user pastes txHash)
//   - Webhook from Base chain monitor (future)
// Verifies tx, fires splits, activates slot.
router.post("/vessel/slots/confirm-payment", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const { slotId, paymentRequestId, txHash } = req.body;

    if (!txHash) { res.status(400).json({ ok: false, error: "txHash required" }); return; }

    // Load slot + payment request
    const slot = await db.select()
      .from(vesselSlotsTable)
      .where(and(eq(vesselSlotsTable.id, slotId), eq(vesselSlotsTable.userId, user.id)))
      .limit(1).then(r => r[0]);

    if (!slot) { res.status(404).json({ ok: false, error: "Slot not found" }); return; }

    // Resolve split recipients from existing data
    // Referrer = whoever referred this user
    const referrer = user.referredById
      ? await db.select({ id: usersTable.id, walletAddress: usersTable.walletAddress })
          .from(usersTable).where(eq(usersTable.id, user.referredById)).limit(1).then(r => r[0])
      : null;

    // Config for ops wallets
    const config = await db.select()
      .from(vesselAgentConfigTable)
      .where(eq(vesselAgentConfigTable.agentId, slot.agentId))
      .limit(1).then(r => r[0]);

    // Confirm payment + fire 25/25/25/25 splits via existing commission-splitter
    await confirmPaymentAndSplit(paymentRequestId, txHash, {
      referrerId:          referrer?.id,
      referrerAddress:     referrer?.walletAddress ?? undefined,
      agentManagerAddress: config?.agentOpsWallet ?? process.env.CDP_TREASURY_ADDRESS,
      botOpsAddress:       config?.botOpsWallet   ?? process.env.CDP_TREASURY_ADDRESS,
      devAddress:          config?.protocolWallet  ?? process.env.CDP_TREASURY_ADDRESS,
    });

    // Mark slot as paid + activate it (skip offer/link gate for paid seats)
    const now       = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days for paid

    await db.update(vesselSlotsTable).set({
      status:          "active",
      paidAmountUsdc:  config?.paidSeatPriceUsdc ?? 50,
      paidAt:          now,
      linkSavedAt:     now,
      activatedAt:     now,
      expiresAt,
      updatedAt:       now,
    }).where(eq(vesselSlotsTable.id, slotId));

    // Increment filled seats counter
    await db.update(vesselAgentConfigTable)
      .set({ filledPaidSeats: sql`${vesselAgentConfigTable.filledPaidSeats} + 1`, updatedAt: new Date() })
      .where(eq(vesselAgentConfigTable.agentId, slot.agentId));

    const appUrl = process.env.APP_URL || "https://vesselprotocol.xyz";
    res.json({
      ok:           true,
      status:       "active",
      expiresAt,
      referralLink: `${appUrl}/r/${user.referralCode}`,
      message:      `Paid seat activated for 30 days. Splits fired on-chain.`,
    });
  } catch (err: any) { res.status(400).json({ ok: false, error: err.message }); }
});

// ── GET /vessel/me ─────────────────────────────────────────────────────────────
router.get("/vessel/me", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const stats  = await getVesselUserStats(user.id);
    const appUrl = process.env.APP_URL || "https://vesselprotocol.xyz";
    res.json({
      ok: true,
      referralLink: `${appUrl}/r/${user.referralCode}`,
      referralCode: user.referralCode,
      ...stats,
    });
  } catch (err: any) { res.status(500).json({ ok: false, error: err.message }); }
});

// ── POST /vessel/conversion — partner webhook ──────────────────────────────────
router.post("/vessel/conversion", async (req, res) => {
  try {
    const sig    = (req.headers["x-vessel-signature"] as string) ?? "";
    const secret = process.env.VESSEL_WEBHOOK_SECRET;
    if (secret) {
      const expected = crypto.createHmac("sha256", secret).update(JSON.stringify(req.body)).digest("hex");
      if (sig !== expected) { res.status(401).json({ ok: false, error: "Invalid signature" }); return; }
    }

    const { referralCode, agentSlug, eventType = "offer_signup", grossAmountUsdc = 0, platform, postId, convertedEmail } = req.body;
    if (!referralCode || !agentSlug) { res.status(400).json({ ok: false, error: "referralCode and agentSlug required" }); return; }

    const [affiliateUser, agent] = await Promise.all([
      db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.referralCode, referralCode)).limit(1).then(r => r[0]),
      db.select({ id: agentsTable.id }).from(agentsTable).where(eq(agentsTable.slug, agentSlug)).limit(1).then(r => r[0]),
    ]);

    if (!affiliateUser) { res.status(404).json({ ok: false, error: "Referral code not found" }); return; }
    if (!agent)         { res.status(404).json({ ok: false, error: "Agent not found" }); return; }

    let convertedUserId: string | undefined;
    if (convertedEmail) {
      const cu = await db.select({ id: usersTable.id }).from(usersTable)
        .where(eq(usersTable.email, convertedEmail.toLowerCase())).limit(1).then(r => r[0]);
      convertedUserId = cu?.id;
    }

    const eventId = await recordConversion({
      agentId: agent.id, affiliateUserId: affiliateUser.id, convertedUserId,
      eventType, grossAmountUsdc, platform, postId, referralCode,
    });
    res.json({ ok: true, eventId });
  } catch (err: any) { res.status(500).json({ ok: false, error: err.message }); }
});

// ── Internal: rotator + rotation logging ──────────────────────────────────────
router.get("/vessel/internal/agents/:id/rotator", async (req, res) => {
  if (req.headers["x-internal-secret"] !== (process.env.INTERNAL_SECRET || "dev")) {
    res.status(401).json({ ok: false }); return;
  }
  try {
    const slots = await getActiveRotationSlots(req.params.id);
    res.json({ ok: true, slots });
  } catch (err: any) { res.status(500).json({ ok: false, error: err.message }); }
});

router.post("/vessel/internal/agents/:id/rotation-posted", async (req, res) => {
  if (req.headers["x-internal-secret"] !== (process.env.INTERNAL_SECRET || "dev")) {
    res.status(401).json({ ok: false }); return;
  }
  try {
    const { slotId, userId, platform, postId, postUrl, linkUsed } = req.body;
    await recordRotation({ slotId, agentId: req.params.id, userId, platform, postId, postUrl, linkUsed });
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ ok: false, error: err.message }); }
});

export default router;
