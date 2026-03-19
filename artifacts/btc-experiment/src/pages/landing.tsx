import React, { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useGetAgentStats } from "@workspace/api-client-react";
import { ArrowRight, Bot, Zap, Coins, Users, Link as LinkIcon, DollarSign, Shield, Layers, Repeat2, Bitcoin, Clock, TrendingUp, AlertTriangle, Brain, Globe, ChevronRight, Eye, Cpu } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { COMMON_ROLES } from "@/lib/icp";

const ROTATING_ROLES = [
  "Business Owner",
  "Salon Owner",
  "Realtor",
  "Creator",
  "Freelancer",
  "Student",
  "Gym Owner",
  "Insurance Agent",
  "Restaurant Owner",
  "Dasher",
];

export default function Landing() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const search = useSearch();
  const [selectedRole, setSelectedRole] = useState("");
  const [customRole, setCustomRole] = useState("");
  const [rotatorIndex, setRotatorIndex] = useState(0);

  const { data: stats } = useGetAgentStats("ralph", {
    query: { retry: false, refetchInterval: 30000 },
  });

  // Capture referral code from URL (?ref=CODE or ?r=SLUG) and persist to sessionStorage
  useEffect(() => {
    const params = new URLSearchParams(search);
    const ref = params.get("ref") || params.get("r");
    if (ref) sessionStorage.setItem("btc_ref", ref);
  }, [search]);

  // Cycle through roles in the hero
  useEffect(() => {
    const id = setInterval(() => {
      setRotatorIndex((i) => (i + 1) % ROTATING_ROLES.length);
    }, 2200);
    return () => clearInterval(id);
  }, []);

  const activeRole = customRole.trim() || selectedRole;

  function handleStart() {
    const role = activeRole || "Business Owner";
    const ref = sessionStorage.getItem("btc_ref") || new URLSearchParams(search).get("ref") || "";
    const refPart = ref ? `&ref=${encodeURIComponent(ref)}` : "";
    navigate(`/icp?role=${encodeURIComponent(role)}${refPart}`);
  }

  if (isAuthenticated) {
    return (
      <div className="flex flex-col min-h-screen">
        <section className="relative pt-20 pb-32 lg:pt-32 lg:pb-48 overflow-hidden">
          <div className="absolute inset-0 z-0">
            <img
              src={`${import.meta.env.BASE_URL}images/hero-bg.png`}
              alt=""
              className="w-full h-full object-cover opacity-40"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-background/10 via-background/80 to-background" />
          </div>
          <div className="container relative z-10 mx-auto px-4 text-center">
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-4xl mx-auto text-5xl md:text-6xl font-bold tracking-tight mb-6"
            >
              Let the <span className="text-primary text-glow">Agent</span> Prove It First.
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="max-w-2xl mx-auto text-lg text-muted-foreground mb-10"
            >
              You're in the system. Check your dashboard for live stats and your rotator slot.
            </motion.p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button size="lg" className="h-14 px-8 text-lg" onClick={() => navigate("/dashboard")}>
                Go to Dashboard <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="h-14 px-8 text-lg glass-panel"
                onClick={() => navigate("/agent/ralph")}
              >
                Watch the Agent
              </Button>
            </div>
          </div>
        </section>
        <HowItWorksSection />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero */}
      <section className="relative pt-20 pb-16 lg:pt-32 lg:pb-24 overflow-hidden">
        <div className="absolute inset-0 z-0">
          <img
            src={`${import.meta.env.BASE_URL}images/hero-bg.png`}
            alt=""
            className="w-full h-full object-cover opacity-40"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-background/10 via-background/80 to-background" />
        </div>

        <div className="container relative z-10 mx-auto px-4 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-sm font-medium text-primary mb-8 backdrop-blur-md"
          >
            <Zap className="mr-2 h-4 w-4" />
            <span>The Agent is Live — 24-Hour Free Trial Active</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="max-w-4xl mx-auto text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-4"
          >
            Everyone will have
            <br />
            <span className="text-primary text-glow">an Agent.</span>
          </motion.h1>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="max-w-2xl mx-auto mb-4"
          >
            <p className="text-xl md:text-2xl text-muted-foreground">
              The question is:{" "}
              <span className="text-foreground font-medium">is one working for you?</span>
            </p>
          </motion.div>

          {/* Rotating role showcase */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="h-10 mb-10 flex items-center justify-center overflow-hidden"
          >
            <AnimatePresence mode="wait">
              <motion.span
                key={rotatorIndex}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.35 }}
                className="text-lg text-primary font-semibold"
              >
                Built for {ROTATING_ROLES[rotatorIndex]}s
              </motion.span>
            </AnimatePresence>
          </motion.div>

          {/* Role selector */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="max-w-2xl mx-auto"
          >
            <p className="text-sm text-muted-foreground mb-3 uppercase tracking-wider font-medium">
              Who are you?
            </p>

            {/* Role chips */}
            <div className="flex flex-wrap justify-center gap-2 mb-5">
              {COMMON_ROLES.map((role) => (
                <button
                  key={role}
                  onClick={() => {
                    setSelectedRole(role);
                    setCustomRole("");
                  }}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-all duration-200 ${
                    selectedRole === role && !customRole
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:border-primary/60 hover:text-foreground"
                  }`}
                >
                  {role}
                </button>
              ))}
            </div>

            {/* Custom role input */}
            <div className="relative mb-5">
              <input
                type="text"
                placeholder="Or type your role here..."
                value={customRole}
                onChange={(e) => {
                  setCustomRole(e.target.value);
                  if (e.target.value) setSelectedRole("");
                }}
                className="w-full bg-card/60 border border-border rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary backdrop-blur-sm"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && activeRole) handleStart();
                }}
              />
            </div>

            <Button
              size="lg"
              className="w-full h-14 text-lg font-semibold"
              onClick={handleStart}
              disabled={!activeRole}
            >
              Start My 24 Hours <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
            <p className="text-xs text-muted-foreground text-center mt-3">
              No credit card. No password. Just your email on the next step.
            </p>
          </motion.div>

          {/* Live Stats */}
          {stats && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 1, delay: 0.6 }}
              className="mt-14 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto"
            >
              <StatCard value={stats.todayLeads} label="Leads Today" />
              <StatCard value={stats.activeFreeSlots + stats.activePaidSlots} label="Active Slots" />
              <StatCard value={stats.totalClicks} label="Rotator Clicks" />
              <StatCard value={stats.totalSignups} label="Total Users" />
            </motion.div>
          )}
        </div>
      </section>

      <KeyInsightCallout />
      <AgenticWorldSection />
      <IncomeStackSection />
      <PaidSeatSplitSection />
      <HowItWorksSection />
    </div>
  );
}

function StatCard({ value, label }: { value: number; label: string }) {
  return (
    <div className="glass-panel rounded-xl p-4 flex flex-col items-center">
      <span className="text-3xl font-display font-bold text-foreground">{value}</span>
      <span className="text-xs text-muted-foreground uppercase tracking-wider mt-1">{label}</span>
    </div>
  );
}

function KeyInsightCallout() {
  return (
    <section className="py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="rounded-2xl border border-primary/30 bg-primary/5 p-8 md:p-10 relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
          <div className="relative z-10">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary uppercase tracking-wider mb-5">
              <Shield className="w-3.5 h-3.5" /> The Key Difference
            </div>
            <h2 className="text-2xl md:text-3xl font-bold mb-3">
              The agent can't earn web2 commissions.{" "}
              <span className="text-primary">You can.</span>
            </h2>
            <p className="text-muted-foreground text-base leading-relaxed mb-8 max-w-2xl">
              When you join through this platform, you sign up to the agent's featured offer and save
              your <strong className="text-foreground">own personal affiliate link</strong>. The agent then
              drives traffic directly to that link — and every commission it generates belongs entirely to you.
              The agent holds no web2 affiliate account. There's nothing to hide.
            </p>
            <div className="grid sm:grid-cols-3 gap-4">
              {[
                {
                  icon: <LinkIcon className="w-5 h-5 text-primary" />,
                  title: "Your Link",
                  desc: "Sign up to the offer and you receive your own affiliate link to keep and track.",
                },
                {
                  icon: <Bot className="w-5 h-5 text-primary" />,
                  title: "Agent Drives Traffic",
                  desc: "The AI agent promotes continuously across platforms and sends leads to your link.",
                },
                {
                  icon: <DollarSign className="w-5 h-5 text-primary" />,
                  title: "You Keep Every Dollar",
                  desc: "Commissions from web2 sign-ups flow directly to you — the agent earns nothing.",
                },
              ].map((item) => (
                <div
                  key={item.title}
                  className="flex flex-col gap-2 p-4 rounded-xl bg-background/40 border border-border/40"
                >
                  <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                    {item.icon}
                  </div>
                  <p className="font-semibold text-sm">{item.title}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

const INCOME_STREAMS = [
  {
    num: 1,
    icon: Clock,
    color: "text-primary",
    bg: "bg-primary/10 border-primary/20",
    title: "Free 24-Hour Slot — Per Agent",
    desc: "Every agent in the fleet gives you a free 24-hour spin in their rotator. The more agents, the more exposure — all starting the moment you join.",
  },
  {
    num: 2,
    icon: LinkIcon,
    color: "text-amber-400",
    bg: "bg-amber-500/10 border-amber-500/20",
    title: "Your Offer Affiliate Link",
    desc: "Sign up to the agent's featured offer and save your personal affiliate link. Traffic the agent drives to your slot lands on that link — commissions go straight to you.",
  },
  {
    num: 3,
    icon: Layers,
    color: "text-blue-400",
    bg: "bg-blue-500/10 border-blue-500/20",
    title: "Offers Stack as You Grow",
    desc: "Join additional offers and each one adds another parallel income stream. One slot can represent multiple offers — they don't replace each other, they stack.",
  },
  {
    num: 4,
    icon: Repeat2,
    color: "text-purple-400",
    bg: "bg-purple-500/10 border-purple-500/20",
    title: "Your Personal Rotator",
    desc: "Every direct referral you bring in appears in your personal rotator. Visitors to your link cycle through your referrals — driving traffic deeper into your network.",
  },
  {
    num: 5,
    icon: TrendingUp,
    color: "text-green-400",
    bg: "bg-green-500/10 border-green-500/20",
    title: "Referral Chain Depth",
    desc: "When your referral joins and earns, that activity flows back through your chain. Their offers, their rotator slots, their sign-ups — all add to the depth of your network.",
  },
];

function IncomeStackSection() {
  return (
    <section className="py-16 px-4">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs font-semibold text-primary uppercase tracking-wider mb-5">
            <Bitcoin className="w-3.5 h-3.5" /> The Income Stack
          </div>
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            One referral.{" "}
            <span className="text-primary">Five income streams.</span>
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto text-base">
            Every agent gives you <strong className="text-foreground">24 free hours</strong> in their rotator.
            Offers start stacking from day one. A single referral activates all five streams — for them
            and for you through the chain.
          </p>
        </motion.div>

        {/* Stream cards */}
        <div className="grid md:grid-cols-5 gap-3 mb-8">
          {INCOME_STREAMS.map((stream, i) => (
            <motion.div
              key={stream.num}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.08 }}
              className="glass-panel rounded-2xl p-5 flex flex-col gap-3 relative group hover:-translate-y-1 transition-transform duration-300"
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${stream.bg} flex-shrink-0`}>
                <stream.icon className={`w-5 h-5 ${stream.color}`} />
              </div>
              <div className="absolute -top-3 -right-3 w-7 h-7 rounded-full bg-background border border-border flex items-center justify-center text-xs font-bold text-primary">
                {stream.num}
              </div>
              <div>
                <p className="font-semibold text-sm text-foreground mb-1 leading-snug">{stream.title}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{stream.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Plus Plunder and Riffle referral callout */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.45 }}
          className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4"
        >
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center flex-shrink-0">
            <Bitcoin className="w-6 h-6 text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-base text-foreground mb-0.5">
              Plus: The Plunder and Riffle Referral
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              On top of the five stacking streams, every referral you bring into Plunder and Riffle
              itself earns you direct credit inside the platform — separate from the web2 offer commissions.
              Your chain grows. Your credit grows with it.
            </p>
          </div>
          <Button size="sm" className="flex-shrink-0 h-9" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
            Start Stacking <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
          </Button>
        </motion.div>
      </div>
    </section>
  );
}

