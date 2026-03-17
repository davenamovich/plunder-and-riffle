import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Redirect } from "wouter";
import {
  useGetAdminSettings,
  useUpdateAdminSettings,
  useGetAdminRotatorSlots,
  useListAdminUsers,
  useListAdminLeads,
  useApproveLead,
  useRejectLead,
  useAdminExpireSlot,
  useGetRalphStatus,
  useRunRalph,
  useGetAdminFunnel,
  useGetDmQueue,
  useTriggerDm,
  useMarkDmSent,
  useCancelDmSend,
  useGetDmSequences,
  useUpdateDmSequence,
  useMarkLeadPosted,
  type DmStep,
} from "@workspace/api-client-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  ShieldAlert, Trash2, CheckCircle, XCircle, Bot, Zap, Play,
  RefreshCw, Activity, Users, Clock, ChevronDown, ChevronUp, Eye,
  AlertTriangle, ToggleLeft, ToggleRight, Mail, Send, BarChart2,
  Check, Ban, Copy, Plus, Minus, Wallet, Gem, PauseCircle, PlayCircle,
  Settings2, ExternalLink, Plug, Link2
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

// ─── Status badge helper ───────────────────────────────────────────────────────

function LeadStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    raw:                "secondary",
    scored:             "outline",
    pending_approval:   "default",
    approved:           "success",
    posted:             "success",
    rejected:           "destructive",
    rejected_low_score: "destructive",
  };
  return <Badge variant={(map[status] || "secondary") as any}>{status.replace(/_/g, " ")}</Badge>;
}

// ─── Reply style badge ─────────────────────────────────────────────────────────

