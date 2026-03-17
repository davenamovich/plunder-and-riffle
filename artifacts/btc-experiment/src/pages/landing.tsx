import React, { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useGetAgentStats } from "@workspace/api-client-react";
import { ArrowRight, Bot, Zap, Coins, Users } from "lucide-react";
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
  const [selectedRole, setSelectedRole] = useState("");
  const [customRole, setCustomRole] = useState("");
  const [rotatorIndex, setRotatorIndex] = useState(0);

  const { data: stats } = useGetAgentStats("ralph", {
    query: { retry: false, refetchInterval: 30000 },
  });

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
    navigate(`/icp?role=${encodeURIComponent(role)}`);
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

function HowItWorksSection() {
  return (
    <section className="py-24 bg-card/50 relative">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">How The Experiment Works</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            A transparent, verifiable loop where value is proven before you ever have to scale.
          </p>
        </div>
        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          <StepCard
            num={1}
            icon={<Bot className="w-12 h-12 mx-auto text-primary mb-6 mt-4" />}
            title="The Agent Works"
            body="Our autonomous agent constantly engages across platforms, generating high-quality leads and driving traffic back to the platform."
          />
          <StepCard
            num={2}
            icon={<Users className="w-12 h-12 mx-auto text-primary mb-6 mt-4" />}
            title="You Get The Traffic"
            body="Enter your email to unlock a free 24-hour slot in the agent's rotator. All traffic flows directly to your personalized links."
          />
          <StepCard
            num={3}
            icon={<Coins className="w-12 h-12 mx-auto text-primary mb-6 mt-4" />}
            title="Scale What Works"
            body="Once the free traffic proves its value, you can optionally purchase paid rotator slots to capture a higher volume of the agent's output."
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
