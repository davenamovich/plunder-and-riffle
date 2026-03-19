import React, { useEffect, useState, useRef } from "react";
import { useRoute } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Bot, CheckCircle, Zap, TrendingUp, Clock, DollarSign, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

interface AgentPreview {
  name: string;
  slug: string;
  description: string | null;
  avatarUrl: string | null;
  totalClicks: number;
}

const PAIN_POINTS = [
  { icon: Clock, text: "Posting daily with nothing to show for it" },
  { icon: TrendingUp, text: "Watching others build income while yours stays flat" },
  { icon: DollarSign, text: "Affiliate links sitting idle — no system, no traffic" },
  { icon: Bot, text: "No AI working for you around the clock" },
];

const SOCIAL_PROOF_COUNT = 847;

export default function ReferralLanding() {
  const [, params] = useRoute("/join/:agentSlug");
  const agentSlug = params?.agentSlug ?? "ralph";

  const [agent, setAgent] = useState<AgentPreview | null>(null);
  const [agentLoading, setAgentLoading] = useState(true);

  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(`/api/rotator/land/${agentSlug}`)
      .then(r => r.json())
      .then(d => {
        if (d.agent) setAgent(d.agent);
        setAgentLoading(false);
        if (d.referrer?.slug) sessionStorage.setItem("btc_ref", d.referrer.slug);
      })
      .catch(() => setAgentLoading(false));
  }, [agentSlug]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes("@")) {
      setError("Enter a valid email address.");
      inputRef.current?.focus();
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const resp = await fetch(`/api/rotator/capture/${agentSlug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });
      const data = await resp.json();
      if (!resp.ok || !data.redirectUrl) {
        setError("Something went wrong. Try again.");
        setSubmitting(false);
        return;
      }
      setSubmitted(true);
      // Small pause so the success state is visible, then redirect
      setTimeout(() => { window.location.href = data.redirectUrl; }, 900);
    } catch {
      setError("Network error — please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background relative overflow-hidden flex flex-col">
      {/* Ambient glows */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[400px] bg-primary/8 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-amber-500/6 rounded-full blur-[100px] pointer-events-none" />

      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 py-16">
        <div className="w-full max-w-lg mx-auto">

          {/* Agent badge */}
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex justify-center mb-8"
          >
            {agentLoading ? (
              <Skeleton className="h-8 w-48 rounded-full" />
            ) : (
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-sm text-primary font-medium">
                <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                {agent?.name ?? "Plunder and Riffle"} — AI Agent Active
              </div>
            )}
          </motion.div>

          {/* Headline */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 }}
            className="text-center mb-6"
          >
            <h1 className="text-4xl sm:text-5xl font-bold font-display tracking-tight leading-[1.1] mb-5">
              You're posting.<br />
              <span className="text-primary">Nothing is working.</span><br />
              There's a fix.
            </h1>
            <p className="text-muted-foreground text-lg leading-relaxed max-w-md mx-auto">
              An AI agent rotates your affiliate link in front of{" "}
              <span className="text-foreground font-semibold">real, targeted traffic</span> — every day,
              without you touching it.
            </p>
          </motion.div>

          {/* Pain points */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="grid grid-cols-2 gap-2.5 mb-8"
          >
            {PAIN_POINTS.map((p, i) => (
              <div
                key={i}
                className="flex items-start gap-2.5 p-3 rounded-xl bg-card/40 border border-border/30 backdrop-blur-sm"
              >
                <div className="w-7 h-7 rounded-lg bg-destructive/10 border border-destructive/20 flex items-center justify-center shrink-0 mt-0.5">
                  <p.icon className="w-3.5 h-3.5 text-destructive/80" />
                </div>
                <p className="text-xs text-muted-foreground leading-snug">{p.text}</p>
              </div>
            ))}
          </motion.div>

          {/* Email form */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.22 }}
          >
            <AnimatePresence mode="wait">
              {submitted ? (
                <motion.div
                  key="success"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex flex-col items-center gap-3 py-8 text-center"
                >
                  <div className="w-14 h-14 rounded-full bg-green-500/15 border border-green-500/30 flex items-center justify-center">
                    <CheckCircle className="w-7 h-7 text-green-400" />
                  </div>
                  <p className="font-semibold text-lg">You're in. Redirecting…</p>
                  <p className="text-sm text-muted-foreground">Taking you to your first resource now.</p>
                </motion.div>
              ) : (
                <motion.form
                  key="form"
                  onSubmit={handleSubmit}
                  className="space-y-3"
                >
                  <div className="relative">
                    <Input
                      ref={inputRef}
                      type="email"
                      placeholder="your@email.com"
                      value={email}
                      onChange={e => { setEmail(e.target.value); setError(null); }}
                      className="h-14 text-base pl-5 pr-36 rounded-2xl border-border/60 bg-card/60 backdrop-blur-sm focus-visible:border-primary/60 focus-visible:ring-primary/20"
                      disabled={submitting}
                      autoComplete="email"
                    />
                    <Button
                      type="submit"
                      disabled={submitting}
                      className="absolute right-1.5 top-1.5 h-11 px-5 rounded-xl font-semibold bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20 gap-1.5"
                    >
                      {submitting ? (
                        <span className="flex items-center gap-1.5">
                          <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                          Hold on…
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5">
                          Get Access <ArrowRight className="w-4 h-4" />
                        </span>
                      )}
                    </Button>
                  </div>

                  <AnimatePresence>
                    {error && (
                      <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="flex items-center gap-2 text-sm text-destructive"
                      >
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        {error}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <p className="text-center text-xs text-muted-foreground pt-1">
                    No spam. One email, then you're in the system.
                  </p>
                </motion.form>
              )}
            </AnimatePresence>
          </motion.div>

          {/* Social proof strip */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.35 }}
            className="mt-8 flex items-center justify-center gap-6 text-xs text-muted-foreground"
          >
            <div className="flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-primary" />
              <span><span className="text-foreground font-semibold">{SOCIAL_PROOF_COUNT.toLocaleString()}</span> referrals sent</span>
            </div>
            <div className="w-px h-4 bg-border" />
            <div className="flex items-center gap-1.5">
              <Bot className="w-3.5 h-3.5 text-primary" />
              <span>AI posts while you sleep</span>
            </div>
            <div className="w-px h-4 bg-border" />
            <div className="flex items-center gap-1.5">
              <CheckCircle className="w-3.5 h-3.5 text-green-400" />
              <span>Free to start</span>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Footer */}
      <div className="relative z-10 text-center pb-6">
        <p className="text-xs text-muted-foreground/60">
          Powered by{" "}
          <a href="/" className="hover:text-primary transition-colors font-medium">
            Plunder and Riffle
          </a>
        </p>
      </div>
    </div>
  );
}