function ReplyStyleBadge({ style }: { style?: string }) {
  if (!style) return null;
  const cfg: Record<string, { label: string; className: string }> = {
    helpful:        { label: "helpful",        className: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
    curiosity:      { label: "curiosity",      className: "bg-violet-500/15 text-violet-400 border-violet-500/30" },
    ask_permission: { label: "ask permission", className: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
    soft_cta:       { label: "soft cta",       className: "bg-green-500/15 text-green-400 border-green-500/30" },
  };
  const c = cfg[style] ?? { label: style, className: "bg-muted text-muted-foreground border-border" };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${c.className}`}>
      {c.label}
    </span>
  );
}

// ─── Score dimension mini-bar ──────────────────────────────────────────────────

function DimBar({ label, value, invert = false }: { label: string; value: number; invert?: boolean }) {
  const pct = (value / 10) * 100;
  const color = invert
    ? value <= 3 ? "bg-green-500" : value <= 6 ? "bg-amber-500" : "bg-red-500"
    : value >= 7 ? "bg-green-500" : value >= 4 ? "bg-amber-500" : "bg-muted-foreground/40";

  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="text-[10px] text-muted-foreground w-28 shrink-0 truncate">{label}</span>
      <div className="flex-1 bg-muted/40 rounded-full h-1.5 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] font-mono text-muted-foreground w-4 text-right shrink-0">{value}</span>
    </div>
  );
}

// ─── Score dimensions panel ────────────────────────────────────────────────────

function ScoreDimensionsPanel({ dims, reason }: { dims?: any; reason?: string }) {
  if (!dims && !reason) return null;
  return (
    <div className="mt-3 p-3 rounded-lg bg-muted/20 border border-border/30">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Signal Breakdown</p>
      {dims ? (
        <div className="space-y-1.5">
          <DimBar label="Niche match"        value={dims.niche_match} />
          <DimBar label="Buyer intent"       value={dims.buyer_intent} />
          <DimBar label="Urgency"            value={dims.urgency} />
          <DimBar label="Lead value"         value={dims.likely_lead_value} />
          <DimBar label="Response likelihood" value={dims.response_likelihood} />
          <DimBar label="Spam risk"          value={dims.spam_risk} invert />
        </div>
      ) : reason ? (
        <p className="text-xs text-muted-foreground italic">{reason}</p>
      ) : null}
      {dims && reason && (
        <p className="text-[11px] text-muted-foreground mt-2 pt-2 border-t border-border/20 italic">{reason}</p>
      )}
    </div>
  );
}

// ─── Expand / collapse lead row ────────────────────────────────────────────────

function LeadRow({ lead, onApprove, onReject, onTriggerDm, onMarkPosted }: {
  lead: any;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onTriggerDm: (id: string) => void;
  onMarkPosted: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const score = lead.score != null ? lead.score.toFixed(2) : "—";

  return (
    <>
      <TableRow className="cursor-pointer hover:bg-muted/30" onClick={() => setExpanded(v => !v)}>
        <TableCell className="font-medium capitalize">{lead.source}</TableCell>
        <TableCell>
          <div className="flex flex-col gap-1">
            <span className={`font-mono font-bold ${Number(lead.score) >= 0.65 ? "text-primary" : Number(lead.score) >= 0.35 ? "text-amber-400" : "text-muted-foreground"}`}>
              {score}
            </span>
            <ReplyStyleBadge style={lead.replyStyle} />
          </div>
        </TableCell>
        <TableCell className="max-w-xs">
          <p className="truncate text-xs text-muted-foreground">{lead.content?.slice(0, 80)}…</p>
        </TableCell>
        <TableCell className="max-w-xs">
          <p className="truncate text-xs italic">{lead.draft || <span className="text-muted-foreground/50">No draft</span>}</p>
        </TableCell>
        <TableCell><LeadStatusBadge status={lead.status} /></TableCell>
        <TableCell className="text-right">
          <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
            {lead.status === "pending_approval" && (
              <>
                <Button size="sm" variant="default" className="h-7 px-2 text-xs" onClick={() => onApprove(lead.id)}>
                  <CheckCircle className="w-3 h-3 mr-1" /> Approve
                </Button>
                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-destructive hover:text-destructive" onClick={() => onReject(lead.id)}>
                  <XCircle className="w-3 h-3 mr-1" /> Reject
                </Button>
              </>
            )}
            {lead.status === "approved" && (
              <>
                <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => onTriggerDm(lead.id)}>
                  <Mail className="w-3 h-3 mr-1" /> Send DM
                </Button>
                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-green-400 hover:text-green-300" onClick={() => onMarkPosted(lead.id)}>
                  <Check className="w-3 h-3 mr-1" /> Mark Posted
                </Button>
              </>
            )}
            {expanded ? <ChevronUp className="w-4 h-4 ml-1 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 ml-1 text-muted-foreground" />}
          </div>
        </TableCell>
      </TableRow>

      {expanded && (
        <TableRow>
          <TableCell colSpan={6} className="bg-muted/10 p-4">
            <div className="grid md:grid-cols-2 gap-4">
              {/* Left: original post + scoring */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase mb-2 flex items-center gap-1">
                  <Eye className="w-3 h-3" /> Original Post
                </p>
                <p className="text-sm bg-background/50 p-3 rounded-lg border border-border/40 leading-relaxed">{lead.content}</p>
                {lead.postUrl && (
                  <a href={lead.postUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline mt-1 block">
                    View original →
                  </a>
                )}
                <ScoreDimensionsPanel dims={lead.scoreDetails} reason={lead.scoreReason} />
              </div>

              {/* Right: AI draft + meta */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase flex items-center gap-1">
                    <Bot className="w-3 h-3" /> AI Draft Reply
                  </p>
                  {lead.replyStyle && (
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      style: <ReplyStyleBadge style={lead.replyStyle} />
                    </div>
                  )}
                </div>
                {lead.draft ? (
                  <p className="text-sm bg-primary/5 border border-primary/20 p-3 rounded-lg leading-relaxed">{lead.draft}</p>
                ) : (
                  <p className="text-sm text-muted-foreground italic p-3 bg-muted/20 rounded-lg border border-border/20">
                    Draft not yet generated.
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-3">
                  Author: <span className="font-mono">{lead.authorHandle || "unknown"}</span>
                  {lead.createdAt && (
                    <span className="ml-2">· {formatDistanceToNow(new Date(lead.createdAt), { addSuffix: true })}</span>
                  )}
                  {lead.externalId && (
                    <span className="ml-2 opacity-50">· {lead.externalId}</span>
                  )}
                </p>
                {lead.rejectedReason && (
                  <p className="text-xs text-destructive/70 mt-2 italic">
                    Rejected: {lead.rejectedReason}
                  </p>
                )}
              </div>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

// ─── Pipeline funnel ───────────────────────────────────────────────────────────

const PIPELINE_STAGES = [
  { key: "raw",              label: "Raw",              color: "bg-muted-foreground" },
  { key: "scored",           label: "Scored",           color: "bg-amber-500" },
  { key: "pending_approval", label: "Pending Approval", color: "bg-blue-500" },
  { key: "approved",         label: "Approved",         color: "bg-primary" },
  { key: "posted",           label: "Posted",           color: "bg-green-500" },
  { key: "rejected_low_score",label:"Rejected (score)", color: "bg-destructive/60" },
  { key: "rejected",         label: "Rejected",         color: "bg-destructive" },
];

// ─── Main Admin Page ───────────────────────────────────────────────────────────

export default function Admin() {
  const { user, isAuthenticated, token } = useAuth();
  const { toast } = useToast();
  const [leadStatusFilter, setLeadStatusFilter] = useState("pending_approval");
  const [rejectReason, setRejectReason] = useState("");
  const [rejectingId, setRejectingId] = useState<string | null>(null);

  if (!isAuthenticated || user?.role !== "admin") {
    return <Redirect to="/" />;
  }

  // ── DM Sequences editor state ──
  const [editingSeqId, setEditingSeqId] = useState<string | null>(null);
  const [editingSeqName, setEditingSeqName] = useState("");
  const [editingSteps, setEditingSteps] = useState<DmStep[]>([]);
  const [dmQueueFilter, setDmQueueFilter] = useState("pending");

  // ── Data hooks ──
  const { data: settings, refetch: refetchSettings } = useGetAdminSettings();
  const { data: slotsRes, refetch: refetchSlots } = useGetAdminRotatorSlots();
  const { data: usersRes } = useListAdminUsers();
  const { data: leadsRes, refetch: refetchLeads } = useListAdminLeads();
  const { data: ralphStatus, refetch: refetchRalph, isLoading: isLoadingRalph } = useGetRalphStatus({
    query: { refetchInterval: 30000 },
  });
  const { data: funnelData, refetch: refetchFunnel } = useGetAdminFunnel();
  const { data: dmQueueData, refetch: refetchDmQueue } = useGetDmQueue(dmQueueFilter);
  const { data: seqData, refetch: refetchSeqs } = useGetDmSequences();

  // ── Mutation hooks ──
  const { mutate: updateSettings, isPending: isSavingSettings } = useUpdateAdminSettings({
    mutation: { onSuccess: () => { toast({ title: "Settings saved" }); refetchSettings(); } },
  });

  const { mutate: expireSlot } = useAdminExpireSlot({
    mutation: { onSuccess: () => { toast({ title: "Slot expired" }); refetchSlots(); } },
  });

  const { mutate: approveLead } = useApproveLead({
    mutation: { onSuccess: () => { toast({ title: "Lead approved ✓" }); refetchLeads(); refetchRalph(); } },
  });

  const { mutate: rejectLead, isPending: isRejecting } = useRejectLead({
    mutation: {
      onSuccess: () => {
        toast({ title: "Lead rejected" });
        setRejectingId(null);
        setRejectReason("");
        refetchLeads();
        refetchRalph();
      },
    },
  });

  const { mutate: runRalph, isPending: isRunningRalph } = useRunRalph({
    mutation: {
      onSuccess: (data) => {
        toast({ title: `Ralph ran: ${data.classified} classified, ${data.drafted} drafted` });
        refetchLeads();
        refetchRalph();
      },
      onError: () => toast({ title: "Ralph run failed", variant: "destructive" }),
    },
  });

  const { mutate: triggerDm } = useTriggerDm({
    mutation: {
      onSuccess: (data) => {
        if (data.success) {
          toast({ title: `DM sequence triggered — ${data.stepsQueued} step(s) queued` });
          refetchDmQueue();
          refetchFunnel();
        } else {
          toast({ title: data.error || "Failed to trigger DM", variant: "destructive" });
        }
      },
    },
  });

  const { mutate: markDmSent } = useMarkDmSent({
    mutation: {
      onSuccess: () => { toast({ title: "DM marked as sent" }); refetchDmQueue(); refetchFunnel(); },
    },
  });

  const { mutate: cancelDmSend } = useCancelDmSend({
    mutation: {
      onSuccess: () => { toast({ title: "DM send cancelled" }); refetchDmQueue(); },
    },
  });

  const { mutate: markPosted } = useMarkLeadPosted({
    mutation: {
      onSuccess: () => { toast({ title: "Lead marked as posted ✓" }); refetchLeads(); refetchRalph(); refetchFunnel(); },
    },
  });

  const { mutate: saveSeq, isPending: isSavingSeq } = useUpdateDmSequence({
    mutation: {
      onSuccess: () => {
        toast({ title: "Sequence saved" });
        setEditingSeqId(null);
        refetchSeqs();
      },
    },
  });

  const [localSettings, setLocalSettings] = React.useState<any>({});
  React.useEffect(() => { if (settings) setLocalSettings(settings); }, [settings]);

  // ── Leads ──
  const allLeads = leadsRes?.leads || [];
  const filteredLeads = leadStatusFilter === "all"
    ? allLeads
    : allLeads.filter(l => l.status === leadStatusFilter);

  const pendingCount = allLeads.filter(l => l.status === "pending_approval").length;

  // ── Usage ──
  const usage = ralphStatus?.moltis?.usage;
  const usagePct = usage ? Math.round((usage.used / usage.cap) * 100) : 0;

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <div className="flex items-center gap-3 mb-8">
        <ShieldAlert className="w-8 h-8 text-destructive" />
        <div>
          <h1 className="text-3xl font-bold font-display tracking-tight">Admin Controls</h1>
          <p className="text-sm text-muted-foreground">Manage the BTC Experiment platform</p>
        </div>
      </div>

      <Tabs defaultValue="ralph" className="w-full">
        <TabsList className="grid w-full md:w-auto md:inline-grid grid-cols-8 h-11 mb-8">
          <TabsTrigger value="ralph" className="flex items-center gap-1.5">
            <Bot className="w-3.5 h-3.5" /> Ralph
          </TabsTrigger>
          <TabsTrigger value="leads" className="flex items-center gap-1.5 relative">
            <Activity className="w-3.5 h-3.5" /> Leads
            {pendingCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-primary text-[10px] text-primary-foreground rounded-full flex items-center justify-center font-bold">
                {pendingCount > 9 ? "9+" : pendingCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="funnel" className="flex items-center gap-1.5">
            <BarChart2 className="w-3.5 h-3.5" /> Funnel
          </TabsTrigger>
          <TabsTrigger value="rotator">Rotator</TabsTrigger>
          <TabsTrigger value="users"><Users className="w-3.5 h-3.5 mr-1" />Users</TabsTrigger>
          <TabsTrigger value="settings">Config</TabsTrigger>
          <TabsTrigger value="agents"><Bot className="w-3.5 h-3.5 mr-1" />Agents</TabsTrigger>
          <TabsTrigger value="wallets"><Wallet className="w-3.5 h-3.5 mr-1" />Wallets</TabsTrigger>
        </TabsList>

        {/* ── RALPH TAB ── */}
        <TabsContent value="ralph" className="space-y-6">
          <div className="grid md:grid-cols-3 gap-6">

            {/* AI Status Card */}
            <Card className={`border ${ralphStatus?.moltis?.configured ? "border-primary/30 bg-primary/5" : "border-destructive/30 bg-destructive/5"}`}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                  <Bot className="w-4 h-4" /> AI Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoadingRalph ? (
                  <Skeleton className="h-8 w-32" />
                ) : (
                  <>
                    <div className="flex items-center gap-2 mb-3">
                      <div className={`w-2.5 h-2.5 rounded-full ${ralphStatus?.moltis?.configured ? "bg-green-500 animate-pulse" : "bg-destructive"}`} />
                      <span className="font-bold text-lg">{ralphStatus?.moltis?.configured ? "Connected" : "No API Key"}</span>
                    </div>
                    <p className="text-xs text-muted-foreground font-mono truncate">{ralphStatus?.moltis?.model}</p>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Daily API Usage Card */}
            <Card className="md:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                  <Zap className="w-4 h-4" /> Daily API Budget
                  <span className="ml-auto text-xs font-normal text-muted-foreground">{usage?.date}</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoadingRalph ? (
                  <Skeleton className="h-8 w-full" />
                ) : usage ? (
                  <>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="font-bold text-2xl font-display">
                        {usage.used} <span className="text-muted-foreground text-sm font-normal">/ {usage.cap} calls</span>
                      </span>
                      <span className={`font-medium ${usage.remaining < 200 ? "text-destructive" : usage.remaining < 500 ? "text-amber-400" : "text-primary"}`}>
                        {usage.remaining} remaining
                      </span>
                    </div>
                    <Progress value={usagePct} className="h-2" />
                    <p className="text-xs text-muted-foreground mt-2">
                      Resets at midnight · Batch calls (20 leads per call) · ~168 automated calls/day
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Usage data unavailable</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Pipeline Funnel */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="w-5 h-5 text-primary" /> Pipeline Funnel
                </CardTitle>
                <CardDescription>Lead counts by stage. Raw leads are processed every 15 min.</CardDescription>
              </div>
              <Button
                onClick={() => runRalph()}
                disabled={isRunningRalph}
                className="gap-2"
                size="sm"
              >
                {isRunningRalph ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                Run Ralph Now
              </Button>
            </CardHeader>
            <CardContent>
              {isLoadingRalph ? (
                <div className="space-y-3">
                  {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-8 rounded" />)}
                </div>
              ) : (
                <div className="space-y-2">
                  {PIPELINE_STAGES.map(stage => {
                    const count = ralphStatus?.leads?.[stage.key] || 0;
                    const maxCount = Math.max(...PIPELINE_STAGES.map(s => ralphStatus?.leads?.[s.key] || 0), 1);
                    const pct = Math.round((count / maxCount) * 100);
                    return (
                      <div key={stage.key} className="flex items-center gap-3">
                        <span className="w-36 text-xs text-muted-foreground shrink-0">{stage.label}</span>
                        <div className="flex-1 h-6 bg-muted/30 rounded overflow-hidden">
                          <div
                            className={`h-full ${stage.color} transition-all duration-500 flex items-center`}
                            style={{ width: `${pct}%`, minWidth: count > 0 ? "2rem" : 0 }}
                          />
                        </div>
                        <span className="w-8 text-right text-sm font-bold font-display">{count}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Worker Schedule */}
          <Card className="border-border/40">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                <Clock className="w-4 h-4" /> Worker Schedule
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                {[
                  { label: "Expire Slots", interval: "30 sec", cost: "free" },
                  { label: "Classify Batch", interval: "15 min", cost: "1 call / 20 leads" },
                  { label: "Draft Batch", interval: "20 min", cost: "1 call / 20 leads" },
                  { label: "Reset Caps", interval: "60 min", cost: "free" },
                ].map(t => (
                  <div key={t.label} className="bg-muted/20 rounded-lg p-3 border border-border/30">
                    <p className="font-medium text-xs">{t.label}</p>
                    <p className="text-primary font-mono text-sm mt-0.5">{t.interval}</p>
                    <p className="text-muted-foreground text-xs mt-0.5">{t.cost}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── LEADS TAB ── */}
        <TabsContent value="leads" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Lead Queue</CardTitle>
                <CardDescription>
                  {pendingCount > 0
                    ? <span className="text-primary font-medium">{pendingCount} leads awaiting approval.</span>
                    : "All leads processed."}
                </CardDescription>
              </div>
              <div className="flex gap-1 flex-wrap justify-end">
                {["pending_approval", "scored", "approved", "posted", "rejected", "all"].map(s => (
                  <Button
                    key={s}
                    size="sm"
                    variant={leadStatusFilter === s ? "default" : "ghost"}
                    className="h-7 text-xs px-2 capitalize"
                    onClick={() => setLeadStatusFilter(s)}
                  >
                    {s.replace(/_/g, " ")}
                    {s !== "all" && <span className="ml-1 opacity-60">({allLeads.filter(l => l.status === s).length})</span>}
                  </Button>
                ))}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Source</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>Post Preview</TableHead>
                    <TableHead>Draft Preview</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLeads.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                        No leads with status "{leadStatusFilter.replace(/_/g, " ")}".
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredLeads.map(lead => (
                      <LeadRow
                        key={lead.id}
                        lead={lead}
                        onApprove={(id) => approveLead({ id })}
                        onReject={(id) => setRejectingId(id)}
                        onTriggerDm={(id) => triggerDm({ id })}
                        onMarkPosted={(id) => markPosted({ id })}
                      />
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Reject confirm dialog */}
          {rejectingId && (
            <Card className="border-destructive/40 bg-destructive/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-destructive flex items-center gap-2 text-base">
                  <AlertTriangle className="w-4 h-4" /> Reject Lead
                </CardTitle>
              </CardHeader>
              <CardContent className="flex gap-3">
                <Input
                  placeholder="Rejection reason (optional)"
                  value={rejectReason}
                  onChange={e => setRejectReason(e.target.value)}
                  className="flex-1"
                />
                <Button
                  variant="destructive"
                  disabled={isRejecting}
                  onClick={() => rejectLead({ id: rejectingId, reason: rejectReason || "Rejected by admin" })}
                >
                  {isRejecting ? <RefreshCw className="w-4 h-4 animate-spin" /> : "Confirm Reject"}
                </Button>
                <Button variant="ghost" onClick={() => setRejectingId(null)}>Cancel</Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── FUNNEL TAB ── */}
        <TabsContent value="funnel" className="space-y-6">

          {/* Attribution Summary */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="flex items-center gap-2"><BarChart2 className="w-5 h-5 text-primary" /> Attribution Funnel</CardTitle>
                <CardDescription>Event counts across the full lead journey. Auto-refreshes every 30s.</CardDescription>
              </div>
              <Button variant="ghost" size="sm" onClick={() => refetchFunnel()}><RefreshCw className="w-4 h-4" /></Button>
            </CardHeader>
            <CardContent>
              {(() => {
                const FUNNEL_EVENTS = [
                  { key: "candidate_scored",  label: "Candidates Scored",   color: "bg-amber-500" },
                  { key: "reply_drafted",     label: "Replies Drafted",     color: "bg-blue-500" },
                  { key: "reply_approved",    label: "Replies Approved",    color: "bg-primary" },
                  { key: "reply_posted",      label: "Replies Posted",      color: "bg-green-500" },
                  { key: "dm_triggered",      label: "DM Sequences Queued", color: "bg-violet-500" },
                  { key: "dm_sent",           label: "DMs Sent",            color: "bg-green-400" },
                  { key: "click",             label: "Link Clicks",         color: "bg-amber-400" },
                ];
                const summary = funnelData?.summary || {};
                const maxVal = Math.max(...FUNNEL_EVENTS.map(e => summary[e.key] || 0), 1);
                return (
                  <div className="space-y-2.5">
                    {FUNNEL_EVENTS.map(ev => {
                      const count = summary[ev.key] || 0;
                      const pct = Math.round((count / maxVal) * 100);
                      return (
                        <div key={ev.key} className="flex items-center gap-3">
                          <span className="w-44 text-xs text-muted-foreground shrink-0">{ev.label}</span>
                          <div className="flex-1 h-6 bg-muted/30 rounded overflow-hidden">
                            <div className={`h-full ${ev.color} transition-all duration-500 flex items-center`}
                              style={{ width: `${pct}%`, minWidth: count > 0 ? "2rem" : 0 }} />
                          </div>
                          <span className="w-10 text-right text-sm font-bold font-display tabular-nums">{count}</span>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </CardContent>
          </Card>

          {/* DM Queue */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="flex items-center gap-2"><Mail className="w-5 h-5 text-primary" /> DM Queue</CardTitle>
                <CardDescription>{dmQueueData?.total ?? 0} item(s) · Copy message, mark sent or cancel.</CardDescription>
              </div>
              <div className="flex gap-1">
                {["pending", "sent", "cancelled", "all"].map(s => (
                  <Button key={s} size="sm" variant={dmQueueFilter === s ? "default" : "ghost"} className="h-7 px-2 text-xs capitalize"
                    onClick={() => setDmQueueFilter(s)}>
                    {s}
                  </Button>
                ))}
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => refetchDmQueue()}>
                  <RefreshCw className="w-3.5 h-3.5" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Lead</TableHead>
                    <TableHead>Sequence</TableHead>
                    <TableHead>Step</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Scheduled</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!dmQueueData?.queue?.length ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">No DM sends in this view.</TableCell>
                    </TableRow>
                  ) : (
                    dmQueueData.queue.map(item => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <p className="font-mono text-xs">{item.leadHandle || item.leadId.slice(0, 8)}</p>
                          <p className="text-[10px] text-muted-foreground capitalize">{item.leadSource}</p>
                        </TableCell>
                        <TableCell className="text-xs">{item.seqName || "—"}</TableCell>
                        <TableCell className="font-mono text-xs">#{item.stepIndex}</TableCell>
                        <TableCell>
                          <Badge variant={item.status === "sent" ? "success" : item.status === "cancelled" ? "destructive" : "outline"} className="text-[10px]">
                            {item.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {item.scheduledAt ? formatDistanceToNow(new Date(item.scheduledAt), { addSuffix: true }) : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {item.message && (
                              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs"
                                onClick={() => { navigator.clipboard.writeText(item.message!); toast({ title: "Message copied" }); }}>
                                <Copy className="w-3 h-3" />
                              </Button>
                            )}
                            {item.status === "pending" && (
                              <>
                                <Button variant="outline" size="sm" className="h-7 px-2 text-xs text-green-400 border-green-500/30"
                                  onClick={() => markDmSent({ dmSendId: item.id })}>
                                  <Send className="w-3 h-3 mr-1" /> Sent
                                </Button>
                                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-destructive"
                                  onClick={() => cancelDmSend({ dmSendId: item.id })}>
                                  <Ban className="w-3 h-3" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Recent Events */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                <Activity className="w-4 h-4" /> Recent Funnel Events
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Event</TableHead>
                    <TableHead>Lead</TableHead>
                    <TableHead>Platform</TableHead>
                    <TableHead>Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!funnelData?.recentEvents?.length ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No events yet.</TableCell>
                    </TableRow>
                  ) : (
                    funnelData.recentEvents.map(ev => (
                      <TableRow key={ev.id}>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px] font-mono">{ev.eventType.replace(/_/g, " ")}</Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{ev.leadId?.slice(0, 8) || "—"}</TableCell>
                        <TableCell className="text-xs capitalize text-muted-foreground">{ev.platform || "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(ev.createdAt), { addSuffix: true })}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── ROTATOR TAB ── */}
        <TabsContent value="rotator">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Active Rotator Slots</CardTitle>
              <div className="flex gap-4 text-sm text-muted-foreground">
                <span className="text-primary font-medium">{slotsRes?.totalFree || 0} free</span>
                <span className="text-amber-500 font-medium">{slotsRes?.totalPaid || 0} paid</span>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Clicks</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {slotsRes?.slots?.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">No active slots.</TableCell></TableRow>
                  )}
                  {slotsRes?.slots?.map(slot => (
                    <TableRow key={slot.id}>
                      <TableCell className="font-medium">{slot.userEmail}</TableCell>
                      <TableCell>
                        <Badge variant={slot.slotType === "free" ? "outline" : "default"}>{slot.slotType}</Badge>
                      </TableCell>
                      <TableCell className="font-mono">{slot.clickCount}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDistanceToNow(new Date(slot.expiresAt), { addSuffix: true })}
                      </TableCell>
                      <TableCell>
                        <Badge variant={slot.status === "active" ? "success" : "secondary"}>{slot.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => expireSlot({ slotId: slot.id })}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── USERS TAB ── */}
        <TabsContent value="users">
          <Card>
            <CardHeader>
              <CardTitle>Registered Users <span className="text-muted-foreground text-base font-normal ml-2">({usersRes?.users?.length || 0})</span></CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead>Privy Wallet</TableHead>
                    <TableHead>Links</TableHead>
                    <TableHead>Offers</TableHead>
                    <TableHead>Active Slots</TableHead>
                    <TableHead>Referral Code</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usersRes?.users?.length === 0 && (
                    <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">No users yet.</TableCell></TableRow>
                  )}
                  {usersRes?.users?.map(u => {
                    const walletLinks = (u as any).walletLinks as Array<{ url: string; displayName: string; linkType: string }> ?? [];
                    const walletAddress = (u as any).walletAddress as string | null;
                    return (
                      <TableRow key={u.id}>
                        <TableCell className="font-medium">{u.email}</TableCell>
                        <TableCell>
                          <Badge variant={u.role === "admin" ? "destructive" : "secondary"}>{u.role}</Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(u.createdAt).toLocaleDateString()}
                        </TableCell>
                        {/* Privy Wallet */}
                        <TableCell>
                          {walletAddress ? (
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded">
                                {walletAddress.slice(0, 6)}…{walletAddress.slice(-4)}
                              </span>
                              <button
                                onClick={() => navigator.clipboard.writeText(walletAddress).then(() => toast({ title: "Wallet address copied" }))}
                                className="text-muted-foreground hover:text-foreground transition-colors"
                                title={walletAddress}
                              >
                                <Copy className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground/40 italic">not set</span>
                          )}
                        </TableCell>
                        {/* Rotator / Link Tree */}
                        <TableCell className="max-w-xs">
                          {walletLinks.length === 0 ? (
                            <span className="text-xs text-muted-foreground/40 italic">none</span>
                          ) : (
                            <div className="space-y-1">
                              {walletLinks.map((lnk, i) => (
                                <div key={i} className="flex items-center gap-1.5">
                                  <a
                                    href={lnk.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-primary hover:underline truncate max-w-[160px]"
                                    title={lnk.url}
                                  >
                                    {lnk.displayName || lnk.url}
                                  </a>
                                </div>
                              ))}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="font-mono">{u.offerSignupCount}</TableCell>
                        <TableCell>
                          <span className={u.activeSlots > 0 ? "text-primary font-bold" : "text-muted-foreground"}>{u.activeSlots}</span>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{(u as any).referralCode || "—"}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── SETTINGS TAB ── */}
        <TabsContent value="settings" className="space-y-6">

          {/* DM Sequences Editor */}
          <Card className="max-w-2xl border-border/40">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Mail className="w-5 h-5 text-primary" /> DM Sequences</CardTitle>
              <CardDescription>Edit outreach steps. Use <code className="text-xs bg-muted px-1 rounded">{"{{handle}}"}</code> and <code className="text-xs bg-muted px-1 rounded">{"{{trackingLink}}"}</code> as placeholders.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!seqData?.sequences?.length ? (
                <p className="text-sm text-muted-foreground">No sequences found. They are seeded on worker startup.</p>
              ) : (
                seqData.sequences.map(seq => (
                  <div key={seq.id} className="border border-border/40 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-sm">{seq.name}</p>
                        <p className="text-xs text-muted-foreground font-mono">{seq.agentSlug} · {seq.steps.length} step(s)</p>
                      </div>
                      {editingSeqId === seq.id ? (
                        <div className="flex gap-2">
                          <Button size="sm" variant="ghost" onClick={() => setEditingSeqId(null)}>Cancel</Button>
                          <Button size="sm" disabled={isSavingSeq}
                            onClick={() => saveSeq({ id: seq.id, name: editingSeqName, steps: editingSteps })}>
                            {isSavingSeq ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : "Save"}
                          </Button>
                        </div>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => {
                          setEditingSeqId(seq.id);
                          setEditingSeqName(seq.name);
                          setEditingSteps(seq.steps.map(s => ({ ...s })));
                        }}>Edit</Button>
                      )}
                    </div>

                    {editingSeqId === seq.id ? (
                      <div className="space-y-3">
                        <div className="space-y-1.5">
                          <label className="text-xs font-medium">Sequence Name</label>
                          <Input value={editingSeqName} onChange={e => setEditingSeqName(e.target.value)} className="h-8 text-sm" />
                        </div>
                        {editingSteps.map((step, idx) => (
                          <div key={idx} className="border border-border/30 rounded-lg p-3 space-y-2 bg-muted/10">
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-semibold text-muted-foreground">Step {idx + 1}</p>
                              {editingSteps.length > 1 && (
                                <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive"
                                  onClick={() => setEditingSteps(prev => prev.filter((_, i) => i !== idx))}>
                                  <Minus className="w-3 h-3" />
                                </Button>
                              )}
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                              <div className="space-y-1">
                                <label className="text-[10px] text-muted-foreground">Delay (hours)</label>
                                <Input type="number" min={0} value={step.delayHours}
                                  onChange={e => setEditingSteps(prev => prev.map((s, i) => i === idx ? { ...s, delayHours: Number(e.target.value) } : s))}
                                  className="h-7 text-xs" />
                              </div>
                              <div className="col-span-2 space-y-1">
                                <label className="text-[10px] text-muted-foreground">Message (supports {"{{handle}}"}, {"{{trackingLink}}"})</label>
                                <Textarea rows={3} value={step.message}
                                  onChange={e => setEditingSteps(prev => prev.map((s, i) => i === idx ? { ...s, message: e.target.value } : s))}
                                  className="text-xs resize-none" />
                              </div>
                            </div>
                          </div>
                        ))}
                        <Button size="sm" variant="outline" className="w-full gap-1 h-8"
                          onClick={() => setEditingSteps(prev => [...prev, { stepIndex: prev.length, delayHours: 48, message: "" }])}>
                          <Plus className="w-3.5 h-3.5" /> Add Step
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {seq.steps.map((s, i) => (
                          <div key={i} className="flex gap-3 text-xs text-muted-foreground">
                            <span className="shrink-0 font-mono w-16">+{s.delayHours}h</span>
                            <p className="line-clamp-2 leading-relaxed">{s.message || <em>Empty</em>}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="max-w-2xl border-border/40">
            <CardHeader>
              <CardTitle>System Configuration</CardTitle>
              <CardDescription>Changes take effect immediately on save.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Daily Lead Cap</label>
                  <Input type="number" value={localSettings.dailyCap || ""} onChange={e => setLocalSettings({ ...localSettings, dailyCap: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Free Slot Capacity</label>
                  <Input type="number" value={localSettings.freeSlotCapacity || ""} onChange={e => setLocalSettings({ ...localSettings, freeSlotCapacity: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Paid Slot Capacity</label>
                  <Input type="number" value={localSettings.paidSlotCapacity || ""} onChange={e => setLocalSettings({ ...localSettings, paidSlotCapacity: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Slot Duration (hours)</label>
                  <Input type="number" value={localSettings.slotDurationHours || ""} onChange={e => setLocalSettings({ ...localSettings, slotDurationHours: e.target.value })} />
                </div>
                <div className="space-y-1.5 col-span-2">
                  <label className="text-sm font-medium">Fallback URL (when rotator is empty)</label>
                  <Input value={localSettings.fallbackUrl || ""} placeholder="https://your-default-offer.com" onChange={e => setLocalSettings({ ...localSettings, fallbackUrl: e.target.value })} />
                </div>
              </div>

              <div className="border-t border-border/40 pt-5 space-y-4">
                {/* Lead Approval Mode Toggle */}
                <div className="flex items-center justify-between p-4 rounded-xl border border-border/40 bg-card/50">
                  <div>
                    <p className="font-medium text-sm">Lead Approval Mode</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {localSettings.leadApprovalMode === "auto"
                        ? "Auto-approve: Drafts immediately become approved without manual review."
                        : "Manual review: Drafted leads require admin approval before posting."}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 shrink-0"
                    onClick={() => setLocalSettings({ ...localSettings, leadApprovalMode: localSettings.leadApprovalMode === "auto" ? "manual" : "auto" })}
                  >
                    {localSettings.leadApprovalMode === "auto"
                      ? <><ToggleRight className="w-4 h-4 text-primary" /> Auto</>
                      : <><ToggleLeft className="w-4 h-4" /> Manual</>}
                  </Button>
                </div>

                {/* System Pause Toggle */}
                <div className="flex items-center justify-between p-4 rounded-xl border border-destructive/20 bg-destructive/5">
                  <div>
                    <p className="font-medium text-sm">System Status</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {localSettings.isPaused ? "System is PAUSED — agent not sending traffic." : "System is ACTIVE — agent running normally."}
                    </p>
                  </div>
                  <Button
                    variant={localSettings.isPaused ? "default" : "destructive"}
                    size="sm"
                    onClick={() => setLocalSettings({ ...localSettings, isPaused: !localSettings.isPaused })}
                  >
                    {localSettings.isPaused ? "Resume System" : "Pause System"}
                  </Button>
                </div>
              </div>

              <Button className="w-full" onClick={() => updateSettings({ data: { ...localSettings, freeSlotCapacity: Number(localSettings.freeSlotCapacity), paidSlotCapacity: Number(localSettings.paidSlotCapacity), dailyCap: Number(localSettings.dailyCap), slotDurationHours: Number(localSettings.slotDurationHours) } })} disabled={isSavingSettings}>
                {isSavingSettings ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : null}
                Save All Settings
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── AGENTS TAB ── */}
        <TabsContent value="agents">
          <AgentsFleetTab token={token} />
        </TabsContent>

        {/* ── WALLETS TAB ── */}
        <TabsContent value="wallets">
          <WalletsTab token={token} />
        </TabsContent>

      </Tabs>
    </div>
  );
}

// ─── Agents Fleet Tab ──────────────────────────────────────────────────────────

function AgentsFleetTab({ token }: { token: string | null }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    slug: "", name: "", description: "", offerUrl: "",
    freeSlotCapacity: 25, paidSlotCapacity: 25,
    slotDurationHours: 24, dailyCap: 100, paidSlotPrice: 9.99,
  });

  const headers = token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };

  const { data, isLoading, refetch } = useQuery<{ agents: any[] }>({
    queryKey: ["admin-fleet"],
    queryFn: () => fetch("/api/admin/agents-fleet", { headers }).then(r => r.json()),
    staleTime: 20_000,
  });

  const togglePause = useMutation({
    mutationFn: (id: string) => fetch(`/api/admin/agents/${id}/toggle-pause`, { method: "POST", headers }).then(r => r.json()),
    onSuccess: () => { toast({ title: "Updated" }); qc.invalidateQueries({ queryKey: ["admin-fleet"] }); },
  });

  const mintAgent = useMutation({
    mutationFn: (id: string) => fetch(`/api/admin/agents/${id}/mint`, { method: "POST", headers }).then(r => r.json()),
    onSuccess: (data: any) => { toast({ title: data.message || "Mint updated" }); qc.invalidateQueries({ queryKey: ["admin-fleet"] }); },
  });

  const deleteAgent = useMutation({
    mutationFn: (id: string) => fetch(`/api/admin/agents/${id}`, { method: "DELETE", headers }).then(r => r.json()),
    onSuccess: () => { toast({ title: "Agent deleted" }); qc.invalidateQueries({ queryKey: ["admin-fleet"] }); },
  });

  const saveEdit = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      fetch(`/api/admin/agents/${id}`, { method: "PUT", headers, body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => { toast({ title: "Saved" }); setEditingId(null); qc.invalidateQueries({ queryKey: ["admin-fleet"] }); },
  });

  const createAgent = useMutation({
    mutationFn: (data: any) => fetch("/api/admin/agents", { method: "POST", headers, body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: (res: any) => {
      if (res.error) { toast({ title: "Error", description: res.error, variant: "destructive" }); return; }
      toast({ title: "Agent created", description: res.agent?.name });
      setShowCreate(false);
      setCreateForm({ slug: "", name: "", description: "", offerUrl: "", freeSlotCapacity: 25, paidSlotCapacity: 25, slotDurationHours: 24, dailyCap: 100, paidSlotPrice: 9.99 });
      qc.invalidateQueries({ queryKey: ["admin-fleet"] });
    },
  });

  const agents: any[] = data?.agents ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Agent Fleet</h2>
          <p className="text-sm text-muted-foreground mt-0.5">{agents.length} agent(s) registered. Each has its own rotator, ICP context, and Composio connection.</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => refetch()}><RefreshCw className="w-3.5 h-3.5 mr-1" />Refresh</Button>
          <Button size="sm" onClick={() => setShowCreate(v => !v)}><Plus className="w-3.5 h-3.5 mr-1" />New Agent</Button>
        </div>
      </div>

      {/* Create form */}
      {showCreate && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-3"><CardTitle className="text-base">Create Agent</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid md:grid-cols-2 gap-3">
              {[
                { key: "slug", label: "Slug (URL-safe)", placeholder: "my-agent" },
                { key: "name", label: "Name", placeholder: "Agent Name" },
                { key: "offerUrl", label: "Offer URL", placeholder: "https://…" },
                { key: "description", label: "Description", placeholder: "What this agent does" },
              ].map(f => (
                <div key={f.key} className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">{f.label}</label>
                  <Input placeholder={f.placeholder} value={(createForm as any)[f.key]} onChange={e => setCreateForm({ ...createForm, [f.key]: e.target.value })} />
                </div>
              ))}
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Free Slot Capacity</label>
                <Input type="number" value={createForm.freeSlotCapacity} onChange={e => setCreateForm({ ...createForm, freeSlotCapacity: Number(e.target.value) })} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Paid Slot Price ($)</label>
                <Input type="number" step="0.01" value={createForm.paidSlotPrice} onChange={e => setCreateForm({ ...createForm, paidSlotPrice: Number(e.target.value) })} />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button size="sm" onClick={() => createAgent.mutate(createForm)} disabled={createAgent.isPending}>
                {createAgent.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1" /> : <Plus className="w-3.5 h-3.5 mr-1" />} Create Agent
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="space-y-3">{[1,2].map(i => <Skeleton key={i} className="h-24 w-full" />)}</div>
      ) : agents.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground"><Bot className="w-10 h-10 mx-auto mb-3 opacity-30" /><p>No agents found. Create one above.</p></div>
      ) : (
        <div className="space-y-3">
          {agents.map((agent: any) => (
            <Card key={agent.id} className={`border-border/50 transition-colors ${agent.isPaused ? "opacity-70" : ""}`}>
              <div className="p-4">
                <div className="flex items-start gap-3">
                  {/* Avatar / icon */}
                  <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
                    {agent.avatarUrl
                      ? <img src={agent.avatarUrl} className="w-full h-full object-cover rounded-xl" alt={agent.name} />
                      : <Bot className="w-5 h-5 text-primary" />}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">{agent.name}</span>
                      <span className="text-xs text-muted-foreground font-mono">/{agent.slug}</span>
                      {agent.isPaused
                        ? <Badge variant="secondary" className="text-xs">Paused</Badge>
                        : <Badge className="text-xs bg-green-500/15 text-green-400 border border-green-500/30">Active</Badge>}
                      {agent.nftMintEnabled && (
                        <Badge className="text-xs bg-violet-500/15 text-violet-400 border border-violet-500/30">
                          <Gem className="w-2.5 h-2.5 mr-0.5" /> NFT Minted
                        </Badge>
                      )}
                      {agent.composioEntityId && (
                        <Badge variant="outline" className="text-xs">
                          <Plug className="w-2.5 h-2.5 mr-0.5" /> Composio
                        </Badge>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                      <span>Free: {agent.activeFreeSlots}/{agent.freeSlotCapacity}</span>
                      <span>Paid: {agent.activePaidSlots}/{agent.paidSlotCapacity}</span>
                      <span>Clicks: {agent.totalClicks}</span>
                      <span>Signups: {agent.totalSignups}</span>
                      <span>Today: {agent.dailyLeadCount} leads</span>
                      {agent.twitterHandle && <span className="text-primary">𝕏 @{agent.twitterHandle}</span>}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap justify-end">
                    <Button size="sm" variant="outline" className="h-7 px-2 text-xs"
                      onClick={() => { setExpanded(expanded === agent.id ? null : agent.id); setEditingId(null); }}>
                      {expanded === agent.id ? <ChevronUp className="w-3 h-3" /> : <Settings2 className="w-3 h-3" />}
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 px-2 text-xs"
                      onClick={() => togglePause.mutate(agent.id)} disabled={togglePause.isPending}>
                      {agent.isPaused ? <PlayCircle className="w-3 h-3 text-green-400" /> : <PauseCircle className="w-3 h-3 text-amber-400" />}
                    </Button>
                    <Button size="sm" variant="outline" className={`h-7 px-2 text-xs ${agent.nftMintEnabled ? "border-violet-500/40 text-violet-400" : ""}`}
                      onClick={() => mintAgent.mutate(agent.id)} disabled={mintAgent.isPending} title={agent.nftMintEnabled ? "Revoke NFT mint" : "Mint NFT"}>
                      <Gem className="w-3 h-3" />
                    </Button>
                    {agent.slug !== "ralph" && (
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                        onClick={() => { if (confirm(`Delete "${agent.name}"?`)) deleteAgent.mutate(agent.id); }}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                </div>

                {/* Expanded: edit profile + ICP + Composio */}
                {expanded === agent.id && (
                  <div className="mt-4 pt-4 border-t border-border/40 space-y-4">
                    {editingId !== agent.id ? (
                      <>
                        {/* Profile read view */}
                        <div className="grid md:grid-cols-3 gap-3 text-xs">
                          <div><p className="text-muted-foreground mb-0.5">Offer URL</p><a href={agent.offerUrl} target="_blank" className="text-primary hover:underline truncate block">{agent.offerUrl || "—"}</a></div>
                          <div><p className="text-muted-foreground mb-0.5">Twitter</p><p>{agent.twitterHandle ? `@${agent.twitterHandle}` : "—"}</p></div>
                          <div><p className="text-muted-foreground mb-0.5">LinkedIn</p><p className="truncate">{agent.linkedinUrl || "—"}</p></div>
                          <div><p className="text-muted-foreground mb-0.5">Composio Entity ID</p><p className="font-mono">{agent.composioEntityId || "—"}</p></div>
                          <div><p className="text-muted-foreground mb-0.5">Slot Duration</p><p>{agent.slotDurationHours}h</p></div>
                          <div><p className="text-muted-foreground mb-0.5">Paid Slot Price</p><p>${agent.paidSlotPrice}</p></div>
                          <div className="md:col-span-3"><p className="text-muted-foreground mb-0.5">Persona</p><p className="italic">{agent.persona || "—"}</p></div>
                          <div className="md:col-span-3"><p className="text-muted-foreground mb-0.5">ICP Context (JSON)</p><p className="font-mono bg-muted/20 p-2 rounded text-[10px] max-h-20 overflow-auto">{agent.icpContext || "—"}</p></div>
                          {agent.nftMintEnabled && <div className="md:col-span-3"><p className="text-muted-foreground mb-0.5">NFT Token ID</p><p className="font-mono text-violet-400">{agent.nftTokenId || "—"}</p></div>}
                        </div>
                        <Button size="sm" variant="outline" onClick={() => { setEditingId(agent.id); setEditForm({ ...agent }); }}>
                          <Settings2 className="w-3 h-3 mr-1" /> Edit Profile
                        </Button>
                      </>
                    ) : (
                      /* Edit form */
                      <div className="space-y-3">
                        <p className="text-sm font-medium">Editing: {agent.name}</p>
                        <div className="grid md:grid-cols-2 gap-3">
                          {[
                            { key: "name", label: "Name" },
                            { key: "twitterHandle", label: "Twitter Handle (no @)" },
                            { key: "linkedinUrl", label: "LinkedIn URL" },
                            { key: "avatarUrl", label: "Avatar URL" },
                            { key: "offerUrl", label: "Offer URL" },
                            { key: "composioEntityId", label: "Composio Entity ID" },
                          ].map(f => (
                            <div key={f.key} className="space-y-1">
                              <label className="text-xs font-medium text-muted-foreground">{f.label}</label>
                              <Input value={editForm[f.key] || ""} onChange={e => setEditForm({ ...editForm, [f.key]: e.target.value })} />
                            </div>
                          ))}
                          <div className="space-y-1 md:col-span-2">
                            <label className="text-xs font-medium text-muted-foreground">Persona (shown to Moltis)</label>
                            <Textarea rows={2} value={editForm.persona || ""} onChange={e => setEditForm({ ...editForm, persona: e.target.value })} />
                          </div>
                          <div className="space-y-1 md:col-span-2">
                            <label className="text-xs font-medium text-muted-foreground">ICP Context JSON <span className="text-primary">(keywords, painPoints arrays)</span></label>
                            <Textarea rows={3} className="font-mono text-xs" placeholder='{"keywords":["btc","crypto"],"painPoints":["High ad costs"]}' value={editForm.icpContext || ""} onChange={e => setEditForm({ ...editForm, icpContext: e.target.value })} />
                          </div>
                          <div className="space-y-1 md:col-span-2">
                            <label className="text-xs font-medium text-muted-foreground">Post Templates JSON (array of strings)</label>
                            <Textarea rows={3} className="font-mono text-xs" placeholder='["Template 1…","Template 2…"]' value={editForm.postTemplates || ""} onChange={e => setEditForm({ ...editForm, postTemplates: e.target.value })} />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-muted-foreground">Free Slot Capacity</label>
                            <Input type="number" value={editForm.freeSlotCapacity || ""} onChange={e => setEditForm({ ...editForm, freeSlotCapacity: Number(e.target.value) })} />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-muted-foreground">Paid Slot Price ($)</label>
                            <Input type="number" step="0.01" value={editForm.paidSlotPrice || ""} onChange={e => setEditForm({ ...editForm, paidSlotPrice: Number(e.target.value) })} />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => saveEdit.mutate({ id: agent.id, data: editForm })} disabled={saveEdit.isPending}>
                            {saveEdit.isPending ? <RefreshCw className="w-3 h-3 animate-spin mr-1" /> : <Check className="w-3 h-3 mr-1" />} Save
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Wallets Tab ───────────────────────────────────────────────────────────────

function WalletsTab({ token }: { token: string | null }) {
  const { toast } = useToast();
  const [selected, setSelected] = useState<string[]>([]);
  const headers = token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };

  const { data, isLoading, refetch } = useQuery<{
    wallets: any[];
    totalWithAddress: number;
    totalPending: number;
    totalActive: number;
  }>({
    queryKey: ["admin-wallets"],
    queryFn: () => fetch("/api/admin/wallets", { headers }).then(r => r.json()),
    staleTime: 30_000,
  });

  const sweep = useMutation({
    mutationFn: (userIds: string[]) =>
      fetch("/api/admin/wallets/sweep", { method: "POST", headers, body: JSON.stringify({ userIds }) }).then(r => r.json()),
    onSuccess: (res: any) => {
      toast({ title: "Sweep initiated", description: res.message });
      setSelected([]);
    },
  });

  const wallets: any[] = data?.wallets ?? [];
  const allSelected = wallets.length > 0 && selected.length === wallets.length;

  function toggleAll() {
    setSelected(allSelected ? [] : wallets.map(w => w.id));
  }
  function toggle(id: string) {
    setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "With Address", value: data?.totalWithAddress ?? "—", icon: Wallet, color: "text-primary" },
          { label: "Pending",      value: data?.totalPending ?? "—",    icon: Clock,  color: "text-amber-400" },
          { label: "Active",       value: data?.totalActive ?? "—",     icon: CheckCircle, color: "text-green-400" },
        ].map(s => (
          <Card key={s.label} className="glass-panel border-border/50">
            <CardContent className="p-4 flex items-center gap-3">
              <s.icon className={`w-5 h-5 ${s.color}`} />
              <div>
                <p className="text-xl font-bold">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Actions bar */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {selected.length > 0 ? `${selected.length} selected` : `${wallets.length} users total`}
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => refetch()}><RefreshCw className="w-3.5 h-3.5 mr-1" />Refresh</Button>
          <Button size="sm" disabled={selected.length === 0 || sweep.isPending}
            onClick={() => sweep.mutate(selected)}>
            <Wallet className="w-3.5 h-3.5 mr-1" /> Sweep {selected.length > 0 ? `(${selected.length})` : "Selected"}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : wallets.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground"><Wallet className="w-10 h-10 mx-auto mb-3 opacity-30" /><p>No users yet.</p></div>
      ) : (
        <Card className="border-border/50">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} className="rounded" />
                </TableHead>
                <TableHead>User</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Wallet Address</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Referred By Wallet</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {wallets.map((w: any) => (
                <TableRow key={w.id} className={selected.includes(w.id) ? "bg-primary/5" : ""}>
                  <TableCell>
                    <input type="checkbox" checked={selected.includes(w.id)} onChange={() => toggle(w.id)} className="rounded" />
                  </TableCell>
                  <TableCell className="text-xs">{w.email}</TableCell>
                  <TableCell><span className="font-mono text-xs text-primary">/{w.slug}</span></TableCell>
                  <TableCell>
                    {w.walletAddress
                      ? <span className="font-mono text-xs">{w.walletAddress.slice(0,10)}…{w.walletAddress.slice(-6)}</span>
                      : <span className="text-muted-foreground text-xs">—</span>}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-xs ${
                      w.walletStatus === "active" ? "text-green-400 border-green-500/30" :
                      w.walletStatus === "pending" ? "text-amber-400 border-amber-500/30" : "text-muted-foreground"
                    }`}>{w.walletStatus}</Badge>
                  </TableCell>
                  <TableCell className="text-xs">{w.roleLabel || "—"}</TableCell>
                  <TableCell>
                    {w.walletAddress
                      ? <span className="font-mono text-[10px] text-muted-foreground">{w.walletAddress.slice(0,8)}…</span>
                      : <span className="text-muted-foreground text-xs">no wallet</span>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
