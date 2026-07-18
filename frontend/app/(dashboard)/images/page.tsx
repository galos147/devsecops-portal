"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, type ImageOut } from "@/lib/api";
import { C, sevStyle, relTime } from "@/lib/tokens";
import DemoBadge from "@/components/DemoBadge";

// ── shared styles ─────────────────────────────────────────────────────────────
const filterStyle = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 7, padding: "8px 10px", color: C.text, fontSize: 13 };
const inputStyle = { ...filterStyle, width: 260, outline: "none" };
const TH = { fontSize: 11, color: C.textMuted, textTransform: "uppercase" as const, letterSpacing: "0.03em" };

function countColor(n: number, level: string) {
  const colors: Record<string, string> = { critical: "oklch(0.80 0.17 25)", high: "oklch(0.80 0.15 55)", medium: "oklch(0.82 0.13 95)", low: "oklch(0.75 0.10 150)" };
  return { fontSize: 12.5, fontWeight: n > 0 ? 600 : 400, color: n > 0 ? colors[level] : C.textMuted };
}

// ── Package inventory data ────────────────────────────────────────────────────
interface PkgRow {
  name: string; pkg_type: string; current_version: string;
  fix_version?: string; severity?: string;
  affected_images: number; affected_names: string[]; source: string;
}

const SEV_RANK: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };

const PKG_COLORS: Record<string, { bg: string; fg: string }> = {
  deb: { bg: "oklch(0.25 0.06 245)", fg: "oklch(0.75 0.14 245)" },
  rpm: { bg: "oklch(0.28 0.07 55)",  fg: "oklch(0.82 0.15 55)" },
  jar: { bg: "oklch(0.28 0.08 25)",  fg: "oklch(0.80 0.16 25)" },
  npm: { bg: "oklch(0.25 0.06 150)", fg: "oklch(0.72 0.13 150)" },
  pip: { bg: "oklch(0.28 0.07 95)",  fg: "oklch(0.82 0.14 95)" },
  go:  { bg: "oklch(0.26 0.06 210)", fg: "oklch(0.76 0.13 210)" },
  apk: { bg: "oklch(0.26 0.07 310)", fg: "oklch(0.78 0.14 310)" },
};

