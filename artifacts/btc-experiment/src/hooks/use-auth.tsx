import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { usePrivy } from "@privy-io/react-auth";

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
  const { ready, authenticated, user: privyUser, login: privyLogin, logout: privyLogout } = usePrivy();
  const [token, setTokenState] = useState<string | null>(() => localStorage.getItem("token"));
  const [platformUser, setPlatformUser] = useState<PlatformUser | null>(null);
  const [isExchanging, setIsExchanging] = useState(false);
  const exchangedRef = useRef<string | null>(null);

  const setToken = useCallback((newToken: string | null) => {
    if (newToken) localStorage.setItem("token", newToken);
    else localStorage.removeItem("token");
    setTokenState(newToken);
  }, []);

  useEffect(() => {
    if (!ready || !authenticated || !privyUser) return;
    const email = privyUser.email?.address;
    if (!email) return;
    if (exchangedRef.current === email) return;
    exchangedRef.current = email;
    setIsExchanging(true);
    fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.token) setToken(data.token);
        if (data.user) setPlatformUser(data.user);
      })
      .catch(console.error)
      .finally(() => setIsExchanging(false));
  }, [ready, authenticated, privyUser, setToken]);

  useEffect(() => {
    if (!token || platformUser || isExchanging) return;
    fetch("/api/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setPlatformUser(data);
        else setToken(null);
      })
      .catch(() => setToken(null));
  }, [token, platformUser, isExchanging, setToken]);

  const logout = useCallback(async () => {
    setToken(null);
    setPlatformUser(null);
    exchangedRef.current = null;
    try { await privyLogout(); } catch {}
  }, [privyLogout, setToken]);

  return (
    <AuthContext.Provider
      value={{
        user: platformUser,
        isLoading: !ready || isExchanging,
        isAuthenticated: !!token && !!platformUser,
        token,
        setToken,
        login: privyLogin,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}
