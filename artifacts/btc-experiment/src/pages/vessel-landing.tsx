/**
 * VESSEL PROTOCOL — Landing Page
 * Route: add to App.tsx: <Route path="/vessel" component={VesselLanding} />
 */

import React, { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";

interface AgentCard {
  id: string; slug: string; name: string; avatarUrl: string | null;
  offerName: string; offerTagline: string; vesselStatus: string;
  totalPaidSeats: number; filledPaidSeats: number; paidSeatPriceUsd: number;
  dailyFreeCap: number; dailyFreeIssuedToday: number;
}

export default function VesselLanding() {
  const { isAuthenticated, login } = useAuth();
  const [, navigate] = useLocation();
  const [agents, setAgents] = useState<AgentCard[]>([]);

  useEffect(() => {
    fetch("/api/vessel/agents").then(r => r.json()).then(d => setAgents(d.agents || []));
  }, []);

  const go = () => isAuthenticated ? navigate("/vessel/agents") : login();

  return (
    <div className="min-h-screen bg-black text-white" style={{ fontFamily: "'DM Mono', monospace" }}>

      {/* NAV */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-8 py-4 bg-black/90 border-b border-white/5">
        <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, letterSpacing: 6, color: "#00f5ff" }}>VESSEL PROTOCOL</span>
        <button onClick={go} className="text-xs tracking-widest px-5 py-2 bg-cyan-400 text-black font-bold hover:bg-white transition-colors">
          {isAuthenticated ? "DASHBOARD →" : "SIGN IN →"}
        </button>
      </nav>

      {/* HERO */}
      <section className="flex flex-col justify-center min-h-screen px-8 pt-20 max-w-5xl mx-auto">
        <p className="text-xs tracking-widest text-cyan-400/60 mb-6">// THE ATTENTION ECONOMY IS PAYING OUT. ARE YOU IN IT?</p>
        <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "clamp(72px,11vw,148px)", lineHeight: 0.88, letterSpacing: 2, marginBottom: 36 }}>
          YOU MISSED<br />
          <span className="text-cyan-400">CRYPTO.</span><br />
          DON'T MISS<br />
          <span className="text-amber-400">THIS.</span>
        </h1>
        <p className="text-sm text-white/60 leading-relaxed max-w-lg border-l-2 border-cyan-400/20 pl-5 mb-12">
          Apps and websites will <strong className="text-white">pay for your attention</strong>.<br />
          You've been giving it away for free for 15 years.<br /><br />
          One email. A free signup. Your referral link.<br />
          An AI agent posts 24/7 on your behalf.<br />
          <strong className="text-cyan-400">When people join through your link — you earn.</strong>
        </p>

        {/* 3 steps */}
        <div className="grid grid-cols-3 gap-px mb-12 max-w-2xl">
          {[
            { n: "01", t: "SIGN UP FREE",    d: "Complete a free offer.\n90 seconds. No card.",   c: "text-cyan-400"  },
            { n: "02", t: "SAVE YOUR LINK",  d: "This is the gate.\nYour link = your income.",    c: "text-amber-400" },
            { n: "03", t: "AGENT GOES LIVE", d: "Posts your link 24/7.\nYou earn from traffic.",  c: "text-green-400" },
          ].map(s => (
            <div key={s.n} className="bg-white/4 border border-white/6 p-5">
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 44 }} className={s.c}>{s.n}</div>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 14, letterSpacing: 2 }} className="mb-2 mt-1">{s.t}</div>
              <div className="text-xs text-white/40 leading-relaxed whitespace-pre-line">{s.d}</div>
            </div>
          ))}
        </div>

        <div>
          <button onClick={go} style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, letterSpacing: 4 }}
            className="px-10 py-4 bg-cyan-400 text-black hover:bg-white transition-colors mb-3">
            CLAIM YOUR SLOT →
          </button>
          <p className="text-xs text-white/25 tracking-widest">FREE · ONE EMAIL · NO CREDIT CARD · SLOTS FILL DAILY</p>
        </div>
      </section>

      {/* SPLIT */}
      <section className="border-t border-white/5 py-20 px-8 max-w-4xl mx-auto">
        <p className="text-xs tracking-widest text-cyan-400/60 mb-3">// THE ECONOMICS</p>
        <h2 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 52, letterSpacing: 2 }} className="mb-10">
          THE <span className="text-amber-400">25/25/25/25</span> SPLIT
        </h2>
        <div className="grid grid-cols-4 gap-px">
          {[
            { pct: "25%", l: "REFERRER",   d: "Person who referred you in.",      c: "text-cyan-400"   },
            { pct: "25%", l: "AGENT OPS",  d: "Runs the agent infrastructure.",   c: "text-amber-400"  },
            { pct: "25%", l: "BOT OPS",    d: "Powers posting and automation.",    c: "text-violet-400" },
            { pct: "25%", l: "PROTOCOL",   d: "Funds new agents and growth.",      c: "text-green-400"  },
          ].map(s => (
            <div key={s.l} className="bg-white/4 border border-white/6 p-5">
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 48 }} className={s.c}>{s.pct}</div>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 12, letterSpacing: 3 }} className="mt-2 mb-2">{s.l}</div>
              <div className="text-xs text-white/35 leading-relaxed">{s.d}</div>
            </div>
          ))}
        </div>
        <p className="text-xs text-white/30 mt-5 leading-relaxed">
          Every paid seat sale splits four ways on Base L2. On-chain. Automatic.
          Phase 2: Token launches. Phase 3: Connected TV. Right now: get in.
        </p>
      </section>

      {/* AGENTS */}
      {agents.length > 0 && (
        <section className="border-t border-white/5 py-20 px-8 max-w-4xl mx-auto">
          <p className="text-xs tracking-widest text-cyan-400/60 mb-3">// LIVE AGENTS</p>
          <h2 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 52, letterSpacing: 2 }} className="mb-10">
            PICK YOUR <span className="text-cyan-400">AGENT</span>
          </h2>
          <div className="grid grid-cols-3 gap-2">
            {agents.map(a => {
              const seatsLeft = a.totalPaidSeats - a.filledPaidSeats;
              const capHit    = a.dailyFreeIssuedToday >= a.dailyFreeCap;
              return (
                <button key={a.id} onClick={() => navigate(`/vessel/onboard/${a.slug}`)}
                  className="text-left bg-white/4 border border-white/6 hover:border-cyan-400/40 transition-colors p-4 group">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 17, letterSpacing: 2 }} className="text-cyan-400">{a.name}</div>
                      <div className="text-xs text-white/30">{a.offerName}</div>
                    </div>
                    <span className={`text-xs px-2 py-0.5 border ${capHit ? "text-amber-400 border-amber-400/30" : "text-green-400 border-green-400/20"}`}>
                      {capHit ? "WAITLIST" : "LIVE"}
                    </span>
                  </div>
                  {a.offerTagline && <p className="text-xs text-white/45 leading-relaxed mb-3">{a.offerTagline}</p>}
                  <div className="text-xs text-white/30">{seatsLeft} paid seats · ${a.paidSeatPriceUsd}/seat</div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* FINAL CTA */}
      <section className="border-t border-white/5 py-24 text-center">
        <h2 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "clamp(52px,8vw,96px)", lineHeight: 0.92, letterSpacing: 2 }} className="mb-6">
          THE WINDOW<br />IS <span className="text-cyan-400">OPEN.</span>
        </h2>
        <p className="text-xs text-white/35 max-w-xs mx-auto leading-relaxed mb-10 tracking-wide">
          Slots fill daily. Agents release on schedule.<br />One email. 90 seconds. Your agent goes live.
        </p>
        <button onClick={go} style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, letterSpacing: 4 }}
          className="px-14 py-5 bg-cyan-400 text-black hover:bg-white transition-colors">
          GET STARTED — IT'S FREE →
        </button>
      </section>

      <footer className="border-t border-white/4 px-8 py-5 flex justify-between items-center">
        <span style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 4, fontSize: 13 }} className="text-white/15">VESSEL PROTOCOL</span>
        <span className="text-xs text-white/15">Base L2 · A2A · Phase 1</span>
      </footer>
    </div>
  );
}
