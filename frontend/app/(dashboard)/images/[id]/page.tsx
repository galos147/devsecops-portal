"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, type ImageDetailOut, type VulnOut, type PackageOut } from "@/lib/api";
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


const PKG_COLORS: Record<string, { bg: string; fg: string }> = {
  deb:  { bg: "oklch(0.25 0.06 245)", fg: "oklch(0.75 0.14 245)" },
  rpm:  { bg: "oklch(0.28 0.07 55)",  fg: "oklch(0.82 0.15 55)" },
  jar:  { bg: "oklch(0.28 0.08 25)",  fg: "oklch(0.80 0.16 25)" },
  npm:  { bg: "oklch(0.25 0.06 150)", fg: "oklch(0.72 0.13 150)" },
  pip:  { bg: "oklch(0.28 0.07 95)",  fg: "oklch(0.82 0.14 95)" },
  go:   { bg: "oklch(0.26 0.06 210)", fg: "oklch(0.76 0.13 210)" },
  apk:  { bg: "oklch(0.26 0.07 310)", fg: "oklch(0.78 0.14 310)" },
  gem:  { bg: "oklch(0.28 0.07 330)", fg: "oklch(0.80 0.15 330)" },
};

type Tab = "vulns" | "packages" | "compliance" | "layers";

export default function ImageDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [img, setImg] = useState<ImageDetailOut | null>(null);
  const [packages, setPackages] = useState<PackageOut[]>([]);
  const [tab, setTab] = useState<Tab>("vulns");
  const [fixPanel, setFixPanel] = useState<FixPanelData | null>(null);
  const [pkgSearch, setPkgSearch] = useState("");
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    api.image(id).then(setImg);
    api.imagePackages(id).then(setPackages).catch(() => {});
  }, [id]);
  if (!img) return <div style={{ color: C.textMuted, padding: 40 }}>Loading…</div>;

  function handleSync() {
    setSyncing(true);
    api.syncImage(id).then(setImg).finally(() => setSyncing(false));
  }

  const filteredPkgs = packages.filter(p => p.name.toLowerCase().includes(pkgSearch.toLowerCase()));

  function openFix(v: VulnOut) {
    setFixPanel({
      title: v.cve_id, severity: v.severity, description: v.description,
      cvssLine: v.cvss_score ? `CVSS ${v.cvss_score}` : undefined,
      packageLine: v.package_name ? `Package: ${v.package_name} ${v.installed_version} → ${v.fixed_version ?? "no fix"}` : undefined,
    });
    api.fixSuggestion(v.cve_id).then(fix => {
      setFixPanel(prev => prev ? { ...prev, suggestion: fix.suggestion_text, copyCmd: fix.copy_cmd, advisoryUrl: fix.advisory_url, cvssLine: fix.cvss_vector ? `CVSS ${v.cvss_score} · ${fix.cvss_vector}` : prev.cvssLine } : null);
    }).catch(() => {});
  }

  const tabStyle = (active: boolean) => ({
    padding: "10px 16px", fontSize: 13, cursor: "pointer",
    borderBottom: active ? `2px solid ${C.accentFg}` : "2px solid transparent",
    color: active ? C.accentFg : C.textSub, fontWeight: active ? 600 : 400,
  });
  const TH = { fontSize: 11, color: C.textMuted, textTransform: "uppercase" as const, letterSpacing: "0.03em" };
  const vulnCols = "1.4fr 1fr 0.8fr 0.8fr 0.8fr 0.8fr 0.7fr";
  const pkgCols  = "1.4fr 0.9fr 0.6fr 1fr 0.7fr 0.8fr";

  return (
    <div>
      <span onClick={() => router.push("/images")} style={{ cursor: "pointer", fontSize: 12.5, color: C.textSub }}>← Back to Images</span>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", margin: "10px 0 6px" }}>
        <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "ui-monospace,monospace" }}>{img.name}:{img.tag}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 11, color: C.textMuted, textTransform: "capitalize" }}>via {img.source}</div>
          {img.source === "jfrog" && (
            <button onClick={handleSync} disabled={syncing} style={{ background: C.accentBg, color: C.accentFg, border: `1px solid ${C.accentBorder}`, borderRadius: 6, padding: "5px 10px", fontSize: 11.5, cursor: syncing ? "default" : "pointer", opacity: syncing ? 0.7 : 1 }}>
              {syncing ? "Updating…" : "Update"}
            </button>
          )}
        </div>
      </div>
      <div style={{ display: "flex", gap: 18, fontSize: 12, color: C.textMuted, marginBottom: 18 }}>
        <span>{img.registry}</span>
        <span style={{ fontFamily: "ui-monospace,monospace" }}>{img.digest?.slice(0, 20)}…</span>
        <span>{img.size_mb} MB</span>
        <span>Scanned {relTime(img.last_scanned_at)}</span>
      </div>

      <div style={{ display: "flex", gap: 4, borderBottom: `1px solid ${C.borderLight}`, marginBottom: 16 }}>
        <div style={tabStyle(tab === "vulns")}     onClick={() => setTab("vulns")}>Vulnerabilities</div>
        <div style={tabStyle(tab === "packages")}  onClick={() => setTab("packages")}>Packages</div>
        <div style={tabStyle(tab === "compliance")} onClick={() => setTab("compliance")}>Compliance</div>
        <div style={tabStyle(tab === "layers")}    onClick={() => setTab("layers")}>Layers</div>
      </div>

      {tab === "vulns" && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: vulnCols, padding: "10px 16px", borderBottom: `1px solid ${C.borderLight}` }}>
            {["CVE ID", "Package", "Installed", "Fixed", "Severity", "Status", ""].map(h => <div key={h} style={TH}>{h}</div>)}
          </div>
          {img.vulnerabilities.map(v => (
            <div key={v.id} style={{ display: "grid", gridTemplateColumns: vulnCols, padding: "11px 16px", borderBottom: `1px solid ${C.borderRow}`, alignItems: "center" }}>
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

      {tab === "packages" && (
        <div>
          <input
            value={pkgSearch} onChange={e => setPkgSearch(e.target.value)}
            placeholder="Search packages…"
            style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 7, padding: "8px 12px", color: C.text, fontSize: 13, width: 260, outline: "none", marginBottom: 14 }}
          />
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: pkgCols, padding: "10px 16px", borderBottom: `1px solid ${C.borderLight}` }}>
              {["Package", "Version", "Type", "License", "Source", "Status"].map(h => <div key={h} style={TH}>{h}</div>)}
            </div>
            {filteredPkgs.map(pkg => {
              const typeColor = PKG_COLORS[pkg.pkg_type ?? ""] ?? { bg: C.card, fg: C.textSub };
              return (
                <div key={pkg.name} style={{ display: "grid", gridTemplateColumns: pkgCols, padding: "11px 16px", borderBottom: `1px solid ${C.borderRow}`, alignItems: "center" }}>
                  <div style={{ fontSize: 12.5, fontFamily: "ui-monospace,monospace" }}>{pkg.name}</div>
                  <div style={{ fontSize: 12, fontFamily: "ui-monospace,monospace", color: C.textSub }}>{pkg.version}</div>
                  <span style={{ background: typeColor.bg, color: typeColor.fg, fontSize: 10.5, padding: "2px 7px", borderRadius: 4, fontWeight: 600, width: "fit-content" }}>{pkg.pkg_type}</span>
                  <div style={{ fontSize: 12, color: C.textMuted }}>{pkg.license}</div>
                  <div style={{ fontSize: 11, color: C.textMuted, textTransform: "capitalize" }}>{pkg.source_tool}</div>
                  {pkg.vuln_severity ? (
                    <span style={sevStyle(pkg.vuln_severity)}>{pkg.vuln_severity}</span>
                  ) : (
                    <span style={{ background: "oklch(0.28 0.05 150)", color: "oklch(0.72 0.12 150)", fontSize: 11, padding: "3px 8px", borderRadius: 5, fontWeight: 600 }}>Clean</span>
                  )}
                </div>
              );
            })}
          </div>
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
