import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

interface LoginDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (token: string, user: any) => void;
}

export function LoginDialog({ open, onClose, onSuccess }: LoginDialogProps) {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setStep("email");
    setEmail("");
    setCode("");
    setDevCode(null);
    setError(null);
    setLoading(false);
  }

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/auth/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await r.json();
      if (!r.ok) { setError(data.error ?? "Failed to send code"); return; }
      if (data.devCode) setDevCode(data.devCode);
      setStep("code");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/auth/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), code: code.trim() }),
      });
      const data = await r.json();
      if (!r.ok) { setError(data.error ?? "Invalid code"); return; }
      onSuccess(data.token, data.user);
      reset();
      onClose();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleOpenChange(open: boolean) {
    if (!open) { reset(); onClose(); }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-lg">
            {step === "email" ? "Sign in to Plunder & Riffle" : "Enter your code"}
          </DialogTitle>
        </DialogHeader>

        {step === "email" ? (
          <form onSubmit={sendCode} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <p className="text-sm text-muted-foreground">We'll send a 6-digit code to your email.</p>
              <Input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoFocus
                required
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading || !email.trim()}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Send code"}
            </Button>
          </form>
        ) : (
          <form onSubmit={verifyCode} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <p className="text-sm text-muted-foreground">
                Code sent to <span className="font-medium text-foreground">{email}</span>. Check your inbox.
              </p>
              {devCode && (
                <div className="rounded-md bg-amber-500/10 border border-amber-500/30 px-3 py-2">
                  <p className="text-xs text-amber-400 font-mono">Dev mode — your code: <span className="font-bold text-amber-300 text-base tracking-widest">{devCode}</span></p>
                </div>
              )}
              <Input
                type="text"
                inputMode="numeric"
                placeholder="000000"
                maxLength={6}
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, ""))}
                autoFocus
                required
                className="text-center text-2xl tracking-widest font-mono"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-2">
              <Button type="button" variant="ghost" className="flex-1" onClick={() => { setStep("email"); setError(null); setCode(""); setDevCode(null); }}>
                Back
              </Button>
              <Button type="submit" className="flex-1" disabled={loading || code.length !== 6}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Sign in"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground text-center">
              Didn't get it?{" "}
              <button type="button" className="underline" onClick={() => { setStep("email"); setCode(""); setDevCode(null); setError(null); }}>
                Try again
              </button>
            </p>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
