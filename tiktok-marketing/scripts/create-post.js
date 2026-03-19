#!/usr/bin/env node
/**
 * Larry Brain — End-to-End Post Creator
 * Runs the full pipeline: generate slides → add overlays → (optionally) post
 *
 * Usage:
 *   node scripts/create-post.js --agent ralph --hook h001
 *   node scripts/create-post.js --agent ralph --hook h001 --post   (auto-post to TikTok)
 *   node scripts/create-post.js --agent ralph --all --post
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const args = process.argv.slice(2);
const agentSlug = args[args.indexOf("--agent") + 1] || "ralph";
const hookId = args[args.indexOf("--hook") + 1] || null;
const shouldPost = args.includes("--post");
const generateAll = args.includes("--all");

const agentProfile = JSON.parse(
  fs.readFileSync(path.join(ROOT, "agents", agentSlug, "profile.json"), "utf8")
);

function run(cmd) {
  console.log(`\n$ ${cmd}`);
  execSync(cmd, { stdio: "inherit", cwd: ROOT });
}

async function main() {
  console.log(`\n🤖 Larry Brain — Full Pipeline`);
  console.log(`   Agent: ${agentProfile.name}`);
  console.log(`   Mode: ${generateAll ? "All hooks" : `Hook ${hookId || agentProfile.hooks[0].id}`}\n`);

  const hookFlag = hookId ? `--hook ${hookId}` : "";
  const allFlag = generateAll ? "--all" : "";
  const baseFlags = `--agent ${agentSlug} ${hookFlag} ${allFlag}`.trim();

  // Step 1: Generate images
  console.log("\n━━━ Step 1: Generate Slide Images ━━━");
  if (!process.env.OPENAI_API_KEY) {
    console.log("⚠️  OPENAI_API_KEY not set — skipping image generation");
    console.log("   Overlays will be rendered on dark background");
  } else {
    run(`node scripts/generate-slides.js ${baseFlags}`);
  }

  // Step 2: Add text overlays
  console.log("\n━━━ Step 2: Add Text Overlays ━━━");
  run(`node scripts/add-overlays.js ${baseFlags}`);

  // Step 3: Post to TikTok (if requested)
  if (shouldPost) {
    console.log("\n━━━ Step 3: Post to TikTok via Postiz ━━━");
    if (!process.env.POSTIZ_API_KEY) {
      console.log("⚠️  POSTIZ_API_KEY not set — skipping post");
      console.log("   Slides are ready in agents/${agentSlug}/posts/");
    } else {
      const hooks = generateAll
        ? agentProfile.hooks
        : [agentProfile.hooks.find((h) => h.id === hookId) || agentProfile.hooks[0]];

      for (const hook of hooks) {
        run(`node scripts/post-to-tiktok.js --agent ${agentSlug} --hook ${hook.id}`);
      }
    }
  } else {
    console.log("\n━━━ Step 3: Post to TikTok ━━━");
    console.log("Skipped (add --post flag to auto-post)");
    console.log(`Slides ready at: agents/${agentSlug}/posts/`);
  }

  console.log("\n✅ Pipeline complete!");
  if (!shouldPost) {
    console.log(`\n📤 When ready to post:`);
    console.log(`   node scripts/post-to-tiktok.js --agent ${agentSlug}${hookId ? ` --hook ${hookId}` : ""}`);
  }
  console.log(`\n⚠️  Remember: Add a trending TikTok sound before publishing each draft!`);
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
