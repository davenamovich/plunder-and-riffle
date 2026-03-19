import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { usePrivy } from "@privy-io/react-auth";

interface LoginDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (token: string, user: any) => void;
}

export function LoginDialog({ open, onClose, onSuccess }: LoginDialogProps) {
  const { login, ready, authenticated, user: privyUser } = usePrivy();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // When Privy auth succeeds, exchange for our JWT
  useEffect(() => {
    if (!open || !authenticated || !privyUser?.email?.address) return;
    if (loading) return;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const storedRef = sessionStorage.getItem("btc_ref") || undefined;
        const res = await fetch("/api/auth/privy-login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: privyUser.email.address,
            referralCode: storedRef,
          }),
        });
        if (storedRef) sessionStorage.removeItem("btc_ref");

        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Login failed");
          setLoading(false);
          return;
        }

        onSuccess(data.token, data.user);
        onClose();
        setLoading(false);
      } catch (err) {
        setError("Network error. Please try again.");
        setLoading(false);
      }
    })();
  }, [open, authenticated, privyUser, onSuccess, onClose]);

  return (
    <Dialog open={open} onOpenChange={isOpen => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-lg">Sign in to Plunder & Riffle</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-4">
          {!ready ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : authenticated ? (
            <div className="text-center space-y-3">
              <p className="text-sm text-muted-foreground">
                Signing in with {privyUser?.email?.address}…
              </p>
              <Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" />
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground text-center">
                Sign in with your email to continue.
              </p>
              <Button
                onClick={() => {
                  setError(null);
                  login();
                }}
                className="w-full"
                size="lg"
                disabled={loading}
              >
                {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                {loading ? "Signing in…" : "Continue with Email"}
              </Button>
            </>
          )}

          {error && <p className="text-sm text-destructive text-center">{error}</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
