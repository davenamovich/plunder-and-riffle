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
  Settings2, ExternalLink, Plug, Link2, MessageSquare, Loader2,
  Tag, Edit3, Gift, ShieldCheck, UserPlus, UserMinus, UserCheck, ArrowRight,
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
  const { user, isAuthenticated, isLoading, token } = useAuth();
  const { toast } = useToast();
  const [leadStatusFilter, setLeadStatusFilter] = useState("pending_approval");
  const [rejectReason, setRejectReason] = useState("");
  const [rejectingId, setRejectingId] = useState<string | null>(null);

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

  // Wait for auth to finish loading before deciding to redirect
  if (isLoading || (token && !user)) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">Loading…</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || user?.role !== "admin") {
    return <Redirect to="/" />;
  }

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
          <p className="text-sm text-muted-foreground">Manage the Plunder and Riffle platform</p>
        </div>
      </div>

      <Tabs defaultValue="ralph" className="w-full">
        <TabsList className="grid w-full md:w-auto md:inline-grid grid-cols-11 h-11 mb-8">
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
          <TabsTrigger value="offers" className="flex items-center gap-1.5">
            <Tag className="w-3.5 h-3.5" /> Offers
          </TabsTrigger>
          <TabsTrigger value="chat" className="flex items-center gap-1.5">
            <MessageSquare className="w-3.5 h-3.5" /> Chat
          </TabsTrigger>
          <TabsTrigger value="sports" className="flex items-center gap-1.5">
            ⚽ Tips
          </TabsTrigger>
          <TabsTrigger value="tokens" className="flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5" /> Tokens
          </TabsTrigger>
          <TabsTrigger value="fleet-metrics" className="flex items-center gap-1.5">
            <Wallet className="w-3.5 h-3.5" /> Fleet
          </TabsTrigger>
          <TabsTrigger value="persona-engine" className="flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5" /> Persona Engine
          </TabsTrigger>
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

              {/* NFT Thresholds */}
              <div className="border border-amber-500/20 bg-amber-500/5 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Gem className="w-4 h-4 text-amber-400" />
                  <p className="text-sm font-medium">NFT Earn Thresholds</p>
                  <p className="text-xs text-muted-foreground">— either condition unlocks the badge</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Referrals needed</label>
                    <Input
                      type="number" min={1} max={100}
                      value={localSettings.nftReferralThreshold ?? 3}
                      onChange={e => setLocalSettings({ ...localSettings, nftReferralThreshold: Number(e.target.value) })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Viral hooks needed</label>
                    <Input
                      type="number" min={1} max={100}
                      value={localSettings.nftViralThreshold ?? 3}
                      onChange={e => setLocalSettings({ ...localSettings, nftViralThreshold: Number(e.target.value) })}
                    />
                  </div>
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

              <Button className="w-full" onClick={() => updateSettings({ data: { ...localSettings, freeSlotCapacity: Number(localSettings.freeSlotCapacity), paidSlotCapacity: Number(localSettings.paidSlotCapacity), dailyCap: Number(localSettings.dailyCap), slotDurationHours: Number(localSettings.slotDurationHours), nftReferralThreshold: Number(localSettings.nftReferralThreshold ?? 3), nftViralThreshold: Number(localSettings.nftViralThreshold ?? 3) } })} disabled={isSavingSettings}>
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

        {/* ── OFFERS TAB ── */}
        <TabsContent value="offers">
          <OffersTab token={token} />
        </TabsContent>

        {/* ── CHAT TAB ── */}
        <TabsContent value="chat">
          <MoltisChatTab token={token} />
        </TabsContent>

        {/* ── SPORTS TIPS TAB ── */}
        <TabsContent value="sports">
          <SportsTipsTab token={token} />
        </TabsContent>

        <TabsContent value="tokens">
          <TokenUsageTab token={token} />
        </TabsContent>

        <TabsContent value="fleet-metrics">
          <AgentFleetMetricsTab token={token} />
        </TabsContent>

        <TabsContent value="persona-engine">
          <AgentPersonaEngineTab token={token} />
        </TabsContent>

      </Tabs>
    </div>
  );
}

// ─── Agent Character Panel ─────────────────────────────────────────────────────

const UGC_CHARACTERS = [
  {
    key: "manager",
    name: "The Manager",
    imageUrl: "/characters/char_manager.png",
    style: "Deadpan middle manager",
    prompt: "Deadpan corporate middle manager, rumpled blazer, loosened tie, earnest thousand-yard stare. Speaks in flat, measured tones. Never excited. Treats company collapse as a logistics problem.",
  },
  {
    key: "believer",
    name: "The True Believer",
    imageUrl: "/characters/char_employee.png",
    style: "Earnest true believer",
    prompt: "Young enthusiastic true-believer employee who genuinely thinks everything is fine. Overly ironed polo, lanyard, slight forced smile. Speaks with too much conviction about mundane things.",
  },
  {
    key: "it",
    name: "The IT Guy",
    imageUrl: "/characters/char_it.png",
    style: "Exhausted skeptic",
    prompt: "Exhausted, slightly dead-eyed IT worker in a hoodie under a blazer. Has seen everything. Responds to all questions with quiet, resigned expertise. Nothing surprises them anymore.",
  },
];

