import React from "react";
import { useRoute } from "wouter";
import { useGetAgent, useGetAgentStats } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bot, ArrowRight, Activity, Users, MousePointerClick, Zap, Copy, Check, ExternalLink } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";

export default function AgentPage() {
  const [, params] = useRoute("/agent/:slug");
  const slug = params?.slug || "main-agent";
  const { isAuthenticated, openLoginModal } = useAuth();
  const [copied, setCopied] = React.useState(false);

  const joinUrl = `${window.location.origin}/join/${slug}`;

  const copyLink = () => {
    navigator.clipboard.writeText(joinUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const { data: agent, isLoading: isLoadingAgent } = useGetAgent(slug, {
    query: { retry: false }
  });

  const { data: stats, isLoading: isLoadingStats } = useGetAgentStats(slug, {
    query: { refetchInterval: 15000, retry: false, enabled: !!agent }
  });

  const handleRedirect = () => {
    window.location.href = "/";
  };

  if (isLoadingAgent) {
    return (
      <div className="container mx-auto px-4 py-20">
        <Skeleton className="w-full h-64 rounded-2xl mb-8" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <Skeleton className="w-full h-40" />
          <Skeleton className="w-full h-40" />
          <Skeleton className="w-full h-40" />
        </div>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="container mx-auto px-4 py-32 text-center">
        <h1 className="text-3xl font-bold mb-4">Agent Not Found</h1>
        <p className="text-muted-foreground">The requested agent could not be located.</p>
      </div>
    );
  }

  const activeSlots = stats ? (stats.activeFreeSlots + stats.activePaidSlots) : 0;
  const capacityPercent = agent.dailyCap ? Math.min(100, Math.round((activeSlots / agent.dailyCap) * 100)) : 0;

  return (
    <div className="container mx-auto px-4 py-12 lg:py-20">
      <div className="flex flex-col lg:flex-row gap-12 items-start">
        
        {/* Left Column: Agent Profile */}
        <div className="w-full lg:w-1/3 shrink-0">
          <Card className="glass-panel overflow-hidden border-primary/20">
            <div className="h-32 bg-gradient-to-br from-primary/20 to-background relative">
              <div className="absolute -bottom-12 left-1/2 -translate-x-1/2 w-24 h-24 rounded-full border-4 border-background overflow-hidden bg-muted">
                <img 
                  src={`${import.meta.env.BASE_URL}images/agent-avatar.png`} 
                  alt={agent.name}
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
            <CardHeader className="pt-16 text-center">
              <div className="flex justify-center mb-2">
                <Badge variant={agent.isPaused ? "destructive" : "success"} className="mb-2">
                  {agent.isPaused ? "PAUSED" : "ACTIVE & PROSPECTING"}
                </Badge>
              </div>
              <CardTitle className="text-3xl">{agent.name}</CardTitle>
              <p className="text-muted-foreground mt-4 leading-relaxed">
                {agent.description}
              </p>

              {/* Referral link strip */}
              <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2">
                <p className="text-xs text-amber-400/70 mb-1 font-medium tracking-wide uppercase">Agent is using</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs text-amber-300 truncate">{`/join/${slug}`}</code>
                  <button onClick={copyLink} className="text-amber-400 hover:text-amber-300 transition-colors">
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                  <a href={joinUrl} target="_blank" rel="noreferrer" className="text-amber-400 hover:text-amber-300 transition-colors">
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <Button 
                onClick={handleRedirect} 
                className="w-full h-14 text-lg shadow-[0_0_20px_rgba(247,147,26,0.3)] hover:shadow-[0_0_30px_rgba(247,147,26,0.5)]"
              >
                Test Rotator <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
              
              {!isAuthenticated && (
                <Button variant="outline" className="w-full" onClick={openLoginModal}>
                  Join & Get a Free Slot
                </Button>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Stats & Data */}
        <div className="w-full lg:w-2/3 space-y-8">
          <div>
            <h2 className="text-2xl font-bold mb-6 flex items-center">
              <Activity className="w-6 h-6 mr-2 text-primary" /> Live Performance
            </h2>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="bg-card/50 border-border/50">
                <CardContent className="p-6 text-center">
                  <Bot className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
                  <p className="text-3xl font-display font-bold">
                    {isLoadingStats ? "-" : stats?.todayLeads}
                  </p>
                  <p className="text-xs text-muted-foreground uppercase mt-1">Leads Today</p>
                </CardContent>
              </Card>
              <Card className="bg-card/50 border-border/50">
                <CardContent className="p-6 text-center">
                  <MousePointerClick className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
                  <p className="text-3xl font-display font-bold">
                    {isLoadingStats ? "-" : stats?.totalClicks}
                  </p>
                  <p className="text-xs text-muted-foreground uppercase mt-1">Total Redirects</p>
                </CardContent>
              </Card>
              <Card className="bg-card/50 border-border/50">
                <CardContent className="p-6 text-center">
                  <Users className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
                  <p className="text-3xl font-display font-bold text-primary text-glow">
                    {isLoadingStats ? "-" : stats?.activeFreeSlots}
                  </p>
                  <p className="text-xs text-muted-foreground uppercase mt-1">Active Free Slots</p>
                </CardContent>
              </Card>
              <Card className="bg-card/50 border-border/50">
                <CardContent className="p-6 text-center">
                  <Zap className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
                  <p className="text-3xl font-display font-bold text-amber-500 text-glow">
                    {isLoadingStats ? "-" : stats?.activePaidSlots}
                  </p>
                  <p className="text-xs text-muted-foreground uppercase mt-1">Active Paid Slots</p>
                </CardContent>
              </Card>
            </div>
          </div>

          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <CardTitle className="text-lg">Rotator Capacity</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-2 flex justify-between text-sm">
                <span className="text-muted-foreground">Current Load</span>
                <span className="font-medium">{activeSlots} / {agent.dailyCap || '∞'} Slots</span>
              </div>
              <div className="w-full bg-secondary rounded-full h-3 overflow-hidden">
                <div 
                  className="bg-primary h-3 rounded-full transition-all duration-1000 ease-out relative"
                  style={{ width: `${capacityPercent}%` }}
                >
                  <div className="absolute inset-0 bg-white/20 animate-pulse" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                When capacity is reached, new slots are queued until older slots expire (24h limit).
              </p>
            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  );
}
