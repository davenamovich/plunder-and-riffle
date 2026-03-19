/**
 * Composio integration — social media posting and tool execution.
 * Uses COMPOSIO_API_KEY to trigger actions on connected accounts.
 *
 * Composio entity = one user's set of connected tools.
 * Agents have a composioEntityId stored in the DB.
 */

const COMPOSIO_API_KEY = process.env.COMPOSIO_API_KEY;
const COMPOSIO_BASE = "https://backend.composio.dev/api/v1";

function headers() {
  return {
    "X-API-Key": COMPOSIO_API_KEY ?? "",
    "Content-Type": "application/json",
  };
}

export function isComposioConfigured(): boolean {
  return !!COMPOSIO_API_KEY;
}

// ─── Entity / connection management ──────────────────────────────────────────

export interface ComposioApp {
  appName: string;
  entityId: string;
  status: "active" | "inactive" | "error";
  connectedAt?: string;
}

export async function getEntityConnections(entityId: string): Promise<ComposioApp[]> {
  if (!COMPOSIO_API_KEY) return [];
  try {
    const res = await fetch(`${COMPOSIO_BASE}/connectedAccounts?entityId=${encodeURIComponent(entityId)}`, {
      headers: headers(),
    });
    if (!res.ok) { console.warn("[composio] connections fetch failed:", res.status); return []; }
    const data = await res.json();
    return (data.items ?? []).map((item: any) => ({
      appName: item.appName ?? item.appUniqueId,
      entityId: item.entityId,
      status: item.status === "ACTIVE" ? "active" : item.status === "INACTIVE" ? "inactive" : "error",
      connectedAt: item.createdAt,
    }));
  } catch (err) {
    console.warn("[composio] getEntityConnections error:", (err as Error).message);
    return [];
  }
}

export async function initiateConnection(entityId: string, appName: string, redirectUrl?: string): Promise<{
  connectionUrl?: string; status: string; connectionId?: string;
}> {
  if (!COMPOSIO_API_KEY) return { status: "not_configured" };
  try {
    const res = await fetch(`${COMPOSIO_BASE}/connectedAccounts`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        entityId,
        appName,
        redirectUri: redirectUrl,
      }),
    });
    const data = await res.json();
    return {
      connectionUrl: data.redirectUrl ?? data.connectionUrl,
      connectionId: data.connectionId ?? data.id,
      status: data.status ?? (res.ok ? "initiated" : "failed"),
    };
  } catch (err) {
    console.warn("[composio] initiateConnection error:", (err as Error).message);
    return { status: "error" };
  }
}

// ─── Action execution ─────────────────────────────────────────────────────────

export interface ComposioActionResult {
  ok: boolean;
  data?: any;
  error?: string;
  actionId?: string;
}

export async function executeAction(
  entityId: string,
  actionName: string,
  params: Record<string, any>,
): Promise<ComposioActionResult> {
  if (!COMPOSIO_API_KEY) return { ok: false, error: "Composio not configured" };
  try {
    const res = await fetch(`${COMPOSIO_BASE}/actions/${encodeURIComponent(actionName)}/execute`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ entityId, input: params }),
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data?.message ?? `HTTP ${res.status}` };
    return { ok: true, data };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? "Unknown error" };
  }
}

// ─── Social posting helpers ───────────────────────────────────────────────────

export async function postToTwitter(entityId: string, text: string): Promise<ComposioActionResult> {
  return executeAction(entityId, "TWITTER_CREATION_OF_A_POST", { text });
}

export async function postToLinkedIn(entityId: string, text: string): Promise<ComposioActionResult> {
  return executeAction(entityId, "LINKEDIN_CREATE_LINKED_IN_POST", {
    text,
    visibility: "PUBLIC",
  });
}

export async function postToTelegram(entityId: string, text: string, chatId?: string): Promise<ComposioActionResult> {
  return executeAction(entityId, "TELEGRAM_SEND_MESSAGE", {
    text,
    chat_id: chatId,
  });
}

export async function sendGmail(
  entityId: string,
  to: string,
  subject: string,
  body: string,
): Promise<ComposioActionResult> {
  return executeAction(entityId, "GMAIL_SEND_EMAIL", {
    recipient_email: to,
    subject,
    body,
  });
}

// ─── Platform routing ─────────────────────────────────────────────────────────

export type SocialPlatform = "twitter" | "linkedin" | "telegram" | "gmail";

export async function postToSocial(
  entityId: string,
  platform: SocialPlatform,
  content: string,
  extra?: Record<string, any>,
): Promise<ComposioActionResult> {
  switch (platform) {
    case "twitter":    return postToTwitter(entityId, content);
    case "linkedin":   return postToLinkedIn(entityId, content);
    case "telegram":   return postToTelegram(entityId, content, extra?.chatId);
    case "gmail":      return sendGmail(entityId, extra?.to ?? "", extra?.subject ?? "Update", content);
    default:           return { ok: false, error: `Unknown platform: ${platform}` };
  }
}

// ─── App catalog (for UI) ─────────────────────────────────────────────────────

export const COMPOSIO_APPS = [
  { name: "Twitter / X",  id: "twitter",    icon: "𝕏",  action: "TWITTER_CREATION_OF_A_POST" },
  { name: "LinkedIn",     id: "linkedin",   icon: "in", action: "LINKEDIN_CREATE_LINKED_IN_POST" },
  { name: "Telegram",     id: "telegram",   icon: "✈️",  action: "TELEGRAM_SEND_MESSAGE" },
  { name: "Gmail",        id: "gmail",      icon: "📧",  action: "GMAIL_SEND_EMAIL" },
  { name: "Slack",        id: "slack",      icon: "#",  action: "SLACK_SENDS_A_MESSAGE_TO_A_SLACK_CHANNEL" },
  { name: "Notion",       id: "notion",     icon: "N",  action: "NOTION_CREATE_PAGE" },
  { name: "Reddit",       id: "reddit",     icon: "📢",  action: "REDDIT_SUBMIT_A_POST" },
  { name: "Discord",      id: "discord",    icon: "🎮",  action: "DISCORD_SEND_MESSAGE_TO_CHANNEL" },
] as const;
