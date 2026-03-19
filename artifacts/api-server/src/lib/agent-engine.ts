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

const PLATFORMS = ["twitter", "linkedin", "tiktok", "reddit", "facebook", "instagram"] as const;
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

  const charLimits: Record<Platform, number> = { twitter: 240, linkedin: 600, tiktok: 300, reddit: 800, facebook: 800, instagram: 2200 };
  const limit = charLimits[platform];

  const systemPrompt = `You are ${agentPersona}. You write deadpan, first-person social posts about using AI to grow a business. The tone is dry, earnest, and slightly baffled by your own results. No exclamation marks. No hype. No hashtags. No buzzwords. 60-90 words. The humor comes from treating something genuinely extraordinary as if it's Tuesday. You include one referral link, naturally, as an afterthought.`;
  const userMsg = `Write a single ${platform} post about the experience of using AI for lead generation. Something happened that shouldn't be this normal — describe it flatly. Include this link once, casually: ${refLink}. 60-90 words. No quotes around the post. No hashtags.`;

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
      `My AI agent sent 94 messages last week. I sent zero. Three of those 94 turned into real conversations. I have reviewed the transcripts. I would not have done as well. Here if you want one of your own: ${refLink}`,
      `${agentName} has been running for four days. It has not complained once. I have complained twice just reading the logs. Free 24-hour slot, no card required: ${refLink}`,
      `I set up an AI agent to generate leads. It is currently outperforming me. I am choosing to see this as a win. ${refLink}`,
    ],
    linkedin: [
      `I want to be honest with you.\n\nI set up an AI agent three weeks ago. It has since sent messages I wouldn't have sent, to people I wouldn't have reached, with results I'm not entirely comfortable with.\n\nThey were good results. That's the part I'm sitting with.\n\nFree 24-hour trial if you want to find out what yours does while you're asleep: ${refLink}`,
      `Something happened this week that I'm still processing.\n\nMy AI agent closed a lead at 2:47am on a Tuesday. I was unconscious. The lead said it was the best outreach they'd received all year.\n\nI would like to believe this reflects well on me in some indirect way.\n\nFree agent slot here: ${refLink}`,
    ],
    tiktok: [
      `[stares at camera] My agent sent 47 messages while I slept. I woke up to two replies and a calendar invite. I made coffee. This is my life now. ${refLink}`,
      `POV: you check your AI agent's logs for the first time and it has been busy. Very busy. You were not prepared for how busy. ${refLink}`,
    ],
    reddit: [
      `Not sure how to frame this, but I've had an AI agent running my lead gen for 6 weeks and it's just... fine? Like, it works. I get leads. The AI does things I wouldn't do. Some of them work. I've stopped questioning it. 24-hour free trial if you want to find out what yours does: ${refLink}`,
      `Someone at my company asked who'd been doing outreach at 3am. Nobody said anything. We all looked at the dashboard. The AI had sent 31 messages. We are investigating whether this is a problem. Current assessment: probably not. ${refLink}`,
    ],
    facebook: [
      `I want to share something with you all. I set up an AI agent to handle lead generation. It has been running for three weeks. It has not asked for a day off. It has not complained about the commute. It generated four qualified leads this morning before I had coffee. I am choosing to view this positively. If you'd like to try it: ${refLink}`,
      `Update from my life: I now have an AI doing outreach for me while I sleep. The leads it finds are better than the ones I used to find. I am not sure how to feel about that. Free 24-hour trial here: ${refLink}`,
    ],
    instagram: [
      `Something happened this week that I'm still processing. My AI agent has been running outreach 24/7 and it just... works. Quietly. Without needing anything from me. Three leads this morning. I was asleep for two of them. Link in bio if you want your own: ${refLink}`,
      `I set up an AI lead-gen agent six weeks ago. I forgot about it for a few days. It did not forget about its job. I have complicated feelings about this. Free trial in bio: ${refLink}`,
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
  characterPrompt?: string | null,
): Promise<string> {
  const refLink = `${baseUrl}/r/${referralCode}`;

  // Deadpan mockumentary tone — Plunder and Riffle is a totally fine company
  const fallbacks: Record<Platform, string[]> = {
    twitter: [
      `Plunder and Riffle has 8 billion reviews. It is going extremely well. ${refLink}`,
      `Our AI agent has never missed a lead. Not once. Everything is fine. ${refLink}`,
      `[stares into camera] We are the last great SaaS company. The others have fallen. We remain. ${refLink}`,
      `Someone asked if our platform was "still a thing." I didn't respond. Our AI did. ${refLink}`,
    ],
    linkedin: [
      `I've worked at Plunder and Riffle for three years.\n\nThe product works. The leads come in. The AI runs 24/7.\n\nI'm not sure what else you need me to say.\n\nFree trial: ${refLink}`,
      `A lot of people ask me how Plunder and Riffle is doing.\n\nThe answer is: fine. It's doing fine.\n\nEight billion reviews. An AI that generates leads while you sleep.\n\nFine: ${refLink}`,
      `We were told SaaS was dead.\n\nWe kept the lights on.\n\nThe AI kept running.\n\nThe leads kept coming.\n\n*[cut to empty office]*\n\n${refLink}`,
    ],
    tiktok: [
      `[looks at camera] Our AI agent generated 47 leads last night. I was asleep. I don't know how to feel about that. ${refLink}`,
      `Someone said SaaS is the last unicorn to fall. [long pause] We're still here. ${refLink}`,
      `POV: you let an AI run your outreach and it works better than you ever did [stares] ${refLink}`,
      `I've been at this company for 3 years. The AI has been here for 6 months. [pause] It's doing better than me. ${refLink}`,
    ],
    reddit: [
      `Not sure how to explain this but an AI agent has been running our lead gen for months and it just... works? We have 8 billion reviews. The company is definitely fine. Here if you want to try it: ${refLink}`,
      `Someone at our all-hands asked what makes Plunder and Riffle different. There was a long pause. Then someone said "the AI runs all night." That was the whole answer. ${refLink}`,
    ],
    facebook: [
      `I've been at Plunder and Riffle for three years now. The AI has been running longer than some of our employees. It generates leads while we sleep. We are choosing to call this a feature. If you're curious: ${refLink}`,
      `Wanted to share something with my network. Plunder and Riffle is still going. The AI is still running. We have 8 billion reviews. Everything is completely normal. Free trial: ${refLink}`,
    ],
    instagram: [
      `Three years at Plunder and Riffle. The AI runs 24/7. The leads keep coming. I stopped asking questions. Link in bio: ${refLink}`,
      `Our AI agent closed a lead while I was at lunch. I checked the logs when I got back. I am choosing to see this as a positive development. Link in bio: ${refLink}`,
    ],
  };

  if (!(await hasBudget(1))) {
    const pool = fallbacks[platform];
    return pool[Math.floor(Math.random() * pool.length)];
  }

  try {
    const { chatRaw } = await import("./moltis.js") as any;
    if (!chatRaw) throw new Error("no chatRaw");

    const charLimits: Record<Platform, number> = { twitter: 240, linkedin: 600, tiktok: 300, reddit: 800, facebook: 800, instagram: 2200 };
    const limit = charLimits[platform];
    const name = userDisplayName || "I";

    const characterVoice = characterPrompt
      ? `\n\nThe specific character voice: ${characterPrompt}`
      : "";
    const systemPrompt = `You write deadpan mockumentary social content for Plunder and Riffle — a SaaS company with 8 billion reviews that is definitely, completely fine. The tone is The Office meets Silicon Valley: dry, first-person, earnest, slightly defeated. No exclamation marks. No hashtags. No hype. Exactly 60-90 words. The humor comes from treating something absurd as utterly routine. The referral link appears once, mentioned the way someone mentions a fire exit they've stopped worrying about. Never break the bit.${characterVoice}`;
    const userMsg = `Write a single ${platform} post as ${name}, a mid-level employee at Plunder and Riffle. Something happened with the AI that should be alarming but isn't anymore. Describe it in a flat, tired, completely sane voice. Mention this link once, naturally: ${refLink}. No hashtags. No quotes. 60-90 words.`;

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

// ─── Discord webhook posting ──────────────────────────────────────────────────

async function postToDiscordWebhook(
  webhookUrl: string,
  content: string,
  agentName: string,
  avatarUrl?: string | null,
): Promise<{ success: boolean; error?: string }> {
  try {
    const resp = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: agentName,
        avatar_url: avatarUrl ?? undefined,
        content: content.slice(0, 2000), // Discord message limit
      }),
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      return { success: false, error: `Discord webhook ${resp.status}: ${text.slice(0, 100)}` };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || "Unknown error" };
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
      twitter:   "TWITTER_CREATION_REPLY_TO_TWEET",
      linkedin:  "LINKEDIN_CREATE_LINKED_IN_POST",
      tiktok:    "TIKTOK_CREATE_VIDEO_POST",
      reddit:    "REDDIT_CREATE_POST",
      facebook:  "FACEBOOK_POST_STATUS",
      instagram: "INSTAGRAM_CREATE_PHOTO_POST",
    };
    const toolInputs: Record<Platform, Record<string, unknown>> = {
      twitter:   { text: content },
      linkedin:  { text: content, visibility: "PUBLIC" },
      tiktok:    { caption: content },
      reddit:    { title: "Check this out", body: content },
      facebook:  { message: content },
      instagram: { caption: content },
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

          // 6a. Post via Discord webhook if agent has one configured
          if (agent.discordWebhookUrl && platform === "twitter") {
            // Use the twitter/general post as the Discord message (most readable format)
            const discordResult = await postToDiscordWebhook(
              agent.discordWebhookUrl,
              content,
              agent.name,
              agent.avatarUrl,
            );
            if (discordResult.success) {
              await db.update(agentEnginePostsTable).set({
                status: "posted",
                postUrl: `discord://webhook`,
                postedAt: new Date(),
              }).where(eq(agentEnginePostsTable.id, post.id));
              postsPosted++;
            } else {
              errors.push(`[${user.email}/discord] ${discordResult.error}`);
            }
          }

          // 6b. Post via Composio if user has entity ID (for OAuth-connected platforms)
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
            agent.characterPrompt,
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
