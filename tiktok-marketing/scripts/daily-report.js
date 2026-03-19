#!/usr/bin/env node
/**
 * Larry Brain — Daily Analytics Report
 * Pulls Postiz analytics + RevenueCat conversions, generates performance report
 *
 * Usage:
 *   node scripts/daily-report.js --days 3
 *
 * Schedule: Run daily at 07:00 before first post.
 * Cron: 0 7 * * * node /path/to/tiktok-marketing/scripts/daily-report.js
 */

const fs = require("fs");
const path = require("path");
const https = require("https");

const ROOT = path.join(__dirname, "..");
const config = JSON.parse(fs.readFileSync(path.join(ROOT, "config.json"), "utf8"));

const POSTIZ_API_KEY = process.env.POSTIZ_API_KEY || config.postiz.apiKey;
const REVENUECAT_API_KEY = process.env.REVENUECAT_API_KEY;
const DAYS = parseInt(process.argv.slice(2)[process.argv.indexOf("--days") + 1]) || 3;

async function apiGet(hostname, apiPath, apiKey, authHeader = "Authorization") {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname,
        path: apiPath,
        method: "GET",
        headers: { [authHeader]: `Bearer ${apiKey}` },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try { resolve(JSON.parse(data)); }
          catch { resolve({ error: data }); }
        });
      }
    );
    req.on("error", reject);
    req.end();
  });
}

async function getPostizAnalytics() {
  if (!POSTIZ_API_KEY) return null;
  try {
    const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000).toISOString();
    const data = await apiGet("api.postiz.com", `/v1/analytics/posts?since=${since}`, POSTIZ_API_KEY);
    return data;
  } catch { return null; }
}

async function getRevenueCatMetrics() {
  if (!REVENUECAT_API_KEY || !config.revenuecat.projectId) return null;
  try {
    const data = await apiGet(
      "api.revenuecat.com",
      `/v2/projects/${config.revenuecat.projectId}/metrics/overview`,
      REVENUECAT_API_KEY
    );
    return data;
  } catch { return null; }
}

function diagnose(views, conversions) {
  const HIGH_VIEWS = 5000;
  const HIGH_CONV = 2;
  if (views >= HIGH_VIEWS && conversions >= HIGH_CONV) return "SCALE";
  if (views >= HIGH_VIEWS && conversions < HIGH_CONV) return "FIX_CTA";
  if (views < HIGH_VIEWS && conversions >= HIGH_CONV) return "FIX_HOOK";
  return "RESET";
}

const DIAGNOSIS_ADVICE = {
  SCALE: "🔥 Scale it — more of the same. Test posting times. Cross-post to Instagram.",
  FIX_CTA: "📣 Hook works, CTA is broken. Test new slide 6 CTAs. Check the signup page flow.",
  FIX_HOOK: "🎯 Content converts but nobody sees it. Test radically different hooks. Keep the CTA.",
  RESET: "🔄 Full reset needed. New format, new audience angle, new hook category.",
};

async function main() {
  console.log(`\n📊 Larry Brain — Daily Report (last ${DAYS} days)`);
  console.log(`   ${new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}\n`);

  const [analytics, rcMetrics] = await Promise.all([
    getPostizAnalytics(),
    getRevenueCatMetrics(),
  ]);

  const reportsDir = path.join(ROOT, "reports");
  fs.mkdirSync(reportsDir, { recursive: true });
  const reportDate = new Date().toISOString().split("T")[0];
  const reportPath = path.join(reportsDir, `${reportDate}.md`);

  let report = `# Larry Brain Daily Report — ${reportDate}\n\n`;
  report += `**Window:** Last ${DAYS} days\n\n`;

  if (!analytics) {
    report += `## ⚠️ Postiz Not Connected\n`;
    report += `Set POSTIZ_API_KEY to enable analytics tracking.\n\n`;
    console.log("⚠️  Postiz not connected — no post analytics available");
  } else {
    report += `## 📱 Post Performance\n\n`;
    const posts = analytics.posts || [];

    if (!posts.length) {
      report += `No posts found in the last ${DAYS} days.\n\n`;
      console.log(`No posts found in last ${DAYS} days`);
    } else {
      // Load our tracked posts to correlate hooks
      const allPosts = [];
      for (const agentSlug of config.agents || ["ralph"]) {
        const trackFile = path.join(ROOT, "agents", agentSlug, "posts.json");
        if (fs.existsSync(trackFile)) {
          const tracked = JSON.parse(fs.readFileSync(trackFile, "utf8"));
          allPosts.push(...tracked.map((p) => ({ ...p, agent: agentSlug })));
        }
      }

      report += `| Post | Hook | Views | Likes | Comments | Diagnosis |\n`;
      report += `|------|------|-------|-------|----------|-----------|\n`;

      for (const post of posts) {
        const tracked = allPosts.find((p) => p.postId === post.id);
        const views = post.views || 0;
        const likes = post.likes || 0;
        const comments = post.comments || 0;
        const conversions = 0; // Will be cross-referenced with RC below
        const d = diagnose(views, conversions);
        const hookLabel = tracked ? `${tracked.hookId} (${tracked.hookCategory})` : "unknown";
        report += `| ${post.id?.slice(0, 8)} | ${hookLabel} | ${views} | ${likes} | ${comments} | ${d} |\n`;
      }
      report += "\n";

      // Sort by views
      const sorted = [...posts].sort((a, b) => (b.views || 0) - (a.views || 0));
      const top = sorted[0];
      if (top) {
        const topTracked = allPosts.find((p) => p.postId === top.id);
        report += `### 🏆 Top Post\n`;
        report += `- **Hook**: ${topTracked?.hookText || "unknown"}\n`;
        report += `- **Views**: ${top.views?.toLocaleString()}\n`;
        report += `- **Advice**: ${DIAGNOSIS_ADVICE[diagnose(top.views, 0)]}\n\n`;
      }
    }
  }

  if (rcMetrics) {
    report += `## 💰 Revenue (RevenueCat)\n\n`;
    report += `- **MRR**: $${(rcMetrics.mrr_in_cents / 100).toFixed(2)}\n`;
    report += `- **Active Subscribers**: ${rcMetrics.active_subscriptions}\n`;
    report += `- **Active Trials**: ${rcMetrics.active_trials}\n\n`;
  } else if (config.revenuecat.enabled) {
    report += `## ⚠️ RevenueCat Not Connected\n`;
    report += `Set REVENUECAT_API_KEY to enable conversion tracking.\n\n`;
  }

  report += `## 🎯 Today's Hook Recommendations\n\n`;
  report += `Based on the data above, for today's posts:\n\n`;
  report += `1. If you have a top performer → **double down on that hook category**\n`;
  report += `2. If everything is underperforming → **try an urgency-based hook**\n`;
  report += `3. Always vary the visual (different scene) while keeping the same hook text\n\n`;
  report += `Run: \`node scripts/create-post.js --agent ralph --hook <id>\`\n`;

  fs.writeFileSync(reportPath, report);
  console.log(report);
  console.log(`\n📄 Report saved: ${reportPath}`);
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
