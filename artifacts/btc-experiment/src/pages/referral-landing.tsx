import React, { useEffect, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Bot, Wallet, ExternalLink, Users, Zap, ShieldCheck,
  ArrowRight, Bitcoin, Copy, CheckCircle,
} from "lucide-react";

interface LandData {
  fallback: boolean;
  redirectUrl: string;
  slotType?: "free" | "paid";
  agent?: {
    name: string;
    slug: string;
    avatarUrl: string | null;
    description: string | null;
    totalClicks: number;
  };
  referrer?: {
    slug: string;
    displayName: string | null;
    walletAddress: string | null;
    roleLabel: string | null;
  };
  offer?: {
    name: string;
    description: string | null;
    logoUrl: string | null;
    commissionNotes: string | null;
  } | null;
}

function truncateWallet(addr: string | null | undefined): string {
  if (!addr) return "No wallet";
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export default function ReferralLanding() {
  const [, params] = useRoute("/join/:agentSlug");
  const agentSlug = params?.agentSlug ?? "ralph";
  const [, navigate] = useLocation();

  const [data, setData] = useState<LandData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [copiedWallet, setCopiedWallet] = useState(false);

  useEffect(() => {
    fetch(`/api/rotator/land/${agentSlug}`)
      .then(r => r.json())
      .then((d: LandData) => {
        setData(d);
        setLoading(false);
        if (d.fallback) {
          setCountdown(3);
        }
        // Save referrer slug so attribution is captured if they sign up
        if (d.referrer?.slug) {
          sessionStorage.setItem("btc_ref", d.referrer.slug);
        }
      })
      .catch(() => { setError(true); setLoading(false); });
  }, [agentSlug]);

  // Auto-redirect countdown for fallback
  useEffect(() => {
    if (countdown === null) return;
    if (countdown === 0) {
      window.location.href = data?.redirectUrl ?? "https://bitcoin.org";
      return;
    }
    const t = setTimeout(() => setCountdown(c => (c ?? 1) - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown, data]);

  function copyWallet() {
    const addr = data?.referrer?.walletAddress;
    if (!addr) return;
    navigator.clipboard.writeText(addr).then(() => {
      setCopiedWallet(true);
      setTimeout(() => setCopiedWallet(false), 2000);
    });
  }

  function claimSpot() {
    if (data?.redirectUrl) window.location.href = data.redirectUrl;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-md space-y-4">
          <Skeleton className="w-20 h-20 rounded-2xl mx-auto" />
          <Skeleton className="w-48 h-6 mx-auto" />
          <Skeleton className="w-64 h-4 mx-auto" />
          <Skeleton className="w-full h-32 rounded-xl" />
          <Skeleton className="w-full h-12 rounded-xl" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Rotator Unavailable</h1>
          <p className="text-muted-foreground mb-6">This referral link could not be resolved.</p>
          <Button asChild variant="outline">
            <a href="/">Return Home</a>
          </Button>
        </div>
      </div>
    );
  }

  if (data.fallback) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 text-center">
        <div className="mb-6 w-16 h-16 rounded-2xl bg-primary/20 flex items-center justify-center">
          <Bitcoin className="w-8 h-8 text-primary" />
        </div>
        <h1 className="text-2xl font-bold mb-2">{data.agent?.name ?? "BTC Experiment"}</h1>
        <p className="text-muted-foreground mb-6">Redirecting you in {countdown}…</p>
        <Button onClick={claimSpot} className="bg-primary hover:bg-primary/90">
          <ExternalLink className="w-4 h-4 mr-2" /> Go Now
        </Button>
      </div>
    );
  }

  const agent = data.agent!;
  const referrer = data.referrer!;
  const offer = data.offer ?? null;
  const displayName = referrer.displayName || referrer.slug || "A member";

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Background blobs */}
      <div className="absolute top-[-15%] left-[-10%] w-[50%] h-[50%] bg-primary/8 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[45%] h-[45%] bg-amber-500/8 rounded-full blur-[140px] pointer-events-none" />

      <div className="relative z-10 container max-w-lg mx-auto px-4 py-16 flex flex-col items-center">

        {/* Agent badge */}
        <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <div className="flex items-center gap-2 mb-8 px-4 py-2 rounded-full bg-muted/40 border border-border/50 backdrop-blur-sm">
            {agent.avatarUrl ? (
              <img src={agent.avatarUrl} alt={agent.name} className="w-5 h-5 rounded-full object-cover" />
            ) : (
              <Bot className="w-4 h-4 text-primary" />
            )}
            <span className="text-sm font-medium">{agent.name}'s Rotator</span>
            {data.slotType === "paid" && (
              <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/30 text-[10px] ml-1">
                <Zap className="w-2.5 h-2.5 mr-0.5" />Paid
              </Badge>
            )}
          </div>
        </motion.div>

        {/* Main headline */}
        <motion.div
          className="text-center mb-10"
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        >
          <p className="text-sm text-muted-foreground mb-2 uppercase tracking-widest font-mono">You're being referred by</p>
          <h1 className="text-3xl sm:text-4xl font-bold font-display tracking-tight mb-2">
            {displayName}
          </h1>
          <p className="text-muted-foreground text-sm">
            Member of the <span className="text-primary font-medium">BTC Experiment</span>
          </p>
        </motion.div>

        {/* Referrer card */}
        <motion.div
          className="w-full mb-6"
          initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2 }}
        >
          <div className="glass-panel rounded-2xl border border-border/60 p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-amber-500/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
                <Users className="w-5 h-5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{displayName}</p>
                {referrer.roleLabel && (
                  <p className="text-xs text-muted-foreground">{referrer.roleLabel}</p>
                )}
              </div>
              <Badge variant="outline" className="border-primary/30 text-primary text-[10px] shrink-0">
                In Rotator
              </Badge>
            </div>

            {/* Wallet address */}
            <div className="flex items-center gap-2 bg-muted/30 rounded-xl p-3 border border-border/30">
              <Wallet className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] text-muted-foreground mb-0.5 uppercase tracking-wider">Wallet</p>
                <p className="font-mono text-sm text-foreground">
                  {referrer.walletAddress
                    ? truncateWallet(referrer.walletAddress)
                    : <span className="text-muted-foreground italic text-xs">Not connected</span>}
                </p>
              </div>
              {referrer.walletAddress && (
                <button
                  onClick={copyWallet}
                  className="shrink-0 p-1.5 rounded-lg hover:bg-muted/50 transition-colors"
                  title="Copy wallet address"
                >
                  <AnimatePresence mode="wait">
                    {copiedWallet ? (
                      <motion.div key="check" initial={{ scale: 0.5 }} animate={{ scale: 1 }} exit={{ scale: 0.5 }}>
                        <CheckCircle className="w-4 h-4 text-green-400" />
                      </motion.div>
                    ) : (
                      <motion.div key="copy" initial={{ scale: 0.5 }} animate={{ scale: 1 }} exit={{ scale: 0.5 }}>
                        <Copy className="w-4 h-4 text-muted-foreground" />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </button>
              )}
            </div>
          </div>
        </motion.div>

        {/* Offer info */}
        {offer && (
          <motion.div
            className="w-full mb-6"
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
          >
            <div className="rounded-2xl border border-border/40 bg-card/30 backdrop-blur-sm p-4 space-y-2">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-muted/40 border border-border/30 flex items-center justify-center overflow-hidden flex-shrink-0">
                  {offer.logoUrl
                    ? <img src={offer.logoUrl} alt={offer.name} className="w-full h-full object-cover" />
                    : <Bitcoin className="w-5 h-5 text-primary" />}
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-0.5">You're being referred to</p>
                  <p className="font-semibold text-sm">{offer.name}</p>
                </div>
              </div>
              {offer.description && (
                <p className="text-sm text-muted-foreground leading-relaxed">{offer.description}</p>
              )}
              {offer.commissionNotes && (
                <div className="flex items-start gap-1.5 text-xs text-muted-foreground bg-muted/20 border border-border/20 rounded-lg p-2">
                  <ShieldCheck className="w-3.5 h-3.5 text-green-400 mt-0.5 shrink-0" />
                  {offer.commissionNotes}
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* CTA */}
        <motion.div
          className="w-full"
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
        >
          <Button
            size="lg"
            className="w-full h-14 text-base font-semibold bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20"
            onClick={claimSpot}
          >
            Claim Your Spot
            <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
          <p className="text-center text-xs text-muted-foreground mt-3">
            You'll be taken to {offer?.name ?? agent.name}'s offer page
          </p>
        </motion.div>

        {/* Agent stats */}
        {agent.totalClicks > 0 && (
          <motion.p
            className="mt-8 text-xs text-muted-foreground text-center"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}
          >
            {agent.name} has served <span className="text-foreground font-medium">{agent.totalClicks.toLocaleString()}</span> referrals
          </motion.p>
        )}

        <div className="mt-10 text-center">
          <p className="text-xs text-muted-foreground mb-1">Powered by</p>
          <a href="/" className="font-display font-bold text-sm hover:text-primary transition-colors">
            The BTC Experiment
          </a>
        </div>
      </div>
    </div>
  );
}
