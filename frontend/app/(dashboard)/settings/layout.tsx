"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { C } from "@/lib/tokens";
import { useAuth } from "@/lib/auth/AuthContext";

const TABS = [
  { href: "/settings", label: "Integrations" },
  { href: "/settings/users", label: "Users" },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { user } = useAuth();

  if (user?.role !== "admin") {
    return <div style={{ fontSize: 13, color: C.textMuted }}>You don&apos;t have access to this page.</div>;
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 4, marginBottom: 18, borderBottom: `1px solid ${C.borderLight}` }}>
        {TABS.map(t => {
          const active = path === t.href;
          return (
            <Link key={t.href} href={t.href} style={{
              padding: "8px 14px", fontSize: 13, fontWeight: active ? 600 : 400,
              color: active ? C.text : C.textMuted,
              borderBottom: active ? `2px solid ${C.accent}` : "2px solid transparent",
              textDecoration: "none", marginBottom: -1,
            }}>
              {t.label}
            </Link>
          );
        })}
      </div>
      {children}
    </div>
  );
}
