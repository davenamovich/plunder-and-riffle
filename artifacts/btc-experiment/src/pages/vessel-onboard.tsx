/**
 * VESSEL PROTOCOL — Onboard Flow
 * Route: /vessel/onboard/:slug
 * Steps: offer CTA → save link (HARD GATE) → slot active
 */

import React, { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useRoute, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Copy, Check, ExternalLink } from "lucide-react";

type Step = "loading" | "offer" | "save_link" | "active" | "waitlisted" | "error";

const APP_URL = window.location.origin;

export default function VesselOnboard() {
  const { user, isAuthenticated, login, token } = useAuth();
  const { toast } = useToast();
  const [, params] = useRoute("/vessel/onboard/:slug");
  const [, navigate] = useLocation();
  const agentSlug = params?.slug || "";

  const [step,          setStep]         = useState<Step>("loading");
  const [agentData,     setAgentData]    = useState<any>(null);
  const [slotId,        setSlotId]       = useState("");
  const [referralLink,  setReferralLink] = useState("");
  const [linkCopied,    setLinkCopied]   = useState(false);
  const [linkConfirmed, setLinkConfirmed]= useState(false);
  const [expiresAt,     setExpiresAt]    = useState<Date | null>(null);
  const [waitlistPos,   setWaitlistPos]  = useState(0);
  const [error,         setError]        = useState("");
  const [loading,       setLoading]      = useState(false);

  const headers = { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };

  useEffect(() => {
    if (!isAuthenticated) { login(); return; }
    if (agentSlug) init();
  }, [isAuthenticated, agentSlug]);

  async function init() {
    try {
      const agRes = await fetch(`/api/vessel/agents/${agentSlug}`);
      const agData = await agRes.json();
      if (!agData.ok) { setError(agData.error); setStep("error"); return; }
      setAgentData(agData);

      const slotRes = await fetch("/api/vessel/slots/start", {
        method: "POST", headers, body: JSON.stringify({ agentSlug }),
      });
      const slotData = await slotRes.json();
      if (!slotData.ok) { setError(slotData.error); setStep("error"); return; }

      setSlotId(slotData.slotId);
      if (slotData.status === "waitlisted") { setWaitlistPos(slotData.waitlistPosition); setStep("waitlisted"); return; }
      if (slotData.status === "already_active") {
        const pendingStatuses = ["pending_offer", "pending_link_save"];
        // Check which sub-step they're on
        if (slotData.slot?.status === "active") { navigate("/vessel/dashboard"); return; }
        if (slotData.slot?.status === "pending_link_save") {
          setReferralLink(`${APP_URL}/r/${user?.referralCode}`);
          setStep("save_link"); return;
        }
      }
      setStep("offer");
    } catch (err: any) { setError(err.message); setStep("error"); }
  }

  async function handleOfferClicked() {
    if (!agentData) return;
    window.open(agentData.config.offerUrl, "_blank");
    fetch("/api/vessel/slots/offer-clicked", { method: "POST", headers, body: JSON.stringify({ slotId }) }).catch(() => {});
    setTimeout(() => {
      setReferralLink(`${APP_URL}/r/${user?.referralCode}`);
      setStep("save_link");
    }, 600);
  }

  async function handleActivate() {
    if (!linkConfirmed) return;
    setLoading(true);
    try {
      const res  = await fetch("/api/vessel/slots/activate", { method: "POST", headers, body: JSON.stringify({ slotId }) });
      const data = await res.json();
      if (!data.ok) { toast({ title: "Error", description: data.error, variant: "destructive" }); return; }
      setReferralLink(data.referralLink);
      setExpiresAt(new Date(data.expiresAt));
      setStep("active");
    } catch (err: any) { toast({ title: "Error", description: err.message, variant: "destructive" }); }
    finally { setLoading(false); }
  }

  function copyLink() {
    navigator.clipboard.writeText(referralLink).then(() => {
      setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2500);
    });
  }

  const wrapper = (children: React.ReactNode) => (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center px-6 py-12" style={{ fontFamily: "'DM Mono', monospace" }}>
      <div className="w-full max-w-md">
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, letterSpacing: 5 }} className="text-cyan-400 mb-8 text-center">
          VESSEL PROTOCOL
        </div>
        {children}
      </div>
    </div>
  );

  if (step === "loading") return wrapper(<div className="text-center text-white/30 text-xs tracking-widest">LOADING...</div>);
  if (step === "error")   return wrapper(
    <div className="text-center space-y-4">
      <p className="text-red-400 text-sm">{error || "Something went wrong"}</p>
      <Button variant="outline" onClick={() => navigate("/vessel/agents")}>← Back to Agents</Button>
    </div>
  );

  if (step === "waitlisted") return wrapper(
    <div className="text-center space-y-4">
      <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 64 }} className="text-amber-400">#{waitlistPos}</div>
      <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 24, letterSpacing: 2 }}>YOU'RE ON THE LIST</div>
      <p className="text-sm text-white/45 leading-relaxed">
        {agentData?.agent?.name} hit its daily slot cap.<br />
        You're #{waitlistPos} in line. Slots reset at midnight.
      </p>
      <Button onClick={() => navigate("/vessel/dashboard")} className="w-full">View Dashboard →</Button>
    </div>
  );

  // STEP 1: Complete the offer
  if (step === "offer") return wrapper(
    <div className="space-y-6">
      <StepBar current={1} />
      <div>
        <p className="text-xs text-cyan-400/60 tracking-widest mb-2">// STEP 1 — REQUIRED</p>
        <h2 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 40, lineHeight: 1 }}>
          COMPLETE THE<br /><span className="text-cyan-400">FREE OFFER</span>
        </h2>
      </div>
      <p className="text-xs text-white/50 leading-relaxed">
        {agentData?.agent?.name} promotes <strong className="text-white">{agentData?.config?.offerName}</strong>.<br />
        {agentData?.config?.offerTagline}<br /><br />
        It's free. Takes 90 seconds. This is the offer the agent drives traffic to — for you.
      </p>
      <div className="border border-cyan-400/20 p-4 bg-white/3">
        <p className="text-xs text-white/30 tracking-widest mb-2">FREE OFFER</p>
        <p style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, letterSpacing: 2 }} className="text-cyan-400">
          {agentData?.config?.offerName}
        </p>
      </div>
      <Button className="w-full h-12 text-base" onClick={handleOfferClicked}>
        {agentData?.config?.offerCtaText || "Sign Up Free"} <ExternalLink className="ml-2 h-4 w-4" />
      </Button>
      <p className="text-xs text-white/20 text-center">Opens in a new tab. Come back when done.</p>
    </div>
  );

  // STEP 2: THE HARD GATE — save your link
  if (step === "save_link") return wrapper(
    <div className="space-y-6">
      <StepBar current={2} />
      <div>
        <p className="text-xs text-amber-400/80 tracking-widest mb-2">// STEP 2 — THE GATE</p>
        <h2 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 40, lineHeight: 1 }}>
          SAVE YOUR<br /><span className="text-amber-400">REFERRAL LINK</span>
        </h2>
      </div>
      <p className="text-xs text-white/50 leading-relaxed">
        This is <strong className="text-white">the most important step</strong>.<br />
        Your link is what {agentData?.agent?.name} posts on TikTok, Instagram, and X — every day.<br />
        When people click and sign up through it, <strong className="text-cyan-400">you earn.</strong>
      </p>

      <div className="border border-amber-400/40 p-4 bg-white/3">
        <p className="text-xs text-white/25 tracking-widest mb-3">YOUR REFERRAL LINK</p>
        <p className="text-amber-400 text-sm break-all mb-3">{referralLink}</p>
        <button onClick={copyLink}
          className={`w-full py-2 text-xs tracking-widest font-bold transition-colors flex items-center justify-center gap-2 ${linkCopied ? "bg-green-400 text-black" : "bg-amber-400 text-black"}`}>
          {linkCopied ? <><Check className="h-3 w-3" /> COPIED</> : <><Copy className="h-3 w-3" /> COPY LINK</>}
        </button>
      </div>

      <div className="flex gap-2">
        {[
          { label: "𝕏 Twitter", url: `https://twitter.com/intent/tweet?text=${encodeURIComponent(`My AI agent works for me 24/7. Free to join: ${referralLink}`)}` },
          { label: "WhatsApp",  url: `https://wa.me/?text=${encodeURIComponent(`AI agent that posts on my behalf. Free entry: ${referralLink}`)}` },
        ].map(s => (
          <button key={s.label} onClick={() => window.open(s.url, "_blank")}
            className="flex-1 py-2 text-xs text-white/40 border border-white/8 hover:border-white/20 transition-colors">
            {s.label}
          </button>
        ))}
      </div>

      <label className={`flex items-start gap-3 p-4 cursor-pointer border transition-colors ${linkConfirmed ? "border-cyan-400/50 bg-cyan-400/5" : "border-white/8 bg-white/3"}`}>
        <input type="checkbox" checked={linkConfirmed} onChange={e => setLinkConfirmed(e.target.checked)} className="mt-0.5 w-4 h-4 flex-shrink-0" />
        <span className="text-xs text-white/60 leading-relaxed">
          I've saved my referral link. I understand the agent will post it on social media on my behalf to drive traffic and earn me commissions.
        </span>
      </label>

      <Button className="w-full h-12 text-base" onClick={handleActivate}
        disabled={!linkConfirmed || loading}
        style={{ background: linkConfirmed ? undefined : "rgba(255,255,255,0.1)", cursor: linkConfirmed ? "pointer" : "not-allowed" }}>
        {loading ? "ACTIVATING..." : "ACTIVATE MY SLOT →"}
      </Button>
    </div>
  );

  // STEP 3: Active!
  if (step === "active") return wrapper(
    <div className="text-center space-y-6">
      <div className="text-5xl">🤖</div>
      <div>
        <p className="text-xs text-green-400/80 tracking-widest mb-2">// SLOT ACTIVE</p>
        <h2 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 44, lineHeight: 1 }}>
          {agentData?.agent?.name}<br /><span className="text-green-400">IS LIVE.</span>
        </h2>
      </div>
      <p className="text-xs text-white/45 leading-relaxed max-w-xs mx-auto">
        Your slot is active for <strong className="text-white">24 hours</strong>.<br />
        The agent is now rotating your link across TikTok, Instagram, X, and LinkedIn.<br /><br />
        Every click. Every signup. <strong className="text-cyan-400">Your commission.</strong>
      </p>
      {expiresAt && <CountdownTimer expiresAt={expiresAt} />}
      <Button className="w-full h-12 text-base" onClick={() => navigate("/vessel/dashboard")}>
        VIEW DASHBOARD →
      </Button>
    </div>
  );

  return null;
}

