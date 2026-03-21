import React, { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useSearch, useLocation, Redirect } from "wouter";
import { Copy, Check, ExternalLink, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Step = "loading" | "offer" | "save_link" | "active" | "waitlisted" | "error";

interface AgentConfig {
  offerName: string; offerUrl: string; offerCtaText: string; offerTagline: string | null;
  paidSeatPriceUsd: number; totalPaidSeats: number; filledPaidSeats: number;
}

export default function OnboardingPage() {
  const { user, isAuthenticated, isLoading, token, login } = useAuth();
  const { toast } = useToast();
  const search = useSearch();
  const [, navigate] = useLocation();

  const params      = new URLSearchParams(search);
  const agentSlug   = params.get("agent") || "ralph";

  const [step,          setStep]          = useState<Step>("loading");
  const [slotId,        setSlotId]        = useState("");
  const [config,        setConfig]        = useState<AgentConfig | null>(null);
  const [agentName,     setAgentName]     = useState("");
  const [referralLink,  setReferralLink]  = useState("");
  const [copied,        setCopied]        = useState(false);
  const [confirmed,     setConfirmed]     = useState(false);
  const [expiresAt,     setExpiresAt]     = useState<Date | null>(null);
  const [waitlistPos,   setWaitlistPos]   = useState(0);
  const [activating,    setActivating]    = useState(false);
  const [timerDisplay,  setTimerDisplay]  = useState("24:00:00");

  // Countdown timer
  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => {
      const diff = Math.max(0, expiresAt.getTime() - Date.now());
      const h = String(Math.floor(diff / 3600000)).padStart(2, "0");
      const m = String(Math.floor((diff % 3600000) / 60000)).padStart(2, "0");
      const s = String(Math.floor((diff % 60000) / 1000)).padStart(2, "0");
      setTimerDisplay(`${h}:${m}:${s}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      login();
      return;
    }
    if (isAuthenticated && user) {
      initSlot();
    }
  }, [isAuthenticated, isLoading, user]);

  const headers = { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };

  async function initSlot() {
    try {
      // Load agent info
      const ar = await fetch(`/api/vessel/agents/${agentSlug}`);
      const ad = await ar.json();
      if (!ad.ok) { setStep("error"); return; }
      setAgentName(ad.agent.name);
      setConfig(ad.config);

      // Check if user already has tokens (completed onboarding before)
      if (user && user.tokens > 0) {
        navigate("/agents");
        return;
      }

      // Start slot
      const sr = await fetch("/api/vessel/slots/start", {
        method: "POST", headers,
        body: JSON.stringify({ agentSlug }),
      });
      const sd = await sr.json();
      if (!sd.ok) { setStep("error"); return; }

      setSlotId(sd.slotId);

      if (sd.status === "already_active") {
        setStep("active");
        return;
      }
      if (sd.status === "waitlisted") {
        setWaitlistPos(sd.waitlistPosition);
        setStep("waitlisted");
        return;
      }

      setStep("offer");
    } catch { setStep("error"); }
  }

  async function handleOfferClicked() {
    if (!config) return;
    window.open(config.offerUrl, "_blank");
    fetch("/api/vessel/slots/offer-clicked", {
      method: "POST", headers,
      body: JSON.stringify({ slotId }),
    }).catch(() => {});
    // Set the referral link from user data
    const appUrl = window.location.origin;
    setReferralLink(`${appUrl}/r/${user?.referralCode}`);
    setTimeout(() => setStep("save_link"), 600);
  }

  async function handleActivate() {
    if (!confirmed) return;
    setActivating(true);
    try {
      const r = await fetch("/api/vessel/slots/activate", {
        method: "POST", headers,
        body: JSON.stringify({ slotId }),
      });
      const d = await r.json();
      if (!d.ok) { toast({ title: "Error", description: d.error, variant: "destructive" }); return; }
      setReferralLink(d.referralLink);
      setExpiresAt(new Date(d.expiresAt));
      setStep("active");
    } catch { toast({ title: "Error", description: "Something went wrong", variant: "destructive" }); }
    finally { setActivating(false); }
  }

  function copyLink() {
    navigator.clipboard.writeText(referralLink || `${window.location.origin}/r/${user?.referralCode}`).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  }

  if (isLoading || step === "loading") {
    return <div className="flex items-center justify-center min-h-screen text-muted-foreground">Loading...</div>;
  }
  if (!isAuthenticated) return <Redirect to="/" />;

  const link = referralLink || `${window.location.origin}/r/${user?.referralCode}`;

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="font-display font-bold text-lg tracking-[6px] text-primary">VESSEL PROTOCOL</div>
        </div>

        {/* Step pills */}
        {(step === "offer" || step === "save_link") && (
          <div className="flex gap-2 mb-8">
            {["OFFER", "SAVE LINK", "LIVE"].map((s, i) => {
              const current = step === "offer" ? 0 : step === "save_link" ? 1 : 2;
              return (
                <div key={s} className={`flex-1 h-1 rounded-full transition-all duration-300 ${i < current ? "bg-primary" : i === current ? "bg-primary/50" : "bg-muted/40"}`} />
              );
            })}
          </div>
        )}

        {/* STEP: OFFER */}
        {step === "offer" && config && (
          <div className="space-y-6">
            <div>
              <div className="text-xs font-semibold text-primary uppercase tracking-wider mb-2">Step 1 of 3 — Required</div>
              <h1 className="text-3xl font-display font-bold mb-3">
                Complete the<br /><span className="text-primary">Free Offer</span>
              </h1>
              <p className="text-muted-foreground text-sm leading-relaxed">
                <strong className="text-foreground">{agentName}</strong> is promoting{" "}
                <strong className="text-foreground">{config.offerName}</strong>.
                {config.offerTagline && <> {config.offerTagline}</>}<br /><br />
                It's free. Takes about 90 seconds. This is the offer the agent will be
                driving traffic to — <em>for you</em>.
              </p>
            </div>
            <div className="glass-panel rounded-xl p-4 border border-primary/20">
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Free Offer</div>
              <div className="font-display font-bold text-primary text-xl">{config.offerName}</div>
              {config.offerTagline && <div className="text-sm text-muted-foreground mt-1">{config.offerTagline}</div>}
            </div>
            <button onClick={handleOfferClicked}
              className="w-full py-4 bg-primary text-primary-foreground font-display font-bold text-lg tracking-wider rounded-lg hover:bg-primary/90 transition-colors flex items-center justify-center gap-2">
              {config.offerCtaText} <ExternalLink className="w-4 h-4" />
            </button>
            <p className="text-center text-xs text-muted-foreground/50">Opens in a new tab. Return here when done.</p>
          </div>
        )}

        {/* STEP: SAVE LINK — THE GATE */}
        {step === "save_link" && (
          <div className="space-y-6">
            <div>
              <div className="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-2">Step 2 of 3 — The Gate</div>
              <h1 className="text-3xl font-display font-bold mb-3">
                Save Your<br /><span className="text-amber-400">Referral Link</span>
              </h1>
              <p className="text-muted-foreground text-sm leading-relaxed">
                This is <strong className="text-foreground">the most important step</strong>.
                Your link is what {agentName} will post on TikTok, Instagram, and X — every day.
                When people click it and sign up, <strong className="text-primary">you earn.</strong><br /><br />
                Save it. Screenshot it. Send it to yourself. Don't lose it.
              </p>
            </div>

            <div className="glass-panel rounded-xl p-4 border border-amber-500/30 space-y-3">
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Your Referral Link</div>
              <div className="font-mono text-sm text-amber-400 break-all leading-relaxed">{link}</div>
              <button onClick={copyLink}
                className={`w-full py-3 font-display font-bold tracking-wider rounded-lg transition-colors flex items-center justify-center gap-2 ${copied ? "bg-green-500 text-black" : "bg-amber-500 text-black hover:bg-amber-400"}`}>
                {copied ? <><Check className="w-4 h-4" /> COPIED</> : <><Copy className="w-4 h-4" /> COPY LINK</>}
              </button>
            </div>

            <div className="flex gap-2">
              {[
                { label: "𝕏 Share", href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(`My AI agent is live. It posts on my behalf 24/7. Free to join: ${link}`)}` },
                { label: "WhatsApp", href: `https://wa.me/?text=${encodeURIComponent(`My AI agent posts for me while I sleep. Free signup: ${link}`)}` },
              ].map(s => (
                <a key={s.label} href={s.href} target="_blank" rel="noreferrer"
                  className="flex-1 py-2 text-center text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-border/80 transition-colors">
                  {s.label}
                </a>
              ))}
            </div>

            <label className={`flex items-start gap-3 cursor-pointer p-4 rounded-xl border transition-all ${confirmed ? "border-primary/40 bg-primary/5" : "border-border/40"}`}>
              <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}
                className="mt-0.5 w-4 h-4 flex-shrink-0" />
              <span className="text-sm text-muted-foreground leading-relaxed">
                I've saved my referral link. I understand {agentName} will post it on social media on my behalf to drive traffic and earn me commissions.
              </span>
            </label>

            <button onClick={handleActivate} disabled={!confirmed || activating}
              className={`w-full py-4 font-display font-bold text-lg tracking-wider rounded-lg transition-colors ${confirmed ? "bg-primary text-primary-foreground hover:bg-primary/90" : "bg-muted/40 text-muted-foreground cursor-not-allowed"}`}>
              {activating ? "ACTIVATING..." : "ACTIVATE MY SLOT →"}
            </button>
          </div>
        )}

        {/* STEP: ACTIVE */}
        {step === "active" && (
          <div className="text-center space-y-6">
            <div className="text-6xl">🤖</div>
            <div>
              <div className="text-xs font-semibold text-green-400 uppercase tracking-wider mb-2">Slot Active</div>
              <h1 className="text-3xl font-display font-bold mb-3">
                {agentName}<br /><span className="text-green-400">Is Live.</span>
              </h1>
              <p className="text-muted-foreground text-sm leading-relaxed max-w-sm mx-auto">
                Your slot expires in <strong className="text-foreground">24 hours</strong>.
                During that time, {agentName} will rotate your link across TikTok, Instagram, X, and LinkedIn.
                Every click. Every signup. <strong className="text-primary">Your commission.</strong>
              </p>
            </div>
            {expiresAt && (
              <div className="glass-panel rounded-xl p-5 border border-green-500/20">
                <div className="flex items-center justify-center gap-2 text-muted-foreground text-xs mb-2">
                  <Clock className="w-3.5 h-3.5" /> Slot expires in
                </div>
                <div className="font-display font-bold text-4xl text-green-400 tracking-wider">{timerDisplay}</div>
              </div>
            )}
            <div className="glass-panel rounded-xl p-4 border border-border/40 text-left">
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Your Link</div>
              <div className="font-mono text-xs text-primary break-all">{link}</div>
            </div>
            <button onClick={() => navigate("/dashboard")}
              className="w-full py-4 bg-primary text-primary-foreground font-display font-bold text-lg tracking-wider rounded-lg hover:bg-primary/90 transition-colors">
              VIEW DASHBOARD →
            </button>
          </div>
        )}

        {/* WAITLISTED */}
        {step === "waitlisted" && (
          <div className="text-center space-y-6">
            <div className="text-5xl font-display font-bold text-amber-400">#{waitlistPos}</div>
            <div>
              <h1 className="text-3xl font-display font-bold mb-3">You're on the list.</h1>
              <p className="text-muted-foreground text-sm leading-relaxed max-w-sm mx-auto">
                {agentName} has hit its daily slot cap. You're #{waitlistPos} in line.
                Slots reset every 24 hours. You'll be notified when your slot opens.
              </p>
            </div>
            <button onClick={() => navigate("/dashboard")}
              className="w-full py-4 bg-primary text-primary-foreground font-display font-bold text-lg tracking-wider rounded-lg hover:bg-primary/90 transition-colors">
              VIEW DASHBOARD →
            </button>
          </div>
        )}

        {/* ERROR */}
        {step === "error" && (
          <div className="text-center space-y-4">
            <p className="text-destructive">Something went wrong. Please try again.</p>
            <button onClick={() => navigate("/")}
              className="px-6 py-3 border border-border rounded-lg text-sm hover:bg-card/50">
              ← Back to Home
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
