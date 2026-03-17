import { Router } from "express";
import { db } from "@workspace/db";
import { leadsTable } from "@workspace/db/schema";
import { eq, count, sql } from "drizzle-orm";
import { requireAdmin } from "../lib/auth.js";

const router = Router();

router.post("/leads/ingest", async (req, res) => {
  try {
    const { source, externalId, content, authorHandle, authorUrl, postUrl } = req.body;
    if (!source || !externalId || !content) {
      res.status(400).json({ error: "source, externalId, content required" });
      return;
    }

    const existing = await db.select().from(leadsTable).where(eq(leadsTable.externalId, externalId)).limit(1).then(r => r[0]);
    if (existing) {
      res.json({
        id: existing.id,
        source: existing.source,
        externalId: existing.externalId,
        status: existing.status,
        score: existing.score,
        draft: existing.draft,
        postedAt: existing.postedAt,
        createdAt: existing.createdAt,
      });
      return;
    }

    const [lead] = await db.insert(leadsTable).values({
      source,
      externalId,
      content,
      authorHandle,
      authorUrl,
      postUrl,
      status: "raw",
    }).returning();

    res.json({
      id: lead.id,
      source: lead.source,
      externalId: lead.externalId,
      status: lead.status,
      score: lead.score,
      draft: lead.draft,
      postedAt: lead.postedAt,
      createdAt: lead.createdAt,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/leads", requireAdmin, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, parseInt(req.query.limit as string) || 20);
    const status = req.query.status as string | undefined;

    let query = db.select().from(leadsTable);
    if (status) {
      query = query.where(eq(leadsTable.status, status)) as typeof query;
    }

    const [leads, total] = await Promise.all([
      query.limit(limit).offset((page - 1) * limit),
      db.select({ count: count() }).from(leadsTable).then(r => Number(r[0]?.count ?? 0)),
    ]);

    res.json({
      leads: leads.map(l => ({
        id: l.id,
        source: l.source,
        externalId: l.externalId,
        status: l.status,
        score: l.score,
        draft: l.draft,
        postedAt: l.postedAt,
        createdAt: l.createdAt,
      })),
      total,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/leads/:id/approve", requireAdmin, async (req, res) => {
  try {
    const lead = await db.select().from(leadsTable).where(eq(leadsTable.id, req.params.id)).limit(1).then(r => r[0]);
    if (!lead) {
      res.status(404).json({ error: "Lead not found" });
      return;
    }

    const [updated] = await db.update(leadsTable).set({ status: "approved", updatedAt: new Date() }).where(eq(leadsTable.id, req.params.id)).returning();
    res.json({
      id: updated.id,
      source: updated.source,
      externalId: updated.externalId,
      status: updated.status,
      score: updated.score,
      draft: updated.draft,
      postedAt: updated.postedAt,
      createdAt: updated.createdAt,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
