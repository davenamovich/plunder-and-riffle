import express, { type Express } from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import router from "./routes/index.js";
import { startWorker } from "./lib/worker.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app: Express = express();

// ── CORS — allow the frontend origin ─────────────────────────────────────────
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map(o => o.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    // Allow same-origin, no-origin (server-to-server), or listed origins
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      cb(null, true);
    } else {
      cb(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
}));

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// ── API routes ─────────────────────────────────────────────────────────────────
app.use("/api", router);

// ── Static SPA serving (when SERVE_STATIC=true or dist/public exists) ─────────
// This lets one Railway service serve both API + frontend
const staticPath = process.env.STATIC_DIR
  || path.resolve(__dirname, "..", "..", "btc-experiment", "dist", "public")
  || path.resolve(__dirname, "public");

if (process.env.SERVE_STATIC === "true" || fs.existsSync(staticPath)) {
  console.log(`[static] serving SPA from ${staticPath}`);
  app.use(express.static(staticPath));
  // SPA fallback — all non-API routes return index.html
  app.get("*", (req, res) => {
    const index = path.join(staticPath, "index.html");
    if (fs.existsSync(index)) {
      res.sendFile(index);
    } else {
      res.status(404).send("Not found");
    }
  });
}

startWorker();

export default app;
