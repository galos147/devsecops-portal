"use client";
import { C, relTime } from "@/lib/tokens";
import type { ToolHealth } from "@/lib/api";

export default function ToolHealthCard({ tool }: { tool: ToolHealth }) {
  const ok = tool.connected && tool.status === "success";
  const dotColor = !tool.connected ? C.textMuted : ok ? "oklch(0.72 0.12 150)" : "oklch(0.78 0.16 25)";
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />
        <span style={{ fontSize: 12.5, fontWeight: 600 }}>{tool.label}</span>
      </div>
      <div style={{ fontSize: 11, color: C.textMuted }}>{tool.connected ? `Synced ${relTime(tool.last_sync)}` : "Not connected"}</div>
    </div>
  );
}
