/**
 * Moltis client — wraps the Moltis agent API.
 * Falls back to a lightweight keyword-heuristic scorer when Moltis is not available.
 */

const BASE_URL = process.env.MOLTIS_BASE_URL;
const API_KEY = process.env.MOLTIS_API_KEY;
const AGENT_ID = process.env.MOLTIS_AGENT_ID || "ralph";

const isConfigured = () => !!(BASE_URL && API_KEY);

async function post<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({ ...body, agentId: AGENT_ID }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Moltis ${path} → ${res.status}: ${text}`);
  }

  return res.json() as Promise<T>;
}

// ─── Fallback keyword scorer ──────────────────────────────────────────────────

function fallbackScore(content: string, keywords: string[]): { score: number; reason: string } {
  if (!keywords.length) return { score: 0.3, reason: "No keywords configured" };

  const lower = content.toLowerCase();
  const hits = keywords.filter((kw) => lower.includes(kw.toLowerCase()));
  const ratio = hits.length / keywords.length;
  const score = Math.min(0.95, 0.2 + ratio * 0.75);

  const reason =
    hits.length === 0
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
      return await post<ClassifyResult>("/classify", { content, keywords });
    } catch (err) {
      console.warn("[moltis] classify failed, using fallback:", (err as Error).message);
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
      return await post<DraftResult>("/draft", { content, persona, postUrl });
    } catch (err) {
      console.warn("[moltis] draft failed, using fallback:", (err as Error).message);
    }
  }
  return { draft: fallbackDraft(content, persona) };
}

export async function buildIcpFromUrl(offerUrl: string): Promise<IcpResult> {
  if (isConfigured()) {
    try {
      return await post<IcpResult>("/icp", { offerUrl });
    } catch (err) {
      console.warn("[moltis] icp failed, using fallback:", (err as Error).message);
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

export function moltisStatus(): { configured: boolean; baseUrl: string | undefined; agentId: string } {
  return { configured: isConfigured(), baseUrl: BASE_URL, agentId: AGENT_ID };
}
