import React from "react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
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
import { useToast } from "@/hooks/use-toast";
import {
  Activity, Clock, Plus, Copy, Link as LinkIcon,
  RefreshCw, CheckCircle2, ArrowRight,
  Users, Coins, ExternalLink
} from "lucide-react";
import { formatDistanceToNow, isPast } from "date-fns";
import { motion } from "framer-motion";

export default function Dashboard() {
  const { user, isLoading: isAuthLoading, isAuthenticated, login } = useAuth();
  const { toast } = useToast();

  const enabled = isAuthenticated;

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
      {user?.slug && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15 }}
          className="mb-6 p-4 rounded-xl border border-border/40 bg-card/50 flex flex-col sm:flex-row sm:items-center gap-3"
        >
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground mb-1">Your Personal Rotator Page</p>
            <p className="font-mono text-sm text-foreground truncate">
              {window.location.origin}/r/{user.slug}
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={() => handleCopy(`${window.location.origin}/r/${user.slug}`)}>
              <Copy className="w-3.5 h-3.5 mr-1.5" /> Copy
            </Button>
            <Link href={`/r/${user.slug}`}>
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
          <TabsList className="grid w-full grid-cols-3 h-11 mb-6">
            <TabsTrigger value="slots">Rotator Slots</TabsTrigger>
            <TabsTrigger value="offers">Offers</TabsTrigger>
            <TabsTrigger value="referrals">Referrals</TabsTrigger>
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
            <div className="grid md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-primary" /> My Joined Offers
                  </CardTitle>
                  <CardDescription>These offers appear on your personal rotator page.</CardDescription>
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
                  <CardDescription>Join qualifying offers to unlock free 24h rotator slots.</CardDescription>
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
        </Tabs>
      </motion.div>
    </div>
  );
}
