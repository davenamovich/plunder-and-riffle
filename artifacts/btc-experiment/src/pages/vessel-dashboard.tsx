/**
 * VESSEL PROTOCOL — User Dashboard
 * Route: /vessel/dashboard
 */

import React, { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Copy, Check } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const APP_URL = window.location.origin;

export default function VesselDashboard() {
  const { user, isAuthenticated, login, token } = useAuth();
  const [, navigate] = useLocation();
  const [data,       setData]       = useState<any>(null);
  const [loading,    setLoading]    = useState(true);
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) { login(); return; }
    fetch("/api/vessel/me", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => { if (d.ok) setData(d); }).finally(() => setLoading(false));
  }, [isAuthenticated, token]);

  function copyLink() {
    const link = data?.referralLink || `${APP_URL}/r/${user?.referralCode}`;
    navigator.clipboard.writeText(link).then(() => { setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2500); });
  }

  const activeSlots  = data?.slots?.filter((s: any) => s.slot.status === "active") ?? [];
  const pendingSlots = data?.slots?.filter((s: any) => ["pending_offer","pending_link_save"].includes(s.slot.status)) ?? [];
  const refLink      = data?.referralLink || `${APP_URL}/r/${user?.referralCode}`;

  if (loading) return (
    <div className="min-h-screen bg-black flex items-center justify-center text-white/30 text-xs tracking-widest" style={{ fontFamily: "'DM Mono', monospace" }}>
      LOADING...
    </div>
  );

  return (
    <div className="min-h-screen bg-black text-white" style={{ fontFamily: "'DM Mono', monospace" }}>
      <nav className="sticky top-0 z-50 flex justify-between items-center px-8 py-4 bg-black/95 border-b border-white/5">
        <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, letterSpacing: 5 }} className="text-cyan-400">VESSEL PROTOCOL</span>
        <div className="flex gap-6 items-center text-xs text-white/30">
          <button onClick={() => navigate("/vessel/agents")} className="hover:text-white transition-colors tracking-widest">AGENTS</button>
          <span>{user?.email}</span>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-4">

        {/* REFERRAL LINK — THE MAIN EVENT */}
        <div className="border border-amber-400/35 p-6 bg-amber-400/3">
          <p className="text-xs text-amber-400 tracking-widest mb-2">// YOUR REFERRAL LINK — THIS IS WHAT THE AGENTS POST</p>
          <h2 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, letterSpacing: 2 }} className="mb-2">
            EVERY AGENT WITH AN ACTIVE SLOT ROTATES THIS LINK
          </h2>
          <p className="text-xs text-white/40 leading-relaxed mb-5">
            When someone clicks and joins through it — <span className="text-cyan-400">that's your commission. 25% of the split, on-chain.</span>
          </p>
          <div className="flex gap-3 items-center border border-amber-400/25 p-3 bg-black/40 mb-3">
            <span className="text-amber-400 text-sm flex-1 truncate">{refLink}</span>
            <button onClick={copyLink}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold transition-colors flex-shrink-0 ${linkCopied ? "bg-green-400 text-black" : "bg-amber-400 text-black"}`}>
              {linkCopied ? <><Check className="h-3 w-3" /> COPIED</> : <><Copy className="h-3 w-3" /> COPY</>}
            </button>
          </div>
          <div className="flex gap-2">
            {[
              { l: "𝕏 Twitter", u: `https://twitter.com/intent/tweet?text=${encodeURIComponent(`Join the agentic economy. Free entry: ${refLink}`)}` },
              { l: "WhatsApp",  u: `https://wa.me/?text=${encodeURIComponent(`My AI agent works for me 24/7. Free to join: ${refLink}`)}` },
            ].map(s => (
              <button key={s.l} onClick={() => window.open(s.u, "_blank")}
                className="px-4 py-2 text-xs text-white/35 border border-white/8 hover:border-white/20 transition-colors">
                {s.l}
              </button>
            ))}
          </div>
        </div>

        {/* STATS */}
        <div className="grid grid-cols-3 gap-px">
          {[
            { v: data?.timesRotated ?? 0,                    l: "Times Posted",   c: "text-cyan-400",  s: "your link was distributed" },
            { v: `$${(data?.totalEarned ?? 0).toFixed(2)}`,  l: "Total Earned",   c: "text-green-400", s: "in commission splits" },
            { v: activeSlots.length,                          l: "Active Slots",   c: "text-amber-400", s: "agents working now" },
          ].map((s, i) => (
            <div key={i} className="bg-white/3 border border-white/6 p-4">
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 40, lineHeight: 1 }} className={s.c}>{s.v}</div>
              <div className="text-xs tracking-widest text-white/50 mt-1 uppercase">{s.l}</div>
              <div className="text-xs text-white/20 mt-0.5">{s.s}</div>
            </div>
          ))}
        </div>

        {/* ACTIVE SLOTS */}
        <div>
          <p className="text-xs text-cyan-400/60 tracking-widest mb-3">// ACTIVE AGENTS</p>
          {activeSlots.length === 0 ? (
            <div className="border border-white/6 p-10 text-center space-y-4">
              <p style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, letterSpacing: 2 }} className="text-white/20">NO ACTIVE SLOTS</p>
              <p className="text-xs text-white/30 leading-relaxed">Your agents aren't working yet.<br />Pick an agent and complete a free offer to start.</p>
              <Button onClick={() => navigate("/vessel/agents")} variant="outline">BROWSE AGENTS →</Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {activeSlots.map(({ slot, agent, config }: any) => {
                const expires   = new Date(slot.expiresAt);
                const isExpiring = expires.getTime() - Date.now() < 3 * 60 * 60 * 1000;
                return (
                  <div key={slot.id} className={`border p-4 bg-white/3 ${isExpiring ? "border-red-400/25" : "border-green-400/15"}`}>
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 17, letterSpacing: 2 }} className="text-cyan-400">{agent.name}</div>
                        <div className="text-xs text-white/30">{config?.offerName}</div>
                      </div>
                      <span className="text-xs text-green-400 border border-green-400/20 px-2 py-0.5">LIVE</span>
                    </div>
                    <div className="grid grid-cols-2 gap-1 mb-3">
                      <div className="bg-black/40 p-2">
                        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22 }} className="text-cyan-400">{slot.timesRotated}</div>
                        <div className="text-xs text-white/25">Times Posted</div>
                      </div>
                      <div className="bg-black/40 p-2">
                        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 16 }} className={isExpiring ? "text-red-400" : "text-amber-400"}>
                          {formatDistanceToNow(expires)}
                        </div>
                        <div className="text-xs text-white/25">Remaining</div>
                      </div>
                    </div>
                    <Button size="sm" variant="outline" className="w-full text-xs"
                      onClick={() => navigate(`/vessel/onboard/${agent.slug}`)}>
                      RENEW SLOT
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* PENDING */}
        {pendingSlots.length > 0 && (
          <div>
            <p className="text-xs text-amber-400/60 tracking-widest mb-3">// INCOMPLETE — ACTION NEEDED</p>
            {pendingSlots.map(({ slot, agent }: any) => (
              <div key={slot.id} className="border border-amber-400/20 p-3 flex justify-between items-center mb-2">
                <div>
                  <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 14 }}>{agent.name}</div>
                  <div className="text-xs text-white/30">
                    {slot.status === "pending_offer" ? "Complete the free offer to activate" : "Save your referral link to activate"}
                  </div>
                </div>
                <Button size="sm" onClick={() => navigate(`/vessel/onboard/${agent.slug}`)}>CONTINUE →</Button>
              </div>
            ))}
          </div>
        )}

        {/* MORE AGENTS CTA */}
        <div className="border border-cyan-400/10 p-5 flex justify-between items-center bg-white/2">
          <div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, letterSpacing: 2 }} className="mb-1">MORE AGENTS = MORE DISTRIBUTION</div>
            <div className="text-xs text-white/35 leading-relaxed">Each agent rotates your link to a different audience on a different platform.</div>
          </div>
          <Button onClick={() => navigate("/vessel/agents")} className="flex-shrink-0 ml-6">ADD AGENT →</Button>
        </div>

      </div>
    </div>
  );
}
