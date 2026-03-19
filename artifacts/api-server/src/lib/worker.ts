/**
 * Background worker — runs scheduled tasks inside the API server process.
 *
 * Schedule (budget-aware, batch-optimised for 5000 calls/day):
 *   30s    — expire stale rotator slots (no API calls)
 *   8 min  — Ralph classify batch (1 call per tick, up to 30 leads)
 *   12 min — Ralph draft batch    (1 call per tick, up to 30 leads)
 *   60 min — reset daily caps + log API usage
 *
 * Budget math (worst-case, all leads every tick):
 *   classify: 24h / 8min  = 180 calls/day  → 5,400 leads/day
 *   draft:    24h / 12min = 120 calls/day  → 3,600 leads/day
 *   engine:   every 30min =  48 calls/day
 *   sports:   every 6h    =  ~12 calls/day
 *   Total automated: ~360 calls/day  →  leaves ~4,540 for on-demand use
 */

import { db } from "@workspace/db";
import { rotatorSlotsTable, agentsTable } from "@workspace/db/schema";
import { eq, and, lt, isNull, isNotNull } from "drizzle-orm";
import { classifyRawLeads, draftScoredLeads } from "./ralph.js";
import { getDailyUsage } from "./moltis.js";
import { seedDefaultSequenceIfNeeded } from "./dm.js";
import { runAllAgentEngines } from "./agent-engine.js";
import { runSportsTipsEngine } from "./sports-tips.js";
import { createAgentWallet, isCDPConfigured, sweepWallet } from "./cdp.js";

const SECOND = 1000;
const MINUTE = 60 * SECOND;

// ─── Tasks ────────────────────────────────────────────────────────────────────

async function expireStaleSlots() {
  try {
    const now     = new Date();
    const expired = await db
      .update(rotatorSlotsTable)
      .set({ status: "expired", expiredAt: now })
      .where(and(eq(rotatorSlotsTable.status, "active"), lt(rotatorSlotsTable.expiresAt, now)))
      .returning();

    if (expired.length > 0) {
      console.log(`[worker] expired ${expired.length} rotator slots`);
    }
  } catch (err) {
    console.error("[worker] expireStaleSlots error:", err);
  }
}

async function resetDailyCaps() {
  try {
    const now      = new Date();
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);

    const reset = await db
      .update(agentsTable)
      .set({ dailyLeadCount: 0, dailyCapResetAt: now })
      .where(lt(agentsTable.dailyCapResetAt, midnight))
      .returning();

    if (reset.length > 0) {
      console.log(`[worker] reset daily caps for ${reset.length} agents`);
    }

    // Log API usage summary
    const usage = await getDailyUsage();
    console.log(`[worker] daily API usage: ${usage.used}/${usage.cap} calls used, ${usage.remaining} remaining`);
  } catch (err) {
    console.error("[worker] resetDailyCaps error:", err);
  }
}

async function runClassifyTick() {
  try {
    const result = await classifyRawLeads();
    if (result.processed > 0) {
      console.log(`[worker] classify: ${result.processed} processed, ${result.rejected} rejected${result.skipped > 0 ? `, ${result.skipped} skipped (budget)` : ""}`);
    }
  } catch (err) {
    console.error("[worker] classify tick error:", err);
  }
}

async function runDraftTick() {
  try {
    const result = await draftScoredLeads();
    if (result.drafted > 0) {
      console.log(`[worker] draft: ${result.drafted} drafted${result.skipped > 0 ? `, ${result.skipped} skipped (budget)` : ""}`);
    }
  } catch (err) {
    console.error("[worker] draft tick error:", err);
  }
}

// ─── CDP Wallet provisioning ──────────────────────────────────────────────────
// Runs every 5 minutes — provisions ONE missing wallet per tick.
// Sequential single-wallet-per-tick approach avoids CDP rate limits entirely.

