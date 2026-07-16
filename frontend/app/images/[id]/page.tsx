"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, type ImageDetailOut, type VulnOut } from "@/lib/api";
import { C, SEV, sevStyle, relTime } from "@/lib/tokens";
import SeverityBadge from "@/components/SeverityBadge";
import FixPanel, { type FixPanelData } from "@/components/FixPanel";

const COMPLIANCE = [
  { name: "CIS Docker Benchmark", pass: true },
  { name: "Running as root user", pass: false },
  { name: "Secrets in environment variables", pass: true },
  { name: "Image from approved registry", pass: true },
  { name: "Read-only root filesystem", pass: false },
  { name: "Unpinned base image versions", pass: false },
];

const LAYERS = [
  { index: 1, packages: 42, size: 18.3 },
  { index: 2, packages: 5, size: 2.1 },
  { index: 3, packages: 12, size: 7.8 },
  { index: 4, packages: 1, size: 0.4 },
];

type Tab = "vulns" | "compliance" | "layers";

export default function ImageDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [img, setImg] = useState<ImageDetailOut | null>(null);
  const [tab, setTab] = useState<Tab>("vulns");
  const [fixPanel, setFixPanel] = useState<FixPanelData | null>(null);

  useEffect(() => { api.image(id).then(setImg); }, [id]);
  if (!img) return <div style={{ color: C.textMuted, padding: 40 }}>Loading…</div>;

  function openFix(v: VulnOut) {
    setFixPanel({
      title: v.cve_id,
      severity: v.severity,
      description: v.description,
      cvssLine: v.cvss_score ? `CVSS ${v.cvss_score}` : undefined,
      packageLine: v.package_name ? `Package: ${v.package_name} ${v.installed_version} → ${v.fixed_version ?? "no fix"}` : undefined,
    });
    api.fixSuggestion(v.cve_id).then(fix => {
      setFixPanel(prev => prev ? {
        ...prev,
        suggestion: fix.suggestion_text,
        copyCmd: fix.copy_cmd,
        advisoryUrl: fix.advisory_url,
        cvssLine: fix.cvss_vector ? `CVSS ${v.cvss_score} · ${fix.cvss_vector}` : prev.cvssLine,
      } : null);
    }).catch(() => {});
  }

  const tabStyle = (active: boolean) => ({
    padding: "10px 16px", fontSize: 13, cursor: "pointer",
    borderBottom: active ? `2px solid ${C.accentFg}` : "2px solid transparent",
    color: active ? C.accentFg : C.textSub, fontWeight: active ? 600 : 400,
  });
  const TH = { fontSize: 11, color: C.textMuted, textTransform: "uppercase" as const, letterSpacing: "0.03em" };
  const cols = "1.4fr 1fr 0.8fr 0.8fr 0.8fr 0.8fr 0.7fr";

  return (
    <div>
      <span onClick={() => router.push("/images")} style={{ cursor: "pointer", fontSize: 12.5, color: C.textSub }}>← Back to Images</span>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", margin: "10px 0 6px" }}>
        <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "ui-monospace,monospace" }}>{img.name}:{img.tag}</div>
        <div style={{ fontSize: 11, color: C.textMuted, textTransform: "capitalize" }}>via {img.source}</div>
      </div>
      <div style={{ display: "flex", gap: 18, fontSize: 12, color: C.textMuted, marginBottom: 18 }}>
        <span>{img.registry}</span>
        <span style={{ fontFamily: "ui-monospace,monospace" }}>{img.digest?.slice(0, 20)}…</span>
        <span>{img.size_mb} MB</span>
        <span>Scanned {relTime(img.last_scanned_at)}</span>
      </div>

      <div style={{ display: "flex", gap: 4, borderBottom: `1px solid ${C.borderLight}`, marginBottom: 16 }}>
        <div style={tabStyle(tab === "vulns")} onClick={() => setTab("vulns")}>Vulnerabilities</div>
        <div style={tabStyle(tab === "compliance")} onClick={() => setTab("compliance")}>Compliance</div>
        <div style={tabStyle(tab === "layers")} onClick={() => setTab("layers")}>Layers</div>
      </div>

      {tab === "vulns" && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: cols, padding: "10px 16px", borderBottom: `1px solid ${C.borderLight}` }}>
            {["CVE ID", "Package", "Installed", "Fixed", "Severity", "Status", ""].map(h => <div key={h} style={TH}>{h}</div>)}
          </div>
          {img.vulnerabilities.map(v => (
            <div key={v.id} style={{ display: "grid", gridTemplateColumns: cols, padding: "11px 16px", borderBottom: `1px solid ${C.borderRow}`, alignItems: "center" }}>
              <a href={`/vulnerabilities/${v.cve_id}`} style={{ fontFamily: "ui-monospace,monospace", fontSize: 12.5 }}>{v.cve_id}</a>
              <div style={{ fontSize: 12.5 }}>{v.package_name}</div>
              <div style={{ fontSize: 12, fontFamily: "ui-monospace,monospace", color: C.textSub }}>{v.installed_version}</div>
              <div style={{ fontSize: 12, fontFamily: "ui-monospace,monospace", color: "oklch(0.65 0.13 150)" }}>{v.fixed_version ?? "—"}</div>
              <SeverityBadge sev={v.severity} />
              <div style={{ fontSize: 12, color: C.textMuted, textTransform: "capitalize" }}>{v.status}</div>
              <button onClick={() => openFix(v)} style={{ background: C.accentBg, color: C.accentFg, border: `1px solid ${C.accentBorder}`, borderRadius: 6, padding: "5px 10px", fontSize: 11.5, cursor: "pointer" }}>Fix</button>
            </div>
          ))}
        </div>
      )}

      {tab === "compliance" && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
          {COMPLIANCE.map(c => (
            <div key={c.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: `1px solid ${C.borderRow}` }}>
              <div style={{ fontSize: 13 }}>{c.name}</div>
              <span style={{ background: c.pass ? SEV.pass.bg : SEV.fail.bg, color: c.pass ? SEV.pass.fg : SEV.fail.fg, fontSize: 11, padding: "3px 8px", borderRadius: 5, fontWeight: 600 }}>{c.pass ? "Pass" : "Fail"}</span>
            </div>
          ))}
        </div>
      )}

      {tab === "layers" && (
        img.source === "jfrog" ? (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
            {LAYERS.map(l => (
              <div key={l.index} style={{ display: "flex", justifyContent: "space-between", padding: "12px 16px", borderBottom: `1px solid ${C.borderRow}` }}>
                <div style={{ fontFamily: "ui-monospace,monospace", fontSize: 12.5 }}>Layer {l.index}</div>
                <div style={{ fontSize: 12, color: C.textMuted }}>{l.packages} packages · {l.size} MB</div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ padding: 24, textAlign: "center", color: C.textMuted, fontSize: 13, background: C.card, border: `1px solid ${C.border}`, borderRadius: 10 }}>
            Layer breakdown not available — this image is scanned by Prisma Cloud, not JFrog Xray.
          </div>
        )
      )}

      <FixPanel data={fixPanel} onClose={() => setFixPanel(null)} />
    </div>
  );
}