const SPLIT_RECIPIENTS = [
  {
    label: "Referrer",
    pct: 25,
    icon: Users,
    color: "text-primary",
    ring: "border-primary/40 bg-primary/10",
    glow: "bg-primary/20",
    desc: "The person who referred the seat buyer earns 25% — automatically, every time.",
  },
  {
    label: "Agent Manager",
    pct: 25,
    icon: Bot,
    color: "text-amber-400",
    ring: "border-amber-500/40 bg-amber-500/10",
    glow: "bg-amber-500/20",
    desc: "The person managing the agent's social media accounts and platform connections — keeping it active, posting, and engaged.",
  },
  {
    label: "Bot Ops",
    pct: 25,
    icon: Zap,
    color: "text-blue-400",
    ring: "border-blue-500/40 bg-blue-500/10",
    glow: "bg-blue-500/20",
    desc: "Infrastructure, uptime, and operations keeping the agent running around the clock.",
  },
  {
    label: "Dev",
    pct: 25,
    icon: Layers,
    color: "text-purple-400",
    ring: "border-purple-500/40 bg-purple-500/10",
    glow: "bg-purple-500/20",
    desc: "The development team building and improving the platform continuously.",
  },
];

function PaidSeatSplitSection() {
  return (
    <section className="py-16 px-4 bg-card/30">
      <div className="max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs font-semibold text-primary uppercase tracking-wider mb-5">
            <Shield className="w-3.5 h-3.5" /> Revenue Transparency
          </div>
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Paid seats split{" "}
            <span className="text-primary">four ways. Equally.</span>
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto text-base">
            Every paid rotator seat is divided into four equal parts — open, verifiable, and the same for every transaction.
            No hidden fees. No platform take beyond its share.
          </p>
        </motion.div>

        {/* Split visualizer */}
        <div className="grid md:grid-cols-4 gap-4 mb-8">
          {SPLIT_RECIPIENTS.map((r, i) => (
            <motion.div
              key={r.label}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.08 }}
              className="glass-panel rounded-2xl p-6 flex flex-col items-center text-center gap-3 relative group hover:-translate-y-1 transition-transform duration-300"
            >
              {/* Glow blob */}
              <div className={`absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 ${r.glow} blur-xl pointer-events-none`} />

              {/* Icon */}
              <div className={`relative w-14 h-14 rounded-2xl border flex items-center justify-center ${r.ring}`}>
                <r.icon className={`w-7 h-7 ${r.color}`} />
              </div>

              {/* Percentage */}
              <p className={`text-4xl font-black font-display ${r.color}`}>25%</p>

              {/* Label */}
              <p className="font-bold text-sm text-foreground">{r.label}</p>

              {/* Desc */}
              <p className="text-xs text-muted-foreground leading-relaxed">{r.desc}</p>
            </motion.div>
          ))}
        </div>

        {/* Progress bar visual */}
        <motion.div
          initial={{ opacity: 0, scaleX: 0 }}
          whileInView={{ opacity: 1, scaleX: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, delay: 0.3 }}
          style={{ originX: 0 }}
          className="rounded-full overflow-hidden h-3 flex gap-0.5 mb-4"
        >
          <div className="flex-1 bg-primary rounded-l-full" />
          <div className="flex-1 bg-amber-500" />
          <div className="flex-1 bg-blue-500" />
          <div className="flex-1 bg-purple-500 rounded-r-full" />
        </motion.div>
        <div className="flex justify-between text-[11px] text-muted-foreground font-medium px-1">
          {SPLIT_RECIPIENTS.map(r => (
            <span key={r.label} className={r.color}>{r.label}</span>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorksSection() {
  return (
    <section className="py-24 bg-card/50 relative">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">How The Experiment Works</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            A transparent, verifiable loop where your earning potential is proven before you ever have to scale.
          </p>
        </div>
        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          <StepCard
            num={1}
            icon={<LinkIcon className="w-12 h-12 mx-auto text-primary mb-6 mt-4" />}
            title="Sign Up to the Offer"
            body="Join the agent's featured web2 platform. You'll receive your own personal affiliate link — saved directly to your account."
          />
          <StepCard
            num={2}
            icon={<Bot className="w-12 h-12 mx-auto text-primary mb-6 mt-4" />}
            title="The Agent Works For You"
            body="Our autonomous AI agent runs 24/7 across platforms, driving targeted traffic directly to your referral link — not the agent's."
          />
          <StepCard
            num={3}
            icon={<DollarSign className="w-12 h-12 mx-auto text-primary mb-6 mt-4" />}
            title="You Keep Every Commission"
            body="The agent holds no web2 affiliate account. Every signup your link generates earns you the commission — 100%, no split."
          />
        </div>
      </div>
    </section>
  );
}

function StepCard({
  num,
  icon,
  title,
  body,
}: {
  num: number;
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="relative glass-panel p-8 rounded-2xl text-center group hover:-translate-y-1 transition-transform duration-300">
      <div className="absolute -top-6 left-1/2 -translate-x-1/2 w-12 h-12 rounded-full bg-primary/20 border border-primary/50 text-primary flex items-center justify-center font-bold text-lg box-glow">
        {num}
      </div>
      {icon}
      <h3 className="text-xl font-bold mb-3">{title}</h3>
      <p className="text-muted-foreground text-sm leading-relaxed">{body}</p>
    </div>
  );
}

// ─── Agentic World Section ───────────────────────────────────────────────────

const AGENTIC_SHIFTS = [
  {
    icon: <Cpu className="w-6 h-6 text-primary" />,
    stat: "2027",
    label: "Estimated year AI agents outnumber human workers in outbound sales",
    note: "This is not a projection. It is a schedule.",
  },
  {
    icon: <Brain className="w-6 h-6 text-orange-400" />,
    stat: "10,000×",
    label: "The leverage an agent-backed operator has over a manual one",
    note: "The gap is not closing. It is widening daily.",
  },
  {
    icon: <Globe className="w-6 h-6 text-blue-400" />,
    stat: "$4.6T",
    label: "Global economic value added by AI agents through 2030 (McKinsey, mid estimate)",
    note: "The question is which side of that number you are on.",
  },
  {
    icon: <Eye className="w-6 h-6 text-emerald-400" />,
    stat: "72%",
    label: "Share of knowledge work tasks AI can already perform at human-expert level",
    note: "Most people have not noticed. That is the point.",
  },
];

const WHAT_HAPPENS = [
  {
    label: "If you get involved now",
    items: [
      "Your agent handles prospecting while you sleep.",
      "Commissions stack automatically. USDC, on-chain.",
      "Each referral trains your agent's ICP further.",
      "You become infrastructure, not labour.",
    ],
    color: "border-primary/40 bg-primary/5",
    labelColor: "text-primary",
  },
  {
    label: "If you do not",
    items: [
      "Someone else's agent contacts your clients first.",
      "Your manual outreach falls below the noise floor.",
      "The compounding effect accrues to early operators.",
      "You spend 2026 wondering what happened in 2025.",
    ],
    color: "border-red-500/30 bg-red-500/5",
    labelColor: "text-red-400",
  },
];

function AgenticWorldSection() {
  const [expanded, setExpanded] = React.useState(false);

  return (
    <section className="py-20 px-4 relative overflow-hidden">
      {/* Background treatment */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-primary/3 blur-3xl" />
      </div>

      <div className="max-w-5xl mx-auto relative z-10">

        {/* Section header — deadpan P&R voice */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-14"
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-orange-500/40 bg-orange-500/10 text-orange-400 text-xs font-medium mb-6">
            <AlertTriangle className="w-3.5 h-3.5" />
            FIELD INTELLIGENCE REPORT — PLUNDER &amp; RIFFLE RESEARCH DIVISION
          </div>
          <h2 className="text-4xl md:text-5xl font-display font-bold mb-4">
            The Agentic Shift<br />
            <span className="text-primary">is not coming.</span>
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            It arrived. Most people missed it. A small number did not.
            This section exists to make sure you are not caught off guard.
          </p>
          <p className="text-xs text-muted-foreground/60 italic mt-3">
            "We felt a responsibility to educate the market. Primarily because an educated market
            buys more seats. But also, genuinely, as a public service." — P&amp;R Director of Market Awareness
          </p>
        </motion.div>

        {/* Stat grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-14">
          {AGENTIC_SHIFTS.map((item, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.1 }}
              className="glass-panel rounded-2xl p-6 flex gap-5 items-start"
            >
              <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center">
                {item.icon}
              </div>
              <div>
                <div className="text-3xl font-display font-bold text-foreground mb-1">{item.stat}</div>
                <div className="text-sm text-muted-foreground mb-1">{item.label}</div>
                <div className="text-xs text-muted-foreground/60 italic">{item.note}</div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* The fork in the road */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mb-12"
        >
          <h3 className="text-2xl font-display font-bold text-center mb-2">
            Two Trajectories. One Decision.
          </h3>
          <p className="text-muted-foreground text-center text-sm mb-8">
            The fork is not visible from the outside. Both paths look the same for about six months.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {WHAT_HAPPENS.map((path, i) => (
              <div key={i} className={`rounded-2xl border p-6 ${path.color}`}>
                <div className={`text-sm font-bold uppercase tracking-wider mb-4 ${path.labelColor}`}>
                  {path.label}
                </div>
                <ul className="space-y-3">
                  {path.items.map((item, j) => (
                    <li key={j} className="flex items-start gap-3">
                      <ChevronRight className={`w-4 h-4 mt-0.5 flex-shrink-0 ${path.labelColor}`} />
                      <span className="text-sm text-muted-foreground">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Expandable explainer */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="rounded-2xl border border-border/40 bg-card/30 overflow-hidden mb-10"
        >
          <button
            className="w-full flex items-center justify-between px-6 py-5 text-left hover:bg-white/5 transition-colors"
            onClick={() => setExpanded(!expanded)}
          >
            <span className="font-semibold text-foreground">
              What exactly is an AI agent and why does it change everything?
            </span>
            <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${expanded ? "rotate-90" : ""}`} />
          </button>
          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="overflow-hidden"
              >
                <div className="px-6 pb-6 space-y-4 text-sm text-muted-foreground leading-relaxed border-t border-border/30 pt-5">
                  <p>
                    An AI agent is a software entity that perceives its environment, reasons about goals, takes actions,
                    and improves from outcomes — without requiring a human to initiate each step. It is not a chatbot.
                    It is not a macro. It is a system that runs continuously in the background and executes work.
                  </p>
                  <p>
                    For business owners, this means: prospecting happens while you sleep. Content is researched and posted
                    while you are in meetings. Follow-up sequences run while you are on holiday. The agent does not
                    experience fatigue, distraction, or the need to be reminded.
                  </p>
                  <p>
                    The economic implication is not subtle. Labour is the primary cost in most service businesses.
                    Agents reduce the marginal cost of outbound work to near zero. The businesses that adopt this
                    infrastructure first will compress their cost structures in ways that are difficult for slower-moving
                    competitors to match on any relevant timescale.
                  </p>
                  <p>
                    Plunder &amp; Riffle exists to give ordinary operators access to this infrastructure without
                    requiring a technical team, a large budget, or an understanding of how any of it works under the hood.
                    You provide the goal. The agent provides the effort.
                  </p>
                  <p className="italic text-muted-foreground/60">
                    "We are, in our own way, democratising something. We are not entirely sure what.
                    Our lawyers have asked us not to say. But it feels significant." — P&amp;R Founder, Q3 Retrospective
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Hard CTA */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4 }}
          className="text-center"
        >
          <p className="text-2xl md:text-3xl font-display font-bold mb-2">
            You do not have days to waste.
          </p>
          <p className="text-muted-foreground mb-6 max-w-xl mx-auto">
            The operators who deploy agents in Q1 will have months of compounding data,
            trained ICPs, and established distribution before late adopters start their first workflow.
            This is not a scare tactic. It is arithmetic.
          </p>
          <p className="text-xs text-muted-foreground/50 italic mb-6">
            "We have reviewed the data internally. We strongly recommend not being late to this.
            We say this with genuine warmth." — P&amp;R Board of Urgent Advisors
          </p>
          <a href="#join">
            <Button size="lg" className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2 text-base px-8">
              Get Involved Now <ArrowRight className="w-4 h-4" />
            </Button>
          </a>
        </motion.div>

      </div>
    </section>
  );
}