function StepBar({ current }: { current: 1 | 2 | 3 }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3].map(n => (
        <div key={n} className={`h-0.5 flex-1 transition-all ${n < current ? "bg-cyan-400" : n === current ? "bg-cyan-400/40" : "bg-white/8"}`} />
      ))}
    </div>
  );
}

function CountdownTimer({ expiresAt }: { expiresAt: Date }) {
  const [display, setDisplay] = useState("24:00:00");
  useEffect(() => {
    const tick = () => {
      const d = Math.max(0, expiresAt.getTime() - Date.now());
      const h = String(Math.floor(d / 3600000)).padStart(2, "0");
      const m = String(Math.floor((d % 3600000) / 60000)).padStart(2, "0");
      const s = String(Math.floor((d % 60000) / 1000)).padStart(2, "0");
      setDisplay(`${h}:${m}:${s}`);
    };
    tick(); const id = setInterval(tick, 1000); return () => clearInterval(id);
  }, [expiresAt]);
  return (
    <div className="border border-cyan-400/20 p-4 bg-white/3 max-w-xs mx-auto">
      <p className="text-xs text-white/25 tracking-widest mb-1">SLOT EXPIRES IN</p>
      <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 52, letterSpacing: 4 }} className="text-cyan-400">{display}</div>
    </div>
  );
}
