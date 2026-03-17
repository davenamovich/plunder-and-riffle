import React from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, LogOut, Activity, ExternalLink } from "lucide-react";

export function Layout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user, login, logout } = useAuth();
  const [location] = useLocation();

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground selection:bg-primary/30">
      <header className="sticky top-0 z-40 w-full border-b border-border/40 bg-background/80 backdrop-blur-lg supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center space-x-2 group">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold font-display shadow-[0_0_15px_rgba(247,147,26,0.4)] group-hover:shadow-[0_0_25px_rgba(247,147,26,0.6)] transition-all">
              B
            </div>
            <span className="font-display font-bold text-lg tracking-tight hidden sm:inline-block">
              BTC Experiment
            </span>
          </Link>

          <nav className="flex items-center space-x-2 md:space-x-4">
            <Link href="/agent/ralph" className={`text-sm font-medium transition-colors hover:text-primary ${location.startsWith('/agent') ? 'text-primary' : 'text-muted-foreground'}`}>
              The Agent
            </Link>

            {isAuthenticated ? (
              <>
                <Link href="/dashboard">
                  <Button variant="ghost" size="sm" className="hidden sm:flex">
                    <LayoutDashboard className="w-4 h-4 mr-2" />
                    Dashboard
                  </Button>
                </Link>
                {user?.role === "admin" && (
                  <Link href="/admin">
                    <Button variant="ghost" size="sm" className="hidden md:flex text-primary">
                      <Activity className="w-4 h-4 mr-2" />
                      Admin
                    </Button>
                  </Link>
                )}
                <div className="h-4 w-px bg-border hidden sm:block mx-2" />
                <div className="flex items-center space-x-3">
                  <Link href={`/r/${user?.slug}`} className="hidden md:flex items-center text-xs text-muted-foreground hover:text-foreground transition-colors">
                    <ExternalLink className="w-3 h-3 mr-1" />
                    My Rotator
                  </Link>
                  <Button variant="outline" size="sm" onClick={logout}>
                    <LogOut className="w-4 h-4 sm:mr-2" />
                    <span className="hidden sm:inline">Logout</span>
                  </Button>
                </div>
              </>
            ) : (
              <Button size="sm" onClick={login}>
                Join Now
              </Button>
            )}
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {children}
      </main>

      <footer className="border-t border-border py-8 mt-12 bg-card/30">
        <div className="container mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center space-x-2">
            <div className="w-6 h-6 rounded-md bg-primary flex items-center justify-center text-primary-foreground font-bold font-display text-xs">
              B
            </div>
            <span className="font-display font-semibold text-sm">The BTC Experiment</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Let the agent prove it first. 24-hour rotators powered by AI.
          </p>
          <div className="flex items-center space-x-4 text-sm text-muted-foreground">
            <Link href="/" className="hover:text-primary transition-colors">Terms</Link>
            <Link href="/" className="hover:text-primary transition-colors">Privacy</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
