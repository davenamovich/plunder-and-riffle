/**
 * Background worker — runs scheduled tasks inside the API server process.
 *
 * Schedule:
 *   30s   — expire stale rotator slots
 *   2 min — Ralph classify loop (raw → scored)
 *   5 min — Ralph draft loop  (scored → pending_approval / approved)
 *   60 min — roll up agent metrics (future)
 *   24h   — reset daily lead caps
 */

import { db } from "@workspace/db";
import { rotatorSlotsTable, agentsTable } from "@workspace/db/schema";
import { eq, and, lt } from "drizzle-orm";
import { classifyRawLeads, draftScoredLeads } from "./ralph.js";

const SECOND = 1000;
const MINUTE = 60 * SECOND;

// ─── Tasks ────────────────────────────────────────────────────────────────────

async function expireStaleSlots() {
  try {
    const now = new Date();
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
    const now = new Date();
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
  } catch (err) {
    console.error("[worker] resetDailyCaps error:", err);
  }
}

async function runClassifyTick() {
  try {
    const result = await classifyRawLeads();
    if (result.processed > 0) {
      console.log(`[worker] classify: ${result.processed} processed, ${result.rejected} rejected`);
    }
  } catch (err) {
    console.error("[worker] classify tick error:", err);
  }
}

async function runDraftTick() {
  try {
    const result = await draftScoredLeads();
    if (result.drafted > 0) {
      console.log(`[worker] draft: ${result.drafted} drafted`);
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

  // Expire stale slots — every 30s
  setInterval(expireStaleSlots, 30 * SECOND);

  // Classify raw leads — every 2 min
  setInterval(runClassifyTick, 2 * MINUTE);

  // Draft scored leads — every 5 min
  setInterval(runDraftTick, 5 * MINUTE);

  // Reset daily caps — every hour (cheap check, only acts when needed)
  setInterval(resetDailyCaps, 60 * MINUTE);

  // Run immediately on start to catch anything queued
  setTimeout(() => {
    expireStaleSlots();
    resetDailyCaps();
    runClassifyTick().then(() => runDraftTick());
  }, 5 * SECOND);

  console.log("[worker] scheduled: expire=30s, classify=2m, draft=5m, caps=60m");
}
