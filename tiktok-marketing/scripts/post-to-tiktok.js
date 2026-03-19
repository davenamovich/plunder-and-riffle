#!/usr/bin/env node
/**
 * Larry Brain — TikTok Poster via Postiz
 * Posts a slideshow to TikTok as a photo carousel draft
 *
 * Usage:
 *   node scripts/post-to-tiktok.js --agent ralph --hook h001
 *
 * Requires:
 *   POSTIZ_API_KEY env var
 *   TIKTOK_INTEGRATION_ID env var (from Postiz dashboard)
 *
 * Posts go to TikTok as DRAFTS — add a trending sound in TikTok before publishing.
 * Music is the #1 factor in TikTok reach.
 */

const fs = require("fs");
const path = require("path");
const https = require("https");

const ROOT = path.join(__dirname, "..");
const config = JSON.parse(fs.readFileSync(path.join(ROOT, "config.json"), "utf8"));

const POSTIZ_API_KEY = process.env.POSTIZ_API_KEY || config.postiz.apiKey;
const TIKTOK_INTEGRATION_ID = process.env.TIKTOK_INTEGRATION_ID || config.postiz.integrationIds.tiktok;

if (!POSTIZ_API_KEY) {
  console.error("❌  POSTIZ_API_KEY not set.");
  console.error("   Get it from: postiz.pro/oliverhenry → Settings → API");
  process.exit(1);
}

if (!TIKTOK_INTEGRATION_ID) {
  console.error("❌  TIKTOK_INTEGRATION_ID not set.");
  console.error("   Get it from Postiz → Integrations → TikTok → copy ID");
  process.exit(1);
}

const args = process.argv.slice(2);
const agentSlug = args[args.indexOf("--agent") + 1] || "ralph";
const hookId = args[args.indexOf("--hook") + 1] || null;

const agentProfile = JSON.parse(
  fs.readFileSync(path.join(ROOT, "agents", agentSlug, "profile.json"), "utf8")
);

async function uploadMedia(filePath) {
  // Postiz media upload
  const fileContent = fs.readFileSync(filePath);
  const fileName = path.basename(filePath);
  const boundary = "----FormBoundary" + Math.random().toString(36).substr(2);

  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: image/png\r\n\r\n`),
    fileContent,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "api.postiz.com",
        path: "/v1/media",
        method: "POST",
        headers: {
          Authorization: `Bearer ${POSTIZ_API_KEY}`,
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
          "Content-Length": body.length,
        },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            if (json.id) resolve(json.id);
            else reject(new Error(`Upload failed: ${data}`));
          } catch (e) {
            reject(new Error(`Parse error: ${data}`));
          }
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function createPost(mediaIds, hook, caption) {
  const body = JSON.stringify({
    type: "post",
    date: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // 5 min from now
    integrations: [TIKTOK_INTEGRATION_ID],
    posts: [
      {
        integration: { id: TIKTOK_INTEGRATION_ID },
        content: caption,
        media: mediaIds.map((id) => ({ id })),
        settings: {
          tiktok: {
            privacy_level: config.posting.privacyLevel || "SELF_ONLY",
          },
        },
      },
    ],
  });

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "api.postiz.com",
        path: "/v1/posts",
        method: "POST",
        headers: {
          Authorization: `Bearer ${POSTIZ_API_KEY}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            resolve(json);
          } catch (e) {
            reject(new Error(`Parse error: ${data}`));
          }
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  console.log(`\n🚀 Larry Brain — TikTok Poster`);
  console.log(`   Agent: ${agentProfile.name} (${agentSlug})\n`);

  const hook = hookId
    ? agentProfile.hooks.find((h) => h.id === hookId)
    : agentProfile.hooks[0];

  if (!hook) {
    console.error(`❌ Hook not found`);
    process.exit(1);
  }

  const postsDir = path.join(ROOT, "agents", agentSlug, "posts", hook.id);
  if (!fs.existsSync(postsDir)) {
    console.error(`❌ Posts not found. Run add-overlays.js first.`);
    process.exit(1);
  }

  const slideFiles = fs.readdirSync(postsDir)
    .filter((f) => f.endsWith(".png"))
    .sort()
    .map((f) => path.join(postsDir, f));

  if (!slideFiles.length) {
    console.error(`❌ No slide images found in ${postsDir}`);
    process.exit(1);
  }

  console.log(`📤 Uploading ${slideFiles.length} slides to Postiz...`);
  const mediaIds = [];
  for (const file of slideFiles) {
    console.log(`  ↑ ${path.basename(file)}`);
    const mediaId = await uploadMedia(file);
    mediaIds.push(mediaId);
  }

  const caption = `${hook.text}\n\n${agentProfile.cta}\n\n#AI #AIAgents #PlunderAndRiffle #${agentProfile.name}`;

  console.log(`\n📝 Creating post...`);
  console.log(`   Caption: "${caption.slice(0, 80)}..."`);

  const result = await createPost(mediaIds, hook, caption);

  console.log(`\n✅ Post created!`);
  console.log(`   ID: ${result.id}`);
  console.log(`   ⚠️  IMPORTANT: Go to TikTok and add a trending sound before publishing!`);
  console.log(`      Music is the #1 factor in TikTok reach.`);

  // Log to tracking file
  const trackFile = path.join(ROOT, "agents", agentSlug, "posts.json");
  const posts = fs.existsSync(trackFile) ? JSON.parse(fs.readFileSync(trackFile, "utf8")) : [];
  posts.push({
    postId: result.id,
    hookId: hook.id,
    hookCategory: hook.category,
    hookText: hook.text,
    postedAt: new Date().toISOString(),
    status: "draft",
  });
  fs.writeFileSync(trackFile, JSON.stringify(posts, null, 2));
  console.log(`\n📊 Logged to ${trackFile}`);
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
