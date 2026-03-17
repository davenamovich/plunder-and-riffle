import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import {
  Bot, Zap, Users, BarChart2, Clock, ArrowRight, Lock, CheckCircle, Split
} from "lucide-react";

interface AgentCard {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  isPaused: boolean;
  freeSlotCapacity: number;
  paidSlotCapacity: number;
  activeFreeSlots: number;
  activePaidSlots: number;
  freeAvailable: number;
  totalClicks: number;
  totalSignups: number;
  dailyLeadCount: number;
  paidSlotPrice: number;
  slotDurationHours: number;
}

function useAgentDirectory() {
  return useQuery<{ agents: AgentCard[] }>({
    queryKey: ["agents-directory"],
    queryFn: () => fetch("/api/agents").then(r => r.json()),
    staleTime: 30_000,
  });
}

function AgentStatusBadge({ agent }: { agent: AgentCard }) {
  if (agent.isPaused) return <Badge variant="secondary">Paused</Badge>;
  if (agent.freeAvailable > 0) return <Badge className="bg-green-500/15 text-green-400 border-green-500/30 border">Free Slots Open</Badge>;
  return <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 border">Paid Only</Badge>;
}

function SlotBar({ label, used, capacity, color }: { label: string; used: number; capacity: number; color: string }) {
  const pct = capacity > 0 ? Math.min(100, (used / capacity) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-foreground font-mono">{used}/{capacity}</span>
      </div>
      <div className="w-full bg-muted/40 rounded-full h-1.5">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function AgentsPage() {
  const { isAuthenticated, login } = useAuth();
  const { data, isLoading } = useAgentDirectory();
  const agents = data?.agents ?? [];

  return (
    <div className="min-h-screen py-12 px-4">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <div className="inline-flex items-center gap-2 text-primary text-sm font-medium mb-4 px-3 py-1.5 bg-primary/10 rounded-full border border-primary/20">
            <Bot className="h-4 w-4" />
            Agent Fleet Directory
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
            Choose Your Agent
          </h1>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto">
            Each agent runs its own rotator. Get a 24-hour free slot, then upgrade to paid.
            Your referral link is tied to the agent you join.
          </p>
        </motion.div>

        {/* Agent grid */}
        {isLoading ? (
          <div className="grid md:grid-cols-2 gap-6">
            {[1, 2].map(i => <Skeleton key={i} className="h-64 rounded-2xl" />)}
          </div>
        ) : agents.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <Bot className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p>No active agents yet. Check back soon.</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-6">
            {agents.map((agent, i) => (
              <motion.div
                key={agent.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08 }}
              >
                <Card className="glass-panel border-border/50 hover:border-primary/30 transition-colors h-full flex flex-col">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                          <Bot className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <CardTitle className="text-lg">{agent.name}</CardTitle>
                          <p className="text-xs text-muted-foreground font-mono">/{agent.slug}</p>
                        </div>
                      </div>
                      <AgentStatusBadge agent={agent} />
                    </div>
                    {agent.description && (
                      <CardDescription className="mt-2 text-sm leading-relaxed">
                        {agent.description}
                      </CardDescription>
                    )}
                  </CardHeader>

                  <CardContent className="flex-1 flex flex-col gap-4">
                    {/* Slot bars */}
                    <div className="space-y-2">
                      <SlotBar
                        label={`Free slots (${agent.slotDurationHours}h)`}
                        used={agent.activeFreeSlots}
                        capacity={agent.freeSlotCapacity}
                        color="bg-primary"
                      />
                      <SlotBar
                        label={`Paid slots ($${agent.paidSlotPrice}/slot)`}
                        used={agent.activePaidSlots}
                        capacity={agent.paidSlotCapacity}
                        color="bg-amber-500"
                      />
                    </div>

                    {/* Stats row */}
                    <div className="grid grid-cols-3 gap-3">
                      <div className="text-center p-2 rounded-lg bg-muted/20 border border-border/40">
                        <p className="text-base font-bold text-foreground">{agent.totalSignups.toLocaleString()}</p>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Signups</p>
                      </div>
                      <div className="text-center p-2 rounded-lg bg-muted/20 border border-border/40">
                        <p className="text-base font-bold text-foreground">{agent.totalClicks.toLocaleString()}</p>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Clicks</p>
                      </div>
                      <div className="text-center p-2 rounded-lg bg-muted/20 border border-border/40">
                        <p className="text-base font-bold text-primary">{agent.dailyLeadCount}</p>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Today</p>
                      </div>
                    </div>

                    {/* Perks list */}
                    <ul className="space-y-1.5 text-sm">
                      {[
                        `${agent.slotDurationHours}h free trial — no card required`,
                        "Your referral link generated instantly",
                        "AI agent works on your behalf 24/7",
                      ].map((perk, j) => (
                        <li key={j} className="flex items-center gap-2 text-muted-foreground">
                          <CheckCircle className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                          {perk}
                        </li>
                      ))}
                    </ul>

                    {/* Paid seat split info */}
                    {agent.paidSlotPrice > 0 && (
                      <div className="rounded-xl border border-border/40 bg-muted/10 p-3 mt-1">
                        <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold mb-2 flex items-center gap-1.5">
                          <Split className="h-3 w-3" /> Paid seat revenue split
                        </p>
                        <div className="grid grid-cols-4 gap-1 text-center">
                          {[
                            { label: "Referrer", color: "text-primary" },
                            { label: "Manager", color: "text-amber-400" },
                            { label: "Bot Ops", color: "text-blue-400" },
                            { label: "Dev", color: "text-purple-400" },
                          ].map(r => (
                            <div key={r.label}>
                              <p className={`text-base font-black ${r.color}`}>25%</p>
                              <p className="text-[10px] text-muted-foreground leading-tight">{r.label}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* CTA */}
                    <div className="mt-auto pt-2">
                      {agent.isPaused ? (
                        <Button variant="outline" className="w-full" disabled>
                          <Lock className="h-4 w-4 mr-2" /> Agent Paused
                        </Button>
                      ) : (
                        <Link href={`/icp?role=BusinessOwner&agent=${agent.slug}`}>
                          <Button className="w-full" size="lg">
                            <Zap className="h-4 w-4 mr-2" />
                            {agent.freeAvailable > 0
                              ? `Get Free Slot · ${agent.freeAvailable} left`
                              : `Join Agent · $${agent.paidSlotPrice}`}
                            <ArrowRight className="h-4 w-4 ml-2" />
                          </Button>
                        </Link>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}

        {/* Bottom CTA for unauthenticated users */}
        {!isAuthenticated && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="mt-12 text-center glass-panel rounded-2xl p-8 border border-primary/20"
          >
            <p className="text-lg font-semibold mb-2">Already have a slot?</p>
            <p className="text-muted-foreground mb-4 text-sm">Sign in to see your agent dashboard and referral link.</p>
            <Button onClick={login} variant="outline">
              Sign in to My Agent
            </Button>
          </motion.div>
        )}
      </div>
    </div>
  );
}
