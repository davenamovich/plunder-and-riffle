#!/usr/bin/env node
/**
 * Larry Brain — Slide Generator
 * Generates 6 slide images per hook using OpenAI gpt-image-1
 *
 * Usage:
 *   node scripts/generate-slides.js --agent ralph --hook h001
 *   node scripts/generate-slides.js --agent ralph --all
 *
 * Requires: OPENAI_API_KEY env var
 */

const fs = require("fs");
const path = require("path");
const https = require("https");

const ROOT = path.join(__dirname, "..");
const config = JSON.parse(fs.readFileSync(path.join(ROOT, "config.json"), "utf8"));

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.error("❌  OPENAI_API_KEY env var not set.");
  console.error("   Add it with: export OPENAI_API_KEY=sk-...");
  process.exit(1);
}

const args = process.argv.slice(2);
const agentSlug = args[args.indexOf("--agent") + 1] || "ralph";
const hookId = args[args.indexOf("--hook") + 1] || null;
const generateAll = args.includes("--all");

const agentProfile = JSON.parse(
  fs.readFileSync(path.join(ROOT, "agents", agentSlug, "profile.json"), "utf8")
);

const outputDir = path.join(ROOT, "agents", agentSlug, "slides");
fs.mkdirSync(outputDir, { recursive: true });

async function generateImage(prompt, outputPath) {
  console.log(`  🎨 Generating: ${path.basename(outputPath)}`);

  const body = JSON.stringify({
    model: config.imageGen.model,
    prompt,
    n: 1,
    size: config.imageGen.size,
    quality: config.imageGen.quality,
    response_format: "b64_json",
  });

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "api.openai.com",
        path: "/v1/images/generations",
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            if (json.error) {
              reject(new Error(json.error.message));
              return;
            }
            const imageData = json.data[0].b64_json;
            fs.writeFileSync(outputPath, Buffer.from(imageData, "base64"));
            resolve(outputPath);
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function buildSlidePrompt(basePrompt, slideIndex, slideText) {
  // Use a variation for variety while keeping visual consistency
  const variantPrompt = agentProfile.imageStyle.variants?.[slideIndex % agentProfile.imageStyle.variants.length]
    || basePrompt;
  return variantPrompt;
}

async function generateHookSlides(hook) {
  const hookDir = path.join(outputDir, hook.id);
  fs.mkdirSync(hookDir, { recursive: true });

  console.log(`\n📱 Generating slides for hook: ${hook.id} — "${hook.category}"`);
  console.log(`   "${hook.text}"`);

  const basePrompt = agentProfile.imageStyle.basePrompt;

  for (let i = 0; i < hook.slides.length; i++) {
    const slideText = hook.slides[i];
    const slideNum = i + 1;
    const outputPath = path.join(hookDir, `slide-${slideNum}.png`);

    if (fs.existsSync(outputPath)) {
      console.log(`  ✅ Slide ${slideNum} already exists, skipping`);
      continue;
    }

    const prompt = buildSlidePrompt(basePrompt, i, slideText);

    try {
      await generateImage(prompt, outputPath);
      console.log(`  ✅ Slide ${slideNum} saved`);
      // Respect rate limits
      if (i < hook.slides.length - 1) {
        await new Promise((r) => setTimeout(r, 1500));
      }
    } catch (err) {
      console.error(`  ❌ Slide ${slideNum} failed: ${err.message}`);
    }
  }

  console.log(`\n✅ Hook ${hook.id} complete → ${hookDir}`);
  return hookDir;
}

async function main() {
  console.log(`\n🤖 Larry Brain — Slide Generator`);
  console.log(`   Agent: ${agentProfile.name} (${agentSlug})`);
  console.log(`   Model: ${config.imageGen.model}`);
  console.log(`   Size: ${config.imageGen.size}\n`);

  const hooks = agentProfile.hooks;

  if (generateAll) {
    for (const hook of hooks) {
      await generateHookSlides(hook);
    }
  } else if (hookId) {
    const hook = hooks.find((h) => h.id === hookId);
    if (!hook) {
      console.error(`❌ Hook "${hookId}" not found. Available: ${hooks.map((h) => h.id).join(", ")}`);
      process.exit(1);
    }
    await generateHookSlides(hook);
  } else {
    // Default: generate first hook
    await generateHookSlides(hooks[0]);
  }

  console.log(`\n🎉 Done! Run add-overlays.js next to add text to slides.`);
}

main().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
