import React, { useState, useEffect, useRef } from "react";
import { useLocation, useSearch } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { getRoleCopy } from "@/lib/icp";
import { ArrowRight, CheckCircle, Loader2, ShieldCheck, Zap } from "lucide-react";

const LOADING_STEPS = [
  { id: "account", label: "Verifying your account…" },
  { id: "wallet", label: "Setting up your wallet path…" },
  { id: "slot", label: "Activating your 24-hour slot…" },
  { id: "done", label: "You're in the system." },
];

export default function IcpPage() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const rawRole = params.get("role") || "Business Owner";
  const rawRef = params.get("ref") || sessionStorage.getItem("btc_ref") || "";
  const copy = getRoleCopy(rawRole);

  const { login, isAuthenticated, user, isLoading } = useAuth();
  const [, navigate] = useLocation();

  const [status, setStatus] = useState<"idle" | "waiting_privy" | "activating" | "done" | "error">("idle");
  const [loadingStep, setLoadingStep] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const activationFiredRef = useRef(false);

  // Auto-advance loading steps during activation
  useEffect(() => {
    if (status !== "activating") return;
    const delays = [0, 900, 1800, 2700];
    const timers = delays.map((delay, i) => setTimeout(() => setLoadingStep(i), delay));
    return () => timers.forEach(clearTimeout);
  }, [status]);

  // After Privy auth completes, run the onboarding activation
  useEffect(() => {
    if (
      status !== "waiting_privy" ||
      !isAuthenticated ||
      !user ||
      isLoading ||
      activationFiredRef.current
    ) return;

    activationFiredRef.current = true;
    runActivation(user.email);
  }, [status, isAuthenticated, user, isLoading]);

  async function runActivation(email: string) {
    setStatus("activating");
    setLoadingStep(0);
    setErrorMsg("");

    try {
      const ref = rawRef || sessionStorage.getItem("btc_ref") || "";
      const resp = await fetch("/api/onboarding/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role: rawRole, referralCode: ref || undefined }),
      });
      if (ref) sessionStorage.removeItem("btc_ref");
      const data = await resp.json();

      if (!resp.ok || !data.ok) {
        throw new Error(data.error || "Activation failed. Please try again.");
      }

      setLoadingStep(3);
      setStatus("done");

      setTimeout(() => {
        navigate(`/agent/ralph?new=1&role=${encodeURIComponent(rawRole)}`);
      }, 1400);
    } catch (err: any) {
      activationFiredRef.current = false;
      setStatus("error");
      setErrorMsg(err.message || "Something went wrong. Please try again.");
    }
  }

  function handleActivate() {
    if (isAuthenticated && user) {
      // Already logged in — activate directly
      if (!activationFiredRef.current) {
        activationFiredRef.current = true;
        runActivation(user.email);
      }
    } else {
      // Open Privy modal — activation fires after auth succeeds
      setStatus("waiting_privy");
      login();
    }
  }

  const showLoading = status === "waiting_privy" || status === "activating" || status === "done";
  const showError = status === "error";

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top strip */}
      <div className="w-full py-3 bg-primary/10 border-b border-primary/20 text-center">
        <span className="text-sm text-primary font-medium flex items-center justify-center gap-2">
          <Zap className="h-4 w-4" />
          The Agent is Live — 24-Hour Free Trial
        </span>
      </div>

      <div className="flex-1 flex items-start justify-center py-12 px-4">
        <div className="w-full max-w-xl">

          {/* Headline */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
            className="mb-8"
          >
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-3">
              {copy.headline}
            </h1>
            <p className="text-lg text-muted-foreground leading-relaxed">
              {copy.subheadline}
            </p>
          </motion.div>

          {/* Core message */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.1 }}
            className="glass-panel rounded-2xl p-6 mb-6 border border-primary/20"
          >
            <p className="text-sm text-primary uppercase tracking-wider font-semibold mb-3">
              What's happening right now
            </p>
            <p className="text-base text-foreground leading-relaxed mb-4">
              Everyone will have an agent. Your competitors will have agents.
              The real question isn't <em>whether</em> this happens —
              it's whether one is working <em>for you</em> when it does.
            </p>
            <p className="text-base text-muted-foreground leading-relaxed">
              {copy.whyThisHelps}
            </p>
          </motion.div>

          {/* Pain points */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.18 }}
            className="mb-6"
          >
            <p className="text-sm text-muted-foreground uppercase tracking-wider font-medium mb-3">
              Sound familiar?
            </p>
            <ul className="space-y-2">
              {copy.painPoints.map((point, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full bg-destructive/20 border border-destructive/40 flex items-center justify-center text-destructive text-xs font-bold">
                    ✕
                  </span>
                  <span className="text-sm text-muted-foreground">{point}</span>
                </li>
              ))}
            </ul>
          </motion.div>

          {/* What happens next */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.26 }}
            className="glass-panel rounded-2xl p-6 mb-8 border border-border"
          >
            <p className="text-sm text-muted-foreground uppercase tracking-wider font-medium mb-3">
              What your 24 hours looks like
            </p>
            <ul className="space-y-3">
              {[
                "Enter your email — no password ever required",
                "A wallet path is reserved for you (no crypto knowledge needed)",
                "You're placed into the main agent's traffic rotator",
                "The agent works. You watch the proof.",
              ].map((step, i) => (
                <li key={i} className="flex items-start gap-3">
                  <CheckCircle className="mt-0.5 flex-shrink-0 h-5 w-5 text-primary" />
                  <span className="text-sm text-foreground">{step}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 pt-4 border-t border-border">
              <p className="text-xs text-muted-foreground">
                <ShieldCheck className="inline h-3.5 w-3.5 mr-1 text-primary" />
                This is the bridge to Web4. You don't need to understand crypto to use it.
              </p>
            </div>
          </motion.div>

          {/* CTA / loading state */}
          <AnimatePresence mode="wait">
            {!showLoading && (
              <motion.div
                key="cta"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.35, delay: 0.32 }}
                className="space-y-3"
              >
                {showError && (
                  <p className="text-sm text-destructive text-center px-1 py-2 bg-destructive/10 rounded-lg">
                    {errorMsg}
                  </p>
                )}
                <Button
                  size="lg"
                  className="w-full h-14 text-lg font-semibold"
                  onClick={handleActivate}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <>
                      Activate My 24 Hours <ArrowRight className="ml-2 h-5 w-5" />
                    </>
                  )}
                </Button>
                <p className="text-xs text-muted-foreground text-center pt-1">
                  No credit card. No password. Just your email.
                </p>
              </motion.div>
            )}

            {showLoading && (
              <motion.div
                key="loading"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="glass-panel rounded-2xl p-6 border border-primary/30"
              >
                {status === "waiting_privy" ? (
                  <div className="flex items-center gap-3 justify-center py-2">
                    <Loader2 className="h-5 w-5 text-primary animate-spin" />
                    <span className="text-sm text-foreground font-medium">
                      Complete sign-in to continue…
                    </span>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {LOADING_STEPS.map((step, i) => {
                      const isActive = i === loadingStep;
                      const isDone = i < loadingStep;
                      return (
                        <div key={step.id} className="flex items-center gap-3">
                          <div className="w-6 h-6 flex-shrink-0 flex items-center justify-center">
                            {isDone ? (
                              <CheckCircle className="h-5 w-5 text-primary" />
                            ) : isActive ? (
                              <Loader2 className="h-5 w-5 text-primary animate-spin" />
                            ) : (
                              <div className="w-4 h-4 rounded-full border-2 border-border" />
                            )}
                          </div>
                          <span
                            className={`text-sm font-medium transition-colors ${
                              isDone
                                ? "text-primary"
                                : isActive
                                ? "text-foreground"
                                : "text-muted-foreground"
                            }`}
                          >
                            {step.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
                {status === "done" && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-sm text-primary font-medium text-center mt-4"
                  >
                    Taking you to the agent now…
                  </motion.p>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Proof line */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7 }}
            className="text-xs text-muted-foreground text-center mt-8"
          >
            {copy.proof}
          </motion.p>
        </div>
      </div>
    </div>
  );
}
