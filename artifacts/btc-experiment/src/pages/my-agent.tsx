import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Bot, Clock, Copy, ExternalLink, CheckCircle, Zap, ArrowRight,
  Link as LinkIcon, Plug, Wifi, WifiOff, Users, Activity, RefreshCw,
  ChevronRight, Lock, RotateCcw, ToggleLeft, ToggleRight, UserCheck
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { formatDistanceToNow, isPast } from "date-fns";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Tool {
  id: string;
  name: string;
  icon: string;
  status: "connected" | "disconnected";
}

interface MyAgentData {
  user: {
    id: string; email: string; slug: string; displayName: string | null;
    roleLabel: string | null; walletAddress: string | null;
    walletStatus: string; referralCode: string; composioEntityId: string | null;
  };
  ownsAgent: boolean;
  ownedAgent: { id: string; slug: string; name: string } | null;
  slots: {
    id: string; agentId: string; agentName: string; agentSlug: string;
    slotType: string; status: string; expiresAt: string;
    activatedAt: string | null; clickCount: number; isActive: boolean;
  }[];
  activeSlotCount: number;
  availableAgents: { id: string; slug: string; name: string }[];
  composio: { entityId: string; isConnected: boolean; tools: Tool[] };
}

// ─── Hook ──────────────────────────────────────────────────────────────────────

function useMyAgent(enabled: boolean) {
  const { token } = useAuth();
  return useQuery<MyAgentData>({
    queryKey: ["my-agent"],
    enabled,
    queryFn: async () => {
      const resp = await fetch("/api/my-agent", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!resp.ok) throw new Error("Failed to load agent data");
      return resp.json();
    },
    staleTime: 30_000,
  });
}

interface ReferralEntry {
  entryId: string;
  memberId: string;
  memberSlug: string;
  displayName: string;
  bio: string | null;
  isActive: boolean;
  clickCount: number;
  createdAt: string;
  rotatorUrl: string;
}

function useReferralRotator(enabled: boolean) {
  const { token } = useAuth();
  return useQuery<{ referrals: ReferralEntry[] }>({
    queryKey: ["referral-rotator"],
    enabled,
    queryFn: async () => {
      const resp = await fetch("/api/referral-rotator/my", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!resp.ok) throw new Error("Failed to load referral rotator");
      return resp.json();
    },
    staleTime: 30_000,
  });
}

// ─── Composio tool card ────────────────────────────────────────────────────────

