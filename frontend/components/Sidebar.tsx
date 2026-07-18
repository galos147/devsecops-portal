"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { C } from "@/lib/tokens";
import { useAuth } from "@/lib/auth/AuthContext";

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/services", label: "Services" },
  { href: "/images", label: "Images" },
  { href: "/vulnerabilities", label: "Vulnerabilities" },
  { href: "/code-quality", label: "Code Quality" },
  { href: "/pipelines", label: "Pipelines" },
  { href: "/settings", label: "Settings" },
];

export default function Sidebar() {
  const path = usePathname();
  const { user } = useAuth();

  return (
    <div style={{ width: 232, flexShrink: 0, background: C.sidebar, borderRight: `1px solid ${C.borderLight}`, display: "flex", flexDirection: "column", padding: "20px 12px" }}>
      <div style={{ padding: "6px 10px 20px 10px" }}>
        <div style={{ fontWeight: 700, fontSize: 15, letterSpacing: "-0.01em" }}>DevSecOps Portal</div>
        <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>JFrog · SonarQube · Prisma · GitLab</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {NAV.filter(item => item.href !== "/settings" || user?.role === "admin").map(item => {
          const active = item.href === "/" ? path === "/" : path.startsWith(item.href);
          return (
            <Link key={item.href} href={item.href} style={{
              display: "block",
              padding: "8px 10px",
              borderRadius: 7,
              fontSize: 13.5,
              fontWeight: active ? 600 : 400,
              color: active ? C.accentFg : C.textSub,
              background: active ? C.accentBg : "transparent",
              textDecoration: "none",
              transition: "background 0.1s",
            }}>
              {item.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
