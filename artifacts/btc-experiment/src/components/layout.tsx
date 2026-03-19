import React, { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, LogOut, Activity, Menu, X, Users } from "lucide-react";

export function Layout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user, login, logout } = useAuth();
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navLink = (href: string, label: string) => {
    const active = location === href || location.startsWith(href + "/");
    return (
      <Link href={href} className={`text-sm font-medium transition-colors hover:text-primary ${active ? "text-primary" : "text-muted-foreground"}`}>
        {label}
      </Link>
    );
  };

  const closeMobile = () => setMobileOpen(false);

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground selection:bg-primary/30">
      <header className="sticky top-0 z-40 w-full border-b border-border/40 bg-background/80 backdrop-blur-lg supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center space-x-2 group" onClick={closeMobile}>
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold font-display shadow-[0_0_15px_rgba(247,147,26,0.4)] group-hover:shadow-[0_0_25px_rgba(247,147,26,0.6)] transition-all">
              P
            </div>
            <span className="font-display font-bold text-lg tracking-tight hidden sm:inline-block">
              Plunder & Riffle
            </span>
          </Link>

          <nav className="flex items-center space-x-2 md:space-x-4">
            {/* Desktop links */}
            <div className="hidden md:flex items-center space-x-4">
              {navLink("/agents", "Choose Your Agent")}
            </div>

            {isAuthenticated ? (
              <>
                <div className="h-4 w-px bg-border hidden md:block" />

                <Link href="/dashboard">
                  <Button variant="ghost" size="sm" className={`hidden md:flex gap-1.5 ${location.startsWith("/dashboard") || location.startsWith("/my-agent") ? "text-primary" : ""}`}>
                    <LayoutDashboard className="w-4 h-4" />
                    Dashboard
                  </Button>
                </Link>

                {user?.role === "admin" && (
                  <Link href="/admin">
                    <Button variant="ghost" size="sm" className="hidden md:flex text-primary gap-1.5">
                      <Activity className="w-4 h-4" />
                      Admin
                    </Button>
                  </Link>
                )}

                <Button variant="outline" size="sm" onClick={logout} className="hidden md:flex gap-1.5">
                  <LogOut className="w-4 h-4" />
                  <span className="hidden sm:inline">Logout</span>
                </Button>

                {/* Mobile hamburger */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="md:hidden h-9 w-9 px-0"
                  onClick={() => setMobileOpen(o => !o)}
                  aria-label="Toggle menu"
                >
                  {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                </Button>
              </>
            ) : (
              <>
                <Button size="sm" onClick={login} className="hidden md:flex">
                  Join Now
                </Button>
                {/* Mobile hamburger for unauthenticated */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="md:hidden h-9 w-9 px-0"
                  onClick={() => setMobileOpen(o => !o)}
                  aria-label="Toggle menu"
                >
                  {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                </Button>
              </>
            )}
          </nav>
        </div>

        {/* Mobile dropdown */}
        {mobileOpen && (
          <div className="md:hidden border-t border-border/40 bg-background/95 backdrop-blur-lg">
            <div className="container mx-auto px-4 py-3 flex flex-col gap-1">
              <Link href="/agents" onClick={closeMobile}>
                <Button variant="ghost" size="sm" className={`w-full justify-start gap-2 ${location.startsWith("/agents") ? "text-primary" : ""}`}>
                  <Users className="w-4 h-4" />
                  Choose Your Agent
                </Button>
              </Link>

              {isAuthenticated ? (
                <>
                  <Link href="/dashboard" onClick={closeMobile}>
                    <Button variant="ghost" size="sm" className={`w-full justify-start gap-2 ${location.startsWith("/dashboard") ? "text-primary" : ""}`}>
                      <LayoutDashboard className="w-4 h-4" />
                      Dashboard
                    </Button>
                  </Link>

                  {user?.role === "admin" && (
                    <Link href="/admin" onClick={closeMobile}>
                      <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-primary">
                        <Activity className="w-4 h-4" />
                        Admin
                      </Button>
                    </Link>
                  )}

                  <div className="border-t border-border/30 mt-1 pt-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start gap-2 text-muted-foreground"
                      onClick={() => { logout(); closeMobile(); }}
                    >
                      <LogOut className="w-4 h-4" />
                      Logout
                    </Button>
                  </div>
                </>
              ) : (
                <Button size="sm" className="w-full mt-1" onClick={() => { login(); closeMobile(); }}>
                  Join Now
                </Button>
              )}
            </div>
          </div>
        )}
      </header>

      <main className="flex-1">
        {children}
      </main>

      <footer className="border-t border-border py-8 mt-12 bg-card/30">
        <div className="container mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center space-x-2">
            <div className="w-6 h-6 rounded-md bg-primary flex items-center justify-center text-primary-foreground font-bold font-display text-xs">
              P
            </div>
            <span className="font-display font-semibold text-sm">Plunder and Riffle</span>
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
