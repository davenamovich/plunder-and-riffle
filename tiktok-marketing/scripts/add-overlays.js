#!/usr/bin/env node
/**
 * Larry Brain — Text Overlay Renderer (sharp + SVG)
 * Adds deadpan mockumentary text overlays to slide images
 *
 * Usage:
 *   node scripts/add-overlays.js --agent ralph --hook h001
 *   node scripts/add-overlays.js --agent ralph --all
 */

const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const args = process.argv.slice(2);
const agentSlug = args[args.indexOf("--agent") + 1] || "ralph";
const hookId = args[args.indexOf("--hook") + 1] || null;
const generateAll = args.includes("--all");

const agentProfile = JSON.parse(
  fs.readFileSync(path.join(ROOT, "agents", agentSlug, "profile.json"), "utf8")
);

// TikTok portrait dimensions
const W = 1024;
const H = 1792;

function escapeXml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function wrapText(text, maxCharsPerLine = 22) {
  const words = text.split(" ");
  const lines = [];
  let current = "";
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (test.length > maxCharsPerLine && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function buildOverlaySVG(text, slideNum, totalSlides, brand) {
  const lines = wrapText(text, 20);
  const fontSize = 72;
  const lineH = fontSize * 1.3;
  const textBlockH = lines.length * lineH;
  const padX = 60;
  const padY = 40;
  const pillW = W - 80;
  const pillH = textBlockH + padY * 2;
  const pillX = 40;
  const pillY = H - 300 - pillH;

  const textLines = lines
    .map(
      (line, i) =>
        `<text
          x="${W / 2}"
          y="${pillY + padY + fontSize + i * lineH}"
          font-family="'Helvetica Neue', Helvetica, Arial, sans-serif"
          font-weight="800"
          font-size="${fontSize}"
          fill="white"
          text-anchor="middle"
          dominant-baseline="auto"
        >${escapeXml(line)}</text>`
    )
    .join("\n");

  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <!-- Dark vignette at bottom -->
    <defs>
      <linearGradient id="vignette" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="black" stop-opacity="0"/>
        <stop offset="100%" stop-color="black" stop-opacity="0.72"/>
      </linearGradient>
    </defs>
    <rect x="0" y="${H * 0.4}" width="${W}" height="${H * 0.6}" fill="url(#vignette)"/>

    <!-- Text pill background -->
    <rect
      x="${pillX}" y="${pillY}"
      width="${pillW}" height="${pillH}"
      rx="32" ry="32"
      fill="rgba(0,0,0,0.82)"
    />

    <!-- Slide text -->
    ${textLines}

    <!-- Slide counter -->
    <text
      x="${W - 44}" y="64"
      font-family="'Helvetica Neue', Helvetica, Arial, sans-serif"
      font-size="30"
      fill="rgba(255,255,255,0.4)"
      text-anchor="end"
    >${slideNum}/${totalSlides}</text>

    <!-- Brand watermark -->
    <text
      x="${W / 2}" y="${H - 48}"
      font-family="'Helvetica Neue', Helvetica, Arial, sans-serif"
      font-size="30"
      fill="rgba(255,255,255,0.5)"
      text-anchor="middle"
    >${escapeXml(brand)}</text>
  </svg>`;
}

async function renderSlide(bgImagePath, text, slideNum, totalSlides, outputPath, brand) {
  const svg = buildOverlaySVG(text, slideNum, totalSlides, brand);
  const svgBuffer = Buffer.from(svg);

  let base;
  if (bgImagePath && fs.existsSync(bgImagePath)) {
    base = sharp(bgImagePath).resize(W, H, { fit: "cover" });
  } else {
    // Dark gradient fallback background
    const gradient = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#0f0f17"/>
          <stop offset="100%" stop-color="#1a1225"/>
        </linearGradient>
      </defs>
      <rect width="${W}" height="${H}" fill="url(#bg)"/>
      <!-- Subtle grid pattern -->
      <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
        <path d="M 60 0 L 0 0 0 60" fill="none" stroke="rgba(255,255,255,0.03)" stroke-width="1"/>
      </pattern>
      <rect width="${W}" height="${H}" fill="url(#grid)"/>
    </svg>`;
    base = sharp(Buffer.from(gradient));
  }

  await base
    .composite([{ input: svgBuffer, top: 0, left: 0 }])
    .png()
    .toFile(outputPath);
}

async function processHook(hook) {
  const slidesDir = path.join(ROOT, "agents", agentSlug, "slides", hook.id);
  const postsDir = path.join(ROOT, "agents", agentSlug, "posts", hook.id);
  fs.mkdirSync(postsDir, { recursive: true });

  const brand = "plunderandriffle.com";
  console.log(`\n🎨 Hook ${hook.id} — "${hook.category}"`);
  console.log(`   "${hook.text}"`);

  for (let i = 0; i < hook.slides.length; i++) {
    const slideNum = i + 1;
    const text = hook.slides[i];
    const inputPath = path.join(slidesDir, `slide-${slideNum}.png`);
    const outputPath = path.join(postsDir, `slide-${slideNum}.png`);

    try {
      await renderSlide(
        fs.existsSync(inputPath) ? inputPath : null,
        text,
        slideNum,
        hook.slides.length,
        outputPath,
        brand
      );
      const bgLabel = fs.existsSync(inputPath) ? "photo bg" : "dark bg";
      console.log(`  ✅ Slide ${slideNum} [${bgLabel}]: "${text.slice(0, 50)}"`);
    } catch (err) {
      console.error(`  ❌ Slide ${slideNum} failed: ${err.message}`);
    }
  }

  console.log(`   → ${postsDir}`);
  return postsDir;
}

async function main() {
  console.log(`\n🤖 Larry Brain — Text Overlay Renderer`);
  console.log(`   Agent: ${agentProfile.name} (${agentSlug})\n`);

  const hooks = agentProfile.hooks;

  if (generateAll) {
    for (const hook of hooks) {
      await processHook(hook);
    }
  } else if (hookId) {
    const hook = hooks.find((h) => h.id === hookId);
    if (!hook) {
      console.error(`❌ Hook "${hookId}" not found.`);
      process.exit(1);
    }
    await processHook(hook);
  } else {
    await processHook(hooks[0]);
  }

  console.log(`\n✅ Done! Slides ready in agents/${agentSlug}/posts/`);
  console.log(`   Next: node scripts/post-to-tiktok.js --agent ${agentSlug}`);
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
