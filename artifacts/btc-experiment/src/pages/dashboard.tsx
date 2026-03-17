import React, { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { 
  useGetDashboardStats, 
  useGetMyRotatorSlots, 
  useGetMyOffers, 
  useListOffers, 
  useSignupForOffer,
  useGetMyKeywords,
  useUpdateMyKeywords,
  useBuildIcp,
  useGetMyReferral
} from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Activity, Clock, Plus, Copy, Link as LinkIcon, RefreshCw, CheckCircle2, Tag } from "lucide-react";
import { formatDistanceToNow, isPast } from "date-fns";

export default function Dashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  
  // Data Hooks
  const { data: stats } = useGetDashboardStats();
  const { data: slotsRes, refetch: refetchSlots } = useGetMyRotatorSlots();
  const { data: myOffersRes, refetch: refetchMyOffers } = useGetMyOffers();
  const { data: offersListRes } = useListOffers();
  const { data: keywordsRes, refetch: refetchKeywords } = useGetMyKeywords();
  const { data: refRes } = useGetMyReferral();

  // Mutation Hooks
  const { mutate: signupOffer, isPending: isSigningUp } = useSignupForOffer({
    mutation: {
      onSuccess: () => {
        toast({ title: "Success", description: "Signed up and rotator slot activated!" });
        refetchSlots();
        refetchMyOffers();
      },
      onError: (e) => toast({ title: "Error", description: e.error || "Failed to sign up", variant: "destructive" })
    }
  });

  const { mutate: updateKeywords, isPending: isUpdatingKw } = useUpdateMyKeywords({
    mutation: {
      onSuccess: () => {
        toast({ title: "Keywords updated" });
        refetchKeywords();
      }
    }
  });

  const { mutate: buildIcp, isPending: isBuildingIcp } = useBuildIcp({
    mutation: {
      onSuccess: (data) => {
        setKwInput(data.keywords.join(", "));
        toast({ title: "ICP Generated", description: "Keywords auto-populated from offer." });
      },
      onError: (e) => toast({ title: "Error", description: e.error || "Failed to generate ICP", variant: "destructive" })
    }
  });

  // State
  const [icpUrl, setIcpUrl] = useState("");
  const [kwInput, setKwInput] = useState("");

  React.useEffect(() => {
    if (keywordsRes) {
      setKwInput(keywordsRes.keywords.join(", "));
    }
  }, [keywordsRes]);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard" });
  };

  const myOfferIds = myOffersRes?.offers.map(o => o.offerId) || [];
  const availableOffers = offersListRes?.offers.filter(o => !myOfferIds.includes(o.id) && o.isActive) || [];

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold font-display tracking-tight mb-1">Dashboard</h1>
          <p className="text-muted-foreground">Welcome back, {user?.displayName || user?.email}</p>
        </div>
        {refRes && (
          <div className="bg-primary/10 border border-primary/20 rounded-lg p-3 flex items-center gap-3">
            <div className="text-sm">
              <span className="text-muted-foreground block text-xs mb-1">Your Referral Link</span>
              <span className="font-mono font-medium text-primary select-all">{refRes.referralUrl}</span>
            </div>
            <Button size="icon" variant="ghost" onClick={() => handleCopy(refRes.referralUrl)}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <Card className="bg-card">
          <CardContent className="p-6">
            <p className="text-sm font-medium text-muted-foreground mb-1">Active Slots</p>
            <p className="text-3xl font-bold text-foreground">{stats?.activeSlots || 0}</p>
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardContent className="p-6">
            <p className="text-sm font-medium text-muted-foreground mb-1">Total Clicks</p>
            <p className="text-3xl font-bold text-foreground">{stats?.totalClicks || 0}</p>
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardContent className="p-6">
            <p className="text-sm font-medium text-muted-foreground mb-1">Referrals</p>
            <p className="text-3xl font-bold text-primary">{stats?.totalReferrals || 0}</p>
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardContent className="p-6">
            <p className="text-sm font-medium text-muted-foreground mb-1">Rotator Views</p>
            <p className="text-3xl font-bold text-foreground">{stats?.personalRotatorViews || 0}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="slots" className="w-full">
        <TabsList className="grid w-full md:w-auto grid-cols-2 md:grid-cols-4 h-auto md:h-11">
          <TabsTrigger value="slots">Rotator Slots</TabsTrigger>
          <TabsTrigger value="offers">My Offers</TabsTrigger>
          <TabsTrigger value="keywords">Keywords & ICP</TabsTrigger>
          <TabsTrigger value="referrals">Referrals</TabsTrigger>
        </TabsList>

        <TabsContent value="slots" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Your Agent Rotator Slots</CardTitle>
              <CardDescription>Active slots receive traffic directly from the agent.</CardDescription>
            </CardHeader>
            <CardContent>
              {slotsRes?.slots && slotsRes.slots.length > 0 ? (
                <div className="space-y-4">
                  {slotsRes.slots.map(slot => {
                    const expired = isPast(new Date(slot.expiresAt)) || slot.status === 'expired';
                    return (
                      <div key={slot.id} className={`flex items-center justify-between p-4 rounded-xl border ${expired ? 'bg-muted/30 border-border/50' : 'bg-card border-primary/20 shadow-[0_0_10px_rgba(247,147,26,0.05)]'}`}>
                        <div className="flex items-center gap-4">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${expired ? 'bg-muted text-muted-foreground' : 'bg-primary/20 text-primary'}`}>
                            {expired ? <Clock className="w-5 h-5" /> : <Activity className="w-5 h-5" />}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold capitalize">{slot.slotType} Slot</span>
                              <Badge variant={expired ? "secondary" : "success"}>
                                {expired ? "Expired" : "Active"}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">
                              {expired ? 'Expired ' : 'Expires '} 
                              {formatDistanceToNow(new Date(slot.expiresAt), { addSuffix: true })}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-muted-foreground">Clicks delivered</p>
                          <p className="font-bold font-display text-lg">{slot.clickCount || 0}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="text-center py-12 bg-muted/20 rounded-xl border border-dashed border-border">
                  <Activity className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                  <p className="text-muted-foreground">You don't have any active rotator slots.</p>
                  <Button className="mt-4" onClick={() => document.getElementById("tab-offers")?.click()}>
                    Join an Offer to get one
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="offers" className="mt-6 space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>My Joined Offers</CardTitle>
                <CardDescription>These offers appear on your personal rotator.</CardDescription>
              </CardHeader>
              <CardContent>
                {myOffersRes?.offers && myOffersRes.offers.length > 0 ? (
                  <div className="space-y-4">
                    {myOffersRes.offers.map(offer => (
                      <div key={offer.offerId} className="p-4 rounded-xl border border-border bg-card">
                        <div className="flex justify-between items-start mb-2">
                          <h4 className="font-bold">{offer.offerName}</h4>
                          <Badge variant="outline"><CheckCircle2 className="w-3 h-3 mr-1 text-primary"/> Joined</Badge>
                        </div>
                        <div className="mt-4 flex gap-2">
                          <Input value={offer.inheritedRefUrl || offer.offerUrl} readOnly className="text-xs h-8" />
                          <Button size="sm" variant="secondary" onClick={() => handleCopy(offer.inheritedRefUrl || offer.offerUrl)}>Copy</Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No offers joined yet.</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Available Offers</CardTitle>
                <CardDescription>Join qualifying offers to unlock free 24h slots.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {availableOffers.length > 0 ? (
                    availableOffers.map(offer => (
                      <div key={offer.id} className="p-4 rounded-xl border border-primary/20 bg-primary/5">
                        <h4 className="font-bold mb-1">{offer.name}</h4>
                        <p className="text-sm text-muted-foreground mb-4">{offer.description}</p>
                        <Button 
                          className="w-full" 
                          disabled={isSigningUp}
                          onClick={() => signupOffer({ data: { offerId: offer.id } })}
                        >
                          <Plus className="w-4 h-4 mr-2" /> Join & Get 24h Slot
                        </Button>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">No new offers available.</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="keywords" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>ICP & Keyword Targeting</CardTitle>
              <CardDescription>Help the agent find better leads by defining your ideal customer profile.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <div>
                    <h4 className="text-sm font-medium mb-2 flex items-center"><Zap className="w-4 h-4 mr-2 text-primary"/> Auto-Build ICP</h4>
                    <p className="text-xs text-muted-foreground mb-3">Paste an offer or landing page URL, and our AI will extract the perfect keywords.</p>
                    <div className="flex gap-2">
                      <Input 
                        placeholder="https://example.com/offer" 
                        value={icpUrl}
                        onChange={e => setIcpUrl(e.target.value)}
                      />
                      <Button 
                        disabled={!icpUrl || isBuildingIcp} 
                        onClick={() => buildIcp({ data: { offerUrl: icpUrl } })}
                      >
                        {isBuildingIcp ? <RefreshCw className="w-4 h-4 animate-spin" /> : "Extract"}
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <h4 className="text-sm font-medium mb-2 flex items-center"><Tag className="w-4 h-4 mr-2"/> Target Keywords</h4>
                    <p className="text-xs text-muted-foreground mb-3">Comma separated list of keywords and topics.</p>
                    <textarea 
                      className="w-full h-32 rounded-lg border border-border bg-background p-3 text-sm focus:ring-2 focus:ring-primary/50 focus:outline-none"
                      value={kwInput}
                      onChange={e => setKwInput(e.target.value)}
                      placeholder="bitcoin, crypto, passive income..."
                    />
                    <Button 
                      className="w-full mt-3" 
                      disabled={isUpdatingKw}
                      onClick={() => updateKeywords({ data: { keywords: kwInput.split(',').map(s=>s.trim()).filter(Boolean), painPoints: [], buyerIntentPhrases: [] } })}
                    >
                      Save Target Keywords
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="referrals" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Referral Program</CardTitle>
              <CardDescription>Share your link to earn from your network.</CardDescription>
            </CardHeader>
            <CardContent>
              {refRes && (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4 max-w-sm">
                    <div className="bg-card p-4 rounded-xl border">
                      <p className="text-sm text-muted-foreground">Total Referrals</p>
                      <p className="text-2xl font-bold">{refRes.totalReferrals}</p>
                    </div>
                    <div className="bg-card p-4 rounded-xl border">
                      <p className="text-sm text-muted-foreground">Pending</p>
                      <p className="text-2xl font-bold">{refRes.pendingReferrals}</p>
                    </div>
                  </div>
                  
                  <div>
                    <p className="text-sm font-medium mb-2">Share Link</p>
                    <div className="flex gap-2 max-w-md">
                      <Input value={refRes.referralUrl} readOnly />
                      <Button onClick={() => handleCopy(refRes.referralUrl)}>Copy</Button>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
