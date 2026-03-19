/**
 * Moltis client — Chutes.ai (OpenAI-compatible) with true batch processing.
 *
 * Key design: N leads → 1 API call (not N calls).
 * Daily budget: 5000 calls/day hard cap, tracked in DB.
 *
 * Env vars:
 *   CHUTES_API_KEY   — Chutes.ai API key
 *   CHUTES_BASE_URL  — default: https://llm.chutes.ai/v1
 *   CHUTES_MODEL     — default: chutesai/Mistral-Small-3.2-24B-Instruct-2506
 *   CHUTES_DAILY_CAP — default: 5000
 */

import { db } from "@workspace/db";
import { apiUsageTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const CHUTES_BASE_URL = process.env.CHUTES_BASE_URL || "https://llm.chutes.ai/v1";
const CHUTES_API_KEY  = process.env.CHUTES_API_KEY;
const CHUTES_MODEL    = process.env.CHUTES_MODEL || "chutesai/Mistral-Small-3.2-24B-Instruct-2506";
const DAILY_CAP       = parseInt(process.env.CHUTES_DAILY_CAP || "5000", 10);
const HARD_STOP       = DAILY_CAP - 100;

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

export async function chatOnce(systemPrompt: string, userMessage: string, temperature = 0.7): Promise<string> {
  return chat(systemPrompt, userMessage, temperature);
}

async function chat(systemPrompt: string, userMessage: string, temperature = 0.2): Promise<string> {
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
      temperature,
      max_tokens: 1536,
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

// ─── Fallbacks ────────────────────────────────────────────────────────────────

function fallbackScore(content: string, keywords: string[]): ClassifyResult {
  if (!keywords.length) return {
    score: 0.3, reason: "No keywords configured",
    recommendedAction: "review", replyStyle: "helpful",
  };
  const lower = content.toLowerCase();
  const hits  = keywords.filter(kw => lower.includes(kw.toLowerCase()));
  const ratio = hits.length / keywords.length;
  const score = parseFloat(Math.min(0.95, 0.2 + ratio * 0.75).toFixed(3));
  const reason = hits.length === 0
    ? "No keyword matches found"
    : `Matched ${hits.length}/${keywords.length} keywords: ${hits.slice(0, 3).join(", ")}`;
  const recommendedAction: "discard" | "review" | "draft" = score < 0.35 ? "discard" : score < 0.60 ? "review" : "draft";
  return { score, reason, recommendedAction, replyStyle: "helpful" };
}

function fallbackDraft(content: string, persona: string): string {
  const trimmed = content.slice(0, 80).replace(/\n/g, " ").trim();
  const name    = persona.split(",")[0].trim() || "Ralph";
  return `This is exactly what ${name} was built for — helping people move from "${trimmed}..." to real clarity and results. Happy to point you in the right direction if you're open to it.`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type RecommendedAction = "discard" | "review" | "draft";
export type ReplyStyle        = "helpful" | "curiosity" | "ask_permission" | "soft_cta";

export interface ScoreDimensions {
  niche_match:        number;
  buyer_intent:       number;
  urgency:            number;
  likely_lead_value:  number;
  response_likelihood: number;
  spam_risk:          number;
}

export interface ClassifyResult {
  score:             number;
  reason:            string;
  recommendedAction: RecommendedAction;
  replyStyle:        ReplyStyle;
  scoreDetails?:     string;   // JSON of raw dimensions
}

export interface DraftResult    { draft: string }
export interface BatchClassifyResult { results: ClassifyResult[]; usedFallback: boolean }
export interface BatchDraftResult    { results: DraftResult[];    usedFallback: boolean }

export interface IcpResult {
  // New structure
  offerSummary:          string;
  idealCustomerProfile:  { audience: string; problems: string[]; desires: string[]; objections: string[] };
  keywordClusters:       string[];
  buyerIntentPhrases:    string[];
  searchPhrases:         string[];
  outreachAngles:        string[];
  ctaDirections:         string[];
  // Backward-compat fields used by existing dashboard/API
  keywords:              string[];
  painPoints:            string[];
  ctaAngles:             string[];
  targetAudience:        string;
}

export interface LeadInput { id: string; content: string }

// ─── Batch classify (N leads → 1 API call) ───────────────────────────────────

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

  const kwContext = keywords.length
    ? `Niche context — score higher when these are present: ${keywords.join(", ")}`
    : "Niche context — target: bitcoin, btc, crypto, passive income, investing, financial freedom, wealth building";

  const system = `You are scoring social posts for lead-generation relevance.

${kwContext}

For each candidate, score:

- niche_match: 1-10
- buyer_intent: 1-10
- urgency: 1-10
- likely_lead_value: 1-10
- response_likelihood: 1-10
- spam_risk: 1-10

Then assign:
- recommended_action: discard | review | draft
- reply_style: helpful | curiosity | ask_permission | soft_cta

Rules:
- prefer posts where someone is actively looking for help, leads, tools, referrals, growth, clients, or traffic
- prefer high-intent, specific problems over vague conversation
- heavily penalize spam-like or irrelevant posts
- heavily penalize posts with low commercial relevance
- do not over-score weak posts
- be conservative

Return strict JSON array with exactly ${leads.length} objects in order:
[
  {
    "candidate_id": "...",
    "niche_match": 0,
    "buyer_intent": 0,
    "urgency": 0,
    "likely_lead_value": 0,
    "response_likelihood": 0,
    "spam_risk": 0,
    "recommended_action": "discard",
    "reply_style": "helpful"
  }
]`;

  const candidates = leads
    .map(l => `{"candidate_id": "${l.id}", "post": ${JSON.stringify(l.content.slice(0, 500))}}`)
    .join(",\n");

  try {
    const response = await chat(system, `Score these candidates:\n[\n${candidates}\n]`);
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error("No JSON array in response");

    const parsed: {
      candidate_id: string;
      niche_match: number;
      buyer_intent: number;
      urgency: number;
      likely_lead_value: number;
      response_likelihood: number;
      spam_risk: number;
      recommended_action: string;
      reply_style: string;
    }[] = JSON.parse(jsonMatch[0]);

    if (!Array.isArray(parsed) || parsed.length !== leads.length) {
      throw new Error(`Expected ${leads.length} results, got ${parsed.length}`);
    }

    // Re-order by candidate_id to match original lead order
    const byId = new Map(parsed.map(p => [p.candidate_id, p]));

    const results: ClassifyResult[] = leads.map(l => {
      const p = byId.get(l.id) ?? parsed[leads.indexOf(l)];
      if (!p) return fallbackScore(l.content, keywords);

      const dims: ScoreDimensions = {
        niche_match:         clamp1to10(p.niche_match),
        buyer_intent:        clamp1to10(p.buyer_intent),
        urgency:             clamp1to10(p.urgency),
        likely_lead_value:   clamp1to10(p.likely_lead_value),
        response_likelihood: clamp1to10(p.response_likelihood),
        spam_risk:           clamp1to10(p.spam_risk),
      };

      // Composite 0-1 score
      const raw     = (dims.niche_match + dims.buyer_intent + dims.likely_lead_value) / 3 / 10;
      const penalty = (dims.spam_risk / 10) * 0.25;
      const score   = parseFloat(Math.max(0, Math.min(1, raw - penalty)).toFixed(3));

      const recommendedAction = (["discard","review","draft"].includes(p.recommended_action)
        ? p.recommended_action
        : score < 0.35 ? "discard" : score < 0.60 ? "review" : "draft") as RecommendedAction;

      const replyStyle = (["helpful","curiosity","ask_permission","soft_cta"].includes(p.reply_style)
        ? p.reply_style
        : "helpful") as ReplyStyle;

      const reason = buildReason(dims, recommendedAction);

      return {
        score,
        reason,
        recommendedAction,
        replyStyle,
        scoreDetails: JSON.stringify(dims),
      };
    });

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

function clamp1to10(n: unknown): number {
  const v = parseFloat(String(n));
  return isNaN(v) ? 1 : Math.max(1, Math.min(10, Math.round(v)));
}

function buildReason(dims: ScoreDimensions, action: RecommendedAction): string {
  const parts: string[] = [];
  if (dims.buyer_intent >= 7)       parts.push(`strong buyer intent (${dims.buyer_intent}/10)`);
  else if (dims.buyer_intent >= 4)  parts.push(`moderate buyer intent (${dims.buyer_intent}/10)`);
  else                               parts.push(`low buyer intent (${dims.buyer_intent}/10)`);
  if (dims.niche_match >= 7)        parts.push(`good niche fit (${dims.niche_match}/10)`);
  if (dims.spam_risk >= 6)          parts.push(`spam risk flagged (${dims.spam_risk}/10)`);
  if (dims.urgency >= 7)            parts.push(`high urgency signal (${dims.urgency}/10)`);
  parts.push(`action: ${action}`);
  return parts.join(" · ").slice(0, 300);
}

// ─── Batch draft (N leads → 1 API call) ──────────────────────────────────────

export async function batchDraftResponses(
  leads: LeadInput[],
  persona: string,
  replyStyles?: string[],
): Promise<BatchDraftResult> {
  if (!leads.length) return { results: [], usedFallback: false };

  if (!CHUTES_API_KEY || !(await hasBudget(1))) {
    return {
      results: leads.map(l => ({ draft: fallbackDraft(l.content, persona) })),
      usedFallback: true,
    };
  }

  const system = `You are drafting public replies to social posts for a lead-generation agent.

Write short, natural, human-sounding replies.

Rules:
- 1 to 3 short sentences
- no fake hype
- no spam tone
- no emojis unless the source tone clearly supports it
- helpful first
- curiosity or soft CTA second
- vary phrasing
- avoid repeating exact structures
- do not sound like a template
- do not overpitch
- do not mention automation unless relevant
- do not promise outcomes

The product context:
- users can join a free offer
- get 24 hours in a live rotator
- the system lets the agent prove value first
- optional paid upgrades come later only if value is clear

Allowed CTA directions:
- invite them to see what is being tested
- invite them to check a simple page
- mention a live rotator concept
- ask if they want the link
- mention a free entry point

Each post below includes a reply_style hint. Use it to guide tone:
- helpful: lead with useful context or empathy
- curiosity: open with an interesting angle or question
- ask_permission: gently ask if they want more info
- soft_cta: naturally invite them toward the free offer

Return ONLY valid JSON — an array with exactly ${leads.length} objects, in order:
[
  {
    "candidate_id": "...",
    "reply": "..."
  }
]`;

  const candidates = leads
    .map((l, i) => {
      const style = replyStyles?.[i] ?? "helpful";
      return `{"candidate_id": "${l.id}", "reply_style": "${style}", "post": ${JSON.stringify(l.content.slice(0, 400))}}`;
    })
    .join(",\n");

  try {
    const response = await chat(
      system,
      `Write replies for these candidates:\n[\n${candidates}\n]`,
      0.7,  // higher temperature for reply variety
    );
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error("No JSON array in response");

    const parsed: { candidate_id: string; reply: string }[] = JSON.parse(jsonMatch[0]);

    if (!Array.isArray(parsed) || parsed.length !== leads.length) {
      throw new Error(`Expected ${leads.length} drafts, got ${parsed.length}`);
    }

    const byId = new Map(parsed.map(p => [p.candidate_id, p]));

    const results: DraftResult[] = leads.map((l, i) => {
      const p = byId.get(l.id) ?? parsed[i];
      return { draft: String(p?.reply || "").slice(0, 300) };
    });

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

// ─── Single-lead helpers (used by manual reclassify/redraft endpoints) ────────

export async function classifyLead(content: string, keywords: string[] = []): Promise<ClassifyResult> {
  const { results } = await batchClassifyLeads([{ id: "single", content }], keywords);
  return results[0] ?? fallbackScore(content, keywords);
}

export async function draftResponse(
  content: string,
  persona: string,
  _postUrl?: string | null,
  replyStyle?: string,
): Promise<DraftResult> {
  const { results } = await batchDraftResponses(
    [{ id: "single", content }],
    persona,
    replyStyle ? [replyStyle] : undefined,
  );
  return results[0] ?? { draft: fallbackDraft(content, persona) };
}

// ─── ICP builder ──────────────────────────────────────────────────────────────

export async function buildIcpFromUrl(offerUrl: string): Promise<IcpResult> {
  if (!CHUTES_API_KEY || !(await hasBudget(1))) {
    return fallbackIcp();
  }

  const system = `You are an ICP and targeting engine.

Input:
- affiliate offer URL
- offer title if available
- offer summary if available

Your job:
- infer the most likely ideal customer profile
- identify who would realistically want this offer
- identify pain points
- identify buyer-intent phrases
- identify keyword clusters
- identify likely objections
- propose 10 social search phrases
- propose 10 short outreach angles
- propose 5 CTA directions

Return ONLY valid JSON:
{
  "offer_summary": "",
  "ideal_customer_profile": {
    "audience": "",
    "problems": [],
    "desires": [],
    "objections": []
  },
  "keyword_clusters": [],
  "buyer_intent_phrases": [],
  "search_phrases": [],
  "outreach_angles": [],
  "cta_directions": []
}`;

  try {
    const response = await chat(system, `Analyze this offer: ${offerUrl}`);
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response");

    const p = JSON.parse(jsonMatch[0]);

    const icp = p.ideal_customer_profile ?? {};
    const keywordClusters    = arr(p.keyword_clusters);
    const buyerIntentPhrases = arr(p.buyer_intent_phrases);
    const ctaDirections      = arr(p.cta_directions);

    return {
      // New structure
      offerSummary:         String(p.offer_summary || ""),
      idealCustomerProfile: {
        audience:   String(icp.audience || ""),
        problems:   arr(icp.problems),
        desires:    arr(icp.desires),
        objections: arr(icp.objections),
      },
      keywordClusters,
      buyerIntentPhrases,
      searchPhrases:  arr(p.search_phrases),
      outreachAngles: arr(p.outreach_angles),
      ctaDirections,
      // Backward-compat
      keywords:       keywordClusters,
      painPoints:     arr(icp.problems),
      ctaAngles:      ctaDirections,
      targetAudience: String(icp.audience || ""),
    };
  } catch (err) {
    console.warn("[chutes] icp failed, using fallback:", (err as Error).message);
    return fallbackIcp();
  }
}

function arr(v: unknown): string[] {
  return Array.isArray(v) ? v.map(String) : [];
}

function fallbackIcp(): IcpResult {
  const keywords = ["bitcoin investment", "crypto portfolio", "passive income crypto", "btc accumulation", "digital asset strategy"];
  const problems = ["volatile markets", "don't know where to start", "missed the last bull run", "afraid of losing money"];
  const ctas     = ["Start with just $10", "No experience needed", "Let the AI do the heavy lifting", "Free to get started", "See what's being tested right now"];

  return {
    offerSummary: "A free-entry bitcoin/crypto income experiment powered by AI agents and a live rotator system.",
    idealCustomerProfile: {
      audience:   "Adults 25–45 interested in financial independence, passive income, and building wealth through digital assets.",
      problems,
      desires:    ["financial freedom", "passive income streams", "understanding crypto without risk", "a system that works while they sleep"],
      objections: ["too risky", "too complicated", "already tried and failed", "sounds like a scam"],
    },
    keywordClusters:    keywords,
    buyerIntentPhrases: ["how to buy bitcoin safely", "best crypto investment 2025", "passive crypto income", "bitcoin dollar cost average"],
    searchPhrases: [
      "how do I start investing in bitcoin",
      "crypto passive income 2025",
      "best way to build wealth with btc",
      "I want to try bitcoin but scared",
      "bitcoin for beginners step by step",
      "is it too late to buy bitcoin",
      "how to make money with crypto without trading",
      "btc income strategies that work",
      "what is a bitcoin rotator",
      "free bitcoin experiment legit",
    ],
    outreachAngles: [
      "Acknowledge their fear and offer a low-risk starting point",
      "Ask if they've heard about the free rotator model",
      "Point to a live test they can join at no cost",
      "Mention that most people don't need trading skills for this",
      "Invite them to see proof before committing anything",
      "Reference the 24-hour rotator as a risk-free entry",
      "Lead with the agent-first, human-optional angle",
      "Ask what's held them back from trying crypto so far",
      "Position this as an experiment, not a promise",
      "Mention that it's built to work even for complete beginners",
    ],
    ctaDirections: ctas,
    // Backward-compat
    keywords,
    painPoints: problems,
    ctaAngles:  ctas,
    targetAudience: "Adults 25–45 interested in financial independence, passive income, and building wealth through digital assets.",
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
