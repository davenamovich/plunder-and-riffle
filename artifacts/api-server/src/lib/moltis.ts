/**
 * Moltis client — Chutes.ai (OpenAI-compatible) with true batch processing.
 *
 * Key design: N leads → 1 API call (not N calls).
 * Daily budget: 2000 calls/day hard cap, tracked in DB.
 *
 * Env vars:
 *   CHUTES_API_KEY   — Chutes.ai API key
 *   CHUTES_BASE_URL  — default: https://llm.chutes.ai/v1
 *   CHUTES_MODEL     — default: chutesai/Mistral-Small-3.2-24B-Instruct-2506
 *   CHUTES_DAILY_CAP — default: 2000
 */

import { db } from "@workspace/db";
import { apiUsageTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const CHUTES_BASE_URL = process.env.CHUTES_BASE_URL || "https://llm.chutes.ai/v1";
const CHUTES_API_KEY  = process.env.CHUTES_API_KEY;
const CHUTES_MODEL    = process.env.CHUTES_MODEL || "chutesai/Mistral-Small-3.2-24B-Instruct-2506";
const DAILY_CAP       = parseInt(process.env.CHUTES_DAILY_CAP || "2000", 10);
const HARD_STOP       = DAILY_CAP - 100; // stop 100 before limit as buffer

// ─── Daily budget tracking ────────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}

export async function getDailyUsage(): Promise<{ date: string; used: number; remaining: number; cap: number }> {
  const date = todayStr();
  const row = await db.select().from(apiUsageTable).where(eq(apiUsageTable.date, date)).limit(1).then(r => r[0]);
  const used = row?.callCount ?? 0;
  return { date, used, remaining: Math.max(0, HARD_STOP - used), cap: DAILY_CAP };
}

async function trackApiCalls(n: number): Promise<void> {
  const date = todayStr();
  const existing = await db.select().from(apiUsageTable).where(eq(apiUsageTable.date, date)).limit(1).then(r => r[0]);

  if (existing) {
    await db.update(apiUsageTable)
      .set({ callCount: existing.callCount + n, updatedAt: new Date() })
      .where(eq(apiUsageTable.date, date));
  } else {
    await db.insert(apiUsageTable).values({ date, callCount: n, updatedAt: new Date() });
  }
}

export async function hasBudget(callsNeeded = 1): Promise<boolean> {
  const { remaining } = await getDailyUsage();
  return remaining >= callsNeeded;
}

// ─── Raw Chutes chat call ─────────────────────────────────────────────────────

async function chat(systemPrompt: string, userMessage: string): Promise<string> {
  const res = await fetch(`${CHUTES_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${CHUTES_API_KEY}`,
    },
    body: JSON.stringify({
      model: CHUTES_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userMessage },
      ],
      temperature: 0.2,
      max_tokens: 1024,
    }),
  });

  await trackApiCalls(1);

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Chutes API error ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json() as { choices: { message: { content: string } }[] };
  return data.choices[0]?.message?.content?.trim() ?? "";
}

// ─── Fallback (no API key or budget exhausted) ────────────────────────────────

function fallbackScore(content: string, keywords: string[]): ClassifyResult {
  if (!keywords.length) return { score: 0.3, reason: "No keywords configured" };
  const lower = content.toLowerCase();
  const hits   = keywords.filter(kw => lower.includes(kw.toLowerCase()));
  const ratio  = hits.length / keywords.length;
  const score  = parseFloat(Math.min(0.95, 0.2 + ratio * 0.75).toFixed(3));
  const reason = hits.length === 0
    ? "No keyword matches found"
    : `Matched ${hits.length}/${keywords.length} keywords: ${hits.slice(0, 3).join(", ")}`;
  return { score, reason };
}

