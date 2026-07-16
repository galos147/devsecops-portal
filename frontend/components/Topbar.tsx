"use client";
import { useState, type KeyboardEvent } from "react";
import { useRouter, usePathname } from "next/navigation";
import { C } from "@/lib/tokens";

const PAGE_TITLES: Record<string, string> = {
  "/": "Dashboard",
  "/images": "Images",
  "/vulnerabilities": "Vulnerabilities",
  "/code-quality": "Code Quality",
  "/pipelines": "Pipelines",
  "/search": "Search",
  "/settings": "Settings",
};

export default function Topbar() {
  const router = useRouter();
  const path = usePathname();
  const [draft, setDraft] = useState("");

  const title = Object.entries(PAGE_TITLES).find(([k]) => k === "/" ? path === "/" : path.startsWith(k))?.[1] ?? "";

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && draft.trim()) {
      router.push(`/search?q=${encodeURIComponent(draft.trim())}`);
    }
  }

  return (
    <div style={{ height: 60, flexShrink: 0, borderBottom: `1px solid ${C.borderLight}`, display: "flex", alignItems: "center", gap: 16, padding: "0 28px" }}>
      <div style={{ fontSize: 13, color: C.textMuted }}>{title}</div>
      <div style={{ flex: 1 }} />
      <div style={{ display: "flex", alignItems: "center", gap: 8, background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "7px 12px", width: 320 }}>
        <span style={{ color: C.textMuted, fontSize: 13 }}>⌕</span>
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search CVEs, images, projects…"
          style={{ background: "transparent", border: "none", outline: "none", color: C.text, fontSize: 13, flex: 1, fontFamily: "inherit" }}
        />
      </div>
    </div>
  );
}
