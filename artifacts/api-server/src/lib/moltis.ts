/**
 * Moltis client — uses Chutes.ai (OpenAI-compatible) as the LLM brain.
 * Falls back to a lightweight keyword-heuristic scorer when CHUTES_API_KEY is not set.
 *
 * Env vars:
 *   CHUTES_API_KEY   — Chutes.ai API key (required for AI-powered classification/drafting)
 *   CHUTES_BASE_URL  — Chutes.ai base URL (default: https://llm.chutes.ai/v1)
 *   CHUTES_MODEL     — Model to use (default: chutesai/Mistral-Small-3.2-24B-Instruct-2506)
 */

const CHUTES_BASE_URL = process.env.CHUTES_BASE_URL || "https://llm.chutes.ai/v1";
const CHUTES_API_KEY = process.env.CHUTES_API_KEY;
const CHUTES_MODEL = process.env.CHUTES_MODEL || "chutesai/Mistral-Small-3.2-24B-Instruct-2506";

const isConfigured = () => !!CHUTES_API_KEY;

// ─── Chutes chat completion ───────────────────────────────────────────────────

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
        { role: "user", content: userMessage },
      ],
      temperature: 0.2,
      max_tokens: 512,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Chutes API error ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json() as { choices: { message: { content: string } }[] };
  return data.choices[0]?.message?.content?.trim() ?? "";
}

// ─── Fallback (no API key) ────────────────────────────────────────────────────

function fallbackScore(content: string, keywords: string[]): { score: number; reason: string } {
  if (!keywords.length) return { score: 0.3, reason: "No keywords configured" };
  const lower = content.toLowerCase();
  const hits = keywords.filter((kw) => lower.includes(kw.toLowerCase()));
  const ratio = hits.length / keywords.length;
  const score = Math.min(0.95, 0.2 + ratio * 0.75);
  const reason = hits.length === 0
    ? "No keyword matches found"
    : `Matched ${hits.length}/${keywords.length} keywords: ${hits.slice(0, 3).join(", ")}`;
  return { score: parseFloat(score.toFixed(3)), reason };
}

function fallbackDraft(content: string, persona: string): string {
  const trimmed = content.slice(0, 100).replace(/\n/g, " ").trim();
  const agentName = persona.split(",")[0].trim() || "Ralph";
  return `This is exactly what ${agentName} was built for — helping people move from "${trimmed}..." to real clarity and results. Happy to point you in the right direction if you're open to it!`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface ClassifyResult {
  score: number;
  reason: string;
}

export interface DraftResult {
  draft: string;
}

export interface IcpResult {
  keywords: string[];
  painPoints: string[];
  buyerIntentPhrases: string[];
  ctaAngles: string[];
  targetAudience: string;
}

export async function classifyLead(
  content: string,
  keywords: string[] = [],
): Promise<ClassifyResult> {
  if (isConfigured()) {
    try {
      const system = `You are a lead scoring AI for a bitcoin/crypto platform. Given a social media post, score its relevance to crypto investing on a scale of 0.0 to 1.0, where:
- 0.0 = completely unrelated to crypto/bitcoin
- 0.5 = somewhat related
- 1.0 = highly relevant buyer intent

Target keywords: ${keywords.length ? keywords.join(", ") : "bitcoin, crypto, passive income, investing"}

Respond ONLY with valid JSON: {"score": 0.0, "reason": "brief explanation"}`;

      const response = await chat(system, `Score this post:\n\n${content}`);

      const jsonMatch = response.match(/\{[\s\S]*"score"[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          score: Math.min(1, Math.max(0, parseFloat(parsed.score) || 0)),
          reason: String(parsed.reason || "AI classified").slice(0, 200),
        };
      }

      const scoreMatch = response.match(/\b(0\.\d+|1\.0|0|1)\b/);
      const score = scoreMatch ? parseFloat(scoreMatch[1]) : 0.3;
      return { score, reason: response.slice(0, 200) };
    } catch (err) {
      console.warn("[chutes] classify failed, using fallback:", (err as Error).message);
    }
  }
  return fallbackScore(content, keywords);
}

export async function draftResponse(
  content: string,
  persona: string,
  postUrl?: string | null,
): Promise<DraftResult> {
  if (isConfigured()) {
    try {
      const system = `You are ${persona}. Write a short, natural, helpful engagement comment for the following social media post. The comment should:
- Feel human and genuine, not salesy
- Acknowledge their specific situation
- Subtly position yourself as someone who can help
- Be under 280 characters
- NOT include hashtags or emojis
- NOT mention any specific products or URLs

Respond with ONLY the comment text, nothing else.`;

      const draft = await chat(system, `Write a reply to this post:\n\n${content}`);
      return { draft: draft.slice(0, 300) };
    } catch (err) {
      console.warn("[chutes] draft failed, using fallback:", (err as Error).message);
    }
  }
  return { draft: fallbackDraft(content, persona) };
}

export async function buildIcpFromUrl(offerUrl: string): Promise<IcpResult> {
  if (isConfigured()) {
    try {
      const system = `You are a marketing strategist for a bitcoin/crypto platform. Given an offer URL, generate a detailed Ideal Customer Profile (ICP). 

Respond ONLY with valid JSON matching this exact structure:
{
  "keywords": ["keyword1", "keyword2", ...],
  "painPoints": ["pain1", "pain2", ...],
  "buyerIntentPhrases": ["phrase1", "phrase2", ...],
  "ctaAngles": ["cta1", "cta2", ...],
  "targetAudience": "description"
}`;

      const response = await chat(system, `Generate ICP for this offer: ${offerUrl}`);
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          keywords: parsed.keywords || [],
          painPoints: parsed.painPoints || [],
          buyerIntentPhrases: parsed.buyerIntentPhrases || [],
          ctaAngles: parsed.ctaAngles || [],
          targetAudience: parsed.targetAudience || "",
        };
      }
    } catch (err) {
      console.warn("[chutes] icp failed, using fallback:", (err as Error).message);
    }
  }
  return {
    keywords: ["bitcoin investment", "crypto portfolio", "passive income crypto", "btc accumulation", "digital asset strategy"],
    painPoints: ["volatile markets", "don't know where to start", "missed the last bull run", "afraid of losing money"],
    buyerIntentPhrases: ["how to buy bitcoin safely", "best crypto investment 2025", "passive crypto income", "bitcoin dollar cost average"],
    ctaAngles: ["Start with just $10", "No experience needed", "Let the AI do the heavy lifting", "Free to get started"],
    targetAudience: "Adults 25-45 interested in financial independence, passive income, and building wealth through digital assets.",
  };
}

export function moltisStatus(): { configured: boolean; baseUrl: string; model: string } {
  return { configured: isConfigured(), baseUrl: CHUTES_BASE_URL, model: CHUTES_MODEL };
}
