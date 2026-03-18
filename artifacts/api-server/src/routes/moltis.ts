import { Router } from "express";
import { requireAuth } from "../lib/auth.js";

const router = Router();

const CHUTES_BASE = "https://llm.chutes.ai/v1";
const MODEL = "chutesai/Mistral-Small-3.2-24B-Instruct-2506";

function getApiKey(): string {
  return process.env.CHUTES_API_KEY ?? process.env.OPENAI_API_KEY ?? "";
}

// GET /api/moltis/status — check if AI backend is reachable
router.get("/moltis/status", async (_req, res) => {
  const key = getApiKey();
  if (!key) {
    res.status(200).json({ ready: false, error: "No API key configured" });
    return;
  }
  try {
    const r = await fetch(`${CHUTES_BASE}/models`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (r.ok) {
      res.status(200).json({ ready: true });
    } else {
      res.status(200).json({ ready: false, error: `Backend returned ${r.status}` });
    }
  } catch {
    res.status(200).json({ ready: false, error: "AI backend unreachable" });
  }
});

// POST /api/moltis/chat — send a message and get a reply (admin only)
router.post("/moltis/chat", requireAuth, async (req, res) => {
  const { messages } = req.body as {
    messages: Array<{ role: string; content: string }>;
  };

  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "messages array required" });
    return;
  }

  const key = getApiKey();
  if (!key) {
    res.status(503).json({ error: "No API key configured" });
    return;
  }

  try {
    const r = await fetch(`${CHUTES_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({ model: MODEL, messages, stream: false }),
    });

    const data = await r.json() as any;
    if (!r.ok) {
      res.status(r.status).json({ error: data?.error?.message ?? "Upstream error" });
      return;
    }

    const reply: string = data?.choices?.[0]?.message?.content ?? "";
    res.json({ reply });
  } catch (err) {
    console.error("[moltis/chat]", err);
    res.status(502).json({ error: "AI backend unreachable" });
  }
});

export default router;
