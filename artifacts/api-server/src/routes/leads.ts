import { Router } from "express";
import { db } from "@workspace/db";
import { leadsTable } from "@workspace/db/schema";
import { eq, count } from "drizzle-orm";
import { requireAdmin } from "../lib/auth.js";
import { classifyLead, draftResponse } from "../lib/moltis.js";
import { approveLead, rejectLead, markLeadPosted } from "../lib/ralph.js";

const router = Router();

function serializeLead(l: typeof leadsTable.$inferSelect) {
  return {
    id: l.id,
    source: l.source,
    externalId: l.externalId,
    authorHandle: l.authorHandle,
    authorUrl: l.authorUrl,
    postUrl: l.postUrl,
    content: l.content,
    status: l.status,
    score: l.score,
    scoreReason: l.scoreReason,
    draft: l.draft,
    rejectedReason: l.rejectedReason,
    rejectedAt: l.rejectedAt,
    postedAt: l.postedAt,
    createdAt: l.createdAt,
    updatedAt: l.updatedAt,
  };
}

// Ingest — open endpoint (called by external scrapers / Ralph)
router.post("/leads/ingest", async (req, res) => {
  try {
    const { source, externalId, content, authorHandle, authorUrl, postUrl } = req.body;
    if (!source || !externalId || !content) {
      res.status(400).json({ error: "source, externalId, content required" });
      return;
    }

    const existing = await db
      .select()
      .from(leadsTable)
      .where(eq(leadsTable.externalId, externalId))
      .limit(1)
      .then((r) => r[0]);

    if (existing) {
      res.json(serializeLead(existing));
      return;
    }

    const [lead] = await db
      .insert(leadsTable)
      .values({ source, externalId, content, authorHandle, authorUrl, postUrl, status: "raw" })
      .returning();

    res.status(201).json(serializeLead(lead));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// List leads — admin only
router.get("/leads", requireAdmin, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, parseInt(req.query.limit as string) || 20);
    const status = req.query.status as string | undefined;

    let query = db.select().from(leadsTable);
    if (status) {
      query = query.where(eq(leadsTable.status, status)) as typeof query;
    }

    const [leads, totalRows] = await Promise.all([
      query.limit(limit).offset((page - 1) * limit),
      db.select({ count: count() }).from(leadsTable).then((r) => Number(r[0]?.count ?? 0)),
    ]);

    res.json({ leads: leads.map(serializeLead), total: totalRows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Approve a lead
router.post("/leads/:id/approve", requireAdmin, async (req, res) => {
  try {
    const ok = await approveLead(req.params.id);
    if (!ok) {
      res.status(404).json({ error: "Lead not found or not in approvable state" });
      return;
    }
    const lead = await db.select().from(leadsTable).where(eq(leadsTable.id, req.params.id)).limit(1).then((r) => r[0]);
    res.json(serializeLead(lead!));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Reject a lead
router.post("/leads/:id/reject", requireAdmin, async (req, res) => {
  try {
    const { reason = "Rejected by admin" } = req.body;
    const ok = await rejectLead(req.params.id, reason);
    if (!ok) {
      res.status(404).json({ error: "Lead not found" });
      return;
    }
    const lead = await db.select().from(leadsTable).where(eq(leadsTable.id, req.params.id)).limit(1).then((r) => r[0]);
    res.json(serializeLead(lead!));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Mark a lead as posted
router.post("/leads/:id/post", requireAdmin, async (req, res) => {
  try {
    const ok = await markLeadPosted(req.params.id);
    if (!ok) {
      res.status(404).json({ error: "Lead not found or not approved" });
      return;
    }
    const lead = await db.select().from(leadsTable).where(eq(leadsTable.id, req.params.id)).limit(1).then((r) => r[0]);
    res.json(serializeLead(lead!));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Manually trigger classification for a single lead — admin only
router.post("/leads/:id/classify", requireAdmin, async (req, res) => {
  try {
    const lead = await db.select().from(leadsTable).where(eq(leadsTable.id, req.params.id)).limit(1).then((r) => r[0]);
    if (!lead) {
      res.status(404).json({ error: "Lead not found" });
      return;
    }

    const keywords: string[] = req.body.keywords || [];
    const { score, reason } = await classifyLead(lead.content, keywords);
    const now = new Date();

    const [updated] = await db
      .update(leadsTable)
      .set({ status: "scored", score, scoreReason: reason, updatedAt: now })
      .where(eq(leadsTable.id, req.params.id))
      .returning();

    res.json(serializeLead(updated));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Manually trigger draft generation for a single lead — admin only
router.post("/leads/:id/draft", requireAdmin, async (req, res) => {
  try {
    const lead = await db.select().from(leadsTable).where(eq(leadsTable.id, req.params.id)).limit(1).then((r) => r[0]);
    if (!lead) {
      res.status(404).json({ error: "Lead not found" });
      return;
    }

    const persona: string = req.body.persona || "Ralph, the BTC Experiment agent";
    const { draft } = await draftResponse(lead.content, persona, lead.postUrl);

    const [updated] = await db
      .update(leadsTable)
      .set({ status: "pending_approval", draft, updatedAt: new Date() })
      .where(eq(leadsTable.id, req.params.id))
      .returning();

    res.json(serializeLead(updated));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
