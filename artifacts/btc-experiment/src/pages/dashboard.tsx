import React, { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  useGetDashboardStats,
  useGetMyRotatorSlots,
  useGetMyOffers,
  useListOffers,
  useSignupForOffer,
} from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import {
  Activity, Clock, Plus, Copy, Link as LinkIcon,
  RefreshCw, CheckCircle2, ArrowRight, Users, Coins,
  ExternalLink, DollarSign, Wallet, ArrowUpRight,
  AlertCircle, CheckCircle, Bot, Zap, UserCheck,
  RotateCcw, ChevronRight, Plug, Wifi, WifiOff, Lock,
  Gem, Gift, Star, Loader2,
} from "lucide-react";
import { formatDistanceToNow, isPast } from "date-fns";
import { motion } from "framer-motion";

const APP_URL = (import.meta.env.VITE_APP_URL as string | undefined)?.replace(/\/$/, "") || window.location.origin;

// ─── Types ────────────────────────────────────────────────────────────────────

interface Tool { id: string; name: string; icon: string; status: "connected" | "disconnected"; }
interface AssistantAgent { id: string; slug: string; name: string; assistantRecordId: string; }
interface MyAgentData {
  user: { id: string; email: string; slug: string; displayName: string | null; roleLabel: string | null; walletAddress: string | null; walletStatus: string; referralCode: string; composioEntityId: string | null; };
  ownsAgent: boolean; ownedAgent: { id: string; slug: string; name: string } | null;
  isAssistant: boolean; assistantAgents: AssistantAgent[];
  hasAgentAccess: boolean; primaryAgent: { id: string; slug: string; name: string } | null;
  slots: { id: string; agentId: string; agentName: string; agentSlug: string; slotType: string; status: string; expiresAt: string; activatedAt: string | null; clickCount: number; isActive: boolean; }[];
  activeSlotCount: number; availableAgents: { id: string; slug: string; name: string }[];
  composio: { entityId: string; isConnected: boolean; tools: Tool[] };
}
interface ReferralEntry { entryId: string; memberId: string; memberSlug: string; displayName: string; bio: string | null; isActive: boolean; clickCount: number; createdAt: string; rotatorUrl: string; }

// ─── Sub-components ───────────────────────────────────────────────────────────

