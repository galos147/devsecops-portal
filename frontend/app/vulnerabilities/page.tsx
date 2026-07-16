"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, type VulnGroupOut } from "@/lib/api";
import { C } from "@/lib/tokens";
import SeverityBadge from "@/components/SeverityBadge";

const filterStyle = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 7, padding: "8px 10px", color: C.text, fontSize: 13 };

type SortKey = "severity" | "cvss";
const SEV_RANK: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };

export default function VulnerabilitiesPage() {
  const router = useRouter();
  const [vulns, setVulns] = useState<VulnGroupOut[]>([]);
  const [q, setQ] = useState("");
  const [severity, setSeverity] = useState("all");
  const [status, setStatus] = useState("all");
  const [source, setSource] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("severity");
  const [sortAsc, setSortAsc] = useState(false);

  useEffect(() => { api.vulnerabilities().then(setVulns); }, []);

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortAsc(a => !a);
    else { setSortKey(k); setSortAsc(false); }
  }

  const filtered = vulns
    .filter(v => {
      if (q && !`${v.cve_id} ${v.description} ${v.package_name ?? ""}`.toLowerCase().includes(q.toLowerCase())) return false;
      if (severity !== "all" && v.severity !== severity) return false;
      if (status !== "all" && v.status !== status) return false;
      if (source !== "all" && v.source_tool !== source) return false;
      return true;
    })
    .sort((a, b) => {
      let cmp = 0;
      if (sortKey === "severity") cmp = (SEV_RANK[b.severity] ?? 0) - (SEV_RANK[a.severity] ?? 0);
      if (sortKey === "cvss") cmp = (b.cvss_score ?? 0) - (a.cvss_score ?? 0);
      return sortAsc ? -cmp : cmp;
    });

  const TH = { fontSize: 11, color: C.textMuted, textTransform: "uppercase" as const, letterSpacing: "0.03em" };
  const cols = "1.1fr 0.8fr 0.6fr 2fr 0.9fr 0.9fr 0.8fr";
  const caret = (k: SortKey) => sortKey === k ? (sortAsc ? " ▲" : " ▼") : "";

  return (
    <div>
      <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Vulnerability Explorer</div>
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="CVE ID, package, keyword…" style={{ ...filterStyle, width: 260, outline: "none" }} />
        <select value={severity} onChange={e => setSeverity(e.target.value)} style={filterStyle}>
          <option value="all">All severities</option>
          <option value="critical">Critical</option><option value="high">High</option>
          <option value="medium">Medium</option><option value="low">Low</option>
        </select>
        <select value={status} onChange={e => setStatus(e.target.value)} style={filterStyle}>
          <option value="all">All statuses</option>
          <option value="open">Open</option><option value="fixed">Fixed</option><option value="suppressed">Suppressed</option>
        </select>
        <select value={source} onChange={e => setSource(e.target.value)} style={filterStyle}>
          <option value="all">All tools</option><option value="jfrog">JFrog</option><option value="prisma">Prisma</option>
        </select>
      </div>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: cols, padding: "10px 16px", borderBottom: `1px solid ${C.borderLight}` }}>
          <div style={TH}>CVE ID</div>
          <div style={{ ...TH, cursor: "pointer" }} onClick={() => toggleSort("severity")}>Severity{caret("severity")}</div>
          <div style={{ ...TH, cursor: "pointer" }} onClick={() => toggleSort("cvss")}>CVSS{caret("cvss")}</div>
          <div style={TH}>Description</div>
          <div style={TH}>Affected Images</div>
          <div style={TH}>Fixed Version</div>
          <div style={TH}>Status</div>
        </div>
        {filtered.map(v => (
          <div key={v.cve_id} onClick={() => router.push(`/vulnerabilities/${v.cve_id}`)} style={{ display: "grid", gridTemplateColumns: cols, padding: "12px 16px", borderBottom: `1px solid ${C.borderRow}`, cursor: "pointer", alignItems: "center" }}>
            <div style={{ fontFamily: "ui-monospace,monospace", fontSize: 12.5 }}>{v.cve_id}</div>
            <SeverityBadge sev={v.severity} />
            <div style={{ fontSize: 12.5, fontFamily: "ui-monospace,monospace" }}>{v.cvss_score}</div>
            <div style={{ fontSize: 12.5, color: C.textSub, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.description}</div>
            <div style={{ fontSize: 12.5 }}>{v.affected_images} images</div>
            <div style={{ fontSize: 12, fontFamily: "ui-monospace,monospace", color: "oklch(0.65 0.13 150)" }}>{v.fixed_version ?? "—"}</div>
            <div style={{ fontSize: 12, color: C.textMuted, textTransform: "capitalize" }}>{v.status}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
