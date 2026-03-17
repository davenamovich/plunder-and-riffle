import React from "react";
import { useRoute } from "wouter";
import { useGetPersonalRotator } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { ExternalLink, User, Users, RotateCcw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

interface ReferralLink {
  memberId: string;
  memberSlug: string;
  displayName: string;
  bio: string | null;
  url: string;
  type: "referral";
  clickCount: number;
}

interface RotatorData {
  userId: string;
  userSlug: string;
  displayName: string;
  bio: string | null;
  hasReferralRotator: boolean;
  referralLinks: ReferralLink[];
  links: { offerId?: string; offerName: string; url: string; logoUrl?: string }[];
}

export default function PersonalRotator() {
  const [, params] = useRoute("/r/:userSlug");
  const userSlug = params?.userSlug;

  const { data: raw, isLoading, error } = useGetPersonalRotator(userSlug || "", {
    query: {
      enabled: !!userSlug,
      retry: false
    }
  });

  const rotatorData = raw as unknown as RotatorData | undefined;
  const hasReferrals = rotatorData?.hasReferralRotator && rotatorData.referralLinks && rotatorData.referralLinks.length > 0;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center pt-24 px-4">
        <Skeleton className="w-24 h-24 rounded-full mb-6" />
        <Skeleton className="w-48 h-8 mb-4" />
        <Skeleton className="w-64 h-4 mb-12" />
        <div className="w-full max-w-md space-y-4">
          <Skeleton className="w-full h-16 rounded-xl" />
          <Skeleton className="w-full h-16 rounded-xl" />
        </div>
      </div>
    );
  }

  if (error || !rotatorData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Page Not Found</h1>
          <p className="text-muted-foreground">This personal rotator does not exist or has been removed.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Abstract bg blobs */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-amber-500/10 rounded-full blur-[120px] pointer-events-none" />
      
      <div className="container max-w-md mx-auto px-4 py-20 relative z-10 flex flex-col items-center">
        <div className="w-24 h-24 bg-muted rounded-full flex items-center justify-center mb-6 shadow-xl border-2 border-border">
          <User className="w-10 h-10 text-muted-foreground" />
        </div>
        
        <h1 className="text-2xl font-bold text-center font-display mb-2">
          {rotatorData.displayName}
        </h1>
        
        {rotatorData.bio && (
          <p className="text-center text-muted-foreground mb-10">
            {rotatorData.bio}
          </p>
        )}

        {hasReferrals ? (
          <>
            <div className="flex items-center gap-2 mb-6 mt-2">
              <RotateCcw className="w-4 h-4 text-primary" />
              <span className="text-sm text-muted-foreground">
                {rotatorData!.referralLinks.length} member{rotatorData!.referralLinks.length !== 1 ? "s" : ""} in this rotator
              </span>
              <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">Active</Badge>
            </div>
            <div className="w-full space-y-3">
              {rotatorData!.referralLinks.map((link) => (
                <a key={link.memberId} href={link.url} className="block w-full group">
                  <div className="w-full p-4 rounded-xl border border-border/50 bg-card/40 backdrop-blur-sm hover:bg-accent/10 hover:border-primary/50 transition-all shadow-sm hover:shadow-md">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
                          <User className="w-5 h-5 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                            {link.displayName}
                          </p>
                          {link.bio && (
                            <p className="text-xs text-muted-foreground truncate max-w-[220px]">{link.bio}</p>
                          )}
                        </div>
                      </div>
                      <ExternalLink className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
                    </div>
                  </div>
                </a>
              ))}
            </div>
          </>
        ) : rotatorData.links && rotatorData.links.length > 0 ? (
          <div className="w-full space-y-4">
            {rotatorData.links.map((link, i) => (
              <a
                key={`${link.offerId ?? i}`}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full"
              >
                <div className="w-full p-4 rounded-xl border border-border/50 bg-card/40 backdrop-blur-sm hover:bg-accent/10 hover:border-primary/50 transition-all group flex items-center justify-between shadow-sm hover:shadow-md">
                  <span className="font-semibold text-foreground group-hover:text-primary transition-colors">
                    {link.offerName}
                  </span>
                  <ExternalLink className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
              </a>
            ))}
          </div>
        ) : (
          <div className="w-full text-center p-8 bg-card/30 rounded-xl border border-border/50">
            <Users className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No active links available.</p>
          </div>
        )}

        <div className="mt-16 text-center">
          <p className="text-xs text-muted-foreground mb-2">Powered by</p>
          <a href="/" className="font-display font-bold text-sm hover:text-primary transition-colors">
            The BTC Experiment
          </a>
        </div>
      </div>
    </div>
  );
}
