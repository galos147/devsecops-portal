"use client";
import { sevStyle } from "@/lib/tokens";

export default function SeverityBadge({ sev }: { sev: string }) {
  return <span style={sevStyle(sev)}>{sev}</span>;
}
