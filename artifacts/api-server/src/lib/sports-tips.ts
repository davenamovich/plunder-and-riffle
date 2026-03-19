/**
 * Sports Tips Engine
 *
 * Pulls live upcoming fixtures from free sports APIs,
 * generates deadpan sports-fan-style tips via the LLM,
 * and posts them to a Telegram channel.
 *
 * Character: The Sports Fan — calm, deadpan, slightly knowing.
 * Treats tips as objective analysis. Never excited.
 */

import { hasBudget } from "./moltis.js";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

// Normalise channel ID — accept @username, numeric ID, or https://t.me/username
function normaliseChatId(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  // t.me URL → @username
  const tme = trimmed.match(/t\.me\/([A-Za-z0-9_]+)/);
  if (tme) return `@${tme[1]}`;
  // bare username without @ → add @
  if (/^[A-Za-z][A-Za-z0-9_]{3,}$/.test(trimmed)) return `@${trimmed}`;
  return trimmed; // already @username or numeric -100xxx
}

const TELEGRAM_CHANNEL_ID = normaliseChatId(process.env.TELEGRAM_CHANNEL_ID);

// ─── Telegram ─────────────────────────────────────────────────────────────────

async function sendTelegram(message: string): Promise<boolean> {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHANNEL_ID) {
    console.warn("[sports-tips] Telegram not configured — skipping post");
    return false;
  }
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHANNEL_ID,
          text: message,
          parse_mode: "HTML",
          disable_web_page_preview: true,
        }),
      }
    );
    const data = await res.json() as any;
    if (!data.ok) {
      console.error("[sports-tips] Telegram error:", data.description);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[sports-tips] Telegram fetch failed:", err);
    return false;
  }
}

// ─── Live fixtures from free API-Football via RapidAPI or direct ──────────────

interface Fixture {
  home: string;
  away: string;
  competition: string;
  date: string;
  homeOdds?: number;
  awayOdds?: number;
  drawOdds?: number;
}

async function fetchUpcomingFixtures(): Promise<Fixture[]> {
  // Use TheSportsDB free tier — no key required
  try {
    const today = new Date();
    const dateStr = today.toISOString().split("T")[0];

    const res = await fetch(
      `https://www.thesportsdb.com/api/v1/json/3/eventsday.php?d=${dateStr}&s=Soccer`,
      { signal: AbortSignal.timeout(8000) }
    );

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as any;
    const events = data.events ?? [];

    return events.slice(0, 8).map((e: any) => ({
      home: e.strHomeTeam ?? "Home",
      away: e.strAwayTeam ?? "Away",
      competition: e.strLeague ?? "Unknown League",
      date: e.strTime ?? dateStr,
    }));
  } catch (err) {
    console.warn("[sports-tips] Fixtures fetch failed, using fallback:", err);
    return getFallbackFixtures();
  }
}

function getFallbackFixtures(): Fixture[] {
  const teams = [
    ["Manchester City", "Arsenal", "Premier League"],
    ["Real Madrid", "Barcelona", "La Liga"],
    ["Bayern Munich", "Borussia Dortmund", "Bundesliga"],
    ["PSG", "Marseille", "Ligue 1"],
    ["Inter Milan", "AC Milan", "Serie A"],
  ];
  const pick = teams[Math.floor(Math.random() * teams.length)];
  return [{ home: pick[0], away: pick[1], competition: pick[2], date: "Today" }];
}

// ─── Polymarket — prediction market odds ──────────────────────────────────────

async function fetchPolymarketSportsOdds(): Promise<{ question: string; probability: number }[]> {
  try {
    const res = await fetch(
      "https://clob.polymarket.com/markets?active=true&closed=false&tag_slug=sports&limit=5",
      { signal: AbortSignal.timeout(6000) }
    );
    if (!res.ok) return [];
    const data = await res.json() as any;
    const markets = data.data ?? [];
    return markets.slice(0, 3).map((m: any) => ({
      question: m.question ?? "",
      probability: parseFloat(m.bestAsk ?? "0.5"),
    }));
  } catch {
    return [];
  }
}

// ─── Tip generation ───────────────────────────────────────────────────────────

const FALLBACK_TIPS = [
  (f: Fixture) =>
    `📊 <b>${f.home} vs ${f.away}</b>\n${f.competition}\n\nBoth sides have been solid at home recently. Over 2.5 goals looks reasonable here. The stats suggest it.\n\n<i>Not financial advice. Just the numbers.</i>`,
  (f: Fixture) =>
    `📊 <b>${f.home} vs ${f.away}</b>\n${f.competition}\n\n${f.home} have kept a clean sheet in 3 of their last 4. BTTS: No is worth a look.\n\n<i>This is a tip channel. We give tips. This is one of them.</i>`,
  (f: Fixture) =>
    `📊 <b>${f.home} vs ${f.away}</b>\n${f.competition}\n\n${f.away} have lost their last two away games. Home win is the obvious call. It's usually the obvious call.\n\n<i>We remain committed to the process.</i>`,
  (f: Fixture) =>
    `📊 <b>${f.home} vs ${f.away}</b>\n${f.competition}\n\nCorners market: ${f.home} have averaged 7.2 corners at home this season. Over 9.5 total corners. That's just what the data says.\n\n<i>Free tips. Always free.</i>`,
];

