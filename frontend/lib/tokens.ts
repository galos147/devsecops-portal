export const C = {
  bg: "oklch(0.15 0.004 250)",
  sidebar: "oklch(0.13 0.004 250)",
  card: "oklch(0.19 0.006 250)",
  inset: "oklch(0.14 0.004 250)",
  border: "oklch(0.28 0.008 250)",
  borderLight: "oklch(0.26 0.008 250)",
  borderRow: "oklch(0.23 0.008 250)",
  text: "oklch(0.93 0.004 250)",
  textSub: "oklch(0.65 0.01 250)",
  textMuted: "oklch(0.52 0.01 250)",
  accent: "oklch(0.66 0.15 245)",
  accentFg: "oklch(0.75 0.14 245)",
  accentBg: "oklch(0.66 0.15 245 / 0.15)",
  accentBorder: "oklch(0.66 0.15 245 / 0.3)",
} as const;

export const SEV: Record<string, { bg: string; fg: string }> = {
  critical: { bg: "oklch(0.30 0.09 25)", fg: "oklch(0.80 0.17 25)" },
  high:     { bg: "oklch(0.30 0.07 55)", fg: "oklch(0.80 0.15 55)" },
  medium:   { bg: "oklch(0.30 0.06 95)", fg: "oklch(0.82 0.13 95)" },
  low:      { bg: "oklch(0.28 0.03 150)", fg: "oklch(0.75 0.10 150)" },
  blocker:  { bg: "oklch(0.30 0.09 25)", fg: "oklch(0.80 0.17 25)" },
  pass:     { bg: "oklch(0.28 0.05 150)", fg: "oklch(0.72 0.12 150)" },
  fail:     { bg: "oklch(0.30 0.08 25)", fg: "oklch(0.78 0.16 25)" },
  passed:   { bg: "oklch(0.28 0.05 150)", fg: "oklch(0.72 0.12 150)" },
  failed:   { bg: "oklch(0.30 0.08 25)", fg: "oklch(0.78 0.16 25)" },
  running:  { bg: "oklch(0.28 0.06 245)", fg: "oklch(0.75 0.14 245)" },
  major:    { bg: "oklch(0.30 0.07 55)", fg: "oklch(0.80 0.15 55)" },
  minor:    { bg: "oklch(0.28 0.03 150)", fg: "oklch(0.75 0.10 150)" },
  info:     { bg: "oklch(0.24 0.008 250)", fg: "oklch(0.60 0.01 250)" },
};

export function sevStyle(sev: string): React.CSSProperties {
  const s = SEV[sev] ?? SEV.info;
  return {
    background: s.bg,
    color: s.fg,
    fontSize: 11,
    padding: "3px 8px",
    borderRadius: 5,
    textTransform: "capitalize",
    fontWeight: 600,
    whiteSpace: "nowrap",
  };
}

export function relTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// Needed for sevStyle return type
import type React from "react";
