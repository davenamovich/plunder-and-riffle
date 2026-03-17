import React from "react";
import { useAuth } from "@/hooks/use-auth";
import { Redirect } from "wouter";
import { 
  useGetAdminSettings, 
  useUpdateAdminSettings,
  useGetAdminRotatorSlots,
  useListAdminUsers,
  useListAdminLeads,
  useApproveLead,
  useAdminExpireSlot
} from "@workspace/api-client-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { ShieldAlert, Trash2, CheckCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function Admin() {
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();

  if (!isAuthenticated || user?.role !== "admin") {
    return <Redirect to="/" />;
  }

  const { data: settings, refetch: refetchSettings } = useGetAdminSettings();
  const { data: slotsRes, refetch: refetchSlots } = useGetAdminRotatorSlots();
  const { data: usersRes } = useListAdminUsers();
  const { data: leadsRes, refetch: refetchLeads } = useListAdminLeads();

  const { mutate: updateSettings, isPending: isSavingSettings } = useUpdateAdminSettings({
    mutation: {
      onSuccess: () => { toast({ title: "Settings updated" }); refetchSettings(); }
    }
  });

  const { mutate: expireSlot } = useAdminExpireSlot({
    mutation: {
      onSuccess: () => { toast({ title: "Slot expired manually" }); refetchSlots(); }
    }
  });

  const { mutate: approveLead } = useApproveLead({
    mutation: {
      onSuccess: () => { toast({ title: "Lead approved for posting" }); refetchLeads(); }
    }
  });

  const [localSettings, setLocalSettings] = React.useState<any>({});
  
  React.useEffect(() => {
    if (settings) setLocalSettings(settings);
  }, [settings]);

  const handleSaveSettings = () => {
    updateSettings({
      data: {
        freeSlotCapacity: Number(localSettings.freeSlotCapacity),
        paidSlotCapacity: Number(localSettings.paidSlotCapacity),
        dailyCap: Number(localSettings.dailyCap),
        fallbackUrl: localSettings.fallbackUrl,
        isPaused: localSettings.isPaused
      }
    });
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <div className="flex items-center gap-3 mb-8">
        <ShieldAlert className="w-8 h-8 text-destructive" />
        <h1 className="text-3xl font-bold font-display tracking-tight">Admin Controls</h1>
      </div>

      <Tabs defaultValue="settings" className="w-full">
        <TabsList className="grid w-full md:w-[600px] grid-cols-4 h-11 mb-8">
          <TabsTrigger value="settings">Config</TabsTrigger>
          <TabsTrigger value="slots">Rotator</TabsTrigger>
          <TabsTrigger value="leads">Leads</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
        </TabsList>

        <TabsContent value="settings" className="space-y-6">
          <Card className="max-w-2xl border-destructive/20">
            <CardHeader>
              <CardTitle>System Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Daily Lead Cap</label>
                  <Input 
                    type="number" 
                    value={localSettings.dailyCap || ''} 
                    onChange={e => setLocalSettings({...localSettings, dailyCap: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Free Slot Capacity</label>
                  <Input 
                    type="number" 
                    value={localSettings.freeSlotCapacity || ''} 
                    onChange={e => setLocalSettings({...localSettings, freeSlotCapacity: e.target.value})}
                  />
                </div>
                <div className="space-y-2 col-span-2">
                  <label className="text-sm font-medium">Fallback URL (when Rotator empty)</label>
                  <Input 
                    value={localSettings.fallbackUrl || ''} 
                    onChange={e => setLocalSettings({...localSettings, fallbackUrl: e.target.value})}
                  />
                </div>
              </div>
              <div className="flex items-center gap-4 pt-4 border-t border-border mt-4">
                <Button 
                  variant={localSettings.isPaused ? "default" : "destructive"}
                  onClick={() => setLocalSettings({...localSettings, isPaused: !localSettings.isPaused})}
                >
                  {localSettings.isPaused ? "System Paused (Click to Resume)" : "Pause Entire System"}
                </Button>
                <div className="flex-1"></div>
                <Button onClick={handleSaveSettings} disabled={isSavingSettings}>
                  Save Settings
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="slots">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Active Rotator Slots</CardTitle>
              <div className="flex gap-4 text-sm text-muted-foreground">
                <span>Free: {slotsRes?.totalFree || 0}</span>
                <span>Paid: {slotsRes?.totalPaid || 0}</span>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Clicks</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {slotsRes?.slots?.map(slot => (
                    <TableRow key={slot.id}>
                      <TableCell className="font-medium">{slot.userEmail}</TableCell>
                      <TableCell>
                        <Badge variant={slot.slotType === 'free' ? "outline" : "default"}>
                          {slot.slotType}
                        </Badge>
                      </TableCell>
                      <TableCell>{slot.clickCount}</TableCell>
                      <TableCell>{formatDistanceToNow(new Date(slot.expiresAt), { addSuffix: true })}</TableCell>
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

        <TabsContent value="leads">
          <Card>
            <CardHeader>
              <CardTitle>Lead Queue (Manual Approval)</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Source</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>Draft Content</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leadsRes?.leads?.map(lead => (
                    <TableRow key={lead.id}>
                      <TableCell className="font-medium capitalize">{lead.source}</TableCell>
                      <TableCell>{lead.score || '-'}/100</TableCell>
                      <TableCell className="max-w-md truncate text-xs font-mono bg-muted/30 p-2 rounded">
                        {lead.draft || 'No draft yet'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={lead.status === 'approved' ? 'success' : 'secondary'}>
                          {lead.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {lead.status === 'drafted' && (
                          <Button size="sm" onClick={() => approveLead({ id: lead.id })}>
                            <CheckCircle className="w-4 h-4 mr-2" /> Approve
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="users">
          <Card>
            <CardHeader>
              <CardTitle>Registered Users</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead>Offers</TableHead>
                    <TableHead>Active Slots</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usersRes?.users?.map(u => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{u.email}</TableCell>
                      <TableCell><Badge variant={u.role === 'admin' ? 'destructive' : 'secondary'}>{u.role}</Badge></TableCell>
                      <TableCell>{new Date(u.createdAt).toLocaleDateString()}</TableCell>
                      <TableCell>{u.offerSignupCount}</TableCell>
                      <TableCell>{u.activeSlots}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