async function generateTip(fixture: Fixture, polymarketContext: string): Promise<string> {
  if (!(await hasBudget(1))) {
    const fn = FALLBACK_TIPS[Math.floor(Math.random() * FALLBACK_TIPS.length)];
    return fn(fixture);
  }

  try {
    const { chatOnce } = await import("./moltis.js");

    const systemPrompt = `You are a deadpan sports tipster on Telegram. You're a fan — knowledgeable, slightly world-weary, completely calm. You've done the research so your followers don't have to. You don't hype. You don't use exclamation marks. You treat your tips as objective analysis. You never guarantee anything but you always have a reason. The humour comes from how earnestly you state the obvious. Format for Telegram HTML. Use <b> for match header. Keep it under 220 characters of copy (not counting formatting tags). End with a short deadpan disclaimer in <i> tags.`;

    const userMsg = `Write a free betting tip for: ${fixture.home} vs ${fixture.away} (${fixture.competition}). ${polymarketContext ? `Polymarket context: ${polymarketContext}.` : ""} Pick one bet type: match result, over/under goals, BTTS, corners, or first goalscorer. Be specific about the pick. Deadpan, calm, no excitement. Include the match name in bold. Disclaimer at the end in italics.`;

    const raw: string = await chatOnce(systemPrompt, userMsg, 0.85);
    return raw.trim().replace(/^["']|["']$/g, "");
  } catch {
    const fn = FALLBACK_TIPS[Math.floor(Math.random() * FALLBACK_TIPS.length)];
    return fn(fixture);
  }
}

// ─── Daily briefing ───────────────────────────────────────────────────────────

async function generateDailyBriefing(fixtures: Fixture[]): Promise<string> {
  const count = fixtures.length;
  const leagues = [...new Set(fixtures.map(f => f.competition))].slice(0, 3).join(", ");

  return `🗓 <b>Today's card — ${new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</b>\n\n${count} fixture${count !== 1 ? "s" : ""} tracked across ${leagues || "multiple leagues"}.\n\nTips dropping shortly. Stay calm.\n\n<i>This channel is free. It will remain free.</i>`;
}

// ─── Main run ─────────────────────────────────────────────────────────────────

export async function runSportsTipsEngine(triggeredBy: "scheduler" | "admin" = "scheduler"): Promise<{
  ok: boolean;
  fixturesFound: number;
  tipsSent: number;
  briefingSent: boolean;
  error?: string;
}> {
  console.log(`[sports-tips] Running (${triggeredBy})`);

  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHANNEL_ID) {
    return { ok: false, fixturesFound: 0, tipsSent: 0, briefingSent: false, error: "Telegram not configured" };
  }

  try {
    // 1. Fetch data in parallel
    const [fixtures, polymarkets] = await Promise.all([
      fetchUpcomingFixtures(),
      fetchPolymarketSportsOdds(),
    ]);

    console.log(`[sports-tips] ${fixtures.length} fixtures, ${polymarkets.length} polymarket signals`);

    if (fixtures.length === 0) {
      const noGames = `📊 <b>Quiet day today.</b>\n\nNo major fixtures tracked. The algorithm has assessed the situation and found nothing worth tipping.\n\n<i>We will return tomorrow. The process continues.</i>`;
      await sendTelegram(noGames);
      return { ok: true, fixturesFound: 0, tipsSent: 0, briefingSent: true };
    }

    // 2. Send morning briefing
    const briefing = await generateDailyBriefing(fixtures);
    const briefingSent = await sendTelegram(briefing);

    // 3. Generate and send tips for top 2-3 fixtures
    const selected = fixtures.slice(0, Math.min(3, fixtures.length));
    let tipsSent = 0;

    for (const fixture of selected) {
      const polyCtx = polymarkets
        .filter(p => p.question.toLowerCase().includes(fixture.home.split(" ")[0].toLowerCase()) ||
                     p.question.toLowerCase().includes(fixture.away.split(" ")[0].toLowerCase()))
        .map(p => `${p.question}: ${Math.round(p.probability * 100)}%`)
        .join("; ");

      const tip = await generateTip(fixture, polyCtx);

      // Small delay between posts
      await new Promise(r => setTimeout(r, 1500));
      const sent = await sendTelegram(tip);
      if (sent) tipsSent++;
    }

    // 4. End-of-batch marker
    if (tipsSent > 0) {
      await new Promise(r => setTimeout(r, 1000));
      await sendTelegram(`✅ <b>${tipsSent} tip${tipsSent !== 1 ? "s" : ""} sent.</b>\n\nGood luck. Don't bet what you can't afford to lose.\n\n<i>This channel will always be free. Refer a friend if you find it useful.</i>`);
    }

    return { ok: true, fixturesFound: fixtures.length, tipsSent, briefingSent };
  } catch (err: any) {
    console.error("[sports-tips] Error:", err);
    return { ok: false, fixturesFound: 0, tipsSent: 0, briefingSent: false, error: String(err) };
  }
}

// ─── Test ping ────────────────────────────────────────────────────────────────

export async function pingTelegram(): Promise<boolean> {
  return sendTelegram(
    `👋 <b>Vessel26 Sports Tips</b> is online.\n\nFree daily tips. Deadpan analysis. No hype.\n\n<i>The process has begun.</i>`
  );
}
