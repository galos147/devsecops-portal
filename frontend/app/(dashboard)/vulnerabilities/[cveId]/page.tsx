"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, type CveDetailOut } from "@/lib/api";
import { C, sevStyle } from "@/lib/tokens";

export default function CveDetailPage() {
  const { cveId } = useParams<{ cveId: string }>();
  const router = useRouter();
  const [cve, setCve] = useState<CveDetailOut | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => { api.cve(cveId).then(setCve); }, [cveId]);
  if (!cve) return <div style={{ color: C.textMuted, padding: 40 }}>Loading…</div>;

  function copy() {
    if (!cve?.copy_cmd) return;
    navigator.clipboard.writeText(cve.copy_cmd).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  }

  const TH = { fontSize: 11, color: C.textMuted, textTransform: "uppercase" as const, letterSpacing: "0.03em" };

  return (
    <div>
      <span onClick={() => router.push("/vulnerabilities")} style={{ cursor: "pointer", fontSize: 12.5, color: C.textSub }}>← Back to Vulnerabilities</span>
      <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "10px 0 6px" }}>
        <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "ui-monospace,monospace" }}>{cve.cve_id}</div>
        <span style={sevStyle(cve.severity)}>{cve.severity}</span>
      </div>
      <div style={{ fontSize: 13, color: C.textSub, maxWidth: 760, lineHeight: 1.5, marginBottom: 10 }}>{cve.description}</div>
      <div style={{ display: "flex", gap: 20, fontSize: 12, color: C.textMuted, marginBottom: 20, flexWrap: "wrap" }}>
        {cve.cvss_score && <span>CVSS {cve.cvss_score}</span>}
        {cve.cvss_vector && <span style={{ fontFamily: "ui-monospace,monospace" }}>{cve.cvss_vector}</span>}
        {cve.published && <span>Published {cve.published}</span>}
        {cve.advisory_url && <a href={cve.advisory_url} target="_blank" rel="noreferrer">NVD advisory ↗</a>}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 16 }}>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", fontSize: 13, fontWeight: 600, borderBottom: `1px solid ${C.borderLight}` }}>Affected Images</div>
          <div style={{ display: "grid", gridTemplateColumns: "1.6fr 0.9fr 0.9fr 0.8fr", padding: "9px 16px", borderBottom: `1px solid ${C.borderLight}` }}>
            {["Image", "Installed", "Fixed", "Status"].map(h => <div key={h} style={TH}>{h}</div>)}
          </div>
          {cve.affected_images.map(img => (
            <div key={img.id} onClick={() => router.push(`/images/${img.id}`)} style={{ display: "grid", gridTemplateColumns: "1.6fr 0.9fr 0.9fr 0.8fr", padding: "11px 16px", borderBottom: `1px solid ${C.borderRow}`, cursor: "pointer", alignItems: "center" }}>
              <div style={{ fontFamily: "ui-monospace,monospace", fontSize: 12.5 }}>{img.name}:{img.tag}</div>
              <div style={{ fontSize: 12, fontFamily: "ui-monospace,monospace", color: C.textSub }}>{img.installed_version}</div>
              <div style={{ fontSize: 12, fontFamily: "ui-monospace,monospace", color: "oklch(0.65 0.13 150)" }}>{img.fixed_version ?? "—"}</div>
              <div style={{ fontSize: 12, color: C.textMuted, textTransform: "capitalize" }}>{img.status}</div>
            </div>
          ))}
        </div>

        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Fix Suggestion</div>
          <div style={{ fontSize: 13, color: C.textSub, lineHeight: 1.5, marginBottom: 14 }}>{cve.suggestion ?? "Upgrade to the fixed version."}</div>
          {cve.copy_cmd && (
            <div style={{ background: C.inset, border: `1px solid ${C.border}`, borderRadius: 7, padding: "10px 12px", fontFamily: "ui-monospace,monospace", fontSize: 11.5, color: "oklch(0.75 0.14 150)", marginBottom: 10, wordBreak: "break-all" }}>
              {cve.copy_cmd}
            </div>
          )}
          <button onClick={copy} style={{ background: C.accentBg, color: C.accentFg, border: `1px solid ${C.accentBorder}`, borderRadius: 6, padding: "7px 12px", fontSize: 12, cursor: "pointer" }}>
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      </div>
    </div>
  );
}
