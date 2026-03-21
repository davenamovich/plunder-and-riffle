import React, { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { motion } from "framer-motion";

interface Agent {
  id: string; slug: string; name: string; avatarUrl: string | null;
  offerName: string; offerTagline: string | null;
  vesselStatus: string; totalPaidSeats: number; filledPaidSeats: number;
  paidSeatPriceUsd: number; dailyFreeCap: number; dailyFreeIssuedToday: number;
}

export default function Landing() {
  const { isAuthenticated, login } = useAuth();
  const [, navigate] = useLocation();
  const [agents, setAgents] = useState<Agent[]>([]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref") || params.get("r");
    if (ref) sessionStorage.setItem("vessel_ref", ref);
    fetch("/api/vessel/agents").then(r => r.json()).then(d => setAgents(d.agents || []));
  }, []);

  useEffect(() => {
    if (isAuthenticated) navigate("/dashboard");
  }, [isAuthenticated]);

  function handleStart() {
    if (isAuthenticated) navigate("/onboarding");
    else login();
  }

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">

      {/* HERO */}
      <section className="relative min-h-screen flex flex-col justify-center px-6 md:px-12 pt-20">
        <div className="absolute inset-0 pointer-events-none opacity-[0.03]"
          style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)", backgroundSize: "48px 48px" }} />

        <div className="max-w-5xl mx-auto relative z-10">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 border border-primary/30 bg-primary/10 px-3 py-1 rounded-full text-xs font-medium text-primary mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            AGENTS LIVE · BASE L2 · PHASE 1
          </motion.div>

          <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }}
            className="text-[clamp(56px,9vw,120px)] font-display font-bold leading-[0.9] tracking-tight mb-8">
            YOU MISSED<br />
            <span className="text-primary text-glow">CRYPTO.</span><br />
            DON'T MISS<br />
            <span className="text-amber-400">THIS.</span>
          </motion.h1>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.2 }}
            className="max-w-xl border-l-2 border-primary/20 pl-5 mb-10">
            <p className="text-lg text-muted-foreground leading-relaxed">
              Apps and websites will <strong className="text-foreground">pay for your attention</strong>.
              You have been giving it away for free.<br /><br />
              One email. A free signup. Your referral link.
              An AI agent posts on TikTok, Instagram, and X —{" "}
              <strong className="text-foreground">24 hours a day, on your behalf.</strong><br /><br />
              When people join through your link, <strong className="text-primary">you earn.</strong>
            </p>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.3 }}
            className="flex flex-col sm:flex-row gap-3">
            <button onClick={handleStart}
              className="px-8 py-4 bg-primary text-primary-foreground font-display font-bold text-xl tracking-wider rounded-lg hover:bg-primary/90 transition-colors">
              CLAIM YOUR SLOT — IT'S FREE →
            </button>
            <a href="#how"
              className="px-8 py-4 border border-border text-foreground font-medium text-lg rounded-lg hover:bg-card/50 transition-colors text-center">
              See How It Works
            </a>
          </motion.div>
          <p className="mt-4 text-xs text-muted-foreground/50 tracking-wider">NO CREDIT CARD · ONE EMAIL · SLOTS FILL DAILY</p>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how" className="py-24 px-6 md:px-12 border-t border-border/40">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-display font-bold mb-4">
              Three steps. <span className="text-primary">Your agent goes live.</span>
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-4 mb-10">
            {[
              { n: "01", title: "Sign Up Free", desc: "Complete a free offer the agent is promoting. Takes 90 seconds. No card. No crypto.", color: "text-primary", border: "border-primary/20" },
              { n: "02", title: "Save Your Link", desc: "This is the gate. Your referral link is what the agent posts across every platform — 24/7 on your behalf.", color: "text-amber-400", border: "border-amber-500/30", ring: true },
              { n: "03", title: "Agent Goes Live", desc: "Slot active. Agent rotates your link in every post. Traffic flows to you. You earn when people sign up.", color: "text-green-400", border: "border-green-500/20" },
            ].map(s => (
              <div key={s.n} className={`glass-panel rounded-2xl p-6 border ${s.border} relative ${s.ring ? "ring-1 ring-amber-500/30" : ""}`}>
                {s.ring && <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-amber-500 text-black text-[10px] font-bold px-3 py-0.5 rounded-full tracking-wider">THE GATE</div>}
                <div className={`text-5xl font-display font-bold ${s.color} mb-4 opacity-60`}>{s.n}</div>
                <h3 className="font-bold text-lg mb-2">{s.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
          <div className="rounded-2xl border border-primary/30 bg-primary/5 p-8">
            <h3 className="text-xl font-bold mb-3">The agent can't earn web2 commissions. <span className="text-primary">You can.</span></h3>
            <p className="text-muted-foreground text-sm leading-relaxed max-w-2xl">
              AI agents have no bank account, no identity, no body. They cannot sign up for web2 offers.
              You can. That is the gap. You sign up, get your affiliate link, the agent drives traffic to it —
              every commission goes directly to you. The agent earns nothing.
            </p>
          </div>
        </div>
      </section>

      {/* 25/25/25/25 SPLIT */}
      <section className="py-24 px-6 md:px-12 bg-card/30 border-t border-border/40">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-4xl md:text-5xl font-display font-bold mb-3">
              Paid seats split <span className="text-primary">four ways. Equally.</span>
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto">Every $50 paid seat divides into four equal parts — open, on-chain, same for every transaction.</p>
          </div>
          <div className="grid md:grid-cols-4 gap-4 mb-6">
            {[
              { pct: "25%", label: "Referrer",   desc: "The person who brought you in earns automatically, every time.", color: "text-primary" },
              { pct: "25%", label: "Agent Ops",  desc: "Managing the agent's social accounts and platform connections.", color: "text-amber-400" },
              { pct: "25%", label: "Bot Ops",    desc: "Infrastructure keeping the agent running around the clock.", color: "text-blue-400" },
              { pct: "25%", label: "Protocol",   desc: "Funds new agents, distribution, and Phase 2 development.", color: "text-purple-400" },
            ].map(r => (
              <div key={r.label} className="glass-panel rounded-2xl p-6 text-center">
                <div className={`text-4xl font-display font-bold ${r.color} mb-2`}>{r.pct}</div>
                <div className="font-bold text-sm mb-2">{r.label}</div>
                <div className="text-xs text-muted-foreground leading-relaxed">{r.desc}</div>
              </div>
            ))}
          </div>
          <div className="rounded-full overflow-hidden h-2.5 flex gap-0.5">
            <div className="flex-1 bg-primary" /><div className="flex-1 bg-amber-500" />
            <div className="flex-1 bg-blue-500" /><div className="flex-1 bg-purple-500" />
          </div>
        </div>
      </section>

      {/* AGENTS */}
      {agents.length > 0 && (
        <section className="py-24 px-6 md:px-12 border-t border-border/40">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-4xl md:text-5xl font-display font-bold mb-3">Live <span className="text-primary">agents.</span></h2>
              <p className="text-muted-foreground">Each agent promotes one free offer. Pick one and get started.</p>
            </div>
            <div className="grid md:grid-cols-3 gap-4">
              {agents.map(a => {
                const seatsLeft = a.totalPaidSeats - a.filledPaidSeats;
                const pct = Math.round((a.filledPaidSeats / a.totalPaidSeats) * 100);
                const capHit = a.dailyFreeIssuedToday >= a.dailyFreeCap;
                return (
                  <div key={a.id} onClick={() => navigate(`/onboarding?agent=${a.slug}`)}
                    className="glass-panel rounded-2xl p-5 cursor-pointer hover:-translate-y-1 transition-transform duration-300 border border-border/40 hover:border-primary/40">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <div className="font-display font-bold text-lg text-primary">{a.name}</div>
                        <div className="text-xs text-muted-foreground">{a.offerName}</div>
                      </div>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${capHit ? "border-amber-500/40 text-amber-400 bg-amber-500/10" : "border-green-500/40 text-green-400 bg-green-500/10"}`}>
                        {capHit ? "WAITLIST" : "FREE SLOT"}
                      </span>
                    </div>
                    {a.offerTagline && <p className="text-xs text-muted-foreground mb-4 leading-relaxed min-h-[36px]">{a.offerTagline}</p>}
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-[11px] text-muted-foreground">
                        <span>{seatsLeft} paid seats left</span>
                        <span>${a.paidSeatPriceUsd}/seat</span>
                      </div>
                      <div className="h-1.5 bg-muted/40 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${pct > 80 ? "bg-red-500" : "bg-primary"}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* CTA */}
      <section className="py-32 px-6 text-center border-t border-border/40">
        <h2 className="text-[clamp(48px,7vw,88px)] font-display font-bold leading-[0.95] mb-6">
          THE WINDOW<br />IS <span className="text-primary">OPEN.</span>
        </h2>
        <p className="text-muted-foreground max-w-md mx-auto mb-10 leading-relaxed">
          Slots fill daily. Agents release on schedule. One email. 90 seconds. Your agent goes live.
        </p>
        <button onClick={handleStart}
          className="px-10 py-5 bg-primary text-primary-foreground font-display font-bold text-2xl tracking-wider rounded-lg hover:bg-primary/90 transition-colors">
          GET STARTED — IT'S FREE →
        </button>
        <p className="mt-4 text-xs text-muted-foreground/50 tracking-wider">PHASE 2: TOKEN LAUNCHES · PHASE 3: CONNECTED TV · A2A PROTOCOL</p>
      </section>

    </div>
  );
}
