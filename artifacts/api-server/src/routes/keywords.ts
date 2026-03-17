import { Router } from "express";
import { db } from "@workspace/db";
import { agentKeywordsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";
import { buildIcpFromUrl } from "../lib/moltis.js";

const router = Router();

router.get("/keywords", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const kw = await db.select().from(agentKeywordsTable).where(eq(agentKeywordsTable.userId, user.id)).limit(1).then(r => r[0]);
    res.json({
      keywords: kw?.keywords || [],
      painPoints: kw?.painPoints || [],
      buyerIntentPhrases: kw?.buyerIntentPhrases || [],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/keywords", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const { keywords, painPoints, buyerIntentPhrases } = req.body;
    const existing = await db.select().from(agentKeywordsTable).where(eq(agentKeywordsTable.userId, user.id)).limit(1).then(r => r[0]);

    if (existing) {
      await db.update(agentKeywordsTable).set({ keywords, painPoints, buyerIntentPhrases, updatedAt: new Date() }).where(eq(agentKeywordsTable.id, existing.id));
    } else {
      await db.insert(agentKeywordsTable).values({ userId: user.id, keywords, painPoints, buyerIntentPhrases });
    }

    res.json({ keywords, painPoints, buyerIntentPhrases });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/icp/build", requireAuth, async (req, res) => {
  try {
    const { offerUrl } = req.body;
    if (!offerUrl) {
      res.status(400).json({ error: "offerUrl required" });
      return;
    }

    const icp = await buildIcpFromUrl(offerUrl);
    res.json(icp);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
