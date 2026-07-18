"use client";
import { C } from "@/lib/tokens";

export default function AddIntegrationCard({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="settings-add-tile"
      style={{
        background: "transparent",
        border: `1px dashed ${C.border}`,
        borderRadius: 10,
        padding: 18,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        minHeight: 160,
        cursor: "pointer",
        color: C.textMuted,
        fontFamily: "inherit",
      }}
    >
      <span style={{ fontSize: 22, lineHeight: 1 }}>+</span>
      <span style={{ fontSize: 12.5, fontWeight: 600 }}>Add Integration</span>
    </button>
  );
}
