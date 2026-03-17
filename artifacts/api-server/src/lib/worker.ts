/**
 * Background worker — runs scheduled tasks inside the API server process.
 *
 * Schedule (budget-aware, batch-optimised for 2000 calls/day):
 *   30s    — expire stale rotator slots (no API calls)
 *   15 min — Ralph classify batch (1 call per tick, up to 20 leads)
 *   20 min — Ralph draft batch    (1 call per tick, up to 20 leads)
 *   60 min — reset daily caps + log API usage
 *
 * Budget math (worst-case, all leads every tick):
 *   classify: 24h / 15min = 96 calls/day
 *   draft:    24h / 20min = 72 calls/day
 *   Total automated: ~168 calls/day  →  leaves ~1,832 for on-demand use
 */

import { db } from "@workspace/db";
import { rotatorSlotsTable, agentsTable } from "@workspace/db/schema";
import { eq, and, lt } from "drizzle-orm";
import { classifyRawLeads, draftScoredLeads } from "./ralph.js";
import { getDailyUsage } from "./moltis.js";

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

// ─── Scheduler ────────────────────────────────────────────────────────────────

let started = false;

export function startWorker() {
  if (started) return;
  started = true;

  console.log("[worker] starting background worker");

  // Expire stale slots — every 30s (free)
  setInterval(expireStaleSlots, 30 * SECOND);

  // Classify raw leads — every 15 min (1 API call, 20 leads)
  setInterval(runClassifyTick, 15 * MINUTE);

  // Draft scored leads — every 20 min (1 API call, 20 leads)
  setInterval(runDraftTick, 20 * MINUTE);

  // Reset daily caps + log usage — every hour
  setInterval(resetDailyCaps, 60 * MINUTE);

  // Run immediately on start to catch any queue backlog
  setTimeout(() => {
    expireStaleSlots();
    resetDailyCaps();
    runClassifyTick().then(() => runDraftTick());
  }, 5 * SECOND);

  console.log("[worker] scheduled: expire=30s, classify=15m (batch), draft=20m (batch), caps=60m");
}
