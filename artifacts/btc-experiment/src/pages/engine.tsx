import React, { useState } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Zap, Activity, PlayCircle, PauseCircle, Globe, Lock,
  Clock, RefreshCw, CheckCircle2, XCircle, AlertCircle,
  BarChart2, Radio, ExternalLink, ChevronDown, ChevronUp,
  Twitter, Linkedin, MessageSquare,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";

// ─── Types ────────────────────────────────────────────────────────────────────

interface EngineStatus {
  agent: {
    id: string; slug: string; name: string;
    engineEnabled: boolean; enginePublic: boolean;
    engineScheduleHours: number;
    engineLastRunAt: string | null;
    engineNextRunAt: string | null;
  };
  status: {
    isRunning: boolean;
    state: "disabled" | "running" | "idle";
    lastRunAt: string | null;
    lastRunStatus: string | null;
    nextRunAt: string | null;
  };
  stats: {
    generatedToday: number;
    postedToday: number;
    totalPosts: number;
    totalRuns: number;
  };
  recentRuns: {
    id: string; triggeredBy: string; status: string;
    slotsProcessed: number; postsGenerated: number; postsPosted: number;
    startedAt: string; completedAt: string | null; durationMs: number | null;
    errors: string[];
  }[];
  feed: {
    id: string; platform: string; content: string;
    status: string; postUrl: string | null; error: string | null;
    createdAt: string; postedAt: string | null;
    user: { slug: string | null; displayName: string | null; email?: string };
  }[];
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

function useEngineStatus(slug: string, token: string | null) {
  return useQuery<EngineStatus>({
    queryKey: ["engine", slug],
    queryFn: async () => {
      const resp = await fetch(`/api/engine/${slug}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.error || "Failed to load engine status");
      }
      return resp.json();
    },
    refetchInterval: 10_000,
    staleTime: 5_000,
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PLATFORM_META: Record<string, { label: string; icon: React.FC<any>; color: string }> = {
  twitter:  { label: "X / Twitter", icon: Twitter,      color: "text-sky-400 bg-sky-400/10 border-sky-400/20" },
  linkedin: { label: "LinkedIn",    icon: Linkedin,      color: "text-blue-400 bg-blue-400/10 border-blue-400/20" },
  discord:  { label: "Discord",     icon: MessageSquare, color: "text-indigo-400 bg-indigo-400/10 border-indigo-400/20" },
};

function PlatformBadge({ platform }: { platform: string }) {
  const meta = PLATFORM_META[platform] ?? { label: platform, icon: Globe, color: "text-muted-foreground bg-muted/20 border-border/30" };
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${meta.color}`}>
      <Icon className="w-3 h-3" /> {meta.label}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    generated: { label: "Generated",  className: "text-amber-400 border-amber-400/30 bg-amber-400/5" },
    posted:    { label: "Posted",     className: "text-green-400 border-green-500/30 bg-green-400/5" },
    failed:    { label: "Failed",     className: "text-red-400 border-red-500/30 bg-red-400/5" },
    skipped:   { label: "Skipped",    className: "text-muted-foreground border-border/30 bg-muted/10" },
    running:   { label: "Running",    className: "text-primary border-primary/30 bg-primary/5" },
    completed: { label: "Completed",  className: "text-green-400 border-green-500/30 bg-green-400/5" },
    disabled:  { label: "Disabled",   className: "text-muted-foreground border-border/30 bg-muted/10" },
    idle:      { label: "Idle",       className: "text-muted-foreground border-border/30 bg-muted/10" },
  };
  const s = map[status] ?? { label: status, className: "text-muted-foreground border-border/30" };
  return (
    <Badge variant="outline" className={`text-[10px] capitalize ${s.className}`}>
      {s.label}
    </Badge>
  );
}

// ─── Post Card ────────────────────────────────────────────────────────────────

function PostCard({ post }: { post: EngineStatus["feed"][0] }) {
  const [expanded, setExpanded] = useState(false);
  const preview = post.content.length > 140 && !expanded
    ? post.content.slice(0, 140) + "…"
    : post.content;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4 rounded-xl border border-border/40 bg-card/40 hover:border-border/70 transition-colors"
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <PlatformBadge platform={post.platform} />
          <StatusBadge status={post.status} />
          {post.user.displayName && (
            <span className="text-[10px] text-muted-foreground">
              @{post.user.slug ?? post.user.displayName}
            </span>
          )}
        </div>
        <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0">
          {formatDistanceToNow(new Date(post.createdAt), { addSuffix: true })}
        </span>
      </div>

      <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-line">{preview}</p>

      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-2">
          {post.postUrl && (
            <a href={post.postUrl} target="_blank" rel="noopener noreferrer"
               className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline">
              <ExternalLink className="w-3 h-3" /> View post
            </a>
          )}
          {post.error && (
            <span className="text-[10px] text-red-400 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> {post.error.slice(0, 60)}
            </span>
          )}
        </div>
        {post.content.length > 140 && (
          <Button variant="ghost" size="sm" className="h-5 px-1 text-[10px] text-muted-foreground"
                  onClick={() => setExpanded(!expanded)}>
            {expanded ? <><ChevronUp className="w-3 h-3 mr-0.5" /> Less</> : <><ChevronDown className="w-3 h-3 mr-0.5" /> More</>}
          </Button>
        )}
      </div>
    </motion.div>
  );
}

// ─── Run Row ──────────────────────────────────────────────────────────────────

function RunRow({ run }: { run: EngineStatus["recentRuns"][0] }) {
  const [open, setOpen] = useState(false);
  const icon = run.status === "completed"
    ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
    : run.status === "running"
    ? <RefreshCw className="w-3.5 h-3.5 text-primary animate-spin" />
    : <XCircle className="w-3.5 h-3.5 text-red-400" />;

  return (
    <div className="border-b border-border/20 last:border-0">
      <button
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/10 transition-colors text-left"
        onClick={() => run.errors.length > 0 && setOpen(!open)}
      >
        {icon}
        <span className="text-xs font-mono text-muted-foreground w-20 shrink-0">
          {format(new Date(run.startedAt), "HH:mm:ss")}
        </span>
        <span className="text-xs capitalize text-muted-foreground w-16 shrink-0">{run.triggeredBy}</span>
        <span className="text-xs text-foreground flex-1">
          {run.slotsProcessed} slots → {run.postsGenerated} generated, {run.postsPosted} posted
        </span>
        {run.durationMs != null && (
          <span className="text-[10px] text-muted-foreground shrink-0">{(run.durationMs / 1000).toFixed(1)}s</span>
        )}
        {run.errors.length > 0 && (
          <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
        )}
      </button>
      <AnimatePresence>
        {open && run.errors.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-3 space-y-1">
              {run.errors.map((e, i) => (
                <p key={i} className="text-[10px] text-red-400 font-mono">{e}</p>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Admin Settings Panel ─────────────────────────────────────────────────────

function EngineSettings({ data, token, onSaved }: {
  data: EngineStatus;
  token: string | null;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [enabled, setEnabled] = useState(data.agent.engineEnabled);
  const [isPublic, setIsPublic] = useState(data.agent.enginePublic);
  const [scheduleHours, setScheduleHours] = useState(data.agent.engineScheduleHours);

  const { mutate: saveSettings, isPending } = useMutation({
    mutationFn: async () => {
      const resp = await fetch(`/api/admin/engine/${data.agent.slug}/settings`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ engineEnabled: enabled, enginePublic: isPublic, engineScheduleHours: scheduleHours }),
      });
      if (!resp.ok) throw new Error("Failed to save");
      return resp.json();
    },
    onSuccess: () => { toast({ title: "Engine settings saved" }); onSaved(); },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  const { mutate: runNow, isPending: isRunning } = useMutation({
    mutationFn: async () => {
      const resp = await fetch(`/api/admin/engine/${data.agent.slug}/run`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!resp.ok) throw new Error("Failed to trigger");
      return resp.json();
    },
    onSuccess: () => { toast({ title: "Engine run triggered", description: "Posts will appear in the feed shortly." }); onSaved(); },
    onError: () => toast({ title: "Trigger failed", variant: "destructive" }),
  });

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary" /> Engine Controls
        </CardTitle>
        <CardDescription className="text-xs">Admin only — configure and trigger the content engine.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center justify-between p-3 rounded-lg border border-border/40 bg-card/60">
            <div>
              <p className="text-xs font-medium">Engine Enabled</p>
              <p className="text-[10px] text-muted-foreground">Run on schedule</p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>
          <div className="flex items-center justify-between p-3 rounded-lg border border-border/40 bg-card/60">
            <div>
              <p className="text-xs font-medium">Public Feed</p>
              <p className="text-[10px] text-muted-foreground">Anyone can view</p>
            </div>
            <Switch checked={isPublic} onCheckedChange={setIsPublic} />
          </div>
        </div>

        <div className="flex items-center gap-3 p-3 rounded-lg border border-border/40 bg-card/60">
          <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
          <div className="flex-1">
            <p className="text-xs font-medium">Schedule</p>
            <p className="text-[10px] text-muted-foreground">Run every N hours</p>
          </div>
          <div className="flex items-center gap-1">
            {[1, 2, 4, 6, 12, 24].map(h => (
              <button
                key={h}
                onClick={() => setScheduleHours(h)}
                className={`text-[10px] px-2 py-1 rounded border transition-colors ${
                  scheduleHours === h
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border/40 text-muted-foreground hover:border-border"
                }`}
              >{h}h</button>
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          <Button size="sm" className="flex-1" onClick={() => saveSettings()} disabled={isPending}>
            {isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin mr-2" /> : null}
            Save Settings
          </Button>
          <Button size="sm" variant="outline" className="flex-1 gap-1.5" onClick={() => runNow()} disabled={isRunning}>
            <PlayCircle className="w-3.5 h-3.5" />
            {isRunning ? "Running…" : "Run Now"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function EnginePage() {
  const { slug = "ralph" } = useParams<{ slug?: string }>();
  const { isAuthenticated, user, token } = useAuth();
  const qc = useQueryClient();

  const isAdmin = user?.role === "admin";
  const { data, isLoading, error, refetch } = useEngineStatus(slug, token);

  if (isLoading) {
    return (
      <div className="min-h-screen py-12 px-4">
        <div className="max-w-4xl mx-auto space-y-4">
          <Skeleton className="h-14 w-72" />
          <div className="grid grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
          </div>
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 text-center">
        <div>
          <Lock className="w-10 h-10 text-muted-foreground/40 mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">Engine Not Available</h2>
          <p className="text-muted-foreground text-sm max-w-xs mx-auto">
            {(error as Error)?.message || "This agent's engine feed is not public yet."}
          </p>
        </div>
      </div>
    );
  }

  const { agent, status, stats, recentRuns, feed } = data;
  const stateColor = status.state === "running"
    ? "text-green-400 border-green-500/30 bg-green-400/5"
    : status.state === "idle"
    ? "text-amber-400 border-amber-400/30 bg-amber-400/5"
    : "text-muted-foreground border-border/30";

  return (
    <div className="min-h-screen py-10 px-4">
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Radio className="w-4 h-4 text-primary" />
              <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Agent Engine</span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight">{agent.name}</h1>
            <div className="flex items-center gap-2 mt-1.5">
              <Badge variant="outline" className={`text-[10px] ${stateColor}`}>
                {status.state === "running" && <RefreshCw className="w-2.5 h-2.5 mr-1 animate-spin" />}
                {status.state}
              </Badge>
              {agent.enginePublic ? (
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Globe className="w-3 h-3" /> Public feed
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Lock className="w-3 h-3" /> Admin only
                </span>
              )}
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5 shrink-0">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </Button>
        </motion.div>

        {/* Stats */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Generated Today", value: stats.generatedToday, icon: Zap, color: "text-primary" },
            { label: "Posted Today",    value: stats.postedToday,    icon: CheckCircle2, color: "text-green-400" },
            { label: "Total Posts",     value: stats.totalPosts,     icon: BarChart2,    color: "text-foreground" },
            { label: "Runs (recent)",   value: stats.totalRuns,      icon: Activity,     color: "text-foreground" },
          ].map(s => (
            <Card key={s.label} className="glass-panel border-border/50">
              <CardContent className="p-4">
                <div className="flex items-center gap-1.5 mb-1">
                  <s.icon className={`w-3.5 h-3.5 ${s.color}`} />
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{s.label}</p>
                </div>
                <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              </CardContent>
            </Card>
          ))}
        </motion.div>

        {/* Next run */}
        {(status.nextRunAt || status.lastRunAt) && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.08 }}
            className="flex items-center gap-4 px-4 py-2.5 rounded-xl border border-border/30 bg-card/30 text-xs text-muted-foreground">
            {status.lastRunAt && (
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                Last run: {formatDistanceToNow(new Date(status.lastRunAt), { addSuffix: true })}
                <StatusBadge status={status.lastRunStatus ?? "idle"} />
              </span>
            )}
            {status.nextRunAt && agent.engineEnabled && (
              <span className="flex items-center gap-1.5 ml-auto">
                Next: {formatDistanceToNow(new Date(status.nextRunAt), { addSuffix: true })}
              </span>
            )}
          </motion.div>
        )}

        {/* Admin controls */}
        {isAdmin && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <EngineSettings
              data={data}
              token={token}
              onSaved={() => qc.invalidateQueries({ queryKey: ["engine", slug] })}
            />
          </motion.div>
        )}

        {/* Run history */}
        {recentRuns.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
            <Card className="glass-panel border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Activity className="w-4 h-4 text-primary" /> Run History
                </CardTitle>
                <CardDescription className="text-xs">Last {recentRuns.length} engine runs</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {recentRuns.map(run => <RunRow key={run.id} run={run} />)}
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Activity feed */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <Card className="glass-panel border-border/50">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Radio className="w-4 h-4 text-primary" /> Content Feed
                  </CardTitle>
                  <CardDescription className="text-xs mt-0.5">
                    Live posts generated by the engine for active slot holders.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-1.5">
                  {Object.entries(PLATFORM_META).map(([key]) => (
                    <PlatformBadge key={key} platform={key} />
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {feed.length === 0 ? (
                <div className="text-center py-12">
                  <Radio className="w-8 h-8 text-muted-foreground/20 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground mb-1">No posts yet</p>
                  <p className="text-xs text-muted-foreground/60">
                    {agent.engineEnabled
                      ? "The engine will generate posts on its next run."
                      : "Enable the engine to start generating content."}
                  </p>
                </div>
              ) : (
                feed.map(post => <PostCard key={post.id} post={post} />)
              )}
            </CardContent>
          </Card>
        </motion.div>

      </div>
    </div>
  );
}
