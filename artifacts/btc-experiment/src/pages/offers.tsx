import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import {
  Tag, Bot, ExternalLink, CheckCircle, Copy, Link2, Gift, Zap, ShieldCheck, Settings2,
} from "lucide-react";

interface Offer {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  offerUrl: string;
  logoUrl: string | null;
  isActive: boolean;
  isQualifying: boolean;
  commissionNotes: string | null;
  agent: { id: string; slug: string; name: string; avatarUrl: string | null; description: string | null } | null;
}

interface MyOffer {
  offerId: string;
  offerName: string;
  offerUrl: string;
  inheritedRefUrl: string;
  signedUpAt: string;
}

export default function OffersPage() {
  const { user, token } = useAuth();
  const { toast } = useToast();
  const [signingUpId, setSigningUpId] = useState<string | null>(null);
  const headers = token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };

  const isAdmin = user?.role === "admin";

  const { data, isLoading } = useQuery<{ offers: Offer[] }>({
    queryKey: ["offers-public"],
    queryFn: () => fetch("/api/offers").then(r => r.json()),
    staleTime: 60_000,
  });

  const { data: myData, refetch: refetchMy } = useQuery<{ offers: MyOffer[] }>({
    queryKey: ["my-offers", token],
    queryFn: () => fetch("/api/offers/my", { headers }).then(r => r.json()),
    enabled: !!token,
    staleTime: 30_000,
  });

  const myOffers = myData?.offers ?? [];
  const myOfferIds = new Set(myOffers.map(o => o.offerId));
  const myRefMap = Object.fromEntries(myOffers.map(o => [o.offerId, o.inheritedRefUrl]));

  async function signUp(offer: Offer) {
    if (!token) { toast({ title: "Sign in to claim this offer", variant: "destructive" }); return; }
    setSigningUpId(offer.id);
    try {
      const res = await fetch("/api/offers/signup", {
        method: "POST",
        headers,
        body: JSON.stringify({ offerId: offer.id }),
      }).then(r => r.json());
      if (res.success) {
        toast({ title: `Signed up for ${offer.name}!`, description: res.message });
        refetchMy();
      } else {
        toast({ title: "Error", description: res.error ?? "Failed to sign up", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Network error", variant: "destructive" });
    } finally {
      setSigningUpId(null);
    }
  }

  function copyLink(url: string) {
    navigator.clipboard.writeText(url).then(() => {
      toast({ title: "Referral link copied!", description: url });
    });
  }

  const offers = data?.offers ?? [];

  return (
    <div className="container mx-auto px-4 py-12 max-w-6xl">
      {/* Header */}
      <div className="text-center mb-12">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
              <Gift className="w-5 h-5 text-primary" />
            </div>
          </div>
          <h1 className="text-4xl font-bold font-display tracking-tight mb-3">
            Active <span className="text-primary">Offers</span>
          </h1>
          <p className="text-muted-foreground max-w-xl mx-auto text-lg">
            Each offer is promoted by one of our AI agents. Sign up to claim your personal referral link.
          </p>
          {isAdmin && (
            <div className="mt-4 flex items-center justify-center gap-3">
              <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/30 px-3 py-1">
                <ShieldCheck className="w-3 h-3 mr-1.5" />Admin — you own all agents
              </Badge>
              <Button size="sm" variant="outline" asChild>
                <Link href="/admin">
                  <Settings2 className="w-3.5 h-3.5 mr-1.5" />Manage Offers
                </Link>
              </Button>
            </div>
          )}
        </motion.div>
      </div>

      {/* My referral links (if logged in and has signups) */}
      {user && myOffers.length > 0 && (
        <div className="mb-10">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Link2 className="w-4 h-4 text-primary" />
            {isAdmin ? "All Offer Links (Admin)" : "Your Referral Links"}
          </h2>
          <div className="grid md:grid-cols-2 gap-3">
            {myOffers.map(mo => (
              <Card key={mo.offerId} className="glass-panel border-primary/20">
                <CardContent className="p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-sm">{mo.offerName}</p>
                    <p className="font-mono text-xs text-primary truncate mt-0.5">{mo.inheritedRefUrl}</p>
                  </div>
                  <Button size="sm" variant="outline" className="shrink-0" onClick={() => copyLink(mo.inheritedRefUrl)}>
                    <Copy className="w-3.5 h-3.5" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Offers grid */}
      {isLoading ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1,2,3].map(i => <Skeleton key={i} className="h-64 rounded-xl" />)}
        </div>
      ) : offers.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <Tag className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p className="text-lg">No active offers yet.</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {offers.map((offer, i) => {
            const claimed = myOfferIds.has(offer.id);
            const myLink = myRefMap[offer.id];
            return (
              <motion.div key={offer.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
                <Card className="glass-panel border-border/50 h-full flex flex-col hover:border-primary/40 transition-all">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 flex items-center justify-center flex-shrink-0 overflow-hidden">
                        {offer.logoUrl
                          ? <img src={offer.logoUrl} alt={offer.name} className="w-full h-full object-cover rounded-xl" />
                          : <Tag className="w-5 h-5 text-primary" />}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {offer.isQualifying && (
                          <Badge className="bg-primary/10 text-primary border-primary/30 text-[10px]">
                            <Zap className="w-2.5 h-2.5 mr-1" />Qualifies
                          </Badge>
                        )}
                        {claimed && (
                          <Badge className="bg-green-500/10 text-green-400 border-green-500/30 text-[10px]">
                            <CheckCircle className="w-2.5 h-2.5 mr-1" />Claimed
                          </Badge>
                        )}
                      </div>
                    </div>
                    <CardTitle className="text-base">{offer.name}</CardTitle>
                    {offer.description && (
                      <p className="text-sm text-muted-foreground leading-relaxed">{offer.description}</p>
                    )}
                  </CardHeader>

                  <CardContent className="pt-0 flex-1 flex flex-col justify-end gap-3">
                    {/* Agent chip */}
                    {offer.agent && (
                      <div className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/30 border border-border/30">
                        <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center overflow-hidden flex-shrink-0">
                          {offer.agent.avatarUrl
                            ? <img src={offer.agent.avatarUrl} alt={offer.agent.name} className="w-full h-full object-cover" />
                            : <Bot className="w-3.5 h-3.5 text-primary" />}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-medium leading-none">{offer.agent.name}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">Promoting Agent</p>
                        </div>
                      </div>
                    )}

                    {/* Commission notes */}
                    {offer.commissionNotes && (
                      <div className="flex items-start gap-1.5 text-xs text-muted-foreground bg-muted/20 border border-border/20 rounded-lg p-2.5">
                        <ShieldCheck className="w-3.5 h-3.5 text-green-400 mt-0.5 shrink-0" />
                        {offer.commissionNotes}
                      </div>
                    )}

                    {/* My referral link for this offer */}
                    {claimed && myLink && (
                      <div className="flex items-center gap-2 bg-primary/5 border border-primary/20 rounded-lg p-2.5">
                        <p className="font-mono text-[10px] text-primary truncate flex-1">{myLink}</p>
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0 shrink-0" onClick={() => copyLink(myLink)}>
                          <Copy className="w-3 h-3" />
                        </Button>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2 pt-1">
                      {isAdmin ? (
                        <Button size="sm" variant="outline" className="flex-1" asChild>
                          <Link href="/admin">
                            <Settings2 className="w-3.5 h-3.5 mr-1.5" />Edit in Admin
                          </Link>
                        </Button>
                      ) : claimed ? (
                        <Button variant="outline" size="sm" className="flex-1" asChild>
                          <a href={myLink ?? offer.offerUrl} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="w-3.5 h-3.5 mr-1.5" /> Visit Offer
                          </a>
                        </Button>
                      ) : (
                        <Button size="sm" className="flex-1 bg-primary hover:bg-primary/90"
                          disabled={signingUpId === offer.id}
                          onClick={() => signUp(offer)}>
                          {signingUpId === offer.id ? "Claiming…" : "Claim Offer"}
                        </Button>
                      )}
                      <Button variant="outline" size="sm" asChild>
                        <a href={offer.offerUrl} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
