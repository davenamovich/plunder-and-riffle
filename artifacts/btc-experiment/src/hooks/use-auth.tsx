import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { LoginDialog } from "@/components/login-dialog";

export interface PlatformUser {
  id: string;
  email: string;
  slug: string;
  displayName: string;
  role: string;
  createdAt: string;
  referralCode: string;
}

interface AuthContextType {
  user: PlatformUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  token: string | null;
  setToken: (token: string | null) => void;
  login: () => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setTokenState] = useState<string | null>(() => localStorage.getItem("token"));
  const [platformUser, setPlatformUser] = useState<PlatformUser | null>(null);
  const [isLoading, setIsLoading] = useState(!!localStorage.getItem("token"));
  const [dialogOpen, setDialogOpen] = useState(false);

  const setToken = useCallback((newToken: string | null) => {
    if (newToken) localStorage.setItem("token", newToken);
    else localStorage.removeItem("token");
    setTokenState(newToken);
  }, []);

  // Restore session from stored token on mount
  useEffect(() => {
    if (!token) { setIsLoading(false); return; }
    if (platformUser) { setIsLoading(false); return; }
    fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) setPlatformUser(data);
        else setToken(null);
      })
      .catch(() => setToken(null))
      .finally(() => setIsLoading(false));
  }, [token]);

  const handleLoginSuccess = useCallback((newToken: string, user: PlatformUser) => {
    setToken(newToken);
    setPlatformUser(user);
  }, [setToken]);

  const login = useCallback(() => setDialogOpen(true), []);

  const logout = useCallback(() => {
    setToken(null);
    setPlatformUser(null);
  }, [setToken]);

  return (
    <AuthContext.Provider
      value={{
        user: platformUser,
        isLoading,
        isAuthenticated: !!token && !!platformUser,
        token,
        setToken,
        login,
        logout,
      }}
    >
      {children}
      <LoginDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSuccess={handleLoginSuccess}
      />
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}
