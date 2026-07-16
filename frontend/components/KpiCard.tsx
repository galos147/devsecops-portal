"use client";
import { C } from "@/lib/tokens";

interface Props { label: string; value: string | number; color?: string }

export default function KpiCard({ label, value, color }: Props) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 16 }}>
      <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: color ?? C.text }}>{value}</div>
    </div>
  );
}
