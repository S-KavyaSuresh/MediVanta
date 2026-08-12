"use client";

import { createContext, useContext, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { normalizeAuthSession, type AuthSession, type Capability } from "@/lib/auth";
import { apiRequest } from "@/lib/api";

type AuthContextValue = {
  session: AuthSession;
  hasCapability: (capability: Capability) => boolean;
  updateSession: (nextSession: AuthSession) => void;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({
  children,
  initialSession,
}: {
  children: React.ReactNode;
  initialSession: AuthSession;
}) {
  const [session, setSession] = useState(() => normalizeAuthSession(initialSession));
  const router = useRouter();

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      hasCapability: (capability) => session.permissions.includes(capability),
      updateSession: (nextSession) => {
        setSession(normalizeAuthSession(nextSession));
      },
      logout: async () => {
        try {
          await apiRequest("/api/auth/logout", { method: "POST" });
        } catch {
          // Clear local auth state even when the backend is temporarily unavailable.
        }
        setSession((current) => ({
          ...current,
          permissions: [],
          landingPath: "/login",
        }));
        router.replace("/login");
      },
    }),
    [router, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
}