const ALL_PACKAGES: PkgRow[] = [
  { name: "log4j-core",  pkg_type: "jar", current_version: "2.14.1", fix_version: "2.17.1", severity: "critical", affected_images: 2, affected_names: ["payments-service:2.4.1", "fraud-detection:3.4.0"], source: "jfrog" },
  { name: "xz-utils",    pkg_type: "deb", current_version: "5.6.0",  fix_version: "5.6.2",  severity: "critical", affected_images: 2, affected_names: ["auth-gateway:1.12.0", "search-indexer:4.2.0"], source: "jfrog" },
  { name: "runc",        pkg_type: "rpm", current_version: "1.1.5",  fix_version: "1.1.12", severity: "critical", affected_images: 3, affected_names: ["checkout-api:3.0.2", "notification-worker:1.5.0", "inventory-sync:1.0.8"], source: "prisma" },
  { name: "libwebp",     pkg_type: "deb", current_version: "1.2.4",  fix_version: "1.3.2",  severity: "critical", affected_images: 4, affected_names: ["notification-worker:1.5.0", "fraud-detection:3.4.0", "search-indexer:4.2.0", "billing-engine:2.9.0"], source: "jfrog+prisma" },
  { name: "openssl",     pkg_type: "deb", current_version: "3.0.6",  fix_version: "3.0.7",  severity: "high",     affected_images: 3, affected_names: ["payments-service:2.4.1", "auth-gateway:1.12.0", "billing-engine:2.9.0"], source: "jfrog" },
  { name: "curl",        pkg_type: "deb", current_version: "8.1.0",  fix_version: "8.4.0",  severity: "high",     affected_images: 2, affected_names: ["auth-gateway:1.12.0", "reporting-api:2.0.5"], source: "jfrog" },
  { name: "nghttp2",     pkg_type: "deb", current_version: "1.51.0", fix_version: "1.57.0", severity: "high",     affected_images: 2, affected_names: ["checkout-api:3.0.2", "fraud-detection:3.4.0"], source: "prisma" },
  { name: "requests",    pkg_type: "pip", current_version: "2.29.0", fix_version: "2.31.0", severity: "medium",   affected_images: 3, affected_names: ["user-profile-svc:2.1.3", "email-dispatcher:1.3.1", "session-cache:1.1.0"], source: "jfrog" },
  { name: "openssl",     pkg_type: "deb", current_version: "1.1.1l", fix_version: "1.1.1n", severity: "medium",   affected_images: 2, affected_names: ["notification-worker:1.5.0", "inventory-sync:1.0.8"], source: "prisma" },
  { name: "minizip",     pkg_type: "deb", current_version: "1.2.11", fix_version: "1.3",    severity: "medium",   affected_images: 2, affected_names: ["inventory-sync:1.0.8", "reporting-api:2.0.5"], source: "prisma" },
  { name: "sqlite3",     pkg_type: "deb", current_version: "3.26.0", fix_version: "3.28.0", severity: "low",      affected_images: 2, affected_names: ["user-profile-svc:2.1.3", "session-cache:1.1.0"], source: "jfrog" },
  { name: "python3.11",  pkg_type: "deb", current_version: "3.11.4", fix_version: undefined, severity: undefined, affected_images: 5, affected_names: ["payments-service:2.4.1", "auth-gateway:1.12.0", "user-profile-svc:2.1.3", "email-dispatcher:1.3.1", "session-cache:1.1.0"], source: "jfrog" },
  { name: "node",        pkg_type: "deb", current_version: "20.0.0", fix_version: undefined, severity: undefined, affected_images: 4, affected_names: ["payments-service:2.4.1", "search-indexer:4.2.0", "email-dispatcher:1.3.1", "session-cache:1.1.0"], source: "jfrog" },
  { name: "glibc",       pkg_type: "deb", current_version: "2.35",   fix_version: undefined, severity: undefined, affected_images: 3, affected_names: ["checkout-api:3.0.2", "notification-worker:1.5.0", "reporting-api:2.0.5"], source: "prisma" },
  { name: "busybox",     pkg_type: "apk", current_version: "1.36.1", fix_version: undefined, severity: undefined, affected_images: 3, affected_names: ["checkout-api:3.0.2", "inventory-sync:1.0.8", "reporting-api:2.0.5"], source: "prisma" },
  { name: "alpine-base", pkg_type: "apk", current_version: "3.18.0", fix_version: undefined, severity: undefined, affected_images: 4, affected_names: ["payments-service:2.4.1", "auth-gateway:1.12.0", "search-indexer:4.2.0", "session-cache:1.1.0"], source: "jfrog" },
];

// ── Main page ─────────────────────────────────────────────────────────────────
type MainTab = "images" | "packages";

