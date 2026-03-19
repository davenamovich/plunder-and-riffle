import React from "react";
import { Link, useSearch } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useGetDashboardStats,
  useGetMyRotatorSlots,
  useGetMyOffers,
  useListOffers,
  useSignupForOffer,
  useGetMyReferral,
} from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  Activity, Clock, Plus, Copy, Link as LinkIcon,
  RefreshCw, CheckCircle2, ArrowRight,
  Users, Coins, ExternalLink, DollarSign,
  Wallet, ArrowUpRight, AlertCircle, CheckCircle,
  Bot, Zap, UserCheck, RotateCcw, ChevronRight, Plug,
  Wifi, WifiOff, ToggleLeft, ToggleRight,
} from "lucide-react";
import { formatDistanceToNow, isPast } from "date-fns";
import { motion } from "framer-motion";

const APP_URL = (import.meta.env.VITE_APP_URL as string | undefined)?.replace(/\/$/, "") || window.location.origin;

export default function Dashboard() {
  const { user, token, isLoading: isAuthLoading, isAuthenticated, login } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const enabled = isAuthenticated;
  const authHeaders = React.useMemo(() => token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" }, [token]);

  // Wallet
  const { data: walletData, isLoading: walletLoading, refetch: refetchWallet } = useQuery<{
    ok: boolean; walletAddress: string | null; walletStatus: string;
    earnings: { pending: number; approved: number; paid: number; withdrawable: number };
    splits: any[];
  }>({
    queryKey: ["dashboard-wallet"],
    queryFn: () => fetch("/api/dashboard/wallet", { headers: authHeaders }).then(r => r.json()),
    enabled,
    staleTime: 30_000,
  });
  const [walletAddressInput, setWalletAddressInput] = React.useState("");
  const [savingAddress, setSavingAddress] = React.useState(false);
  const [withdrawing, setWithdrawing] = React.useState(false);

  React.useEffect(() => {
    if (walletData?.walletAddress && !walletAddressInput) setWalletAddressInput(walletData.walletAddress);
  }, [walletData?.walletAddress]);

  const { data: stats, isLoading: isStatsLoading } = useGetDashboardStats({ query: { enabled } });
  const { data: slotsRes, refetch: refetchSlots, isLoading: isSlotsLoading } = useGetMyRotatorSlots({ query: { enabled } });
  const { data: myOffersRes, refetch: refetchMyOffers } = useGetMyOffers({ query: { enabled } });
  const { data: offersListRes } = useListOffers({ query: { enabled } });
  const { data: refRes } = useGetMyReferral({ query: { enabled } });

  const { mutate: signupOffer, isPending: isSigningUp } = useSignupForOffer({
    mutation: {
      onSuccess: () => {
        toast({ title: "Success!", description: "Signed up and rotator slot activated." });
        refetchSlots();
        refetchMyOffers();
      },
      onError: (e: any) =>
        toast({ title: "Error", description: e?.error || "Failed to sign up", variant: "destructive" }),
    },
  });

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard" });
  };

  const myOfferIds = myOffersRes?.offers.map((o) => o.offerId) || [];
  const availableOffers = offersListRes?.offers.filter((o) => !myOfferIds.includes(o.id) && o.isActive) || [];

  if (isAuthLoading) {
    return (
      <div className="container mx-auto px-4 py-20 max-w-6xl">
        <Skeleton className="h-10 w-48 mb-2" />
        <Skeleton className="h-5 w-64 mb-10" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
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
          <p className="text-muted-foreground mb-8">
            Track your rotator slots, referrals, and offers all in one place.
          </p>
          <Button size="lg" className="w-full h-12" onClick={login}>
            Sign In / Join <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
          <p className="text-xs text-muted-foreground mt-4">No password required — just your email.</p>
        </div>
      </div>
    );
  }

  const activeSlotCount = slotsRes?.slots.filter(s => s.status === "active").length || 0;

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4"
      >
        <div>
          <h1 className="text-3xl font-bold font-display tracking-tight mb-1">Dashboard</h1>
          <p className="text-muted-foreground">
            Welcome back, <span className="text-foreground font-medium">{user?.displayName || user?.email}</span>
          </p>
        </div>
        {refRes?.referralUrl && (
          <div className="bg-primary/10 border border-primary/20 rounded-xl p-3 flex items-center gap-3 max-w-sm">
            <LinkIcon className="w-4 h-4 text-primary shrink-0" />
            <div className="min-w-0 flex-1">
              <span className="text-muted-foreground block text-xs mb-0.5">Your Referral Link</span>
              <span className="font-mono text-xs text-primary truncate block">{refRes.referralUrl}</span>
            </div>
            <Button size="icon" variant="ghost" className="shrink-0 h-8 w-8" onClick={() => handleCopy(refRes.referralUrl)}>
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </motion.div>

      {/* Stat Cards */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8"
      >
        {[
          { label: "Active Slots", value: isStatsLoading ? "…" : (stats?.activeSlots ?? 0), icon: Activity, color: "text-primary" },
          { label: "Total Clicks", value: isStatsLoading ? "…" : (stats?.totalClicks ?? 0), icon: ExternalLink, color: "text-foreground" },
          { label: "Referrals", value: isStatsLoading ? "…" : (stats?.totalReferrals ?? 0), icon: Users, color: "text-primary" },
          { label: "Rotator Views", value: isStatsLoading ? "…" : (stats?.personalRotatorViews ?? 0), icon: Coins, color: "text-foreground" },
        ].map((stat) => (
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

      {/* Personal Rotator Link */}
      {user?.referralCode && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15 }}
          className="mb-6 p-4 rounded-xl border border-border/40 bg-card/50 flex flex-col sm:flex-row sm:items-center gap-3"
        >
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground mb-1">Your Personal Rotator Page</p>
            <p className="font-mono text-sm text-foreground truncate">
              {APP_URL}/r/{user.referralCode}
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={() => handleCopy(`${APP_URL}/r/${user.referralCode}`)}>
              <Copy className="w-3.5 h-3.5 mr-1.5" /> Copy
            </Button>
            <Link href={`/r/${user.referralCode}`}>
              <Button variant="outline" size="sm">
                <ExternalLink className="w-3.5 h-3.5 mr-1.5" /> Preview
              </Button>
            </Link>
          </div>
        </motion.div>
      )}

      {/* Tabs */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
        <Tabs defaultValue="slots">
          <TabsList className="grid w-full grid-cols-4 h-11 mb-6">
            <TabsTrigger value="slots">Rotator Slots</TabsTrigger>
            <TabsTrigger value="offers">Offers</TabsTrigger>
            <TabsTrigger value="referrals">Referrals</TabsTrigger>
            <TabsTrigger value="wallet" className="flex items-center gap-1.5">
              <Wallet className="w-3.5 h-3.5" /> Wallet
            </TabsTrigger>
          </TabsList>

          {/* Slots Tab */}
          <TabsContent value="slots" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="w-5 h-5 text-primary" />
                  Agent Rotator Slots
                </CardTitle>
                <CardDescription>
                  Active slots receive traffic directly from Ralph's agent.
                  {activeSlotCount > 0 && <span className="text-primary font-medium ml-1">{activeSlotCount} active now.</span>}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isSlotsLoading ? (
                  <div className="space-y-3">
                    {[...Array(2)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
                  </div>
                ) : slotsRes?.slots && slotsRes.slots.length > 0 ? (
                  <div className="space-y-3">
                    {slotsRes.slots.map((slot) => {
                      const expired = isPast(new Date(slot.expiresAt)) || slot.status === "expired";
                      return (
                        <div
                          key={slot.id}
                          className={`flex items-center justify-between p-4 rounded-xl border transition-all ${
                            expired
                              ? "bg-muted/20 border-border/40 opacity-60"
                              : "bg-primary/5 border-primary/30 shadow-[0_0_12px_rgba(247,147,26,0.06)]"
                          }`}
                        >
                          <div className="flex items-center gap-4">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${expired ? "bg-muted text-muted-foreground" : "bg-primary/20 text-primary"}`}>
                              {expired ? <Clock className="w-4 h-4" /> : <Activity className="w-4 h-4" />}
                            </div>
                            <div>
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className="font-semibold capitalize text-sm">{slot.slotType} Slot</span>
                                <Badge variant={expired ? "secondary" : "default"} className="text-xs">
                                  {expired ? "Expired" : "Active"}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {expired ? "Expired " : "Expires "}
                                {formatDistanceToNow(new Date(slot.expiresAt), { addSuffix: true })}
                              </p>
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

          {/* Offers Tab */}
          <TabsContent value="offers" className="space-y-4">
            {/* Key insight banner */}
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 flex gap-3 items-start">
              <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <DollarSign className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-sm text-foreground mb-0.5">Your affiliate link — your commission</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Sign up to an offer below and save your personal affiliate link. When the agent drives traffic through
                  your rotator slot, leads land on <strong className="text-foreground">your link</strong> — any
                  conversions earn <strong className="text-foreground">you</strong> the commission. The agent holds
                  no web2 affiliate account and earns nothing from these offers.
                </p>
              </div>
            </div>
            <div className="grid md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-primary" /> My Joined Offers
                  </CardTitle>
                  <CardDescription>Your personal affiliate link for each offer — commissions go directly to you.</CardDescription>
                </CardHeader>
                <CardContent>
                  {myOffersRes?.offers && myOffersRes.offers.length > 0 ? (
                    <div className="space-y-3">
                      {myOffersRes.offers.map((offer) => (
                        <div key={offer.offerId} className="p-4 rounded-xl border border-border bg-card/50">
                          <div className="flex justify-between items-start mb-3">
                            <h4 className="font-semibold text-sm">{offer.offerName}</h4>
                            <Badge variant="outline" className="text-xs">
                              <CheckCircle2 className="w-3 h-3 mr-1 text-primary" /> Joined
                            </Badge>
                          </div>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-1.5">
                            Your Affiliate Link
                          </p>
                          <div className="flex gap-2">
                            <Input value={offer.inheritedRefUrl || offer.offerUrl} readOnly className="text-xs h-8 font-mono" />
                            <Button size="sm" variant="secondary" className="h-8 shrink-0" onClick={() => handleCopy(offer.inheritedRefUrl || offer.offerUrl)}>
                              Copy
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground py-4">No offers joined yet.</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Plus className="w-5 h-5 text-primary" /> Available Offers
                  </CardTitle>
                  <CardDescription>Join an offer to save your affiliate link and unlock a free 24h rotator slot.</CardDescription>
                </CardHeader>
                <CardContent>
                  {availableOffers.length > 0 ? (
                    <div className="space-y-3">
                      {availableOffers.map((offer) => (
                        <div key={offer.id} className="p-4 rounded-xl border border-primary/20 bg-primary/5">
                          <h4 className="font-semibold text-sm mb-1">{offer.name}</h4>
                          <p className="text-xs text-muted-foreground mb-4">{offer.description}</p>
                          <Button
                            className="w-full h-9"
                            size="sm"
                            disabled={isSigningUp}
                            onClick={() => signupOffer({ data: { offerId: offer.id } })}
                          >
                            <Plus className="w-3.5 h-3.5 mr-1.5" />
                            {offer.isQualifying ? "Join & Get Free 24h Slot" : "Join Offer"}
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground py-4">No new offers available right now.</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Referrals Tab */}
          <TabsContent value="referrals" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-primary" /> Referral Program
                </CardTitle>
                <CardDescription>Share your link — when someone joins through you, they inherit your referral chain.</CardDescription>
              </CardHeader>
              <CardContent>
                {refRes ? (
                  <div className="space-y-6">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                      <div className="bg-card p-4 rounded-xl border text-center">
                        <p className="text-xs text-muted-foreground mb-1">Total Referrals</p>
                        <p className="text-3xl font-bold font-display text-primary">{refRes.totalReferrals}</p>
                      </div>
                      <div className="bg-card p-4 rounded-xl border text-center">
                        <p className="text-xs text-muted-foreground mb-1">Pending</p>
                        <p className="text-3xl font-bold font-display">{refRes.pendingReferrals}</p>
                      </div>
                      <div className="bg-card p-4 rounded-xl border text-center sm:col-span-1 col-span-2">
                        <p className="text-xs text-muted-foreground mb-1">Your Code</p>
                        <p className="text-xl font-mono font-bold text-primary">{user?.referralCode}</p>
                      </div>
                    </div>

                    <div>
                      <p className="text-sm font-medium mb-2">Share Your Referral Link</p>
                      <div className="flex gap-2">
                        <Input value={refRes.referralUrl} readOnly className="font-mono text-xs" />
                        <Button onClick={() => handleCopy(refRes.referralUrl)} className="shrink-0">
                          <Copy className="w-4 h-4 mr-2" /> Copy
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        Anyone who joins using your link gets your referral chain applied automatically.
                      </p>
                    </div>
                  </div>
                ) : (
                  <Skeleton className="h-32 rounded-xl" />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Wallet Tab */}
          <TabsContent value="wallet" className="space-y-4">
            {/* Earnings summary */}
            <div className="grid grid-cols-3 gap-4">
              {walletLoading ? (
                [...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)
              ) : (
                <>
                  <Card className="border-primary/20 bg-primary/5">
                    <CardContent className="p-5">
                      <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wide">Available to Withdraw</p>
                      <p className="text-3xl font-bold font-display text-primary">
                        ${(walletData?.earnings.withdrawable ?? 0).toFixed(2)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">USDC on Base</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-5">
                      <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wide">Paid Out</p>
                      <p className="text-3xl font-bold font-display text-foreground">
                        ${(walletData?.earnings.paid ?? 0).toFixed(2)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">All time</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-5">
                      <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wide">Commission Splits</p>
                      <p className="text-3xl font-bold font-display text-foreground">
                        {walletData?.splits.length ?? 0}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">Total events</p>
                    </CardContent>
                  </Card>
                </>
              )}
            </div>

            {/* Wallet address */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Wallet className="w-4 h-4 text-primary" /> Withdrawal Address
                </CardTitle>
                <CardDescription>Your Base (EVM) wallet address for USDC commission payouts.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    placeholder="0x..."
                    value={walletAddressInput}
                    onChange={e => setWalletAddressInput(e.target.value)}
                    className="font-mono text-sm"
                  />
                  <Button
                    variant="outline"
                    disabled={savingAddress || !walletAddressInput}
                    onClick={async () => {
                      setSavingAddress(true);
                      try {
                        const r = await fetch("/api/dashboard/wallet/address", {
                          method: "POST", headers: authHeaders,
                          body: JSON.stringify({ address: walletAddressInput }),
                        });
                        const d = await r.json();
                        if (!d.ok) throw new Error(d.error ?? "Failed");
                        await refetchWallet();
                        toast({ title: "Wallet address saved" });
                      } catch (e: any) {
                        toast({ title: "Save failed", description: e.message, variant: "destructive" });
                      } finally { setSavingAddress(false); }
                    }}
                    className="shrink-0"
                  >
                    {savingAddress ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                    <span className="ml-1.5">Save</span>
                  </Button>
                </div>
                {walletData?.walletAddress && (
                  <div className="flex items-center gap-2 text-xs text-green-400">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    Saved: <span className="font-mono">{walletData.walletAddress.slice(0, 10)}…{walletData.walletAddress.slice(-6)}</span>
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

            {/* Withdraw button */}
            <Card className="border-primary/20">
              <CardContent className="p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <p className="font-semibold text-sm">Request Withdrawal</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Queue your pending commissions for USDC payout to your wallet.
                    {(walletData?.earnings.withdrawable ?? 0) === 0 && " No pending balance right now."}
                  </p>
                </div>
                <Button
                  disabled={withdrawing || !walletData?.walletAddress || (walletData?.earnings.withdrawable ?? 0) === 0}
                  onClick={async () => {
                    setWithdrawing(true);
                    try {
                      const r = await fetch("/api/dashboard/wallet/withdraw", { method: "POST", headers: authHeaders });
                      const d = await r.json();
                      if (!d.ok && !d.message) throw new Error(d.error ?? "Failed");
                      await refetchWallet();
                      toast({ title: "Withdrawal queued", description: d.message });
                    } catch (e: any) {
                      toast({ title: "Withdrawal failed", description: e.message, variant: "destructive" });
                    } finally { setWithdrawing(false); }
                  }}
                  className="shrink-0 gap-1.5"
                >
                  {withdrawing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ArrowUpRight className="w-3.5 h-3.5" />}
                  Withdraw ${(walletData?.earnings.withdrawable ?? 0).toFixed(2)} USDC
                </Button>
              </CardContent>
            </Card>

            {/* Commission history */}
            {(walletData?.splits?.length ?? 0) > 0 && (
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
                          <div className={`w-2 h-2 rounded-full shrink-0 ${
                            s.status === "paid" ? "bg-green-500" :
                            s.status === "approved" ? "bg-amber-400" : "bg-muted-foreground/40"
                          }`} />
                          <div>
                            <p className="text-xs font-medium capitalize">{s.recipientType?.replace("_", " ")}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {s.paidAt ? formatDistanceToNow(new Date(s.paidAt), { addSuffix: true }) : formatDistanceToNow(new Date(s.createdAt), { addSuffix: true })}
                            </p>
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
            )}

            {(walletData?.splits?.length ?? 0) === 0 && !walletLoading && (
              <div className="text-center py-10 text-muted-foreground">
                <DollarSign className="w-10 h-10 mx-auto mb-3 opacity-20" />
                <p className="font-medium text-sm">No commission events yet</p>
                <p className="text-xs mt-1 opacity-60">Commissions appear here when paid seats are purchased through your referral chain.</p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </motion.div>
    </div>
  );
}