function ComposioTool({ tool, onConnect, isConnecting }: { tool: Tool; onConnect: (p: string) => void; isConnecting: boolean; }) {
  const connected = tool.status === "connected";
  return (
    <div className={`flex items-center justify-between p-3 rounded-xl border transition-colors ${connected ? "border-primary/30 bg-primary/5" : "border-border/40 bg-muted/10 hover:border-border"}`}>
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold border ${connected ? "bg-primary/10 border-primary/20 text-primary" : "bg-muted/30 border-border/30 text-muted-foreground"}`}>{tool.icon}</div>
        <div>
          <p className="text-sm font-medium">{tool.name}</p>
          <p className="text-xs text-muted-foreground">{connected ? "Active — posting enabled" : "Not connected"}</p>
        </div>
      </div>
      {connected ? (
        <div className="flex items-center gap-1.5 text-green-400 text-xs font-medium"><Wifi className="h-3.5 w-3.5" /> Connected</div>
      ) : (
        <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs" disabled={isConnecting} onClick={() => onConnect(tool.id)}>
          <Plug className="h-3 w-3 mr-1" />{isConnecting ? "Opening…" : "Connect"}
        </Button>
      )}
    </div>
  );
}

function ReferralRotatorCard({ userSlug, token }: { userSlug: string; token: string | null }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<{ referrals: ReferralEntry[] }>({
    queryKey: ["referral-rotator"],
    queryFn: () => fetch("/api/referral-rotator/my", { headers: token ? { Authorization: `Bearer ${token}` } : {} }).then(r => r.json()),
    staleTime: 30_000,
  });
  const [toggling, setToggling] = useState<string | null>(null);

  async function handleToggle(memberId: string) {
    setToggling(memberId);
    try {
      await fetch(`/api/referral-rotator/${memberId}/toggle`, { method: "PUT", headers: token ? { Authorization: `Bearer ${token}` } : {} });
      await qc.invalidateQueries({ queryKey: ["referral-rotator"] });
    } catch { toast({ title: "Error", description: "Could not update rotator.", variant: "destructive" }); }
    finally { setToggling(null); }
  }

  const referrals = data?.referrals ?? [];
  const activeCount = referrals.filter(r => r.isActive).length;
  return (
    <Card className="glass-panel border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base"><RotateCcw className="h-4 w-4 text-primary" /> Personal Rotator</CardTitle>
          <div className="flex items-center gap-2">
            {!isLoading && <Badge variant="outline" className="text-xs">{activeCount} of {referrals.length} active</Badge>}
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => { navigator.clipboard.writeText(`${APP_URL}/r/${userSlug}`); toast({ title: "Copied!" }); }}>
              <Copy className="h-3 w-3" /> Copy Link
            </Button>
            <a href={`/r/${userSlug}`} target="_blank" rel="noopener noreferrer">
              <Button size="sm" variant="ghost" className="h-7 px-2"><ExternalLink className="h-3.5 w-3.5" /></Button>
            </a>
          </div>
        </div>
        <CardDescription>When someone visits your rotator link, they see your direct referrals. Toggle each on or off.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? <div className="space-y-2">{[1,2].map(i=><Skeleton key={i} className="h-14 w-full rounded-xl"/>)}</div>
        : referrals.length === 0 ? (
          <div className="text-center py-8">
            <Users className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground mb-1">No referrals yet</p>
            <p className="text-xs text-muted-foreground">Share your referral link. Each person who joins using your code appears here automatically.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {referrals.map(r => (
              <div key={r.memberId} className={`flex items-center justify-between p-3 rounded-xl border transition-colors ${r.isActive ? "border-primary/20 bg-primary/5" : "border-border/30 bg-muted/10 opacity-60"}`}>
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-muted/40 border border-border/40 flex items-center justify-center flex-shrink-0">
                    <UserCheck className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{r.displayName}</p>
                    <p className="text-xs text-muted-foreground"><span className="font-mono">/{r.memberSlug}</span>{r.clickCount > 0 && <span className="ml-2 text-primary">{r.clickCount} clicks</span>}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <a href={r.rotatorUrl} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground"><ExternalLink className="h-3.5 w-3.5" /></a>
                  <Switch checked={r.isActive} disabled={toggling === r.memberId} onCheckedChange={() => handleToggle(r.memberId)} className="data-[state=checked]:bg-primary" />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { user, token, isLoading: isAuthLoading, isAuthenticated, login } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, navigate] = useLocation();

  const enabled = isAuthenticated;
  const authHeaders = React.useMemo(() => token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" }, [token]);

  // ── Existing queries ──────────────────────────────────────────────────────
  const { data: stats, isLoading: isStatsLoading } = useGetDashboardStats({ query: { enabled } });
  const { data: slotsRes, refetch: refetchSlots, isLoading: isSlotsLoading } = useGetMyRotatorSlots({ query: { enabled } });
  const { data: myOffersRes, refetch: refetchMyOffers } = useGetMyOffers({ query: { enabled } });
  const { data: offersListRes } = useListOffers({ query: { enabled } });

  // ── Wallet ────────────────────────────────────────────────────────────────
  const { data: walletData, isLoading: walletLoading, refetch: refetchWallet } = useQuery<{
    ok: boolean; walletAddress: string | null; walletStatus: string;
    earnings: { pending: number; approved: number; paid: number; withdrawable: number };
    splits: any[];
  }>({
    queryKey: ["dashboard-wallet"],
    queryFn: () => fetch("/api/dashboard/wallet", { headers: authHeaders }).then(r => r.json()),
    enabled, staleTime: 30_000,
  });
  const [walletAddressInput, setWalletAddressInput] = React.useState("");
  const [savingAddress, setSavingAddress] = React.useState(false);
  const [withdrawing, setWithdrawing] = React.useState(false);
  React.useEffect(() => { if (walletData?.walletAddress && !walletAddressInput) setWalletAddressInput(walletData.walletAddress); }, [walletData?.walletAddress]);

  // ── My Agent data ─────────────────────────────────────────────────────────
  const { data: agentData, isLoading: agentLoading, refetch: refetchAgent } = useQuery<MyAgentData>({
    queryKey: ["my-agent"],
    enabled,
    queryFn: () => fetch("/api/my-agent", { headers: token ? { Authorization: `Bearer ${token}` } : {} }).then(r => { if (!r.ok) throw new Error("Failed"); return r.json(); }),
    staleTime: 30_000,
  });

  // ── NFT progress ──────────────────────────────────────────────────────────
  const { data: nftData, refetch: refetchNft } = useQuery<{
    referralCount: number; viralPostCount: number; referralThreshold: number; viralThreshold: number;
    nftEarned: boolean; nftEarnedAt: string | null; nftClaimTxHash: string | null; walletAddress: string | null;
  }>({
    queryKey: ["nft-progress"],
    queryFn: () => fetch("/api/my-agent/nft-progress", { headers: token ? { Authorization: `Bearer ${token}` } : {} }).then(r => r.json()),
    enabled: enabled && !!token, staleTime: 30_000,
  });
  const claimNft = useMutation({
    mutationFn: () => fetch("/api/my-agent/claim-nft", { method: "POST", headers: token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" } }).then(r => r.json()),
    onSuccess: (res: any) => {
      if (res.error) { toast({ title: "Claim failed", description: res.error, variant: "destructive" }); return; }
      toast({ title: "NFT Claimed!", description: `Transaction: ${res.txHash?.slice(0,18)}…` });
      refetchNft();
    },
  });

  // ── Social / Composio ─────────────────────────────────────────────────────
  const [connectingPlatform, setConnectingPlatform] = useState<string | null>(null);
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("composio_connected") === "1") {
      toast({ title: "Account connected", description: "Your social account is now linked." });
      window.history.replaceState({}, "", window.location.pathname);
      refetchAgent();
    }
  }, []);

  async function handleComposioConnect(platform: string) {
    if (!isAuthenticated || !token) { login(); return; }
    setConnectingPlatform(platform);
    try {
      const resp = await fetch("/api/my-agent/composio/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ platform }),
      });
      const result = await resp.json();
      if (!resp.ok) { toast({ title: "Connection failed", description: result.error ?? "Unknown error", variant: "destructive" }); return; }
      if (result.oauthUrl) window.location.href = result.oauthUrl;
    } catch { toast({ title: "Connection failed", description: "Network error — try again.", variant: "destructive" }); }
    finally { setConnectingPlatform(null); }
  }

  // ── Offers ────────────────────────────────────────────────────────────────
  const { mutate: signupOffer, isPending: isSigningUp } = useSignupForOffer({
    mutation: {
      onSuccess: () => { toast({ title: "Success!", description: "Signed up and rotator slot activated." }); refetchSlots(); refetchMyOffers(); },
      onError: (e: any) => toast({ title: "Error", description: e?.error || "Failed to sign up", variant: "destructive" }),
    },
  });

  const handleCopy = (text: string) => { navigator.clipboard.writeText(text); toast({ title: "Copied to clipboard" }); };
  const myOfferIds = myOffersRes?.offers.map(o => o.offerId) || [];
  const availableOffers = offersListRes?.offers.filter(o => !myOfferIds.includes(o.id) && o.isActive) || [];

  // ── Loading / auth gates ──────────────────────────────────────────────────
  if (isAuthLoading) {
    return (
      <div className="container mx-auto px-4 py-20 max-w-6xl">
        <Skeleton className="h-10 w-48 mb-2" />
        <Skeleton className="h-5 w-64 mb-10" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">{[...Array(4)].map((_,i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }
  if (!isAuthenticated) {
    return (
      <div className="container mx-auto px-4 py-32 max-w-lg text-center">
        <div className="glass-panel rounded-2xl p-10 border border-primary/20">
          <div className="w-16 h-16 rounded-full bg-primary/15 flex items-center justify-center mx-auto mb-6">
            <Activity className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold mb-3">Sign in to access your dashboard</h1>
          <p className="text-muted-foreground mb-8">Track your rotator slots, referrals, and offers all in one place.</p>
          <Button size="lg" className="w-full h-12" onClick={login}>Sign In / Join <ArrowRight className="ml-2 h-4 w-4" /></Button>
          <p className="text-xs text-muted-foreground mt-4">No password required — just your email.</p>
        </div>
      </div>
    );
  }

  const activeSlotCount = slotsRes?.slots.filter(s => s.status === "active").length || 0;
  const userSlug = agentData?.user.slug ?? "";

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold font-display tracking-tight mb-1">Dashboard</h1>
          <p className="text-muted-foreground">Welcome back, <span className="text-foreground font-medium">{user?.displayName || user?.email}</span></p>
        </div>
        {userSlug && (
          <div className="bg-primary/10 border border-primary/20 rounded-xl p-3 flex items-center gap-3 max-w-sm">
            <LinkIcon className="w-4 h-4 text-primary shrink-0" />
            <div className="min-w-0 flex-1">
              <span className="text-muted-foreground block text-xs mb-0.5">Your Referral Link</span>
              <span className="font-mono text-xs text-primary truncate block">{APP_URL}/r/{userSlug}</span>
            </div>
            <Button size="icon" variant="ghost" className="shrink-0 h-8 w-8" onClick={() => handleCopy(`${APP_URL}/r/${userSlug}`)}>
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </motion.div>

      {/* Stat Cards */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Active Slots", value: isStatsLoading ? "…" : (stats?.activeSlots ?? 0), icon: Activity, color: "text-primary" },
          { label: "Total Clicks", value: isStatsLoading ? "…" : (stats?.totalClicks ?? 0), icon: ExternalLink, color: "text-foreground" },
          { label: "Referrals", value: isStatsLoading ? "…" : (stats?.totalReferrals ?? 0), icon: Users, color: "text-primary" },
          { label: "Rotator Views", value: isStatsLoading ? "…" : (stats?.personalRotatorViews ?? 0), icon: Coins, color: "text-foreground" },
        ].map(stat => (
          <Card key={stat.label} className="glass-panel border-border/40">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{stat.label}</p>
                <stat.icon className={`w-4 h-4 ${stat.color} opacity-60`} />
              </div>
              <p className={`text-3xl font-bold font-display ${stat.color}`}>{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </motion.div>

      {/* Tabs */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
        <Tabs defaultValue="slots">
          <TabsList className="grid w-full grid-cols-4 h-11 mb-6">
            <TabsTrigger value="slots">Rotator Slots</TabsTrigger>
            <TabsTrigger value="offers">Offers</TabsTrigger>
            <TabsTrigger value="agent" className="flex items-center gap-1.5">
              <Bot className="w-3.5 h-3.5" /> My Agent
            </TabsTrigger>
            <TabsTrigger value="wallet" className="flex items-center gap-1.5">
              <Wallet className="w-3.5 h-3.5" /> Wallet
            </TabsTrigger>
          </TabsList>

          {/* ── Slots Tab ─────────────────────────────────────────────────── */}
          <TabsContent value="slots" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Activity className="w-5 h-5 text-primary" /> Agent Rotator Slots</CardTitle>
                <CardDescription>
                  Active slots receive traffic directly from the agent.
                  {activeSlotCount > 0 && <span className="text-primary font-medium ml-1">{activeSlotCount} active now.</span>}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isSlotsLoading ? (
                  <div className="space-y-3">{[...Array(2)].map((_,i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
                ) : slotsRes?.slots && slotsRes.slots.length > 0 ? (
                  <div className="space-y-3">
                    {slotsRes.slots.map(slot => {
                      const expired = isPast(new Date(slot.expiresAt)) || slot.status === "expired";
                      return (
                        <div key={slot.id} className={`flex items-center justify-between p-4 rounded-xl border transition-all ${expired ? "bg-muted/20 border-border/40 opacity-60" : "bg-primary/5 border-primary/30 shadow-[0_0_12px_rgba(247,147,26,0.06)]"}`}>
                          <div className="flex items-center gap-4">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${expired ? "bg-muted text-muted-foreground" : "bg-primary/20 text-primary"}`}>
                              {expired ? <Clock className="w-4 h-4" /> : <Activity className="w-4 h-4" />}
                            </div>
                            <div>
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className="font-semibold capitalize text-sm">{slot.slotType} Slot</span>
                                <Badge variant={expired ? "secondary" : "default"} className="text-xs">{expired ? "Expired" : "Active"}</Badge>
                              </div>
                              <p className="text-xs text-muted-foreground">{expired ? "Expired " : "Expires "}{formatDistanceToNow(new Date(slot.expiresAt), { addSuffix: true })}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-muted-foreground">Clicks</p>
                            <p className="font-bold font-display text-xl text-primary">{slot.clickCount || 0}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-14 bg-muted/10 rounded-xl border border-dashed border-border">
                    <Activity className="w-10 h-10 text-muted-foreground mx-auto mb-4 opacity-40" />
                    <p className="text-muted-foreground text-sm mb-4">No rotator slots yet.</p>
                    <p className="text-xs text-muted-foreground mb-4">Join a qualifying offer to unlock your free 24-hour slot.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Offers Tab ────────────────────────────────────────────────── */}
          <TabsContent value="offers" className="space-y-4">
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 flex gap-3 items-start">
              <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <DollarSign className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-sm mb-0.5">Your affiliate link — your commission</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Sign up to an offer and save your personal affiliate link. When the agent drives traffic through your slot, leads land on <strong className="text-foreground">your link</strong> — any conversions earn <strong className="text-foreground">you</strong> the commission.
                </p>
              </div>
            </div>
            <div className="grid md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><CheckCircle2 className="w-5 h-5 text-primary" /> My Joined Offers</CardTitle>
                  <CardDescription>Your personal affiliate link for each offer.</CardDescription>
                </CardHeader>
                <CardContent>
                  {myOffersRes?.offers && myOffersRes.offers.length > 0 ? (
                    <div className="space-y-3">
                      {myOffersRes.offers.map(offer => (
                        <div key={offer.offerId} className="p-4 rounded-xl border border-border bg-card/50">
                          <div className="flex justify-between items-start mb-3">
                            <h4 className="font-semibold text-sm">{offer.offerName}</h4>
                            <Badge variant="outline" className="text-xs"><CheckCircle2 className="w-3 h-3 mr-1 text-primary" /> Joined</Badge>
                          </div>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-1.5">Your Affiliate Link</p>
                          <div className="flex gap-2">
                            <Input value={offer.inheritedRefUrl || offer.offerUrl} readOnly className="text-xs h-8 font-mono" />
                            <Button size="sm" variant="secondary" className="h-8 shrink-0" onClick={() => handleCopy(offer.inheritedRefUrl || offer.offerUrl)}>Copy</Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : <p className="text-sm text-muted-foreground py-4">No offers joined yet.</p>}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Plus className="w-5 h-5 text-primary" /> Available Offers</CardTitle>
                  <CardDescription>Join an offer to unlock a free 24h rotator slot.</CardDescription>
                </CardHeader>
                <CardContent>
                  {availableOffers.length > 0 ? (
                    <div className="space-y-3">
                      {availableOffers.map(offer => (
                        <div key={offer.id} className="p-4 rounded-xl border border-primary/20 bg-primary/5">
                          <h4 className="font-semibold text-sm mb-1">{offer.name}</h4>
                          <p className="text-xs text-muted-foreground mb-4">{offer.description}</p>
                          <Button className="w-full h-9" size="sm" disabled={isSigningUp} onClick={() => signupOffer({ data: { offerId: offer.id } })}>
                            <Plus className="w-3.5 h-3.5 mr-1.5" />{offer.isQualifying ? "Join & Get Free 24h Slot" : "Join Offer"}
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : <p className="text-sm text-muted-foreground py-4">No new offers available right now.</p>}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ── My Agent Tab ──────────────────────────────────────────────── */}
          <TabsContent value="agent" className="space-y-5">
            {agentLoading ? (
              <div className="space-y-4">{[1,2,3].map(i=><Skeleton key={i} className="h-32 rounded-xl"/>)}</div>
            ) : agentData ? (
              <>
                {/* Owned / assistant agents */}
                {(agentData.ownedAgent || agentData.assistantAgents.length > 0) && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Your Agents</p>
                    <div className="grid md:grid-cols-2 gap-3">
                      {agentData.ownedAgent && (
                        <Link href={`/agent/${agentData.ownedAgent.slug}`}>
                          <div className="p-4 rounded-xl border border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors cursor-pointer">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-lg bg-primary/15 border border-primary/20 flex items-center justify-center">
                                  <Bot className="h-4 w-4 text-primary" />
                                </div>
                                <div>
                                  <p className="font-semibold text-sm">{agentData.ownedAgent.name}</p>
                                  <p className="text-xs text-muted-foreground font-mono">/{agentData.ownedAgent.slug}</p>
                                </div>
                              </div>
                              <Badge className="text-[10px]">Owner</Badge>
                            </div>
                            <p className="text-xs text-muted-foreground flex items-center gap-1">View agent page <ChevronRight className="h-3 w-3" /></p>
                          </div>
                        </Link>
                      )}
                      {agentData.assistantAgents.map(a => (
                        <Link key={a.id} href={`/agent/${a.slug}`}>
                          <div className="p-4 rounded-xl border border-border/40 bg-muted/10 hover:bg-muted/20 transition-colors cursor-pointer">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-lg bg-muted/40 border border-border/30 flex items-center justify-center">
                                  <Bot className="h-4 w-4 text-muted-foreground" />
                                </div>
                                <div>
                                  <p className="font-semibold text-sm">{a.name}</p>
                                  <p className="text-xs text-muted-foreground font-mono">/{a.slug}</p>
                                </div>
                              </div>
                              <Badge variant="secondary" className="text-[10px]">Assistant</Badge>
                            </div>
                            <p className="text-xs text-muted-foreground flex items-center gap-1">View agent page <ChevronRight className="h-3 w-3" /></p>
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}

                {/* Referral link */}
                <Card className="glass-panel border-primary/20">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base"><LinkIcon className="h-4 w-4 text-primary" /> Your Referral Link</CardTitle>
                    <CardDescription>Share this link. Every signup using it is credited to you.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/20 border border-border/40 font-mono text-sm">
                      <span className="flex-1 truncate text-muted-foreground">{APP_URL}/r/{userSlug}</span>
                      <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => handleCopy(`${APP_URL}/r/${userSlug}`)}><Copy className="h-3.5 w-3.5" /></Button>
                      <a href={`/r/${userSlug}`} target="_blank" rel="noopener noreferrer"><Button size="sm" variant="ghost" className="h-7 px-2"><ExternalLink className="h-3.5 w-3.5" /></Button></a>
                    </div>
                  </CardContent>
                </Card>

                {/* Personal rotator */}
                <ReferralRotatorCard userSlug={userSlug} token={token} />

                {/* Social connections */}
                <Card className="glass-panel border-border/50">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Plug className="h-4 w-4 text-primary" /> Social Connections
                        <Badge variant="outline" className="text-[10px] ml-1">via Composio</Badge>
                      </CardTitle>
                      {agentData.hasAgentAccess ? (
                        agentData.composio.isConnected
                          ? <div className="flex items-center gap-1 text-xs text-green-400"><Wifi className="h-3.5 w-3.5" /> Live</div>
                          : <div className="flex items-center gap-1 text-xs text-muted-foreground"><WifiOff className="h-3.5 w-3.5" /> Not connected</div>
                      ) : (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground"><Lock className="h-3.5 w-3.5" /> Agent owners only</div>
                      )}
                    </div>
                    <CardDescription>Connect your Twitter / X and LinkedIn. The agent posts on your behalf using your own credentials.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {!agentData.hasAgentAccess ? (
                      <div className="p-4 rounded-xl bg-muted/20 border border-border/40 flex items-start gap-3">
                        <Lock className="h-5 w-5 text-muted-foreground/50 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-sm font-medium mb-1">Requires agent access</p>
                          <p className="text-xs text-muted-foreground leading-relaxed">Social connections are available to agent owners and assigned assistants only.</p>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="p-2.5 rounded-xl bg-primary/5 border border-primary/20 flex items-center gap-2 text-xs flex-wrap">
                          <UserCheck className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                          <span className="text-muted-foreground">{agentData.ownsAgent ? "Managing agent:" : "Assistant to:"}</span>
                          <span className="font-semibold">{agentData.primaryAgent?.name}</span>
                          {agentData.isAssistant && <span className="ml-auto px-1.5 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] font-medium">Assistant</span>}
                        </div>
                        <div className="grid md:grid-cols-2 gap-2">
                          {agentData.composio.tools.map(tool => (
                            <ComposioTool key={tool.id} tool={tool} onConnect={handleComposioConnect} isConnecting={connectingPlatform === tool.id} />
                          ))}
                        </div>
                        <div className="pt-3 border-t border-border/30">
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            <strong className="text-foreground">Your accounts, your posts.</strong> Connecting authorizes the platform to post on your behalf only when the agent engine runs a campaign you're part of.
                          </p>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>

                {/* NFT progress */}
                {nftData && (
                  <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2"><Gem className="h-4 w-4 text-amber-400" /> Earn Your NFT Badge</CardTitle>
                      <CardDescription>
                        {nftData.nftClaimTxHash ? "Congratulations — you've claimed your Contributor NFT!" : nftData.nftEarned ? "You've unlocked your badge! Claim it below." : "Earn your NFT by bringing referrals or having the agent post viral hooks on your behalf."}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {nftData.nftClaimTxHash ? (
                        <div className="flex flex-col items-center gap-3 py-4">
                          <div className="w-16 h-16 rounded-full bg-amber-500/10 border-2 border-amber-400/30 flex items-center justify-center">
                            <Gem className="h-8 w-8 text-amber-400" />
                          </div>
                          <p className="text-sm font-semibold text-amber-300">NFT Claimed</p>
                          <p className="text-xs text-muted-foreground font-mono bg-muted/20 px-2 py-1 rounded">{nftData.nftClaimTxHash.slice(0,18)}…</p>
                        </div>
                      ) : (
                        <>
                          <div className="space-y-3">
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between text-xs">
                                <span className="flex items-center gap-1.5 text-muted-foreground"><Gift className="h-3 w-3" /> Referrals</span>
                                <span className={nftData.referralCount >= nftData.referralThreshold ? "text-green-400 font-semibold" : ""}>{nftData.referralCount} / {nftData.referralThreshold}</span>
                              </div>
                              <Progress value={Math.min(100, (nftData.referralCount / nftData.referralThreshold) * 100)} className="h-1.5" />
                            </div>
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between text-xs">
                                <span className="flex items-center gap-1.5 text-muted-foreground"><Star className="h-3 w-3" /> Viral hooks posted</span>
                                <span className={nftData.viralPostCount >= nftData.viralThreshold ? "text-green-400 font-semibold" : ""}>{nftData.viralPostCount} / {nftData.viralThreshold}</span>
                              </div>
                              <Progress value={Math.min(100, (nftData.viralPostCount / nftData.viralThreshold) * 100)} className="h-1.5" />
                            </div>
                          </div>
                          {nftData.nftEarned && (
                            <Button className="w-full bg-amber-500 hover:bg-amber-400 text-black font-semibold gap-2" onClick={() => claimNft.mutate()} disabled={claimNft.isPending || !nftData.walletAddress}>
                              {claimNft.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Minting…</> : <><Gem className="h-4 w-4" /> Claim NFT Badge</>}
                            </Button>
                          )}
                        </>
                      )}
                    </CardContent>
                  </Card>
                )}
              </>
            ) : (
              <div className="text-center py-16 text-muted-foreground">
                <Bot className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Could not load agent data.</p>
              </div>
            )}
          </TabsContent>

          {/* ── Wallet Tab ────────────────────────────────────────────────── */}
          <TabsContent value="wallet" className="space-y-5">
            {/* Earnings summary */}
            <div className="grid grid-cols-3 gap-4">
              {walletLoading ? [...Array(3)].map((_,i) => <Skeleton key={i} className="h-24 rounded-xl" />) : (
                <>
                  <Card className="border-primary/20 bg-primary/5">
                    <CardContent className="p-5">
                      <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wide">Available</p>
                      <p className="text-3xl font-bold font-display text-primary">${(walletData?.earnings.withdrawable ?? 0).toFixed(2)}</p>
                      <p className="text-xs text-muted-foreground mt-1">USDC on Base</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-5">
                      <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wide">Paid Out</p>
                      <p className="text-3xl font-bold font-display">${(walletData?.earnings.paid ?? 0).toFixed(2)}</p>
                      <p className="text-xs text-muted-foreground mt-1">All time</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-5">
                      <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wide">Pending</p>
                      <p className="text-3xl font-bold font-display">${(walletData?.earnings.pending ?? 0).toFixed(2)}</p>
                      <p className="text-xs text-muted-foreground mt-1">Awaiting approval</p>
                    </CardContent>
                  </Card>
                </>
              )}
            </div>

            {/* Withdrawal address */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base"><Wallet className="w-4 h-4 text-primary" /> Withdrawal Address</CardTitle>
                <CardDescription>Your Base wallet address for USDC payouts.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input placeholder="0x..." value={walletAddressInput} onChange={e => setWalletAddressInput(e.target.value)} className="font-mono text-sm" />
                  <Button variant="outline" disabled={savingAddress || !walletAddressInput} onClick={async () => {
                    setSavingAddress(true);
                    try {
                      const r = await fetch("/api/dashboard/wallet/address", { method: "POST", headers: authHeaders, body: JSON.stringify({ address: walletAddressInput }) });
                      const d = await r.json();
                      if (!d.ok) throw new Error(d.error ?? "Failed");
                      await refetchWallet();
                      toast({ title: "Wallet address saved" });
                    } catch (e: any) { toast({ title: "Save failed", description: e.message, variant: "destructive" }); }
                    finally { setSavingAddress(false); }
                  }} className="shrink-0">
                    {savingAddress ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                    <span className="ml-1.5">Save</span>
                  </Button>
                </div>
                {walletData?.walletAddress && (
                  <div className="flex items-center gap-2 text-xs text-green-400">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    Saved: <span className="font-mono">{walletData.walletAddress.slice(0,10)}…{walletData.walletAddress.slice(-6)}</span>
                  </div>
                )}
                {!walletData?.walletAddress && !walletLoading && (
                  <div className="flex items-center gap-2 text-xs text-amber-400">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    No withdrawal address set. Add one above to receive payouts.
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Withdraw action */}
            <Card className="border-primary/20">
              <CardContent className="p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <p className="font-semibold text-sm">Request Withdrawal</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Queue your pending commissions for USDC payout.
                    {(walletData?.earnings.withdrawable ?? 0) === 0 && " No pending balance right now."}
                  </p>
                </div>
                <Button disabled={withdrawing || !walletData?.walletAddress || (walletData?.earnings.withdrawable ?? 0) === 0} onClick={async () => {
                  setWithdrawing(true);
                  try {
                    const r = await fetch("/api/dashboard/wallet/withdraw", { method: "POST", headers: authHeaders });
                    const d = await r.json();
                    if (!d.ok && !d.message) throw new Error(d.error ?? "Failed");
                    await refetchWallet();
                    toast({ title: "Withdrawal queued", description: d.message });
                  } catch (e: any) { toast({ title: "Withdrawal failed", description: e.message, variant: "destructive" }); }
                  finally { setWithdrawing(false); }
                }} className="shrink-0 gap-1.5">
                  {withdrawing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ArrowUpRight className="w-3.5 h-3.5" />}
                  Withdraw ${(walletData?.earnings.withdrawable ?? 0).toFixed(2)} USDC
                </Button>
              </CardContent>
            </Card>

            {/* Commission history */}
            {walletLoading ? <Skeleton className="h-40 rounded-xl" /> : (walletData?.splits?.length ?? 0) > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Commission History</CardTitle>
                  <CardDescription>Your share of platform revenue events.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {walletData!.splits.map((s: any) => (
                      <div key={s.id} className="flex items-center justify-between p-3 rounded-lg border border-border/30 bg-muted/10 text-sm">
                        <div className="flex items-center gap-3">
                          <div className={`w-2 h-2 rounded-full shrink-0 ${s.status === "paid" ? "bg-green-500" : s.status === "approved" ? "bg-amber-400" : "bg-muted-foreground/40"}`} />
                          <div>
                            <p className="text-xs font-medium capitalize">{s.recipientType?.replace("_"," ")}</p>
                            <p className="text-[10px] text-muted-foreground">{s.paidAt ? formatDistanceToNow(new Date(s.paidAt), { addSuffix: true }) : formatDistanceToNow(new Date(s.createdAt), { addSuffix: true })}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-mono font-bold text-primary">${Number(s.splitAmount).toFixed(2)}</p>
                          <p className="text-[10px] text-muted-foreground capitalize">{s.status}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="text-center py-12 text-muted-foreground border border-dashed border-border rounded-xl">
                <Coins className="w-8 h-8 mx-auto mb-3 opacity-30" />
                <p className="text-sm">No commission events yet.</p>
                <p className="text-xs mt-1">Earnings appear here when the agent generates conversions through your slot.</p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </motion.div>
    </div>
  );
}