function ComposioTool({ tool, onConnect, isConnecting }: {
  tool: Tool;
  onConnect: (platform: string) => void;
  isConnecting: boolean;
}) {
  const isConnected = tool.status === "connected";
  return (
    <div className={`flex items-center justify-between p-3 rounded-xl border transition-colors ${
      isConnected
        ? "border-primary/30 bg-primary/5"
        : "border-border/40 bg-muted/10 hover:border-border"
    }`}>
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold border ${
          isConnected ? "bg-primary/10 border-primary/20 text-primary" : "bg-muted/30 border-border/30 text-muted-foreground"
        }`}>
          {tool.icon}
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">{tool.name}</p>
          <p className="text-xs text-muted-foreground">{isConnected ? "Active — posting enabled" : "Not connected"}</p>
        </div>
      </div>
      {isConnected ? (
        <div className="flex items-center gap-1.5 text-green-400 text-xs font-medium">
          <Wifi className="h-3.5 w-3.5" /> Connected
        </div>
      ) : (
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2.5 text-xs"
          disabled={isConnecting}
          onClick={() => onConnect(tool.id)}
        >
          <Plug className="h-3 w-3 mr-1" />
          {isConnecting ? "Opening…" : "Connect"}
        </Button>
      )}
    </div>
  );
}

// ─── Slot card ─────────────────────────────────────────────────────────────────

function SlotCard({ slot }: { slot: MyAgentData["slots"][0] }) {
  const expiry = new Date(slot.expiresAt);
  const expired = isPast(expiry);
  return (
    <div className={`p-4 rounded-xl border ${
      slot.isActive
        ? "border-primary/30 bg-primary/5"
        : expired
        ? "border-destructive/20 bg-destructive/5"
        : "border-border/40 bg-muted/10"
    }`}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <p className="font-medium text-sm">{slot.agentName}</p>
          <p className="text-xs text-muted-foreground font-mono">/{slot.agentSlug}</p>
        </div>
        <div className="flex gap-1.5">
          <Badge variant={slot.slotType === "free" ? "secondary" : "default"} className="text-xs">
            {slot.slotType}
          </Badge>
          <Badge
            variant="outline"
            className={`text-xs ${
              slot.isActive ? "text-green-400 border-green-500/30" : "text-muted-foreground"
            }`}
          >
            {slot.isActive ? "active" : slot.status}
          </Badge>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <p className="text-muted-foreground">Clicks</p>
          <p className="font-bold text-base text-foreground">{slot.clickCount}</p>
        </div>
        <div>
          <p className="text-muted-foreground">{expired ? "Expired" : "Expires"}</p>
          <p className={`font-medium ${expired ? "text-destructive" : "text-foreground"}`}>
            {formatDistanceToNow(expiry, { addSuffix: true })}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Referral Rotator Card ─────────────────────────────────────────────────────

function ReferralRotatorCard({ userSlug }: { userSlug: string }) {
  const { token } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading } = useReferralRotator(true);
  const [toggling, setToggling] = useState<string | null>(null);

  async function handleToggle(memberId: string) {
    setToggling(memberId);
    try {
      const resp = await fetch(`/api/referral-rotator/${memberId}/toggle`, {
        method: "PUT",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!resp.ok) throw new Error("Toggle failed");
      await queryClient.invalidateQueries({ queryKey: ["referral-rotator"] });
    } catch {
      toast({ title: "Error", description: "Could not update rotator.", variant: "destructive" });
    } finally {
      setToggling(null);
    }
  }

  function copyRotatorLink() {
    navigator.clipboard.writeText(`${window.location.origin}/r/${userSlug}`);
    toast({ title: "Copied!", description: "Your personal rotator link is on the clipboard." });
  }

  const referrals = data?.referrals ?? [];
  const activeCount = referrals.filter(r => r.isActive).length;

  return (
    <Card className="glass-panel border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <RotateCcw className="h-4 w-4 text-primary" /> Personal Rotator
          </CardTitle>
          <div className="flex items-center gap-2">
            {!isLoading && (
              <Badge variant="outline" className="text-xs">
                {activeCount} of {referrals.length} active
              </Badge>
            )}
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={copyRotatorLink}>
              <Copy className="h-3 w-3" /> Copy Link
            </Button>
            <a href={`/r/${userSlug}`} target="_blank" rel="noopener noreferrer">
              <Button size="sm" variant="ghost" className="h-7 px-2">
                <ExternalLink className="h-3.5 w-3.5" />
              </Button>
            </a>
          </div>
        </div>
        <CardDescription>
          When someone visits your rotator link, they see your direct referrals. Toggle each one on or off.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2].map(i => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
          </div>
        ) : referrals.length === 0 ? (
          <div className="text-center py-8">
            <Users className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground mb-1">No referrals yet</p>
            <p className="text-xs text-muted-foreground">
              Share your referral link above. Each person who joins using your code appears here automatically.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {referrals.map(r => (
              <div
                key={r.memberId}
                className={`flex items-center justify-between p-3 rounded-xl border transition-colors ${
                  r.isActive
                    ? "border-primary/20 bg-primary/5"
                    : "border-border/30 bg-muted/10 opacity-60"
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-muted/40 border border-border/40 flex items-center justify-center flex-shrink-0">
                    <UserCheck className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{r.displayName}</p>
                    <p className="text-xs text-muted-foreground">
                      <span className="font-mono">/{r.memberSlug}</span>
                      {r.clickCount > 0 && (
                        <span className="ml-2 text-primary">{r.clickCount} clicks</span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <a
                    href={r.rotatorUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                  <Switch
                    checked={r.isActive}
                    disabled={toggling === r.memberId}
                    onCheckedChange={() => handleToggle(r.memberId)}
                    className="data-[state=checked]:bg-primary"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function MyAgentPage() {
  const { isAuthenticated, isLoading: isAuthLoading, login, token } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [connectingPlatform, setConnectingPlatform] = useState<string | null>(null);

  const { data, isLoading, refetch } = useMyAgent(isAuthenticated);

  function copyReferral() {
    if (!data) return;
    const url = `${window.location.origin}/r/${data.user.referralCode}`;
    navigator.clipboard.writeText(url);
    toast({ title: "Copied!", description: "Your referral link is on the clipboard." });
  }

  async function handleComposioConnect(platform: string) {
    if (!token) return;
    setConnectingPlatform(platform);
    try {
      const resp = await fetch("/api/my-agent/composio/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ platform }),
      });
      const result = await resp.json();
      if (!resp.ok) {
        toast({ title: "Connection failed", description: result.error ?? "Unknown error", variant: "destructive" });
        return;
      }
      if (result.oauthUrl) {
        window.open(result.oauthUrl, "_blank", "noopener,noreferrer");
        toast({ title: "Authorize in the new tab", description: `Complete the ${platform === "twitter" ? "Twitter / X" : "LinkedIn"} authorization in the popup. Refresh this page once done.` });
      }
    } catch {
      toast({ title: "Connection failed", description: "Network error — try again.", variant: "destructive" });
    } finally {
      setConnectingPlatform(null);
    }
  }

  if (isAuthLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="space-y-4 w-full max-w-md px-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 text-center">
        <Bot className="h-16 w-16 text-primary/40 mb-6" />
        <h1 className="text-3xl font-bold mb-3">Your Agent Dashboard</h1>
        <p className="text-muted-foreground mb-6 max-w-sm">
          Sign in to view your active slots, referral link, and connected tools.
        </p>
        <Button size="lg" onClick={login}>
          Sign In to My Agent <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-10 px-4">
      <div className="max-w-4xl mx-auto space-y-8">

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">My Agent</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              {data?.user.email} · {data?.user.roleLabel ?? "Member"}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
        </motion.div>

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-40 w-full rounded-2xl" />)}
          </div>
        ) : !data ? (
          <p className="text-muted-foreground text-center py-12">Could not load agent data.</p>
        ) : (
          <>
            {/* Stats row */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="grid grid-cols-2 md:grid-cols-4 gap-4"
            >
              {[
                { label: "Active Slots", value: data.activeSlotCount, icon: Activity, color: "text-primary" },
                { label: "Total Slots", value: data.slots.length, icon: Clock, color: "text-foreground" },
                { label: "Total Clicks", value: data.slots.reduce((s, sl) => s + sl.clickCount, 0), icon: Zap, color: "text-amber-400" },
                { label: "Wallet Status", value: data.user.walletStatus, icon: Bot, color: "text-foreground" },
              ].map(stat => (
                <Card key={stat.label} className="glass-panel border-border/50">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <stat.icon className={`h-4 w-4 ${stat.color}`} />
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">{stat.label}</p>
                    </div>
                    <p className={`text-2xl font-bold capitalize ${stat.color}`}>{stat.value}</p>
                  </CardContent>
                </Card>
              ))}
            </motion.div>

            {/* Referral link */}
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
              <Card className="glass-panel border-primary/20">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <LinkIcon className="h-4 w-4 text-primary" /> Your Referral Link
                  </CardTitle>
                  <CardDescription>Share this link. Every signup that uses it is credited to you.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/20 border border-border/40 font-mono text-sm">
                    <span className="flex-1 truncate text-muted-foreground">
                      {window.location.origin}/r/{data.user.referralCode}
                    </span>
                    <Button size="sm" variant="ghost" className="h-7 px-2" onClick={copyReferral}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <a
                      href={`/r/${data.user.referralCode}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Button size="sm" variant="ghost" className="h-7 px-2">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    </a>
                  </div>
                  {data.user.walletAddress && (
                    <p className="text-xs text-muted-foreground font-mono">
                      Wallet: {data.user.walletAddress.slice(0, 12)}…{data.user.walletAddress.slice(-6)}
                    </p>
                  )}
                </CardContent>
              </Card>
            </motion.div>

            {/* Referral Rotator */}
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
              <ReferralRotatorCard userSlug={data.user.slug} />
            </motion.div>

            {/* Active slots */}
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
              <Card className="glass-panel border-border/50">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Activity className="h-4 w-4 text-primary" /> Rotator Slots
                    </CardTitle>
                    <Link href="/agents">
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1">
                        Browse Agents <ChevronRight className="h-3 w-3" />
                      </Button>
                    </Link>
                  </div>
                  <CardDescription>Your current and past slots across all agents.</CardDescription>
                </CardHeader>
                <CardContent>
                  {data.slots.length === 0 ? (
                    <div className="text-center py-8">
                      <Clock className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
                      <p className="text-sm text-muted-foreground mb-3">No slots yet. Get started free.</p>
                      <Link href="/agents">
                        <Button size="sm">
                          <Zap className="h-4 w-4 mr-2" /> Browse Agents
                        </Button>
                      </Link>
                    </div>
                  ) : (
                    <div className="grid md:grid-cols-2 gap-3">
                      {data.slots.map(slot => <SlotCard key={slot.id} slot={slot} />)}
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>

            {/* Composio Integration Panel — only for agent owners */}
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
              <Card className="glass-panel border-border/50">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Plug className="h-4 w-4 text-primary" /> Social Connections
                      <Badge variant="outline" className="text-[10px] ml-1">via Composio</Badge>
                    </CardTitle>
                    {data.ownsAgent ? (
                      data.composio.isConnected ? (
                        <div className="flex items-center gap-1 text-xs text-green-400">
                          <Wifi className="h-3.5 w-3.5" /> Live
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <WifiOff className="h-3.5 w-3.5" /> Not connected
                        </div>
                      )
                    ) : (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Lock className="h-3.5 w-3.5" /> Agent owners only
                      </div>
                    )}
                  </div>
                  <CardDescription>
                    Connect your own Twitter / X and LinkedIn accounts. The agent posts on your behalf using your personal credentials — not a shared account.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {!data.ownsAgent ? (
                    /* Locked state for non-owners */
                    <div className="p-4 rounded-xl bg-muted/20 border border-border/40 flex items-start gap-3">
                      <Lock className="h-5 w-5 text-muted-foreground/50 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-foreground mb-1">Requires an Agent</p>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          Social connections are only available to users who manage their own agent on the platform.
                          Agent managers configure their Twitter / X and LinkedIn here so the AI can post on their behalf.
                        </p>
                        {data.ownedAgent === null && (
                          <p className="text-xs text-muted-foreground mt-2">
                            You don't own an agent yet. Contact the admin to be assigned as an agent owner.
                          </p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Owned agent badge */}
                      <div className="p-2.5 rounded-xl bg-primary/5 border border-primary/20 flex items-center gap-2 text-xs">
                        <UserCheck className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                        <span className="text-muted-foreground">Managing agent:</span>
                        <span className="font-semibold text-foreground">{data.ownedAgent?.name}</span>
                      </div>

                      {/* Tool list */}
                      <div className="grid md:grid-cols-2 gap-2">
                        {data.composio.tools.map(tool => (
                          <ComposioTool
                            key={tool.id}
                            tool={tool}
                            onConnect={handleComposioConnect}
                            isConnecting={connectingPlatform === tool.id}
                          />
                        ))}
                      </div>

                      {/* Info footer */}
                      <div className="pt-3 border-t border-border/30">
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          <strong className="text-foreground">Your accounts, your posts.</strong> Connecting authorizes
                          the platform to post on your behalf only when the agent engine runs a campaign you're part of.
                          You can revoke access at any time from Twitter / LinkedIn settings.
                        </p>
                        <a
                          href="https://composio.dev"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-2"
                        >
                          About Composio <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          </>
        )}
      </div>
    </div>
  );
}
