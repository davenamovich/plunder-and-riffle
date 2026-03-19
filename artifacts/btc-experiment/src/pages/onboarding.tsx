import React, { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Redirect, useRouter } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { Copy, Check, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const APP_URL = "https://www.plunderandriffle.com";

export default function OnboardingPage() {
  const { user, isAuthenticated, isLoading, token } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useRouter();
  const [savedLink, setSavedLink] = useState(false);
  const [copied, setCopied] = useState(false);

  // If already got token, redirect to agents
  if (!isLoading && isAuthenticated && user) {
    // Check if user already completed onboarding (has a token)
    if (user.tokens > 0) {
      window.location.replace("/agents");
      return null;
    }
  }

  if (isLoading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  if (!isAuthenticated) {
    return <Redirect to="/" />;
  }

  if (!user) {
    return <div className="flex items-center justify-center min-h-screen">Error loading user</div>;
  }

  const referralUrl = `${APP_URL}/r/${user.referralCode}`;

  const { data: agents } = useQuery({
    queryKey: ["agents-list"],
    queryFn: async () => {
      const r = await fetch("/api/agents", { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new Error("Failed to load agents");
      return r.json();
    },
    enabled: !!token,
  });

  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(referralUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveLink = async () => {
    try {
      const res = await fetch("/api/users/save-referral-link", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ referralCode: user.referralCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save link");
      
      setSavedLink(true);
      toast({ title: "Link saved! You got 1 token for 24 hours" });
      setTimeout(() => window.location.replace("/agents"), 2000);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 py-12 px-4">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center space-y-3 mb-12">
          <h1 className="text-4xl font-bold font-display">Your Personal AI Agent is Ready</h1>
          <p className="text-lg text-muted-foreground">Save your referral link to activate your first 24-hour token</p>
        </div>

        {/* Referral Link Card */}
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader>
            <CardTitle className="text-lg">Your Referral Link</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2 bg-muted p-3 rounded-lg">
              <code className="flex-1 text-sm font-mono break-all text-muted-foreground">{referralUrl}</code>
              <Button
                size="icon"
                variant="ghost"
                className="shrink-0"
                onClick={handleCopyLink}
              >
                {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Share this link to invite others. When they join through your link, they'll earn you rewards.
            </p>
          </CardContent>
        </Card>

        {/* Save Link Button */}
        <div className="flex justify-center">
          <Button
            size="lg"
            onClick={handleSaveLink}
            disabled={savedLink}
            className="px-8"
          >
            {savedLink ? "✓ Link Saved" : "Save Link & Get 1 Token"}
          </Button>
        </div>

        {/* Agents Grid */}
        <div className="space-y-4">
          <h2 className="text-2xl font-bold">Choose Your Agent</h2>
          <p className="text-muted-foreground">Pick an agent to use your token. Your token gives you 24 hours of access.</p>
          
          {!agents || agents.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">Loading agents...</div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {agents.map((agent: any) => (
                <Card key={agent.id} className="hover:border-primary/50 transition-colors cursor-pointer group">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center justify-between">
                      <span>{agent.name}</span>
                      <ExternalLink className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground">{agent.description}</p>
                    <div className="flex flex-wrap gap-1">
                      {agent.platforms?.slice(0, 3).map((p: string) => (
                        <span key={p} className="text-xs bg-muted px-2 py-1 rounded">{p}</span>
                      ))}
                    </div>
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => window.location.replace(`/join/${agent.slug}`)}
                    >
                      Choose Agent
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
