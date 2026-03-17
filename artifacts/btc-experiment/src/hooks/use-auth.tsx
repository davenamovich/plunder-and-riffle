import React, { createContext, useContext, useState, useEffect } from "react";
import { useGetMe } from "@workspace/api-client-react";
import type { UserProfile } from "@workspace/api-client-react";

interface AuthContextType {
  user: UserProfile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  token: string | null;
  setToken: (token: string | null) => void;
  isLoginModalOpen: boolean;
  openLoginModal: () => void;
  closeLoginModal: () => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setTokenState] = useState<string | null>(() => localStorage.getItem("token"));
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);

  const setToken = (newToken: string | null) => {
    if (newToken) {
      localStorage.setItem("token", newToken);
    } else {
      localStorage.removeItem("token");
    }
    setTokenState(newToken);
  };

  const { data: user, isLoading, refetch } = useGetMe({
    query: {
      enabled: !!token,
      retry: false,
    },
    // Attempt to pass headers if customFetch supports it
    request: {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    } as any,
  });

  // If query fails (e.g. 401), we might want to clear token. 
  // We'll rely on the app logic to clear it if needed.

  const logout = () => {
    setToken(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user: user || null,
        isLoading,
        isAuthenticated: !!user && !!token,
        token,
        setToken,
        isLoginModalOpen,
        openLoginModal: () => setIsLoginModalOpen(true),
        closeLoginModal: () => setIsLoginModalOpen(false),
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
