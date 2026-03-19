/**
 * AgentMail integration — per-agent email inboxes on agentmail.to
 *
 * Each agent gets an inbox like ralph@agentmail.to
 * Supports: create inbox, list messages, send message, delete inbox
 */

import { AgentMailClient } from "agentmail";

const AGENTMAIL_API_KEY = process.env.AGENTMAIL_API_KEY;
const DOMAIN = "agentmail.to";

export function isAgentMailConfigured(): boolean {
  return !!AGENTMAIL_API_KEY;
}

function getClient(): AgentMailClient {
  if (!AGENTMAIL_API_KEY) throw new Error("AGENTMAIL_API_KEY not configured");
  return new AgentMailClient({ apiKey: AGENTMAIL_API_KEY });
}

// ─── Inbox management ────────────────────────────────────────────────────────

export interface AgentInbox {
  inboxId: string;
  address: string;   // e.g. ralph@agentmail.to
  username: string;
  domain: string;
  createdAt?: string;
}

/**
 * Create an inbox for an agent. Username is derived from the agent slug.
 * Idempotent — if inbox already exists on agentmail.to it will be returned.
 */
export async function createAgentInbox(agentSlug: string): Promise<AgentInbox> {
  const client = getClient();
  const username = agentSlug.toLowerCase().replace(/[^a-z0-9-]/g, "-");

  const inbox = await client.inboxes.create({ username, domain: DOMAIN });

  const finalUsername = inbox.username || username;
  const finalDomain = inbox.domain || DOMAIN;

  return {
    inboxId: inbox.inboxId,
    address: `${finalUsername}@${finalDomain}`,
    username: finalUsername,
    domain: finalDomain,
    createdAt: (inbox as any).createdAt,
  };
}

export async function getAgentInbox(inboxId: string): Promise<AgentInbox | null> {
  if (!isAgentMailConfigured()) return null;
  try {
    const client = getClient();
    const inbox = await client.inboxes.get(inboxId);
    
    // Ensure username and domain are valid
    if (!inbox.username || !inbox.domain) return null;
    
    return {
      inboxId: inbox.inboxId,
      address: `${inbox.username}@${inbox.domain}`,
      username: inbox.username,
      domain: inbox.domain,
      createdAt: (inbox as any).createdAt,
    };
  } catch {
    return null;
  }
}

// ─── Messages ────────────────────────────────────────────────────────────────

export interface AgentMessage {
  messageId: string;
  from: string;
  to: string[];
  subject: string;
  body?: string;
  receivedAt?: string;
}

export async function listInboxMessages(inboxId: string, limit = 20): Promise<AgentMessage[]> {
  if (!isAgentMailConfigured()) return [];
  try {
    const client = getClient();
    const result = await client.inboxes.messages.list(inboxId, { limit });
    const messages = (result as any).messages ?? (result as any).items ?? [];
    return messages.map((m: any) => ({
      messageId: m.messageId ?? m.id,
      from: m.from ?? "",
      to: Array.isArray(m.to) ? m.to : [m.to ?? ""],
      subject: m.subject ?? "(no subject)",
      body: m.text ?? m.body ?? "",
      receivedAt: m.receivedAt ?? m.createdAt,
    }));
  } catch (err: any) {
    console.warn("[agentmail] listInboxMessages error:", err?.message);
    return [];
  }
}

export async function sendFromInbox(
  inboxId: string,
  to: string,
  subject: string,
  text: string,
): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  if (!isAgentMailConfigured()) return { ok: false, error: "AgentMail not configured" };
  try {
    const client = getClient();
    const result = await client.inboxes.messages.send(inboxId, { to: [to], subject, text });
    const msgId = (result as any).messageId ?? (result as any).id;
    return { ok: true, messageId: msgId };
  } catch (err: any) {
    console.warn("[agentmail] sendFromInbox error:", err?.message);
    return { ok: false, error: err?.message ?? "Unknown error" };
  }
}
