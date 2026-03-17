import React, { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { useGetAgentStats, useLogin } from "@workspace/api-client-react";
import { ArrowRight, Bot, Zap, Coins, Users, ShieldCheck, Loader2 } from "lucide-react";
import { motion } from "framer-motion";

export default function Landing() {
  const { isAuthenticated, setToken } = useAuth();
  const [email, setEmail] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [showReferral, setShowReferral] = useState(false);

  const { data: stats } = useGetAgentStats("ralph", {
    query: { retry: false, refetchInterval: 30000 }
  });

  const { mutate: login, isPending, isSuccess } = useLogin({
    mutation: {
      onSuccess: (data) => {
        setToken(data.token);
      },
    },
  });

  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero Section */}
      <section className="relative pt-20 pb-32 lg:pt-32 lg:pb-48 overflow-hidden">
        {/* Background Image & Overlay */}
        <div className="absolute inset-0 z-0">
          <img 
            src={`${import.meta.env.BASE_URL}images/hero-bg.png`} 
            alt="Abstract tech background" 
            className="w-full h-full object-cover opacity-40"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-background/10 via-background/80 to-background" />
        </div>

        <div className="container relative z-10 mx-auto px-4 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-sm font-medium text-primary mb-8 backdrop-blur-md"
          >
            <Zap className="mr-2 h-4 w-4" />
            <span>The Agent is Live and Generating Leads</span>
          </motion.div>
          
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="max-w-4xl mx-auto text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-6"
          >
            Let the <span className="text-primary text-glow">Agent</span> Prove It First.
          </motion.h1>
          
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="max-w-2xl mx-auto text-lg md:text-xl text-muted-foreground mb-10"
          >
            Stop buying empty promises. Our AI agent does the hard work of finding leads. 
            Join today to get a free 24-hour spot in the agent's traffic rotator.
          </motion.p>
          
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="max-w-md mx-auto w-full"
          >
            {isAuthenticated ? (
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link href="/dashboard">
                  <Button size="lg" className="w-full sm:w-auto text-lg px-8 h-14">
                    Go to Dashboard <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
                <Link href="/agent/ralph">
                  <Button variant="outline" size="lg" className="w-full sm:w-auto text-lg px-8 h-14 glass-panel">
                    Watch the Agent
                  </Button>
                </Link>
              </div>
            ) : isSuccess ? (
              <div className="glass-panel rounded-2xl px-6 py-5 text-center border border-primary/30">
                <p className="text-primary font-semibold text-lg">You're in! 🎉</p>
                <p className="text-muted-foreground text-sm mt-1">Your free 24-hour rotator spot is being activated.</p>
                <Link href="/dashboard">
                  <Button className="mt-4 w-full" size="lg">Go to Dashboard <ArrowRight className="ml-2 h-4 w-4" /></Button>
                </Link>
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (email) login({ data: { email, referralCode: referralCode || undefined } });
                }}
                className="space-y-3"
              >
                <div className="flex gap-2">
                  <Input
                    type="email"
                    placeholder="your@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="h-14 text-base bg-background/60 border-border/60 backdrop-blur-sm flex-1"
                  />
                  <Button type="submit" size="lg" className="h-14 px-6 shrink-0" disabled={isPending}>
                    {isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <><span className="hidden sm:inline">Get My Free Spot</span><ArrowRight className="h-5 w-5 sm:ml-2" /></>}
                  </Button>
                </div>
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-primary transition-colors"
                    onClick={() => setShowReferral(!showReferral)}
                  >
                    {showReferral ? "Hide referral code" : "Have a referral code?"}
                  </button>
                  <Link href="/agent/ralph">
                    <span className="text-xs text-muted-foreground hover:text-primary transition-colors cursor-pointer">Watch the Agent →</span>
                  </Link>
                </div>
                {showReferral && (
                  <Input
                    type="text"
                    placeholder="Referral code (e.g. RALPH-123)"
                    value={referralCode}
                    onChange={(e) => setReferralCode(e.target.value)}
                    className="h-11 text-sm bg-background/60 border-border/60 backdrop-blur-sm"
                  />
                )}
                <p className="text-xs text-muted-foreground text-center">No credit card. No password. Just your email.</p>
              </form>
            )}
          </motion.div>

          {/* Live Stats */}
          {stats && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 1, delay: 0.6 }}
              className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto"
            >
              <div className="glass-panel rounded-xl p-4 flex flex-col items-center">
                <span className="text-3xl font-display font-bold text-foreground">{stats.todayLeads}</span>
                <span className="text-xs text-muted-foreground uppercase tracking-wider mt-1">Leads Today</span>
              </div>
              <div className="glass-panel rounded-xl p-4 flex flex-col items-center">
                <span className="text-3xl font-display font-bold text-foreground">{stats.activeFreeSlots + stats.activePaidSlots}</span>
                <span className="text-xs text-muted-foreground uppercase tracking-wider mt-1">Active Slots</span>
              </div>
              <div className="glass-panel rounded-xl p-4 flex flex-col items-center">
                <span className="text-3xl font-display font-bold text-foreground">{stats.totalClicks}</span>
                <span className="text-xs text-muted-foreground uppercase tracking-wider mt-1">Rotator Clicks</span>
              </div>
              <div className="glass-panel rounded-xl p-4 flex flex-col items-center">
                <span className="text-3xl font-display font-bold text-foreground">{stats.totalSignups}</span>
                <span className="text-xs text-muted-foreground uppercase tracking-wider mt-1">Total Users</span>
              </div>
            </motion.div>
          )}
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 relative overflow-hidden">
        <div className="absolute inset-0 bg-primary/5" />
        <div className="container relative z-10 mx-auto px-4 text-center">
          <ShieldCheck className="w-16 h-16 mx-auto text-primary mb-6" />
          <h2 className="text-3xl md:text-5xl font-bold mb-6">Ready to see the proof?</h2>
          <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto">
            No credit card required to start. Just an email to secure your free 24-hour rotator spot.
          </p>
          {isAuthenticated ? (
            <Link href="/dashboard">
              <Button size="lg" className="text-lg px-10 h-14">Go to Dashboard</Button>
            </Link>
          ) : (
            <Button size="lg" className="text-lg px-10 h-14" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
              Claim Free Spot Now
            </Button>
          )}
        </div>
      </section>

      {/* How it Works */}
      <section className="py-24 bg-card/50 relative">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">How The Experiment Works</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              A transparent, verifiable loop where value is proven before you ever have to scale.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            <div className="relative glass-panel p-8 rounded-2xl text-center group hover:-translate-y-1 transition-transform duration-300">
              <div className="absolute -top-6 left-1/2 -translate-x-1/2 w-12 h-12 rounded-full bg-primary/20 border border-primary/50 text-primary flex items-center justify-center font-bold text-lg box-glow">1</div>
              <Bot className="w-12 h-12 mx-auto text-primary mb-6 mt-4" />
              <h3 className="text-xl font-bold mb-3">The Agent Works</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Our autonomous agent constantly engages across platforms, generating high-quality leads and driving traffic back to the platform.
              </p>
            </div>
            
            <div className="relative glass-panel p-8 rounded-2xl text-center group hover:-translate-y-1 transition-transform duration-300">
              <div className="absolute -top-6 left-1/2 -translate-x-1/2 w-12 h-12 rounded-full bg-primary/20 border border-primary/50 text-primary flex items-center justify-center font-bold text-lg box-glow">2</div>
              <Users className="w-12 h-12 mx-auto text-primary mb-6 mt-4" />
              <h3 className="text-xl font-bold mb-3">You Get The Traffic</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Sign up and join a qualifying offer to unlock a free 24-hour slot in the agent's rotator. All traffic flows directly to your personalized links.
              </p>
            </div>

            <div className="relative glass-panel p-8 rounded-2xl text-center group hover:-translate-y-1 transition-transform duration-300">
              <div className="absolute -top-6 left-1/2 -translate-x-1/2 w-12 h-12 rounded-full bg-primary/20 border border-primary/50 text-primary flex items-center justify-center font-bold text-lg box-glow">3</div>
              <Coins className="w-12 h-12 mx-auto text-primary mb-6 mt-4" />
              <h3 className="text-xl font-bold mb-3">Scale What Works</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Once the free traffic proves its value, you can optionally purchase paid rotator slots to capture a higher volume of the agent's output.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
