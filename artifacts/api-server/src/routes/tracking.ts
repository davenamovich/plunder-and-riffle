/**
 * Public click tracking endpoint.
 * GET /api/track/:leadId  → logs click funnel event → redirects to agent page
 */
import { Router } from "express";
import { trackEvent } from "../lib/funnel.js";

const router = Router();

router.get("/track/:leadId", async (req, res) => {
  const { leadId } = req.params;
  const ref = req.query.ref as string | undefined;

  try {
    await trackEvent("click", leadId, undefined, { ref, ip: req.ip, ua: req.headers["user-agent"]?.slice(0, 100) });
  } catch {
    // Non-fatal — still redirect even if tracking fails
  }

  // Redirect to the public agent page
  res.redirect(302, "/agent/ralph");
});

export default router;
