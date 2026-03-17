import React, { useState } from "react";
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
} from "@workspace/api-client-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  ShieldAlert, Trash2, CheckCircle, XCircle, Bot, Zap, Play,
  RefreshCw, Activity, Users, Clock, ChevronDown, ChevronUp, Eye,
  AlertTriangle, ToggleLeft, ToggleRight
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

// ─── Status badge helper ───────────────────────────────────────────────────────

function LeadStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    raw:               "secondary",
    scored:            "outline",
    pending_approval:  "default",
    approved:          "success",
    posted:            "success",
    rejected:          "destructive",
    rejected_low_score:"destructive",
  };
  return <Badge variant={(map[status] || "secondary") as any}>{status.replace(/_/g, " ")}</Badge>;
}

// ─── Expand / collapse lead row ────────────────────────────────────────────────

function LeadRow({ lead, onApprove, onReject }: {
  lead: any;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const score = lead.score != null ? lead.score.toFixed(2) : "—";

  return (
    <>
      <TableRow className="cursor-pointer hover:bg-muted/30" onClick={() => setExpanded(v => !v)}>
        <TableCell className="font-medium capitalize">{lead.source}</TableCell>
        <TableCell>
          <span className={`font-mono font-bold ${Number(lead.score) >= 0.65 ? "text-primary" : Number(lead.score) >= 0.35 ? "text-amber-400" : "text-muted-foreground"}`}>
            {score}
          </span>
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
            {expanded ? <ChevronUp className="w-4 h-4 ml-1 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 ml-1 text-muted-foreground" />}
          </div>
        </TableCell>
      </TableRow>

      {expanded && (
        <TableRow>
          <TableCell colSpan={6} className="bg-muted/10 p-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase mb-2 flex items-center gap-1"><Eye className="w-3 h-3" /> Original Post</p>
                <p className="text-sm bg-background/50 p-3 rounded-lg border border-border/40 leading-relaxed">{lead.content}</p>
                {lead.postUrl && (
                  <a href={lead.postUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline mt-1 block">
                    View original →
                  </a>
                )}
                {lead.scoreReason && (
                  <p className="text-xs text-muted-foreground mt-2 italic">
                    <span className="font-medium not-italic">Score reason:</span> {lead.scoreReason}
                  </p>
                )}
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase mb-2 flex items-center gap-1"><Bot className="w-3 h-3" /> AI Draft Reply</p>
                {lead.draft ? (
                  <p className="text-sm bg-primary/5 border border-primary/20 p-3 rounded-lg leading-relaxed">{lead.draft}</p>
                ) : (
                  <p className="text-sm text-muted-foreground italic p-3">Draft not yet generated.</p>
                )}
                <p className="text-xs text-muted-foreground mt-2">
                  Author: <span className="font-mono">{lead.authorHandle || "unknown"}</span>
                  {lead.createdAt && <span className="ml-2">· {formatDistanceToNow(new Date(lead.createdAt), { addSuffix: true })}</span>}
                </p>
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
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [leadStatusFilter, setLeadStatusFilter] = useState("pending_approval");
  const [rejectReason, setRejectReason] = useState("");
  const [rejectingId, setRejectingId] = useState<string | null>(null);

  if (!isAuthenticated || user?.role !== "admin") {
    return <Redirect to="/" />;
  }

  // ── Data hooks ──
  const { data: settings, refetch: refetchSettings } = useGetAdminSettings();
  const { data: slotsRes, refetch: refetchSlots } = useGetAdminRotatorSlots();
  const { data: usersRes } = useListAdminUsers();
  const { data: leadsRes, refetch: refetchLeads } = useListAdminLeads();
  const { data: ralphStatus, refetch: refetchRalph, isLoading: isLoadingRalph } = useGetRalphStatus({
    query: { refetchInterval: 30000 },
  });

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
        <TabsList className="grid w-full md:w-auto md:inline-grid grid-cols-5 h-11 mb-8">
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
          <TabsTrigger value="rotator">Rotator</TabsTrigger>
          <TabsTrigger value="users"><Users className="w-3.5 h-3.5 mr-1" />Users</TabsTrigger>
          <TabsTrigger value="settings">Config</TabsTrigger>
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
                    <TableHead>Offers</TableHead>
                    <TableHead>Active Slots</TableHead>
                    <TableHead>Referral Code</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usersRes?.users?.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">No users yet.</TableCell></TableRow>
                  )}
                  {usersRes?.users?.map(u => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{u.email}</TableCell>
                      <TableCell>
                        <Badge variant={u.role === "admin" ? "destructive" : "secondary"}>{u.role}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(u.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="font-mono">{u.offerSignupCount}</TableCell>
                      <TableCell>
                        <span className={u.activeSlots > 0 ? "text-primary font-bold" : "text-muted-foreground"}>{u.activeSlots}</span>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{(u as any).referralCode || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── SETTINGS TAB ── */}
        <TabsContent value="settings" className="space-y-6">
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
      </Tabs>
    </div>
  );
}