function fallbackDraft(content: string, persona: string): string {
  const trimmed = content.slice(0, 80).replace(/\n/g, " ").trim();
  const name    = persona.split(",")[0].trim() || "Ralph";
  return `This is exactly what ${name} was built for — helping people move from "${trimmed}..." to real clarity and results. Happy to point you in the right direction if you're open to it!`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ClassifyResult { score: number; reason: string }
export interface DraftResult    { draft: string }
export interface BatchClassifyResult { results: ClassifyResult[]; usedFallback: boolean }
export interface BatchDraftResult    { results: DraftResult[];    usedFallback: boolean }

export interface IcpResult {
  keywords: string[];
  painPoints: string[];
  buyerIntentPhrases: string[];
  ctaAngles: string[];
  targetAudience: string;
}

// ─── Batch classify (N leads → 1 API call) ───────────────────────────────────

export interface LeadInput { id: string; content: string }

export async function batchClassifyLeads(
  leads: LeadInput[],
  keywords: string[] = [],
): Promise<BatchClassifyResult> {
  if (!leads.length) return { results: [], usedFallback: false };

  if (!CHUTES_API_KEY || !(await hasBudget(1))) {
    return {
      results: leads.map(l => fallbackScore(l.content, keywords)),
      usedFallback: true,
    };
  }

  const kwLine = keywords.length
    ? `Target keywords (boost score if present): ${keywords.join(", ")}`
    : "Target keywords: bitcoin, btc, crypto, passive income, investing";

  const system = `You are a lead scoring AI for a bitcoin/crypto platform.

${kwLine}

Score each post's relevance to crypto investing / bitcoin accumulation on a 0.0–1.0 scale:
- 0.0 = completely unrelated
- 0.35 = low relevance
- 0.65 = moderately relevant
- 1.0 = strong buyer intent (wants to invest, frustrated with money, seeking crypto strategy)

Rules:
- Score higher if they mention: frustration with money/savings, wanting passive income, asking about crypto strategy, mentioning BTC/bitcoin, wanting to grow wealth
- Score lower for: news articles, pure technical discussion, unrelated topics
- Return ONLY valid JSON — an array with exactly ${leads.length} objects, one per post, in order
- Format: [{"score": 0.0, "reason": "brief"}, ...]`;

  const numbered = leads
    .map((l, i) => `Post ${i + 1}:\n${l.content.slice(0, 500)}`)
    .join("\n\n---\n\n");

  try {
    const response = await chat(system, `Score these ${leads.length} posts:\n\n${numbered}`);
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error("No JSON array in response");

    const parsed: { score: number | string; reason: string }[] = JSON.parse(jsonMatch[0]);

    if (!Array.isArray(parsed) || parsed.length !== leads.length) {
      throw new Error(`Expected ${leads.length} results, got ${parsed.length}`);
    }

    const results: ClassifyResult[] = parsed.map(p => ({
      score:  Math.min(1, Math.max(0, parseFloat(String(p.score)) || 0)),
      reason: String(p.reason || "AI classified").slice(0, 300),
    }));

    console.log(`[chutes] batch classified ${leads.length} leads (1 API call)`);
    return { results, usedFallback: false };
  } catch (err) {
    console.warn("[chutes] batch classify failed, using fallback:", (err as Error).message);
    return {
      results: leads.map(l => fallbackScore(l.content, keywords)),
      usedFallback: true,
    };
  }
}

// ─── Batch draft (N leads → 1 API call) ──────────────────────────────────────

export async function batchDraftResponses(
  leads: LeadInput[],
  persona: string,
): Promise<BatchDraftResult> {
  if (!leads.length) return { results: [], usedFallback: false };

  if (!CHUTES_API_KEY || !(await hasBudget(1))) {
    return {
      results: leads.map(l => ({ draft: fallbackDraft(l.content, persona) })),
      usedFallback: true,
    };
  }

  const system = `You are ${persona}.

Write a short, natural engagement reply for each social media post below. Each reply must:
- Sound human and genuine, not salesy or robotic
- Acknowledge their specific pain point or situation
- Subtly position you as someone who can help (without being pushy)
- Be under 250 characters
- NOT include hashtags, emojis, or URLs
- NOT mention specific products or company names

Return ONLY valid JSON — an array with exactly ${leads.length} objects, in order:
[{"draft": "your reply here"}, ...]`;

  const numbered = leads
    .map((l, i) => `Post ${i + 1}:\n${l.content.slice(0, 400)}`)
    .join("\n\n---\n\n");

  try {
    const response = await chat(system, `Write replies for these ${leads.length} posts:\n\n${numbered}`);
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error("No JSON array in response");

    const parsed: { draft: string }[] = JSON.parse(jsonMatch[0]);

    if (!Array.isArray(parsed) || parsed.length !== leads.length) {
      throw new Error(`Expected ${leads.length} drafts, got ${parsed.length}`);
    }

    const results: DraftResult[] = parsed.map(p => ({
      draft: String(p.draft || "").slice(0, 300),
    }));

    console.log(`[chutes] batch drafted ${leads.length} leads (1 API call)`);
    return { results, usedFallback: false };
  } catch (err) {
    console.warn("[chutes] batch draft failed, using fallback:", (err as Error).message);
    return {
      results: leads.map(l => ({ draft: fallbackDraft(l.content, persona) })),
      usedFallback: true,
    };
  }
}

// ─── Single-lead helpers (still used by manual endpoints) ────────────────────

export async function classifyLead(content: string, keywords: string[] = []): Promise<ClassifyResult> {
  const { results } = await batchClassifyLeads([{ id: "single", content }], keywords);
  return results[0] ?? fallbackScore(content, keywords);
}

export async function draftResponse(content: string, persona: string, _postUrl?: string | null): Promise<DraftResult> {
  const { results } = await batchDraftResponses([{ id: "single", content }], persona);
  return results[0] ?? { draft: fallbackDraft(content, persona) };
}

// ─── ICP builder ──────────────────────────────────────────────────────────────

export async function buildIcpFromUrl(offerUrl: string): Promise<IcpResult> {
  if (!CHUTES_API_KEY || !(await hasBudget(1))) {
    return fallbackIcp();
  }

  const system = `You are a marketing strategist for a bitcoin/crypto platform. Given an offer URL, generate a detailed Ideal Customer Profile (ICP) for finding high-quality leads on social media.

Return ONLY valid JSON:
{
  "keywords": ["string", ...],
  "painPoints": ["string", ...],
  "buyerIntentPhrases": ["string", ...],
  "ctaAngles": ["string", ...],
  "targetAudience": "string"
}`;

  try {
    const response = await chat(system, `Generate ICP for: ${offerUrl}`);
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response");
    const p = JSON.parse(jsonMatch[0]);
    return {
      keywords:           Array.isArray(p.keywords)           ? p.keywords           : [],
      painPoints:         Array.isArray(p.painPoints)         ? p.painPoints         : [],
      buyerIntentPhrases: Array.isArray(p.buyerIntentPhrases) ? p.buyerIntentPhrases : [],
      ctaAngles:          Array.isArray(p.ctaAngles)          ? p.ctaAngles          : [],
      targetAudience:     String(p.targetAudience || ""),
    };
  } catch (err) {
    console.warn("[chutes] icp failed, using fallback:", (err as Error).message);
    return fallbackIcp();
  }
}

function fallbackIcp(): IcpResult {
  return {
    keywords:           ["bitcoin investment", "crypto portfolio", "passive income crypto", "btc accumulation", "digital asset strategy"],
    painPoints:         ["volatile markets", "don't know where to start", "missed the last bull run", "afraid of losing money"],
    buyerIntentPhrases: ["how to buy bitcoin safely", "best crypto investment 2025", "passive crypto income", "bitcoin dollar cost average"],
    ctaAngles:          ["Start with just $10", "No experience needed", "Let the AI do the heavy lifting", "Free to get started"],
    targetAudience:     "Adults 25-45 interested in financial independence, passive income, and building wealth through digital assets.",
  };
}

// ─── Status ────────────────────────────────────────────────────────────────────

export async function moltisStatusWithUsage() {
  const usage = await getDailyUsage();
  return {
    configured: !!CHUTES_API_KEY,
    baseUrl:    CHUTES_BASE_URL,
    model:      CHUTES_MODEL,
    dailyCap:   DAILY_CAP,
    usage,
  };
}

export function moltisStatus() {
  return { configured: !!CHUTES_API_KEY, baseUrl: CHUTES_BASE_URL, model: CHUTES_MODEL };
}