export default function ImagesPage() {
  const router = useRouter();
  const [mainTab, setMainTab] = useState<MainTab>("images");

  // Images tab state
  const [images, setImages] = useState<ImageOut[]>([]);
  const [q, setQ] = useState("");
  const [registry, setRegistry] = useState("all");
  const [source, setSource] = useState("all");
  const [minSeverity, setMinSeverity] = useState("all");

  // Packages tab state
  const [pkgQ, setPkgQ] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [sevFilter, setSevFilter] = useState("all");
  const [hasFixOnly, setHasFixOnly] = useState(false);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  useEffect(() => { api.images().then(setImages); }, []);

  const registries = [...new Set(images.map(i => i.registry))];

  const filteredImages = images.filter(img => {
    if (q && !`${img.name}:${img.tag} ${img.digest}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (registry !== "all" && img.registry !== registry) return false;
    if (source !== "all" && img.source !== source) return false;
    if (minSeverity === "critical" && img.counts.critical === 0) return false;
    if (minSeverity === "high" && img.counts.critical + img.counts.high === 0) return false;
    if (minSeverity === "medium" && img.counts.critical + img.counts.high + img.counts.medium === 0) return false;
    return true;
  });

  const filteredPkgs = ALL_PACKAGES
    .filter(p => {
      if (pkgQ && !p.name.toLowerCase().includes(pkgQ.toLowerCase())) return false;
      if (typeFilter !== "all" && p.pkg_type !== typeFilter) return false;
      if (sevFilter === "clean" && p.severity) return false;
      if (sevFilter !== "all" && sevFilter !== "clean" && p.severity !== sevFilter) return false;
      if (hasFixOnly && !p.fix_version) return false;
      return true;
    })
    .sort((a, b) => {
      const ra = SEV_RANK[a.severity ?? ""] ?? 0;
      const rb = SEV_RANK[b.severity ?? ""] ?? 0;
      return rb !== ra ? rb - ra : a.name.localeCompare(b.name);
    });

  const pkgTypes = [...new Set(ALL_PACKAGES.map(p => p.pkg_type))].sort();
  const imgCols = "1.6fr 1.4fr 0.6fr 0.6fr 0.6fr 0.6fr 1fr 0.8fr";
  const pkgCols = "1.2fr 0.6fr 0.9fr 0.9fr 0.8fr 0.9fr 0.7fr";

  const tabStyle = (active: boolean) => ({
    padding: "9px 18px", fontSize: 13, cursor: "pointer",
    borderBottom: active ? `2px solid ${C.accentFg}` : "2px solid transparent",
    color: active ? C.accentFg : C.textSub, fontWeight: active ? 600 : 400,
  });

  return (
    <div>
      <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Images</div>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 4, borderBottom: `1px solid ${C.borderLight}`, marginBottom: 20 }}>
        <div style={tabStyle(mainTab === "images")}   onClick={() => setMainTab("images")}>Image Inventory</div>
        <div style={tabStyle(mainTab === "packages")} onClick={() => setMainTab("packages")}>Package Inventory</div>
      </div>

      {/* ── Images tab ── */}
      {mainTab === "images" && (
        <div>
          <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, tag, digest…" style={inputStyle} />
            <select value={registry} onChange={e => setRegistry(e.target.value)} style={filterStyle}>
              <option value="all">All registries</option>
              {registries.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <select value={source} onChange={e => setSource(e.target.value)} style={filterStyle}>
              <option value="all">All sources</option>
              <option value="jfrog">JFrog</option>
              <option value="prisma">Prisma</option>
            </select>
            <select value={minSeverity} onChange={e => setMinSeverity(e.target.value)} style={filterStyle}>
              <option value="all">Any severity</option>
              <option value="critical">Has critical</option>
              <option value="high">Has high+</option>
              <option value="medium">Has medium+</option>
            </select>
          </div>

          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: imgCols, padding: "10px 16px", borderBottom: `1px solid ${C.borderLight}` }}>
              {["Image", "Registry", "Crit", "High", "Med", "Low", "Last Scanned", "Source"].map(h => (
                <div key={h} style={TH}>{h}</div>
              ))}
            </div>
            {filteredImages.map(img => (
              <div key={img.id} onClick={() => router.push(`/images/${img.id}`)} style={{ display: "grid", gridTemplateColumns: imgCols, padding: "12px 16px", borderBottom: `1px solid ${C.borderRow}`, cursor: "pointer", alignItems: "center" }}>
                <div style={{ fontFamily: "ui-monospace,monospace", fontSize: 12.5, display: "flex", alignItems: "center", gap: 6 }}>
                  {img.name}:{img.tag}
                  {img.is_seed && <DemoBadge />}
                </div>
                <div style={{ fontSize: 12, color: C.textSub }}>{img.registry}</div>
                <div style={countColor(img.counts.critical, "critical")}>{img.counts.critical}</div>
                <div style={countColor(img.counts.high, "high")}>{img.counts.high}</div>
                <div style={countColor(img.counts.medium, "medium")}>{img.counts.medium}</div>
                <div style={countColor(img.counts.low, "low")}>{img.counts.low}</div>
                <div style={{ fontSize: 12, color: C.textMuted }}>{relTime(img.last_scanned_at)}</div>
                <div style={{ fontSize: 11, color: C.textMuted, textTransform: "capitalize" }}>{img.source}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Packages tab ── */}
      {mainTab === "packages" && (
        <div>
          <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 16 }}>
            Packages found across all scanned images — sorted by severity, with upgrade versions.
          </div>
          <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
            <input value={pkgQ} onChange={e => setPkgQ(e.target.value)} placeholder="Search by package name…" style={{ ...filterStyle, width: 240, outline: "none" }} />
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={filterStyle}>
              <option value="all">All types</option>
              {pkgTypes.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={sevFilter} onChange={e => setSevFilter(e.target.value)} style={filterStyle}>
              <option value="all">All severities</option>
              <option value="critical">Critical</option><option value="high">High</option>
              <option value="medium">Medium</option><option value="low">Low</option>
              <option value="clean">Clean</option>
            </select>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: C.textSub, cursor: "pointer" }}>
              <input type="checkbox" checked={hasFixOnly} onChange={e => setHasFixOnly(e.target.checked)} />
              Has fix available
            </label>
          </div>

          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: pkgCols, padding: "10px 16px", borderBottom: `1px solid ${C.borderLight}` }}>
              {["Package", "Type", "Current Ver.", "Fix Version", "Severity", "Affected Images", "Source"].map(h => (
                <div key={h} style={TH}>{h}</div>
              ))}
            </div>

            {filteredPkgs.length === 0 && (
              <div style={{ padding: 24, textAlign: "center", color: C.textMuted, fontSize: 13 }}>No packages match the current filters.</div>
            )}

            {filteredPkgs.map(pkg => {
              const typeColor = PKG_COLORS[pkg.pkg_type] ?? { bg: C.card, fg: C.textSub };
              const rowKey = `${pkg.name}-${pkg.current_version}`;
              const isExpanded = expandedRow === rowKey;
              return (
                <div key={rowKey}>
                  <div style={{ display: "grid", gridTemplateColumns: pkgCols, padding: "11px 16px", borderBottom: `1px solid ${C.borderRow}`, alignItems: "center" }}>
                    <div style={{ fontFamily: "ui-monospace,monospace", fontSize: 12.5, fontWeight: pkg.severity ? 600 : 400 }}>{pkg.name}</div>
                    <span style={{ background: typeColor.bg, color: typeColor.fg, fontSize: 10.5, padding: "2px 7px", borderRadius: 4, fontWeight: 600, width: "fit-content" }}>{pkg.pkg_type}</span>
                    <div style={{ fontSize: 12, fontFamily: "ui-monospace,monospace", color: C.textSub }}>{pkg.current_version}</div>
                    <div style={{ fontSize: 12, fontFamily: "ui-monospace,monospace", color: pkg.fix_version ? "oklch(0.72 0.13 150)" : C.textMuted }}>{pkg.fix_version ?? "—"}</div>
                    <div>
                      {pkg.severity
                        ? <span style={sevStyle(pkg.severity)}>{pkg.severity}</span>
                        : <span style={{ background: "oklch(0.28 0.05 150)", color: "oklch(0.72 0.12 150)", fontSize: 11, padding: "3px 8px", borderRadius: 5, fontWeight: 600 }}>Clean</span>
                      }
                    </div>
                    <div onClick={() => setExpandedRow(isExpanded ? null : rowKey)} style={{ fontSize: 12.5, cursor: "pointer", color: C.accentFg }}>
                      {pkg.affected_images} image{pkg.affected_images !== 1 ? "s" : ""} {isExpanded ? "▲" : "▼"}
                    </div>
                    <div style={{ fontSize: 11, color: C.textMuted }}>{pkg.source}</div>
                  </div>
                  {isExpanded && (
                    <div style={{ background: "oklch(0.16 0.004 250)", padding: "8px 16px 10px", borderBottom: `1px solid ${C.borderRow}` }}>
                      {pkg.affected_names.map(n => (
                        <div key={n} style={{ fontSize: 12, color: C.textSub, fontFamily: "ui-monospace,monospace", padding: "3px 0" }}>· {n}</div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
