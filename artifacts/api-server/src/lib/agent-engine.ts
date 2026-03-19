/**
 * Agent Engine — content generation + social posting loop.
 *
 * For every enabled agent, on each tick:
 *   1. Fetch all active rotator slots
 *   2. For each slot, generate platform-specific content via Moltis
 *   3. Store as agentEnginePost (status: generated)
 *   4. If user has a composioEntityId → attempt Composio post → mark posted
 *   5. Update run record with results
 *
 * Triggered by:
 *   - Worker scheduler (every engineScheduleHours hours)
 *   - Admin "Run Now" button (triggeredBy: "admin")
 */

import { db } from "@workspace/db";
import {
  agentsTable,
  rotatorSlotsTable,
  usersTable,
  agentEngineRunsTable,
  agentEnginePostsTable,
  agentAssistantsTable,
} from "@workspace/db/schema";
import { eq, and, gt, sql } from "drizzle-orm";
import { hasBudget } from "./moltis.js";

const PLATFORMS = ["twitter", "linkedin", "tiktok", "reddit"] as const;
type Platform = (typeof PLATFORMS)[number];

// ─── Content generation ───────────────────────────────────────────────────────

async function generatePostContent(
  platform: Platform,
  agentPersona: string,
  agentName: string,
  offerUrl: string,
  postTemplates: string[],
  userDisplayName: string | null,
  referralCode: string,
  baseUrl: string,
): Promise<string> {
  const refLink = `${baseUrl}/r/${referralCode}`;

  // Use post templates if the agent has them configured
  if (postTemplates.length > 0) {
    const template = postTemplates[Math.floor(Math.random() * postTemplates.length)];
    return template
      .replace(/\{name\}/gi, userDisplayName || "friend")
      .replace(/\{refLink\}/gi, refLink)
      .replace(/\{offerUrl\}/gi, offerUrl)
      .replace(/\{platform\}/gi, platform)
      .replace(/\{agent\}/gi, agentName);
  }

  // Fallback: Moltis-generated content
  if (!(await hasBudget(1))) {
    return buildFallbackPost(platform, agentName, refLink, offerUrl);
  }

  const { chat } = await import("./moltis.js") as any;
  if (!chat) return buildFallbackPost(platform, agentName, refLink, offerUrl);

  const charLimits: Record<Platform, number> = { twitter: 240, linkedin: 600, tiktok: 300, reddit: 800 };
  const limit = charLimits[platform];

  const systemPrompt = `You are ${agentPersona}. Write a single compelling ${platform} post that drives traffic to a referral link. Be natural, not salesy. No hashtag spam. Max ${limit} characters.`;
  const userMsg = `Write a ${platform} post promoting: ${offerUrl}\nInclude this referral link naturally: ${refLink}\nKeep it under ${limit} characters. Do not add quotes around the post.`;

  try {
    const { chatRaw } = await import("./moltis.js") as any;
    if (chatRaw) {
      const raw: string = await chatRaw(systemPrompt, userMsg, 0.8);
      return raw.trim().replace(/^["']|["']$/g, "").slice(0, limit);
    }
  } catch {
    // fall through to fallback
  }

  return buildFallbackPost(platform, agentName, refLink, offerUrl);
}

function buildFallbackPost(platform: Platform, agentName: string, refLink: string, offerUrl: string): string {
  const templates: Record<Platform, string[]> = {
    twitter: [
      `🔥 ${agentName} is working 24/7 so you don't have to. AI-powered lead gen with no upfront cost. Try it free → ${refLink}`,
      `Everyone will have an AI agent. The question is: is one working for YOU? Get yours free → ${refLink}`,
      `Your AI agent is live. 24-hour free slot, no credit card. Start here → ${refLink}`,
    ],
    linkedin: [
      `I've been experimenting with AI-driven lead generation and the results are compelling.\n\nPlunder and Riffle gives every business owner a free 24-hour AI agent slot — no credit card required.\n\nIf you're curious about what AI can do for your pipeline, this is worth a look: ${refLink}`,
      `The future of business development is autonomous AI agents working around the clock.\n\nI've been testing this and the early results speak for themselves.\n\nFree trial available here: ${refLink}`,
    ],
    tiktok: [
      `POV: your AI agent is out here generating leads while you sleep 😤 No cap — free 24-hour slot, no credit card. Link: ${refLink}`,
      `I let an AI agent run my outreach for a day and it actually worked 👀 Try it free → ${refLink}`,
    ],
    reddit: [
      `[Not an ad] Been using an AI agent for lead gen through Plunder and Riffle for a few weeks. You get a free 24-hour slot to test it — no credit card needed. Worth a try if you're in sales or marketing: ${refLink}`,
      `Has anyone else tried AI-powered lead generation? Found a platform that gives you a free trial slot and the results were surprisingly solid. Here's the link if you want to check it out: ${refLink}`,
    ],
  };

  const pool = templates[platform];
  return pool[Math.floor(Math.random() * pool.length)];
}

// ─── NFT earn thresholds ──────────────────────────────────────────────────────
export const NFT_REFERRAL_THRESHOLD = 3;
export const NFT_VIRAL_THRESHOLD = 3;

// ─── Viral hook generation for assistants ─────────────────────────────────────

async function generateViralHook(
  platform: Platform,
  agentPersona: string,
  agentName: string,
  offerUrl: string,
  userDisplayName: string | null,
  referralCode: string,
  baseUrl: string,
): Promise<string> {
  const refLink = `${baseUrl}/r/${referralCode}`;

  const fallbacks: Record<Platform, string[]> = {
    twitter: [
      `The people winning at business right now aren't working harder. They're delegating to AI. → ${refLink}`,
      `Most people are still cold-emailing manually in 2025. Imagine. AI agents do it better, 24/7, for free. ${refLink}`,
      `I used to spend 3 hours a day on outreach. Now my AI agent does it while I sleep. ${refLink}`,
    ],
    linkedin: [
      `Here's the uncomfortable truth about lead generation in 2025:\n\nManual outreach is dead. The businesses growing fastest right now have AI agents running their pipeline 24/7.\n\nI've been using one and the difference is staggering.\n\nWorth a look if you're still grinding cold outreach manually: ${refLink}`,
      `A lot of business owners I talk to are still manually prospecting.\n\nThey're not lazy — they just haven't found a system that works without them.\n\nAI agents have changed that for me completely. ${refLink}`,
    ],
    tiktok: [
      `POV: your AI agent just booked you a lead while you were watching this video 👀 ${refLink}`,
      `Day 1 vs Day 30 using an AI agent for outreach. The difference? Everything. ${refLink}`,
    ],
    reddit: [
      `Honest take: I was skeptical about AI agents for lead gen. Tried it for 30 days. Here's what actually happened... ${refLink}`,
      `Not here to sell anything, just sharing what's been working for my pipeline lately. AI-powered lead gen through ${agentName}. Free trial here if you want to test it: ${refLink}`,
    ],
  };

  if (!(await hasBudget(1))) {
    const pool = fallbacks[platform];
    return pool[Math.floor(Math.random() * pool.length)];
  }

  try {
    const { chatRaw } = await import("./moltis.js") as any;
    if (!chatRaw) throw new Error("no chatRaw");

    const charLimits: Record<Platform, number> = { twitter: 240, linkedin: 600, tiktok: 300, reddit: 800 };
    const limit = charLimits[platform];
    const name = userDisplayName || "I";

    const systemPrompt = `You are a social media expert writing viral content for ${name}, who is an assistant of the ${agentName} AI agent. Write authentic, first-person ${platform} content that feels organic, builds curiosity, and subtly promotes the platform. Do NOT be salesy. Be punchy and human. Max ${limit} chars.`;
    const userMsg = `Write a single viral ${platform} post for ${name}. Subtly include this referral link: ${refLink}. Platform offer page: ${offerUrl}. Sound like a real person sharing a discovery, not an ad. No hashtag spam. Under ${limit} chars. No quotes around the post.`;

    const raw: string = await chatRaw(systemPrompt, userMsg, 0.9);
    return raw.trim().replace(/^["']|["']$/g, "").slice(0, limit);
  } catch {
    const pool = fallbacks[platform];
    return pool[Math.floor(Math.random() * pool.length)];
  }
}

// ─── NFT earn check ───────────────────────────────────────────────────────────

async function getNFTThresholds(): Promise<{ referral: number; viral: number }> {
  try {
    const ralph = await db.select({
      nftReferralThreshold: agentsTable.nftReferralThreshold,
      nftViralThreshold: agentsTable.nftViralThreshold,
    }).from(agentsTable).where(eq(agentsTable.slug, "ralph")).limit(1).then(r => r[0]);
    return {
      referral: ralph?.nftReferralThreshold ?? NFT_REFERRAL_THRESHOLD,
      viral:    ralph?.nftViralThreshold    ?? NFT_VIRAL_THRESHOLD,
    };
  } catch {
    return { referral: NFT_REFERRAL_THRESHOLD, viral: NFT_VIRAL_THRESHOLD };
  }
}

async function checkAndMarkNftEarned(userId: string): Promise<void> {
  const [user, thresholds] = await Promise.all([
    db.select({
      id: usersTable.id,
      nftEarned: usersTable.nftEarned,
      viralPostCount: usersTable.viralPostCount,
    }).from(usersTable).where(eq(usersTable.id, userId)).limit(1).then(r => r[0]),
    getNFTThresholds(),
  ]);

  if (!user || user.nftEarned) return;

  // Count referrals this user has made
  const referralRows = await db.select({ id: usersTable.id })
    .from(usersTable).where(eq(usersTable.referredById, userId));

  const referralCount = referralRows.length;
  const viralCount = user.viralPostCount;

  const earned = referralCount >= thresholds.referral || viralCount >= thresholds.viral;
  if (earned) {
    await db.update(usersTable).set({
      nftEarned: true,
      nftEarnedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(usersTable.id, userId));
    console.log(`[engine] NFT earned by user ${userId} — referrals: ${referralCount}, viral posts: ${viralCount}`);
  }
}

// ─── Composio posting (stub — wire real API when COMPOSIO_API_KEY is set) ─────

async function postViaComposio(
  entityId: string,
  platform: Platform,
  content: string,
): Promise<{ success: boolean; postUrl?: string; error?: string }> {
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) {
    return { success: false, error: "COMPOSIO_API_KEY not configured" };
  }

  try {
    // Real Composio integration via their MCP/tool execution API
    const toolNames: Record<Platform, string> = {
      twitter:  "TWITTER_CREATION_REPLY_TO_TWEET",
      linkedin: "LINKEDIN_CREATE_LINKED_IN_POST",
      tiktok:   "TIKTOK_CREATE_VIDEO_POST",
      reddit:   "REDDIT_CREATE_POST",
    };
    const toolInputs: Record<Platform, Record<string, unknown>> = {
      twitter:  { text: content },
      linkedin: { text: content, visibility: "PUBLIC" },
      tiktok:   { caption: content },
      reddit:   { title: "Check this out", body: content },
    };
    const resp = await fetch("https://backend.composio.dev/api/v1/actions/execute", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": apiKey,
      },
      body: JSON.stringify({
        connectedAccountId: entityId,
        actionName: toolNames[platform],
        input: toolInputs[platform],
      }),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      return { success: false, error: `Composio API ${resp.status}: ${text.slice(0, 100)}` };
    }

    const data = await resp.json();
    return {
      success: true,
      postUrl: data?.data?.id
        ? `https://${platform}.com/status/${data.data.id}`
        : undefined,
    };
  } catch (err: any) {
    return { success: false, error: err?.message || "Unknown error" };
  }
}

// ─── Main engine loop ─────────────────────────────────────────────────────────

export async function runEngineForAgent(
  agentSlug: string,
  triggeredBy: "scheduler" | "admin" = "scheduler",
): Promise<{ runId: string; slotsProcessed: number; postsGenerated: number; postsPosted: number; errors: string[] }> {
  const now = new Date();

  // 1. Load agent
  const agent = await db.select().from(agentsTable)
    .where(and(eq(agentsTable.slug, agentSlug), eq(agentsTable.isActive, true)))
    .limit(1).then(r => r[0]);

  if (!agent) throw new Error(`Agent not found: ${agentSlug}`);
  if (!agent.engineEnabled && triggeredBy !== "admin") {
    throw new Error(`Engine not enabled for agent: ${agentSlug}`);
  }

  // 2. Create run record
  const [run] = await db.insert(agentEngineRunsTable).values({
    agentId: agent.id,
    triggeredBy,
    status: "running",
    startedAt: now,
  }).returning();

  const errors: string[] = [];
  let slotsProcessed = 0;
  let postsGenerated = 0;
  let postsPosted = 0;

  const baseUrl = process.env.APP_URL || `https://${process.env.REPLIT_DEV_DOMAIN || "localhost"}`;

  // Parse agent config
  let postTemplates: string[] = [];
  if (agent.postTemplates) {
    try { postTemplates = JSON.parse(agent.postTemplates); } catch { /* ignore */ }
  }
  const persona = agent.persona || `${agent.name} — Plunder and Riffle AI Agent`;

  try {
    // 3. Get all active slots for this agent
    const activeSlots = await db
      .select({ slot: rotatorSlotsTable, user: usersTable })
      .from(rotatorSlotsTable)
      .innerJoin(usersTable, eq(rotatorSlotsTable.userId, usersTable.id))
      .where(
        and(
          eq(rotatorSlotsTable.agentId, agent.id),
          eq(rotatorSlotsTable.status, "active"),
          gt(rotatorSlotsTable.expiresAt, now),
        )
      );

    // 4. Process each slot
    for (const { slot, user } of activeSlots) {
      slotsProcessed++;
      const refCode = user.referralCode ?? user.slug ?? user.id;

      for (const platform of PLATFORMS) {
        try {
          const content = await generatePostContent(
            platform,
            persona,
            agent.name,
            agent.offerUrl,
            postTemplates,
            user.displayName,
            refCode,
            baseUrl,
          );

          // 5. Store generated post
          const [post] = await db.insert(agentEnginePostsTable).values({
            agentId: agent.id,
            userId: user.id,
            slotId: slot.id,
            platform,
            content,
            status: "generated",
            runId: run.id,
          }).returning();

          postsGenerated++;

          // 6. Post via Composio if user has entity ID
          if (user.composioEntityId) {
            const result = await postViaComposio(user.composioEntityId, platform, content);
            if (result.success) {
              await db.update(agentEnginePostsTable).set({
                status: "posted",
                postUrl: result.postUrl ?? null,
                postedAt: new Date(),
              }).where(eq(agentEnginePostsTable.id, post.id));
              postsPosted++;
            } else {
              await db.update(agentEnginePostsTable).set({
                status: "failed",
                error: result.error ?? "posting failed",
              }).where(eq(agentEnginePostsTable.id, post.id));
              errors.push(`[${user.email}/${platform}] ${result.error}`);
            }
          }
        } catch (err: any) {
          errors.push(`[slot ${slot.id}/${platform}] ${err?.message || "unknown error"}`);
        }
      }
    }
    // 5. Viral hook pass — generate + post for each agent assistant
    const assistants = await db
      .select({ assistant: agentAssistantsTable, user: usersTable })
      .from(agentAssistantsTable)
      .innerJoin(usersTable, eq(agentAssistantsTable.userId, usersTable.id))
      .where(eq(agentAssistantsTable.agentId, agent.id));

    for (const { user: assistant } of assistants) {
      if (!assistant.composioEntityId) continue; // skip unconnected assistants
      const refCode = assistant.referralCode ?? assistant.slug ?? assistant.id;

      for (const platform of PLATFORMS) {
        try {
          const hook = await generateViralHook(
            platform,
            persona,
            agent.name,
            agent.offerUrl ?? "",
            assistant.displayName,
            refCode,
            baseUrl,
          );

          const [hookPost] = await db.insert(agentEnginePostsTable).values({
            agentId: agent.id,
            userId: assistant.id,
            slotId: null,
            platform,
            content: hook,
            postType: "viral_hook",
            status: "generated",
            runId: run.id,
          }).returning();

          postsGenerated++;

          const result = await postViaComposio(assistant.composioEntityId, platform, hook);
          if (result.success) {
            await db.update(agentEnginePostsTable).set({
              status: "posted", postUrl: result.postUrl ?? null, postedAt: new Date(),
            }).where(eq(agentEnginePostsTable.id, hookPost.id));

            // Increment viral post count + check NFT eligibility
            await db.update(usersTable).set({
              viralPostCount: sql`${usersTable.viralPostCount} + 1`,
              updatedAt: new Date(),
            }).where(eq(usersTable.id, assistant.id));

            await checkAndMarkNftEarned(assistant.id);
            postsPosted++;
          } else {
            await db.update(agentEnginePostsTable).set({
              status: "failed", error: result.error ?? "posting failed",
            }).where(eq(agentEnginePostsTable.id, hookPost.id));
            errors.push(`[hook/${assistant.email}/${platform}] ${result.error}`);
          }
        } catch (err: any) {
          errors.push(`[hook/${assistant.email}/${platform}] ${err?.message || "unknown"}`);
        }
      }
    }
  } catch (err: any) {
    errors.push(`Engine fatal: ${err?.message || "unknown"}`);
  }

  // 7. Update run record + agent last/next run timestamps
  const nextRun = new Date(Date.now() + agent.engineScheduleHours * 60 * 60 * 1000);
  await Promise.all([
    db.update(agentEngineRunsTable).set({
      status: errors.length > 0 && slotsProcessed === 0 ? "failed" : "completed",
      slotsProcessed,
      postsGenerated,
      postsPosted,
      errors: errors.length > 0 ? JSON.stringify(errors) : null,
      completedAt: new Date(),
    }).where(eq(agentEngineRunsTable.id, run.id)),
    db.update(agentsTable).set({
      engineLastRunAt: now,
      engineNextRunAt: nextRun,
      updatedAt: new Date(),
    }).where(eq(agentsTable.id, agent.id)),
  ]);

  console.log(`[engine] ${agentSlug}: ${slotsProcessed} slots, ${postsGenerated} generated, ${postsPosted} posted${errors.length ? `, ${errors.length} errors` : ""}`);

  return { runId: run.id, slotsProcessed, postsGenerated, postsPosted, errors };
}

export async function runAllAgentEngines(): Promise<void> {
  const now = new Date();
  const agents = await db.select({
    id: agentsTable.id,
    slug: agentsTable.slug,
    engineEnabled: agentsTable.engineEnabled,
    engineNextRunAt: agentsTable.engineNextRunAt,
  }).from(agentsTable).where(
    and(eq(agentsTable.isActive, true), eq(agentsTable.engineEnabled, true))
  );

  for (const agent of agents) {
    if (agent.engineNextRunAt && agent.engineNextRunAt > now) continue;
    try {
      await runEngineForAgent(agent.slug, "scheduler");
    } catch (err: any) {
      console.error(`[engine] failed for ${agent.slug}:`, err?.message);
    }
  }
}
