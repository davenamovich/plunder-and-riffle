import { Router } from "express";
import http from "http";

const router = Router();

const MOLTIS_HOST = "127.0.0.1";
const MOLTIS_PORT = 13131;

function moltisRequest(
  path: string,
  method: string,
  headers: Record<string, string>,
  body?: string,
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const opts: http.RequestOptions = {
      hostname: MOLTIS_HOST,
      port: MOLTIS_PORT,
      path,
      method,
      headers,
    };
    const req = http.request(opts, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve({ status: res.statusCode ?? 200, headers: res.headers, body: data }));
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

// GET /api/moltis/status — check if moltis is ready
router.get("/moltis/status", async (_req, res) => {
  try {
    const r = await moltisRequest("/api/status", "GET", { accept: "application/json" });
    res.status(r.status).json(JSON.parse(r.body));
  } catch {
    res.status(502).json({ ready: false, error: "Moltis gateway unreachable" });
  }
});

// POST /api/moltis/chat — send a message and stream the reply
router.post("/moltis/chat", async (req, res) => {
  const { messages, sessionId } = req.body as {
    messages: Array<{ role: string; content: string }>;
    sessionId?: string;
  };

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages array required" });
  }

  const payload = JSON.stringify({
    model: "chutesai/Mistral-Small-3.2-24B-Instruct-2506",
    messages,
    stream: false,
    ...(sessionId ? { session_id: sessionId } : {}),
  });

  try {
    const r = await moltisRequest(
      "/v1/chat/completions",
      "POST",
      { "content-type": "application/json", accept: "application/json" },
      payload,
    );
    const parsed = JSON.parse(r.body);
    res.status(r.status).json(parsed);
  } catch (err) {
    res.status(502).json({ error: "Moltis gateway unreachable" });
  }
});

export default router;
