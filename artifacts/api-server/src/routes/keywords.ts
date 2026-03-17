import { Router } from "express";
import { db } from "@workspace/db";
import { agentKeywordsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";

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

    res.json({
      keywords: ["bitcoin investment", "crypto portfolio", "passive income crypto", "btc accumulation", "digital asset strategy"],
      painPoints: ["volatile markets", "don't know where to start", "missed the last bull run", "afraid of losing money", "complex tax implications"],
      buyerIntentPhrases: ["how to buy bitcoin safely", "best crypto investment 2025", "passive crypto income", "bitcoin dollar cost average", "crypto for beginners"],
      ctaAngles: ["Start with just $10", "No experience needed", "Let the AI do the heavy lifting", "Join 10,000+ investors", "Free to get started"],
      targetAudience: "Adults 25-45 interested in financial independence, passive income, and building wealth through digital assets. They are tech-curious but not deeply technical.",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
