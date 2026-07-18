"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { api, type MeOut } from "@/lib/api";

interface AuthState {
  user: MeOut | null;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<MeOut | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    api.me()
      .then(setUser)
      .catch(() => { setUser(null); router.replace("/login"); })
      .finally(() => setLoading(false));
  }, [router]);

  async function logout() {
    await api.logout();
    setUser(null);
    router.replace("/login");
  }

  if (loading) return null; // avoid flashing protected chrome before the /me check resolves

  return <AuthContext.Provider value={{ user, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
