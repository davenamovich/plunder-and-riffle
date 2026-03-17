import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { useLogin } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email"),
  referralCode: z.string().optional(),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export function AuthModal() {
  const { isLoginModalOpen, closeLoginModal, setToken } = useAuth();
  const { toast } = useToast();
  
  const { mutate: login, isPending } = useLogin({
    mutation: {
      onSuccess: (data) => {
        setToken(data.token);
        toast({
          title: "Welcome aboard",
          description: "You've successfully logged in.",
        });
        closeLoginModal();
      },
      onError: (error: any) => {
        toast({
          title: "Login failed",
          description: error?.message || "An error occurred during login.",
          variant: "destructive",
        });
      }
    }
  });

  const { register, handleSubmit, formState: { errors }, reset } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = (data: LoginFormValues) => {
    login({ data });
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      reset();
      closeLoginModal();
    }
  };

  return (
    <Dialog open={isLoginModalOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="text-2xl">Join the Experiment</DialogTitle>
          <DialogDescription>
            Enter your email to secure your free 24-hour agent rotator spot. No passwords, no crypto needed.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-4">
          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium">Email Address</label>
            <Input 
              id="email" 
              placeholder="you@example.com" 
              {...register("email")}
            />
            {errors.email && (
              <p className="text-xs text-destructive">{errors.email.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <label htmlFor="referralCode" className="text-sm font-medium">Referral Code (Optional)</label>
            <Input 
              id="referralCode" 
              placeholder="e.g. RALPH-123" 
              {...register("referralCode")}
            />
          </div>

          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              "Get My Free Spot"
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