function AgentCharacterPanel({ agent, token }: { agent: any; token: string | null }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);

  const selectCharacter = async (char: typeof UGC_CHARACTERS[0]) => {
    if (!token) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/agents/${agent.id}/character`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          characterName: char.name,
          characterStyle: char.style,
          characterImageUrl: char.imageUrl,
          characterPrompt: char.prompt,
        }),
      });
      if (!res.ok) throw new Error("Failed to save");
      await qc.invalidateQueries({ queryKey: ["admin-agents-fleet"] });
      toast({ title: `Character set: ${char.name}`, description: "Engine will use this voice for TikTok content." });
    } catch {
      toast({ title: "Error", description: "Could not save character.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const clearCharacter = async () => {
    if (!token) return;
    setSaving(true);
    try {
      await fetch(`/api/admin/agents/${agent.id}/character`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ characterName: null, characterStyle: null, characterImageUrl: null, characterPrompt: null }),
      });
      await qc.invalidateQueries({ queryKey: ["admin-agents-fleet"] });
      toast({ title: "Character cleared" });
    } catch {
      toast({ title: "Error", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border border-border/40 rounded-lg p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium">UGC Character</span>
          {agent.characterName
            ? <Badge className="text-xs bg-amber-500/15 text-amber-400 border border-amber-500/30">{agent.characterName}</Badge>
            : <Badge variant="outline" className="text-xs text-muted-foreground">None assigned</Badge>}
        </div>
        {agent.characterName && (
          <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-muted-foreground"
            onClick={clearCharacter} disabled={saving}>
            Clear
          </Button>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {UGC_CHARACTERS.map(char => {
          const isActive = agent.characterName === char.name;
          return (
            <button
              key={char.key}
              onClick={() => selectCharacter(char)}
              disabled={saving}
              className={`relative rounded-lg overflow-hidden border-2 transition-all text-left ${
                isActive
                  ? "border-amber-500 ring-1 ring-amber-500/40"
                  : "border-border/40 hover:border-border"
              }`}
            >
              <img src={char.imageUrl} alt={char.name} className="w-full aspect-[9/16] object-cover" />
              <div className={`absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent`} />
              <div className="absolute bottom-0 left-0 right-0 p-1.5">
                <p className="text-[10px] font-medium text-white leading-tight">{char.name}</p>
                <p className="text-[9px] text-white/60 leading-tight">{char.style}</p>
              </div>
              {isActive && (
                <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-amber-500 flex items-center justify-center">
                  <Check className="w-2.5 h-2.5 text-black" />
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Agent Assistants Panel ────────────────────────────────────────────────────

function AgentAssistantsPanel({ agentId, token }: { agentId: string; token: string | null }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [email, setEmail] = useState("");

  const headers = token
    ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
    : { "Content-Type": "application/json" };

  const { data, isLoading } = useQuery<{ assistants: { id: string; userId: string; email: string; displayName: string | null; addedAt: string }[] }>({
    queryKey: ["agent-assistants", agentId],
    queryFn: () => fetch(`/api/admin/agents/${agentId}/assistants`, { headers }).then(r => r.json()),
    staleTime: 15_000,
  });

  const addAssistant = useMutation({
    mutationFn: (email: string) =>
      fetch(`/api/admin/agents/${agentId}/assistants`, {
        method: "POST", headers, body: JSON.stringify({ email }),
      }).then(r => r.json()),
    onSuccess: (res: any) => {
      if (res.error) { toast({ title: "Error", description: res.error, variant: "destructive" }); return; }
      toast({ title: "Assistant added" });
      setEmail("");
      qc.invalidateQueries({ queryKey: ["agent-assistants", agentId] });
    },
  });

  const removeAssistant = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/admin/agents/${agentId}/assistants/${id}`, { method: "DELETE", headers }).then(r => r.json()),
    onSuccess: () => {
      toast({ title: "Assistant removed" });
      qc.invalidateQueries({ queryKey: ["agent-assistants", agentId] });
    },
  });

  return (
    <div className="rounded-lg border border-border/40 bg-muted/10 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <UserCheck className="w-3.5 h-3.5 text-primary" />
        <span className="text-xs font-medium">Assistants</span>
        {data && <Badge variant="outline" className="text-[10px]">{data.assistants.length}</Badge>}
      </div>

      {/* Add assistant */}
      <div className="flex gap-2">
        <Input
          placeholder="user@email.com"
          value={email}
          onChange={e => setEmail(e.target.value)}
          className="h-7 text-xs"
          onKeyDown={e => { if (e.key === "Enter" && email.trim()) addAssistant.mutate(email.trim()); }}
        />
        <Button
          size="sm" className="h-7 px-2 text-xs"
          disabled={!email.trim() || addAssistant.isPending}
          onClick={() => addAssistant.mutate(email.trim())}
        >
          {addAssistant.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserPlus className="w-3 h-3" />}
        </Button>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-1">
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-3/4" />
        </div>
      ) : data?.assistants.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">No assistants assigned.</p>
      ) : (
        <div className="space-y-1">
          {data?.assistants.map(a => (
            <div key={a.id} className="flex items-center gap-2 text-xs py-1 px-2 rounded-md bg-muted/20">
              <UserCheck className="w-3 h-3 text-muted-foreground flex-shrink-0" />
              <span className="flex-1 truncate">
                {a.displayName ? <><span className="font-medium">{a.displayName}</span> <span className="text-muted-foreground">&lt;{a.email}&gt;</span></> : a.email}
              </span>
              <span className="text-muted-foreground text-[10px] hidden sm:block">
                {formatDistanceToNow(new Date(a.addedAt), { addSuffix: true })}
              </span>
              <button
                className="text-destructive hover:text-destructive/80 flex-shrink-0"
                title="Remove assistant"
                onClick={() => { if (confirm(`Remove ${a.email} as assistant?`)) removeAssistant.mutate(a.id); }}
                disabled={removeAssistant.isPending}
              >
                <UserMinus className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
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

  const createCDPWallet = useMutation({
    mutationFn: ({ id, network }: { id: string; network?: string }) =>
      fetch(`/api/admin/agents/${id}/cdp-wallet`, { method: "POST", headers, body: JSON.stringify({ network: network ?? "base-mainnet" }) }).then(r => r.json()),
    onSuccess: (res: any) => {
      if (res.error) { toast({ title: "CDP Error", description: res.error, variant: "destructive" }); return; }
      toast({ title: "CDP Wallet Created", description: res.address });
      qc.invalidateQueries({ queryKey: ["admin-fleet"] });
    },
  });

  const deleteCDPWallet = useMutation({
    mutationFn: (id: string) => fetch(`/api/admin/agents/${id}/cdp-wallet`, { method: "DELETE", headers }).then(r => r.json()),
    onSuccess: () => { toast({ title: "CDP wallet record cleared" }); qc.invalidateQueries({ queryKey: ["admin-fleet"] }); },
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

                        {/* CDP Wallet section */}
                        <div className="rounded-lg border border-border/40 bg-muted/10 p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Wallet className="w-3.5 h-3.5 text-primary" />
                              <span className="text-xs font-medium">CDP Wallet</span>
                              {agent.cdpWalletAddress
                                ? <Badge className="text-xs bg-green-500/15 text-green-400 border border-green-500/30">Active</Badge>
                                : <Badge variant="outline" className="text-xs text-muted-foreground">Not provisioned</Badge>}
                            </div>
                            {agent.cdpWalletAddress ? (
                              <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-destructive hover:text-destructive"
                                onClick={() => { if (confirm("Clear CDP wallet record? (On-chain wallet still exists)")) deleteCDPWallet.mutate(agent.id); }}
                                disabled={deleteCDPWallet.isPending}>
                                <Trash2 className="w-3 h-3 mr-1" /> Clear
                              </Button>
                            ) : (
                              <Button size="sm" className="h-6 px-2 text-xs"
                                onClick={() => createCDPWallet.mutate({ id: agent.id, network: "base-mainnet" })}
                                disabled={createCDPWallet.isPending}>
                                {createCDPWallet.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Plus className="w-3 h-3 mr-1" />}
                                Create Wallet
                              </Button>
                            )}
                          </div>
                          {agent.cdpWalletAddress && (
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div>
                                <p className="text-muted-foreground mb-0.5">Address</p>
                                <p className="font-mono text-primary flex items-center gap-1">
                                  {agent.cdpWalletAddress.slice(0, 10)}…{agent.cdpWalletAddress.slice(-6)}
                                  <button onClick={() => navigator.clipboard.writeText(agent.cdpWalletAddress)} title="Copy" className="text-muted-foreground hover:text-foreground">
                                    <Copy className="w-2.5 h-2.5" />
                                  </button>
                                </p>
                              </div>
                              <div>
                                <p className="text-muted-foreground mb-0.5">Network</p>
                                <p>{agent.cdpWalletNetwork ?? "base-mainnet"}</p>
                              </div>
                              {agent.cdpWalletId && (
                                <div className="col-span-2">
                                  <p className="text-muted-foreground mb-0.5">Wallet ID</p>
                                  <p className="font-mono text-[10px] text-muted-foreground">{agent.cdpWalletId}</p>
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {/* UGC Character */}
                        <AgentCharacterPanel agent={agent} token={token} />

                        {/* Assistants */}
                        <AgentAssistantsPanel agentId={agent.id} token={token} />

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

  const [provisioningId, setProvisioningId] = useState<string | null>(null);
  const provisionWallet = useMutation({
    mutationFn: (userId: string) =>
      fetch(`/api/admin/users/${userId}/cdp-wallet`, { method: "POST", headers }).then(r => r.json()),
    onMutate: (userId) => setProvisioningId(userId),
    onSuccess: (res: any, userId) => {
      setProvisioningId(null);
      if (res.error) { toast({ title: "CDP Error", description: res.error, variant: "destructive" }); return; }
      toast({ title: "Wallet created", description: res.address });
      refetch();
    },
    onError: () => { setProvisioningId(null); toast({ title: "Error", description: "Wallet creation failed", variant: "destructive" }); },
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
                <TableHead>Wallet Address</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>CDP</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {wallets.map((w: any) => (
                <TableRow key={w.id} className={selected.includes(w.id) ? "bg-primary/5" : ""}>
                  <TableCell>
                    <input type="checkbox" checked={selected.includes(w.id)} onChange={() => toggle(w.id)} className="rounded" />
                  </TableCell>
                  <TableCell>
                    <div className="text-xs font-medium">{w.email}</div>
                    <div className="font-mono text-[10px] text-primary">/{w.slug}</div>
                  </TableCell>
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
                  <TableCell>
                    {w.cdpWalletId
                      ? <span className="font-mono text-[10px] text-green-400" title={w.cdpWalletId}>CDP ✓</span>
                      : <span className="text-[10px] text-muted-foreground">no CDP</span>}
                  </TableCell>
                  <TableCell className="text-xs">{w.roleLabel || "—"}</TableCell>
                  <TableCell className="text-right">
                    {!w.cdpWalletId && (
                      <Button size="sm" variant="outline" className="h-7 text-xs"
                        disabled={provisioningId === w.id}
                        onClick={() => provisionWallet.mutate(w.id)}>
                        {provisioningId === w.id
                          ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Creating…</>
                          : <><Wallet className="w-3 h-3 mr-1" />Create Wallet</>}
                      </Button>
                    )}
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

// ─── Moltis Chat Tab ───────────────────────────────────────────────────────────

interface ChatMsg { role: "user" | "assistant"; content: string; }

function MoltisChatTab({ token }: { token: string | null }) {
  const [messages, setMessages] = React.useState<ChatMsg[]>([]);
  const [input, setInput] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const bottomRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    setError(null);
    const next: ChatMsg[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setSending(true);
    try {
      const res = await fetch("/api/moltis/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ messages: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Chat request failed");
      const reply: string = data.choices?.[0]?.message?.content ?? data.reply ?? JSON.stringify(data);
      setMessages(prev => [...prev, { role: "assistant", content: reply }]);
    } catch (e: any) {
      setError(e.message ?? "Unknown error");
    } finally {
      setSending(false);
    }
  }

  return (
    <Card className="border-border/40 bg-card/50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageSquare className="w-4 h-4 text-primary" />
          Moltis AI Chat
        </CardTitle>
        <CardDescription>Chat directly with the Moltis AI gateway (Chutes.ai · Mistral Small)</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border border-border/30 bg-background/40 min-h-[420px] max-h-[520px] overflow-y-auto p-4 space-y-3">
          {messages.length === 0 && (
            <p className="text-center text-muted-foreground text-sm py-16">
              Send a message to start chatting with Moltis.
            </p>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
                m.role === "user"
                  ? "bg-primary text-primary-foreground rounded-br-sm"
                  : "bg-muted/60 text-foreground rounded-bl-sm border border-border/30"
              }`}>
                {m.content}
              </div>
            </div>
          ))}
          {sending && (
            <div className="flex justify-start">
              <div className="bg-muted/60 border border-border/30 rounded-xl rounded-bl-sm px-4 py-2.5">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
            </div>
          )}
          {error && (
            <div className="flex justify-center">
              <span className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-1.5">
                {error}
              </span>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !e.shiftKey && send()}
            placeholder="Message Moltis…"
            disabled={sending}
            className="flex-1"
          />
          <Button onClick={send} disabled={sending || !input.trim()} size="icon">
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Offers Tab ────────────────────────────────────────────────────────────────

const EMPTY_OFFER = {
  name: "", slug: "", description: "", offerUrl: "", logoUrl: "",
  agentId: "", commissionNotes: "", isActive: true, isQualifying: false,
};

function OffersTab({ token }: { token: string | null }) {
  const { toast } = useToast();
  const headers = token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_OFFER });
  const [saving, setSaving] = useState(false);

  const { data, isLoading, refetch } = useQuery<{ offers: any[]; agents: any[] }>({
    queryKey: ["admin-offers"],
    queryFn: () => fetch("/api/admin/offers", { headers }).then(r => r.json()),
    staleTime: 30_000,
  });

  const offers: any[] = data?.offers ?? [];
  const agents: any[] = data?.agents ?? [];

  function startCreate() {
    setForm({ ...EMPTY_OFFER });
    setEditingId(null);
    setShowForm(true);
  }

  function startEdit(offer: any) {
    setForm({
      name: offer.name,
      slug: offer.slug,
      description: offer.description ?? "",
      offerUrl: offer.offerUrl,
      logoUrl: offer.logoUrl ?? "",
      agentId: offer.agentId ?? "",
      commissionNotes: offer.commissionNotes ?? "",
      isActive: offer.isActive,
      isQualifying: offer.isQualifying,
    });
    setEditingId(offer.id);
    setShowForm(true);
  }

  function autoSlug(name: string) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  async function save() {
    if (!form.name || !form.slug || !form.offerUrl) {
      toast({ title: "Name, slug, and offer URL are required", variant: "destructive" }); return;
    }
    setSaving(true);
    try {
      const url = editingId ? `/api/admin/offers/${editingId}` : "/api/admin/offers";
      const method = editingId ? "PUT" : "POST";
      const res = await fetch(url, { method, headers, body: JSON.stringify(form) }).then(r => r.json());
      if (res.error) { toast({ title: "Error", description: res.error, variant: "destructive" }); return; }
      toast({ title: editingId ? "Offer updated" : "Offer created" });
      setShowForm(false);
      setEditingId(null);
      refetch();
    } catch {
      toast({ title: "Network error", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function deleteOffer(id: string, name: string) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/admin/offers/${id}`, { method: "DELETE", headers }).then(r => r.json());
    if (res.success) { toast({ title: "Offer deleted" }); refetch(); }
    else toast({ title: "Delete failed", description: res.error, variant: "destructive" });
  }

  async function toggleActive(offer: any) {
    const res = await fetch(`/api/admin/offers/${offer.id}`, {
      method: "PUT", headers, body: JSON.stringify({ isActive: !offer.isActive }),
    }).then(r => r.json());
    if (res.success) refetch();
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Offers Management</h2>
          <p className="text-sm text-muted-foreground">{offers.length} offer{offers.length !== 1 ? "s" : ""} total</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => refetch()}><RefreshCw className="w-3.5 h-3.5 mr-1" />Refresh</Button>
          <Button size="sm" onClick={startCreate}><Plus className="w-3.5 h-3.5 mr-1" />New Offer</Button>
        </div>
      </div>

      {/* Create / Edit Form */}
      {showForm && (
        <Card className="glass-panel border-primary/30">
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Gift className="w-4 h-4 text-primary" />
              {editingId ? "Edit Offer" : "Create New Offer"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Name *</label>
                <Input value={form.name} onChange={e => {
                  const n = e.target.value;
                  setForm(f => ({ ...f, name: n, slug: f.slug || autoSlug(n) }));
                }} placeholder="Bitcoin Course" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Slug *</label>
                <Input value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value }))} placeholder="bitcoin-course" className="font-mono" />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-xs font-medium text-muted-foreground">Offer URL *</label>
                <Input value={form.offerUrl} onChange={e => setForm(f => ({ ...f, offerUrl: e.target.value }))} placeholder="https://example.com/offer?ref=YOURCODE" />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-xs font-medium text-muted-foreground">Description</label>
                <Textarea rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Brief description of the offer…" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Logo URL</label>
                <Input value={form.logoUrl} onChange={e => setForm(f => ({ ...f, logoUrl: e.target.value }))} placeholder="https://…/logo.png" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Agent</label>
                <select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.agentId}
                  onChange={e => setForm(f => ({ ...f, agentId: e.target.value }))}>
                  <option value="">— No agent —</option>
                  {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-xs font-medium text-muted-foreground">Commission / Notes (shown to users)</label>
                <Input value={form.commissionNotes} onChange={e => setForm(f => ({ ...f, commissionNotes: e.target.value }))} placeholder="e.g. 25% lifetime commission" />
              </div>
              <div className="flex gap-6">
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <input type="checkbox" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} className="rounded" />
                  Active
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <input type="checkbox" checked={form.isQualifying} onChange={e => setForm(f => ({ ...f, isQualifying: e.target.checked }))} className="rounded" />
                  Qualifies for rotator slot
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => { setShowForm(false); setEditingId(null); }}>Cancel</Button>
              <Button onClick={save} disabled={saving}>
                {saving ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Saving…</> : "Save Offer"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Offers Table */}
      {isLoading ? (
        <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : offers.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Gift className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>No offers yet. Create your first one above.</p>
        </div>
      ) : (
        <Card className="border-border/50">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Offer</TableHead>
                <TableHead>Agent</TableHead>
                <TableHead>Ref Links</TableHead>
                <TableHead>Signups</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {offers.map(o => (
                <TableRow key={o.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {o.logoUrl
                        ? <img src={o.logoUrl} alt={o.name} className="w-7 h-7 rounded object-cover border border-border/30" />
                        : <div className="w-7 h-7 rounded bg-muted/50 flex items-center justify-center"><Tag className="w-3.5 h-3.5 text-muted-foreground" /></div>}
                      <div>
                        <div className="font-medium text-sm">{o.name}</div>
                        <div className="font-mono text-[10px] text-muted-foreground">{o.slug}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {o.agent
                      ? <div className="flex items-center gap-1.5 text-xs"><Bot className="w-3.5 h-3.5 text-primary" />{o.agent.name}</div>
                      : <span className="text-xs text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 text-xs">
                      <Link2 className="w-3.5 h-3.5 text-muted-foreground" />
                      {o.referrerLinkCount}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 text-xs">
                      <Users className="w-3.5 h-3.5 text-muted-foreground" />
                      {o.signupCount}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <Badge variant="outline" className={`text-[10px] ${o.isActive ? "text-green-400 border-green-500/30" : "text-muted-foreground"}`}>
                        {o.isActive ? "Active" : "Inactive"}
                      </Badge>
                      {o.isQualifying && <Badge variant="outline" className="text-[10px] text-primary border-primary/30"><Zap className="w-2.5 h-2.5 mr-1" />Qualifies</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title={o.isActive ? "Deactivate" : "Activate"} onClick={() => toggleActive(o)}>
                        {o.isActive ? <ToggleRight className="w-3.5 h-3.5 text-green-400" /> : <ToggleLeft className="w-3.5 h-3.5 text-muted-foreground" />}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Edit" onClick={() => startEdit(o)}>
                        <Edit3 className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" title="Delete" onClick={() => deleteOffer(o.id, o.name)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
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


// ─── Sports Tips Tab ─────────────────────────────────────────────────────────

function SportsTipsTab({ token }: { token: string | null }) {
  const [running, setRunning] = React.useState(false);
  const [pinging, setPinging] = React.useState(false);
  const [lastResult, setLastResult] = React.useState<any>(null);
  const [pingResult, setPingResult] = React.useState<boolean | null>(null);
  const { toast } = useToast();

  const handleRun = async () => {
    setRunning(true);
    setLastResult(null);
    try {
      const res = await fetch("/api/admin/sports-tips/run", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      setLastResult(data);
      if (data.success) {
        toast({ title: "Tips sent", description: `${data.tipsSent} tip(s) posted to Telegram.` });
      } else {
        toast({ title: "Error", description: data.error || "Something went wrong.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Request failed.", variant: "destructive" });
    } finally {
      setRunning(false);
    }
  };

  const handlePing = async () => {
    setPinging(true);
    setPingResult(null);
    try {
      const res = await fetch("/api/admin/sports-tips/ping", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      setPingResult(data.success);
      toast({
        title: data.success ? "Ping sent" : "Ping failed",
        description: data.success ? "Check your Telegram channel." : "Could not reach Telegram. Check bot is admin of the channel.",
        variant: data.success ? "default" : "destructive",
      });
    } catch {
      setPingResult(false);
      toast({ title: "Error", description: "Request failed.", variant: "destructive" });
    } finally {
      setPinging(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-semibold">⚽ Sports Tips Channel</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Deadpan AI tips posted to Telegram. Free daily fixtures, calm analysis, zero hype.
            Runs automatically every 6 hours during daylight UTC hours.
          </p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Channel Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              <span>Bot — <code className="text-xs bg-muted px-1 py-0.5 rounded">@Vessel26bot</code> → <code className="text-xs bg-muted px-1 py-0.5 rounded">@agenticintel</code></span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="w-2 h-2 rounded-full bg-blue-500" />
              <span>Schedule: every 6h (7am–10pm UTC)</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              <span>Sources: TheSportsDB (free), Polymarket signals</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="w-2 h-2 rounded-full bg-purple-500" />
              <span>LLM: Chutes.ai — deadpan sports fan persona</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              The Sports Fan
            </CardTitle>
          </CardHeader>
          <CardContent className="flex gap-4 items-start">
            <img
              src="/characters/char_sports_fan.png"
              alt="Sports Fan"
              className="w-16 h-20 rounded object-cover border border-border flex-shrink-0"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
            <div className="text-sm text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">The Sports Fan</p>
              <p>Calm. Researched. Slightly world-weary. Has done the analysis so you don't have to.</p>
              <p className="text-xs italic">"The stats suggest it. That's all I'm saying."</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Manual Controls
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <Button onClick={handlePing} disabled={pinging} variant="outline" size="sm">
              {pinging ? "Pinging…" : "📡 Ping Channel"}
            </Button>
            <Button onClick={handleRun} disabled={running} size="sm">
              {running ? "Fetching fixtures & posting…" : "⚽ Run Tips Now"}
            </Button>
          </div>
          {pingResult !== null && (
            <p className={`text-sm ${pingResult ? "text-green-600" : "text-destructive"}`}>
              {pingResult ? "✓ Ping delivered to channel." : "✗ Ping failed — ensure bot is an admin of the channel."}
            </p>
          )}
          {lastResult && (
            <div className="rounded-md border p-3 text-sm space-y-1 bg-muted/30">
              <p className="font-medium">{lastResult.success ? "✓ Run complete" : "✗ Run failed"}</p>
              {lastResult.success && (
                <>
                  <p className="text-muted-foreground">Fixtures found: <strong>{lastResult.fixturesFound}</strong></p>
                  <p className="text-muted-foreground">Tips sent: <strong>{lastResult.tipsSent}</strong></p>
                  <p className="text-muted-foreground">Briefing sent: <strong>{lastResult.briefingSent ? "yes" : "no"}</strong></p>
                </>
              )}
              {lastResult.error && <p className="text-destructive">{lastResult.error}</p>}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-dashed">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            How It Works
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>1. <strong>Fetch fixtures</strong> — pulls today's soccer matches from TheSportsDB (free, no key needed).</p>
          <p>2. <strong>Polymarket signals</strong> — checks prediction market odds for matching teams.</p>
          <p>3. <strong>LLM generation</strong> — Chutes.ai writes a deadpan pick per fixture (result, goals, BTTS, or corners).</p>
          <p>4. <strong>Telegram post</strong> — morning briefing + tips sent with a short delay between each.</p>
          <p>5. <strong>Fallback</strong> — if no fixtures found, handcrafted deadpan copy is used. Always posts something.</p>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Token Usage Tab ──────────────────────────────────────────────────────────

interface TokenRow {
  agentId: string | null;
  agentName: string | null;
  agentSlug: string | null;
  task: string;
  totalCalls: number;
  totalPrompt: number;
  totalCompletion: number;
  totalTokens: number;
  totalLeads: number;
}

interface TokenGrandTotal {
  totalCalls: number;
  totalTokens: number;
  totalPrompt: number;
  totalCompletion: number;
  totalLeads: number;
}

function TokenUsageTab({ token }: { token: string | null }) {
  const [rows, setRows] = React.useState<TokenRow[]>([]);
  const [grand, setGrand] = React.useState<TokenGrandTotal | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch("/api/admin/token-usage", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setRows(data.rows ?? []);
      setGrand(data.grandTotal ?? null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  React.useEffect(() => { load(); }, [load]);

  const taskBadge = (task: string) => {
    const colors: Record<string, string> = {
      classify: "bg-blue-100 text-blue-700",
      draft:    "bg-purple-100 text-purple-700",
      engine:   "bg-orange-100 text-orange-700",
      icp:      "bg-green-100 text-green-700",
      tip:      "bg-yellow-100 text-yellow-700",
      unknown:  "bg-muted text-muted-foreground",
    };
    return (
      <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded ${colors[task] ?? colors.unknown}`}>
        {task}
      </span>
    );
  };

  const fmt = (n: number | null | undefined) =>
    (n ?? 0).toLocaleString();

  return (
    <div className="space-y-6">
      {/* Grand total */}
      {grand && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[
            { label: "Total Calls", value: fmt(grand.totalCalls) },
            { label: "Total Tokens", value: fmt(grand.totalTokens) },
            { label: "Prompt Tokens", value: fmt(grand.totalPrompt) },
            { label: "Completion Tokens", value: fmt(grand.totalCompletion) },
            { label: "Leads Processed", value: fmt(grand.totalLeads) },
          ].map(s => (
            <Card key={s.label}>
              <CardContent className="pt-4 pb-3">
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className="text-xl font-bold tabular-nums">{s.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Breakdown table */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="w-4 h-4 text-primary" /> Token Usage by Agent & Task
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </CardHeader>
        <CardContent>
          {error && <p className="text-sm text-destructive mb-3">{error}</p>}
          {loading && !rows.length ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Loading token usage…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No token usage recorded yet. Token tracking starts with the next Ralph cycle.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="text-left py-2 pr-4 font-medium">Agent</th>
                    <th className="text-left py-2 pr-4 font-medium">Task</th>
                    <th className="text-right py-2 pr-4 font-medium">Calls</th>
                    <th className="text-right py-2 pr-4 font-medium">Leads</th>
                    <th className="text-right py-2 pr-4 font-medium">Prompt</th>
                    <th className="text-right py-2 pr-4 font-medium">Completion</th>
                    <th className="text-right py-2 font-medium">Total Tokens</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="py-2 pr-4 font-medium">
                        {r.agentName ?? <span className="text-muted-foreground italic">unattributed</span>}
                        {r.agentSlug && (
                          <span className="text-[10px] text-muted-foreground ml-1">@{r.agentSlug}</span>
                        )}
                      </td>
                      <td className="py-2 pr-4">{taskBadge(r.task)}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{fmt(r.totalCalls)}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{fmt(r.totalLeads)}</td>
                      <td className="py-2 pr-4 text-right tabular-nums text-muted-foreground">{fmt(r.totalPrompt)}</td>
                      <td className="py-2 pr-4 text-right tabular-nums text-muted-foreground">{fmt(r.totalCompletion)}</td>
                      <td className="py-2 text-right tabular-nums font-semibold">{fmt(r.totalTokens)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4 text-xs text-muted-foreground space-y-1">
          <p><strong>classify</strong> — batch scoring of raw leads (30 leads per call)</p>
          <p><strong>draft</strong> — reply drafting for high-intent leads (30 per call)</p>
          <p><strong>engine</strong> — agent engine post generation (1 per agent per cycle)</p>
          <p><strong>tip</strong> — sports tips generation (1 per fixture)</p>
          <p><strong>icp</strong> — ICP analysis from offer URL (on-demand)</p>
          <p className="pt-1 text-[11px]">Token tracking began after this version was deployed. Historical calls are not included.</p>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Agent Fleet Metrics Tab ──────────────────────────────────────────────────

interface WalletEntry {
  agentId: string; agentName: string; agentSlug: string;
  walletId: string | null; address: string | null; network: string;
  balances: { asset: string; amount: string; amountNumber: number }[];
  createdAt: string | null;
}

interface FleetData {
  wallets: WalletEntry[]; totalAgents: number;
  walletsProvisioned: number; walletsWithBalance: number;
}

interface AgentMetrics {
  agent: {
    id: string; name: string; slug: string; isPaused: boolean; isActive: boolean;
    createdAt: string; cdpWalletAddress: string | null; cdpWalletNetwork: string | null;
    cdpWalletCreatedAt: string | null; engineEnabled: boolean; engineLastRunAt: string | null;
  };
  leads: { total: number; byStatus: Record<string, number> };
  tokens: { byTask: { task: string; calls: number; totalTokens: number }[]; totalTokens: number };
  wallet: { balances: { asset: string; amount: string; amountNumber: number }[]; hasWallet: boolean };
  referrals: { signups: number };
}

function AgentFleetMetricsTab({ token }: { token: string | null }) {
  const { toast } = useToast();
  const [sweepAddress, setSweepAddress] = useState(import.meta.env.VITE_TREASURY_ADDRESS ?? "");
  const [sweeping, setSweeping] = useState(false);
  const [sweepResult, setSweepResult] = useState<any>(null);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [metricsCache, setMetricsCache] = useState<Record<string, AgentMetrics>>({});

  const { data: fleet, isLoading: fleetLoading, refetch: refetchFleet } = useQuery<FleetData>({
    queryKey: ["admin-agent-wallets"],
    queryFn: async () => {
      const r = await fetch("/api/admin/agent-wallets", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    enabled: !!token,
    refetchInterval: false,
  });

  async function loadAgentMetrics(agentId: string) {
    if (metricsCache[agentId]) { setSelectedAgent(agentId); return; }
    try {
      const r = await fetch(`/api/admin/agents/${agentId}/metrics`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      setMetricsCache(prev => ({ ...prev, [agentId]: data }));
      setSelectedAgent(agentId);
    } catch (e: any) {
      toast({ title: "Failed to load metrics", description: e.message, variant: "destructive" });
    }
  }

  async function doSweep() {
    if (!sweepAddress.trim()) { toast({ title: "Treasury address required", variant: "destructive" }); return; }
    setSweeping(true); setSweepResult(null);
    try {
      const r = await fetch("/api/admin/agent-wallets/sweep", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ toAddress: sweepAddress.trim(), assets: ["eth", "usdc"] }),
      });
      const data = await r.json();
      setSweepResult(data);
      if (data.swept > 0) toast({ title: `Swept ${data.swept} wallet(s) ✓` });
      else toast({ title: "No balances found to sweep", variant: "default" });
      refetchFleet();
    } catch (e: any) {
      toast({ title: "Sweep failed", description: e.message, variant: "destructive" });
    } finally { setSweeping(false); }
  }

  const selectedMetrics = selectedAgent ? metricsCache[selectedAgent] : null;
  const fmt = (n: number | null | undefined) => (n ?? 0).toLocaleString();

  return (
    <div className="space-y-6">

      {/* Fleet Summary */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total Agents", value: fleet?.totalAgents ?? "—" },
          { label: "Wallets Provisioned", value: fleet?.walletsProvisioned ?? "—" },
          { label: "Wallets With Balance", value: fleet?.walletsWithBalance ?? "—" },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="pt-5 text-center">
              <div className="text-2xl font-bold tabular-nums">{s.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Wallet Fleet Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between py-4">
          <div>
            <CardTitle className="text-base">Agent Wallets</CardTitle>
            <CardDescription className="text-xs">Live on-chain balances — Base mainnet</CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={() => refetchFleet()} disabled={fleetLoading}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${fleetLoading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </CardHeader>
        <CardContent>
          {fleetLoading ? (
            <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : !fleet?.wallets?.length ? (
            <p className="text-sm text-muted-foreground italic">No wallets provisioned yet. New agents get wallets auto-created on save.</p>
          ) : (
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground border-b">
                    <th className="text-left py-2 pr-4">Agent</th>
                    <th className="text-left py-2 pr-4">Address</th>
                    <th className="text-left py-2 pr-4">Network</th>
                    <th className="text-left py-2 pr-4">Balances</th>
                    <th className="text-right py-2">Metrics</th>
                  </tr>
                </thead>
                <tbody>
                  {fleet.wallets.map(w => (
                    <tr key={w.agentId} className={`border-b last:border-0 hover:bg-muted/30 ${selectedAgent === w.agentId ? "bg-muted/50" : ""}`}>
                      <td className="py-2.5 pr-4">
                        <div className="font-medium">{w.agentName}</div>
                        <div className="text-[10px] text-muted-foreground">@{w.agentSlug}</div>
                      </td>
                      <td className="py-2.5 pr-4">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-[11px] text-muted-foreground">
                            {w.address ? `${w.address.slice(0,6)}…${w.address.slice(-4)}` : "—"}
                          </span>
                          {w.address && (
                            <a href={`https://basescan.org/address/${w.address}`} target="_blank" rel="noreferrer">
                              <ExternalLink className="w-3 h-3 text-muted-foreground hover:text-foreground" />
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 pr-4">
                        <Badge variant="outline" className="text-[10px]">{w.network}</Badge>
                      </td>
                      <td className="py-2.5 pr-4">
                        {w.balances.length === 0 ? (
                          <span className="text-xs text-muted-foreground">empty</span>
                        ) : w.balances.map(b => (
                          <Badge key={b.asset} variant="secondary" className="mr-1 text-[10px]">
                            {b.amount} {b.asset.toUpperCase()}
                          </Badge>
                        ))}
                      </td>
                      <td className="py-2.5 text-right">
                        <Button
                          size="sm" variant={selectedAgent === w.agentId ? "default" : "outline"}
                          className="h-7 text-xs"
                          onClick={() => loadAgentMetrics(w.agentId)}
                        >
                          {selectedAgent === w.agentId ? "Viewing" : "View"}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Per-agent metrics drill-down */}
      {selectedMetrics && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">{selectedMetrics.agent.name}</CardTitle>
                <CardDescription className="text-xs">
                  @{selectedMetrics.agent.slug} · created {new Date(selectedMetrics.agent.createdAt).toLocaleDateString()}
                </CardDescription>
              </div>
              <div className="flex gap-2">
                {selectedMetrics.agent.isPaused && <Badge variant="destructive">Paused</Badge>}
                {selectedMetrics.agent.engineEnabled && <Badge variant="secondary">Engine On</Badge>}
                {selectedMetrics.agent.engineLastRunAt && (
                  <Badge variant="outline" className="text-[10px]">
                    Last run: {formatDistanceToNow(new Date(selectedMetrics.agent.engineLastRunAt), { addSuffix: true })}
                  </Badge>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid md:grid-cols-3 gap-5">

            {/* Leads pipeline */}
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Leads Pipeline</p>
              <div className="text-2xl font-bold">{fmt(selectedMetrics.leads.total)}</div>
              <div className="space-y-1">
                {Object.entries(selectedMetrics.leads.byStatus).map(([status, count]) => (
                  <div key={status} className="flex items-center justify-between text-xs">
                    <LeadStatusBadge status={status} />
                    <span className="tabular-nums font-medium">{fmt(count as number)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Token usage */}
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Token Usage</p>
              <div className="text-2xl font-bold">{fmt(selectedMetrics.tokens.totalTokens)}</div>
              <div className="space-y-1">
                {selectedMetrics.tokens.byTask.map(t => (
                  <div key={t.task} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{t.task}</span>
                    <span className="tabular-nums">{fmt(t.totalTokens)} tok · {fmt(t.calls)} calls</span>
                  </div>
                ))}
                {selectedMetrics.tokens.byTask.length === 0 && (
                  <span className="text-xs text-muted-foreground italic">No token data yet</span>
                )}
              </div>
            </div>

            {/* Wallet + Referrals */}
            <div className="space-y-4">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Wallet</p>
                {selectedMetrics.wallet.hasWallet ? (
                  <>
                    <div className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground">
                      <Wallet className="w-3.5 h-3.5" />
                      {selectedMetrics.agent.cdpWalletAddress
                        ? `${selectedMetrics.agent.cdpWalletAddress.slice(0,8)}…${selectedMetrics.agent.cdpWalletAddress.slice(-6)}`
                        : "—"}
                    </div>
                    {selectedMetrics.wallet.balances.length === 0 ? (
                      <span className="text-xs text-muted-foreground">Empty wallet</span>
                    ) : (
                      selectedMetrics.wallet.balances.map(b => (
                        <Badge key={b.asset} variant="secondary" className="mr-1">
                          {b.amount} {b.asset.toUpperCase()}
                        </Badge>
                      ))
                    )}
                  </>
                ) : (
                  <span className="text-xs text-muted-foreground italic">No wallet provisioned</span>
                )}
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Referrals</p>
                <div className="text-2xl font-bold">{fmt(selectedMetrics.referrals.signups)}</div>
                <p className="text-[10px] text-muted-foreground">signups via this agent's rotator</p>
              </div>
            </div>

          </CardContent>
        </Card>
      )}

      {/* Treasury Sweep */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Wallet className="w-4 h-4" /> Treasury Sweep
          </CardTitle>
          <CardDescription>Move all agent ETH + USDC to a single treasury address</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3">
            <Input
              placeholder="0x treasury address"
              value={sweepAddress}
              onChange={e => setSweepAddress(e.target.value)}
              className="font-mono text-sm"
            />
            <Button onClick={doSweep} disabled={sweeping || !sweepAddress.trim()} variant="destructive" className="whitespace-nowrap">
              {sweeping ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Sweeping…</> : "Sweep All Wallets"}
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            This will transfer all ETH and USDC from every provisioned agent wallet to the treasury address. Gas-less for USDC. Irreversible.
          </p>

          {sweepResult && (
            <div className="space-y-2 pt-2 border-t">
              <p className="text-xs font-medium">
                Swept {sweepResult.swept} / {sweepResult.total} wallets
              </p>
              {sweepResult.results?.filter((r: any) => r.transfers?.length > 0 || r.error).map((r: any) => (
                <div key={r.agentId} className="text-xs p-2 rounded bg-muted/50 space-y-1">
                  <div className="font-medium">@{r.agentSlug}</div>
                  {r.error && <div className="text-destructive">{r.error}</div>}
                  {r.transfers?.map((t: any, i: number) => (
                    <div key={i} className="flex items-center gap-2">
                      {t.error ? (
                        <><XCircle className="w-3 h-3 text-destructive" /><span className="text-destructive">{t.asset}: {t.error}</span></>
                      ) : (
                        <><CheckCircle className="w-3 h-3 text-green-600" />
                        <span>{t.amount} {t.asset}</span>
                        {t.txHash && (
                          <a href={`https://basescan.org/tx/${t.txHash}`} target="_blank" rel="noreferrer" className="ml-auto">
                            <ExternalLink className="w-3 h-3 text-muted-foreground" />
                          </a>
                        )}</>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

    </div>
  );
}

// ─── Agent Persona Engine Tab ─────────────────────────────────────────────────

const ARCHETYPE_ROLE_COLORS: Record<string, string> = {
  larry:   "border-amber-500/40 bg-amber-500/5 text-amber-400",
  moltis:  "border-blue-500/40 bg-blue-500/5 text-blue-400",
  ralph:   "border-green-500/40 bg-green-500/5 text-green-400",
  hybrid:  "border-purple-500/40 bg-purple-500/5 text-purple-400",
};

const ROLE_LABELS: Record<string, string> = {
  larry: "Hook Engine", moltis: "Distribution Engine", ralph: "Improvement Engine", hybrid: "Hybrid Specialist",
};

const PLATFORMS_OPTS = ["twitter", "linkedin", "reddit", "telegram", "tiktok"];
const URGENCY_OPTS   = [
  { id: "low",    label: "Low — Informational" },
  { id: "medium", label: "Medium — Opportunity" },
  { id: "high",   label: "High — Act Now" },
];

interface GeneratedPersona {
  name: string; persona: string; icpContext: string;
  postTemplates: string[]; description: string;
  characterPrompt: string; twitterHandle: string;
}
interface GeneratedHook {
  text: string; style: string; persona: string;
  platform: string; ctaSuggestion: string; confidence: number; why: string;
}
interface SkillTagItem { id: string; label: string; description: string; category: string; }
interface ArchetypeItem {
  id: string; name: string; role: string; description: string; voice: string;
  strengths: string[]; defaultHookStyles: string[];
  defaultPlatforms: string[]; exampleHooks: string[];
}

function AgentPersonaEngineTab({ token }: { token: string | null }) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [step, setStep] = React.useState<1|2|3|4>(1);
  const [selectedArchetype, setSelectedArchetype] = React.useState<ArchetypeItem | null>(null);
  const [brief, setBrief] = React.useState({
    niche: "", targetMarket: "", offerType: "", painPoints: "",
    platforms: ["twitter", "linkedin"] as string[],
    urgencyLevel: "high" as "low"|"medium"|"high",
    skills: [] as string[],
  });
  const [generating, setGenerating] = React.useState(false);
  const [generatingHooks, setGeneratingHooks] = React.useState(false);
  const [generatedPersona, setGeneratedPersona] = React.useState<GeneratedPersona | null>(null);
  const [generatedHooks, setGeneratedHooks] = React.useState<GeneratedHook[]>([]);
  const [creating, setCreating] = React.useState(false);
  const [offerUrl, setOfferUrl] = React.useState("");
  const [editedPersona, setEditedPersona] = React.useState<Partial<GeneratedPersona>>({});

  const { data: skillData } = useQuery<{ archetypes: ArchetypeItem[]; skillTags: SkillTagItem[] }>({
    queryKey: ["lead-gen-skill"],
    queryFn: async () => {
      const r = await fetch("/api/admin/lead-gen-skill", { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    enabled: !!token,
  });

  async function generatePersona() {
    if (!selectedArchetype || !brief.niche || !brief.targetMarket || !brief.offerType) {
      toast({ title: "Fill in all brief fields first", variant: "destructive" }); return;
    }
    setGenerating(true);
    try {
      const r = await fetch("/api/admin/agents/generate-persona", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          niche: brief.niche, targetMarket: brief.targetMarket, offerType: brief.offerType,
          platforms: brief.platforms, archetypeId: selectedArchetype.id,
          skills: brief.skills.length ? brief.skills : undefined,
          urgencyLevel: brief.urgencyLevel,
        }),
      });
      const data = await r.json();
      if (!data.ok) throw new Error(data.error ?? "Generation failed");
      setGeneratedPersona(data.persona);
      setEditedPersona({});
      setStep(3);
      generateHooks();
    } catch (e: any) {
      toast({ title: "Generation failed", description: e.message, variant: "destructive" });
    } finally { setGenerating(false); }
  }

  async function generateHooks() {
    setGeneratingHooks(true);
    try {
      const r = await fetch("/api/admin/agents/generate-hooks", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          niche: brief.niche, targetMarket: brief.targetMarket, offerType: brief.offerType,
          painPoints: brief.painPoints, urgencyLevel: brief.urgencyLevel,
        }),
      });
      const data = await r.json();
      if (data.ok) setGeneratedHooks(data.hooks ?? []);
    } catch { /* non-fatal */ } finally { setGeneratingHooks(false); }
  }

  async function createAgent() {
    const p = { ...generatedPersona, ...editedPersona } as GeneratedPersona;
    if (!p.name || !offerUrl) {
      toast({ title: "Agent name and offer URL required", variant: "destructive" }); return;
    }
    setCreating(true);
    try {
      const slug = p.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      const body = {
        slug, name: p.name, description: p.description, persona: p.persona, offerUrl,
        icpContext: p.icpContext,
        postTemplates: JSON.stringify(p.postTemplates ?? []),
        characterPrompt: p.characterPrompt,
        twitterHandle: p.twitterHandle,
        freeSlotCapacity: 25, paidSlotCapacity: 25, slotDurationHours: 24,
        dailyCap: 100, paidSlotPrice: 9.99,
      };
      const r = await fetch("/api/admin/agents", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!data.success) throw new Error(data.error ?? "Create failed");
      await qc.invalidateQueries({ queryKey: ["admin-agents-fleet"] });
      toast({
        title: `Agent "${p.name}" created${data.walletProvisioned ? " + wallet provisioned" : ""}`,
        description: data.walletProvisioned ? `Wallet: ${data.agent.cdpWalletAddress?.slice(0,10)}…` : undefined,
      });
      setStep(4);
    } catch (e: any) {
      toast({ title: "Create failed", description: e.message, variant: "destructive" });
    } finally { setCreating(false); }
  }

  function reset() {
    setStep(1); setSelectedArchetype(null); setGeneratedPersona(null);
    setGeneratedHooks([]); setEditedPersona({}); setOfferUrl("");
    setBrief({ niche: "", targetMarket: "", offerType: "", painPoints: "",
      platforms: ["twitter", "linkedin"], urgencyLevel: "high", skills: [] });
  }

  const persona = { ...generatedPersona, ...editedPersona } as Partial<GeneratedPersona>;
  const archetypes = skillData?.archetypes ?? [];
  const skillTags = skillData?.skillTags ?? [];

  const STEPS = ["Archetype", "Brief", "Generate", "Done"];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Persona Engine</h2>
          <p className="text-sm text-muted-foreground">
            Larry finds the angle. Moltis executes. Ralph makes the machine smarter.
          </p>
        </div>
        {step > 1 && step < 4 && (
          <Button variant="ghost" size="sm" onClick={reset}>Start Over</Button>
        )}
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 text-xs">
        {STEPS.map((label, i) => (
          <React.Fragment key={label}>
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-medium transition-all ${
              step === i + 1 ? "bg-primary text-primary-foreground" :
              step > i + 1 ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
            }`}>
              {step > i + 1 ? <Check className="w-3 h-3" /> : <span>{i + 1}</span>}
              <span className="hidden sm:inline">{label}</span>
            </div>
            {i < STEPS.length - 1 && <div className={`flex-1 h-px ${step > i + 1 ? "bg-primary/40" : "bg-muted"}`} />}
          </React.Fragment>
        ))}
      </div>

      {/* Step 1: Archetype */}
      {step === 1 && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Choose the specialist archetype that best matches this agent's job.
            Each is wired to the Universal Lead Engine — Larry (hooks), Moltis (distribution), Ralph (iteration).
          </p>
          {archetypes.length === 0 ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-48 w-full rounded-xl" />)}
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {archetypes.map(arch => {
                const colorClass = ARCHETYPE_ROLE_COLORS[arch.role] ?? "border-border/40";
                const isSelected = selectedArchetype?.id === arch.id;
                return (
                  <button key={arch.id} onClick={() => setSelectedArchetype(arch)}
                    className={`text-left rounded-xl border-2 p-4 transition-all space-y-3 ${
                      isSelected ? `${colorClass} ring-2 ring-primary/30` : "border-border/40 hover:border-border bg-card"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-semibold text-sm">{arch.name}</p>
                        <Badge variant="outline" className={`text-[10px] mt-0.5 ${isSelected ? colorClass : ""}`}>
                          {ROLE_LABELS[arch.role] ?? arch.role}
                        </Badge>
                      </div>
                      {isSelected && <Check className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />}
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{arch.description}</p>
                    {arch.exampleHooks[0] && (
                      <p className="text-xs italic text-muted-foreground bg-muted/40 rounded px-2 py-1.5">
                        "{arch.exampleHooks[0]}"
                      </p>
                    )}
                    <div className="flex flex-wrap gap-1">
                      {arch.strengths.slice(0, 3).map(s => (
                        <span key={s} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{s}</span>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          <Button disabled={!selectedArchetype} onClick={() => setStep(2)} className="w-full md:w-auto">
            Continue with {selectedArchetype?.name ?? "an archetype"} <ArrowRight className="w-4 h-4 ml-1.5" />
          </Button>
        </div>
      )}

      {/* Step 2: Brief */}
      {step === 2 && selectedArchetype && (
        <div className="space-y-5">
          <Card className={`border-2 ${ARCHETYPE_ROLE_COLORS[selectedArchetype.role] ?? "border-border/40"}`}>
            <CardContent className="pt-4 pb-3">
              <p className="text-sm font-medium">{selectedArchetype.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5 italic">{selectedArchetype.voice}</p>
            </CardContent>
          </Card>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Niche *</label>
              <Input placeholder="e.g. AI tools for freelancers" value={brief.niche}
                onChange={e => setBrief(b => ({ ...b, niche: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Target Market *</label>
              <Input placeholder="e.g. solopreneurs, small business owners" value={brief.targetMarket}
                onChange={e => setBrief(b => ({ ...b, targetMarket: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Offer Type *</label>
              <Input placeholder="e.g. AI lead gen platform, affiliate program" value={brief.offerType}
                onChange={e => setBrief(b => ({ ...b, offerType: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Pain Points</label>
              <Input placeholder="e.g. no leads, manual work, inconsistent income" value={brief.painPoints}
                onChange={e => setBrief(b => ({ ...b, painPoints: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium">Urgency Level</label>
            <div className="flex gap-2 flex-wrap">
              {URGENCY_OPTS.map(u => (
                <button key={u.id} onClick={() => setBrief(b => ({ ...b, urgencyLevel: u.id as any }))}
                  className={`px-3 py-2 rounded-lg border text-xs transition-all ${
                    brief.urgencyLevel === u.id ? "border-primary bg-primary/10 text-primary font-medium" : "border-border/40 text-muted-foreground hover:border-border"
                  }`}>{u.label}</button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium">Platforms</label>
            <div className="flex flex-wrap gap-2">
              {PLATFORMS_OPTS.map(p => {
                const active = brief.platforms.includes(p);
                return (
                  <button key={p} onClick={() => setBrief(b => ({
                    ...b, platforms: active ? b.platforms.filter(x => x !== p) : [...b.platforms, p]
                  }))} className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                    active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/60"
                  }`}>{p}</button>
                );
              })}
            </div>
          </div>
          {skillTags.length > 0 && (
            <div className="space-y-2">
              <label className="text-xs font-medium">Skills to emphasize <span className="text-muted-foreground font-normal">(optional)</span></label>
              <div className="flex flex-wrap gap-2">
                {skillTags.map(tag => {
                  const active = brief.skills.includes(tag.id);
                  return (
                    <button key={tag.id} onClick={() => setBrief(b => ({
                      ...b, skills: active ? b.skills.filter(x => x !== tag.id) : [...b.skills, tag.id]
                    }))} title={tag.description}
                      className={`px-2.5 py-1 rounded text-[11px] transition-all border ${
                        active ? "border-primary/50 bg-primary/10 text-primary" : "border-border/40 text-muted-foreground hover:border-border"
                      }`}>{tag.label}</button>
                  );
                })}
              </div>
            </div>
          )}
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
            <Button disabled={!brief.niche || !brief.targetMarket || !brief.offerType || generating} onClick={generatePersona}
              className="flex-1 md:flex-none md:min-w-[220px]">
              {generating
                ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Generating…</>
                : <><Zap className="w-4 h-4 mr-1.5" />Generate Persona & Hooks</>}
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Review */}
      {step === 3 && generatedPersona && (
        <div className="space-y-5">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Bot className="w-4 h-4 text-primary" /> Generated Persona
              </CardTitle>
              <CardDescription>Review and edit. Every field is saved to the agent.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium">Agent Name</label>
                  <Input value={editedPersona.name ?? generatedPersona.name}
                    onChange={e => setEditedPersona(p => ({ ...p, name: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium">Twitter Handle</label>
                  <Input value={editedPersona.twitterHandle ?? generatedPersona.twitterHandle ?? ""}
                    onChange={e => setEditedPersona(p => ({ ...p, twitterHandle: e.target.value }))}
                    placeholder="no @ prefix" />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-xs font-medium">Description</label>
                  <Input value={editedPersona.description ?? generatedPersona.description ?? ""}
                    onChange={e => setEditedPersona(p => ({ ...p, description: e.target.value }))} />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-xs font-medium">Persona voice</label>
                  <Textarea rows={3} value={editedPersona.persona ?? generatedPersona.persona ?? ""}
                    onChange={e => setEditedPersona(p => ({ ...p, persona: e.target.value }))} />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-xs font-medium">ICP Context</label>
                  <Textarea rows={4} value={editedPersona.icpContext ?? generatedPersona.icpContext ?? ""}
                    onChange={e => setEditedPersona(p => ({ ...p, icpContext: e.target.value }))} />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-xs font-medium">Offer URL *</label>
                  <Input placeholder="https://…" value={offerUrl}
                    onChange={e => setOfferUrl(e.target.value)} />
                </div>
              </div>
              {(generatedPersona.postTemplates ?? []).length > 0 && (
                <div className="space-y-2">
                  <label className="text-xs font-medium">Post Templates ({generatedPersona.postTemplates.length})</label>
                  <div className="space-y-2">
                    {generatedPersona.postTemplates.map((t, i) => (
                      <div key={i} className="text-xs bg-muted/50 rounded-lg p-3 font-mono leading-relaxed">{t}</div>
                    ))}
                  </div>
                </div>
              )}
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Avatar Image Prompt</label>
                <Textarea rows={2} value={editedPersona.characterPrompt ?? generatedPersona.characterPrompt ?? ""}
                  onChange={e => setEditedPersona(p => ({ ...p, characterPrompt: e.target.value }))}
                  className="text-xs font-mono" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-400" /> Larry's Hooks
                {generatingHooks && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground ml-1" />}
              </CardTitle>
              <CardDescription>Ranked by confidence. Use these as content seeds and post templates.</CardDescription>
            </CardHeader>
            <CardContent>
              {generatedHooks.length === 0 && generatingHooks && (
                <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
              )}
              {generatedHooks.length === 0 && !generatingHooks && (
                <p className="text-xs text-muted-foreground italic">No hooks yet</p>
              )}
              <div className="space-y-3">
                {generatedHooks.map((h, i) => (
                  <div key={i} className="border border-border/40 rounded-lg p-3 space-y-1.5">
                    <div className="flex items-start gap-2">
                      <p className="text-sm leading-snug flex-1">{h.text}</p>
                      <div className="flex-shrink-0 text-right space-y-1">
                        <Badge variant="outline" className="text-[10px]">{h.style}</Badge>
                        <div className="text-[10px] text-muted-foreground">{h.confidence}/10</div>
                      </div>
                    </div>
                    <div className="flex gap-2 flex-wrap text-[10px] text-muted-foreground">
                      <span className="bg-muted rounded px-1.5 py-0.5">{h.platform}</span>
                      <span className="bg-muted rounded px-1.5 py-0.5">{h.ctaSuggestion}</span>
                      <span className="italic">{h.why}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-3 flex-wrap">
            <Button variant="outline" onClick={() => setStep(2)}>Back</Button>
            <Button variant="outline" onClick={generatePersona} disabled={generating}>
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
              Regenerate
            </Button>
            <Button disabled={!offerUrl || creating} onClick={createAgent} className="flex-1 md:flex-none md:min-w-[180px]">
              {creating
                ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Creating…</>
                : <><Plus className="w-4 h-4 mr-1.5" />Create Agent</>}
            </Button>
          </div>
        </div>
      )}

      {/* Step 4: Done */}
      {step === 4 && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="pt-10 pb-10 text-center space-y-5">
            <div className="w-14 h-14 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center mx-auto">
              <CheckCircle className="w-7 h-7 text-primary" />
            </div>
            <div>
              <h3 className="text-xl font-bold">{persona.name} is live.</h3>
              <p className="text-sm text-muted-foreground mt-1.5 max-w-md mx-auto">
                CDP wallet provisioned. ICP loaded. Post templates ready. Ralph is already watching.
              </p>
            </div>
            <div className="flex gap-3 justify-center flex-wrap">
              <Button onClick={reset}>Build Another Agent</Button>
              <Button variant="outline" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>Back to Top</Button>
            </div>
            <p className="text-xs text-muted-foreground italic pt-2">
              "We have created a new agent. It is, by all accounts, operational. We are cautiously optimistic." — P&R Field Operations
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