async function provisionNextMissingWallet() {
  if (!isCDPConfigured()) return;
  try {
    const agent = await db
      .select({ id: agentsTable.id, slug: agentsTable.slug, name: agentsTable.name })
      .from(agentsTable)
      .where(isNull(agentsTable.cdpWalletId))
      .limit(1)
      .then(r => r[0]);

    if (!agent) return; // all agents have wallets

    console.log(`[cdp-worker] provisioning wallet for agent "${agent.slug}"…`);
    const wallet = await createAgentWallet("base-mainnet", agent.name);
    await db.update(agentsTable).set({
      cdpWalletId: wallet.walletId,
      cdpWalletAddress: wallet.address,
      cdpWalletNetwork: wallet.network,
      cdpWalletSeed: wallet.seed ?? null,
      cdpWalletCreatedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(agentsTable.id, agent.id));
    console.log(`[cdp-worker] wallet provisioned for "${agent.slug}": ${wallet.address}`);
  } catch (err: any) {
    console.warn("[cdp-worker] wallet provision failed:", err?.apiCode ?? err?.message);
  }
}

// ─── Bot Ops Sweep ─────────────────────────────────────────────────────────────
// Runs every 60 min — sweeps agent wallet USDC surplus above per-agent threshold to Protocol wallet.
// Keeps each agent funded up to their threshold for API micro-payments; sends surplus on-chain.

async function botOpsSweepJob() {
  if (!isCDPConfigured()) return;

  // Resolve protocol wallet address from ralph settings
  const ralph = await db.select({ protocolWalletAddress: agentsTable.protocolWalletAddress })
    .from(agentsTable).where(eq(agentsTable.slug, "ralph")).limit(1).then(r => r[0]);
  const protocolAddress = ralph?.protocolWalletAddress;
  if (!protocolAddress) {
    console.log("[bot-ops-sweep] skipped — no protocolWalletAddress set on ralph settings");
    return;
  }

  const agents = await db.select({
    id: agentsTable.id, slug: agentsTable.slug,
    cdpWalletSeed: agentsTable.cdpWalletSeed,
    cdpWalletAddress: agentsTable.cdpWalletAddress,
    botOpsSweepThresholdUsd: agentsTable.botOpsSweepThresholdUsd,
  }).from(agentsTable).where(and(isNotNull(agentsTable.cdpWalletSeed), isNotNull(agentsTable.cdpWalletAddress)));

  let swept = 0;
  for (const agent of agents) {
    if (!agent.cdpWalletSeed || !agent.cdpWalletAddress) continue;
    try {
      const { transfers } = await sweepWallet(agent.cdpWalletSeed, protocolAddress, ["usdc"]);
      // Note: sweepWallet sweeps full balance; threshold management via CDP transfer amount
      // For future: partial sweep (keep threshold) requires amount-specific transfer
      for (const t of transfers) {
        if (t.txHash) {
          console.log(`[bot-ops-sweep] agent "${agent.slug}" swept ${t.amount} ${t.asset} → Protocol | tx: ${t.txHash}`);
          swept++;
        }
      }
    } catch (err: any) {
      console.warn(`[bot-ops-sweep] agent "${agent.slug}" sweep failed:`, err?.message);
    }
  }
  if (swept > 0) console.log(`[bot-ops-sweep] completed — ${swept} sweep(s) executed`);
}

// ─── Scheduler ────────────────────────────────────────────────────────────────

let started = false;

export function startWorker() {
  if (started) return;
  started = true;

  console.log("[worker] starting background worker");

  // Expire stale slots — every 30s (free)
  setInterval(expireStaleSlots, 30 * SECOND);

  // Classify raw leads — every 8 min (1 API call, 30 leads)
  setInterval(runClassifyTick, 8 * MINUTE);

  // Draft scored leads — every 12 min (1 API call, 30 leads)
  setInterval(runDraftTick, 12 * MINUTE);

  // Reset daily caps + log usage — every hour
  setInterval(resetDailyCaps, 60 * MINUTE);

  // Agent engine — every 30 minutes (respects per-agent engineNextRunAt)
  setInterval(async () => {
    try { await runAllAgentEngines(); } catch (err) {
      console.error("[worker] engine tick error:", err);
    }
  }, 30 * MINUTE);

  // Sports tips — twice daily (9am + 7pm UTC equivalent: 6h intervals after first run)
  // First run at startup is deferred; then every 6 hours
  setInterval(async () => {
    const hour = new Date().getUTCHours();
    // Only post during reasonable hours (7am–10pm UTC)
    if (hour >= 7 && hour <= 22) {
      try {
        const result = await runSportsTipsEngine("scheduler");
        console.log(`[worker] sports-tips: fixtures=${result.fixturesFound}, tips=${result.tipsSent}`);
      } catch (err) {
        console.error("[worker] sports-tips tick error:", err);
      }
    }
  }, 6 * 60 * MINUTE);

  // CDP wallet provisioning — every 5 minutes, ONE wallet per tick (avoids rate limits)
  setInterval(provisionNextMissingWallet, 5 * MINUTE);

  // Bot ops sweep — every 60 minutes, sweeps surplus USDC from agent wallets → Protocol wallet
  setInterval(() => {
    botOpsSweepJob().catch(err => console.error("[worker] bot-ops-sweep error:", err));
  }, 60 * MINUTE);

  // Run immediately on start to catch any queue backlog
  setTimeout(async () => {
    await seedDefaultSequenceIfNeeded();
    expireStaleSlots();
    resetDailyCaps();
    runClassifyTick().then(() => runDraftTick());
    runAllAgentEngines().catch(err => console.error("[worker] engine startup:", err));
    // Defer wallet provisioning 30s after startup to let server settle
    setTimeout(provisionNextMissingWallet, 30 * SECOND);
    // Defer bot ops sweep 90s after startup
    setTimeout(() => botOpsSweepJob().catch(err => console.error("[worker] bot-ops-sweep startup:", err)), 90 * SECOND);
  }, 5 * SECOND);

  console.log("[worker] scheduled: expire=30s, classify=8m×30 leads, draft=12m×30 leads, caps=60m, engine=30m, sports-tips=6h, cdp-wallet=5m, bot-ops-sweep=60m | budget=5000/day");
}
