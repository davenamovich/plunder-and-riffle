import React from "react";
import { useRoute } from "wouter";
import { useGetPersonalRotator } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { ExternalLink, User } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function PersonalRotator() {
  const [, params] = useRoute("/r/:userSlug");
  const userSlug = params?.userSlug;

  const { data: rotatorData, isLoading, error } = useGetPersonalRotator(userSlug || "", {
    query: {
      enabled: !!userSlug,
      retry: false
    }
  });

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

        <div className="w-full space-y-4">
          {rotatorData.links && rotatorData.links.length > 0 ? (
            rotatorData.links.map((link, i) => (
              <a 
                key={`${link.offerId}-${i}`}
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
            ))
          ) : (
            <p className="text-center text-muted-foreground text-sm p-8 bg-card/30 rounded-xl border border-border/50">
              No active links available.
            </p>
          )}
        </div>

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
