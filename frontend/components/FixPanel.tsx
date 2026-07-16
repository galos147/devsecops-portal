"use client";
import { useState } from "react";
import { C, SEV, sevStyle } from "@/lib/tokens";

export interface FixPanelData {
  title: string;
  severity: string;
  description?: string;
  cvssLine?: string;
  packageLine?: string;
  suggestion?: string;
  copyCmd?: string;
  advisoryUrl?: string;
  advisoryLabel?: string;
}

interface Props {
  data: FixPanelData | null;
  onClose: () => void;
}

export default function FixPanel({ data, onClose }: Props) {
  const [copied, setCopied] = useState(false);

  if (!data) return null;

  function copy() {
    if (!data?.copyCmd) return;
    navigator.clipboard.writeText(data.copyCmd).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "oklch(0 0 0 / 0.4)", zIndex: 10 }} />
      <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: 420, background: "oklch(0.17 0.005 250)", borderLeft: `1px solid ${C.border}`, zIndex: 11, padding: 22, overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Fix Suggestion</div>
          <span onClick={onClose} style={{ cursor: "pointer", color: C.textMuted, fontSize: 20, lineHeight: 1 }}>×</span>
        </div>
        <div style={{ fontFamily: "ui-monospace,monospace", fontSize: 15, marginBottom: 6 }}>{data.title}</div>
        <span style={sevStyle(data.severity)}>{data.severity}</span>
        <div style={{ fontSize: 13, color: C.textSub, lineHeight: 1.5, margin: "14px 0" }}>{data.description}</div>
        {data.cvssLine && <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 4 }}>{data.cvssLine}</div>}
        {data.packageLine && <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 14 }}>{data.packageLine}</div>}
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Remediation</div>
        <div style={{ fontSize: 13, color: C.textSub, lineHeight: 1.5, marginBottom: 14 }}>{data.suggestion ?? "Upgrade to the fixed version listed above."}</div>
        {data.copyCmd && (
          <div style={{ background: C.inset, border: `1px solid ${C.border}`, borderRadius: 7, padding: "10px 12px", fontFamily: "ui-monospace,monospace", fontSize: 11.5, color: "oklch(0.75 0.14 150)", marginBottom: 10, wordBreak: "break-all" }}>
            {data.copyCmd}
          </div>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          {data.copyCmd && (
            <button onClick={copy} style={{ background: C.accentBg, color: C.accentFg, border: `1px solid ${C.accentBorder}`, borderRadius: 6, padding: "7px 12px", fontSize: 12, cursor: "pointer" }}>
              {copied ? "Copied!" : "Copy"}
            </button>
          )}
          {data.advisoryUrl && (
            <a href={data.advisoryUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12, alignSelf: "center", color: C.accentFg }}>{data.advisoryLabel ?? "Advisory ↗"}</a>
          )}
        </div>
      </div>
    </>
  );
}
