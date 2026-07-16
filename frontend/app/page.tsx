"use client";
import { useEffect, useState } from "react";
import { api, type DashboardStats } from "@/lib/api";
import { C, SEV, relTime } from "@/lib/tokens";
import KpiCard from "@/components/KpiCard";
import ToolHealthCard from "@/components/ToolHealthCard";
import Link from "next/link";

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);

  useEffect(() => { api.dashboard().then(setStats); }, []);

  if (!stats) return <div style={{ color: C.textMuted, padding: 40 }}>Loading…</div>;

  const sev = stats.severity_counts;
  const maxSev = Math.max(sev.critical, sev.high, sev.medium, sev.low, 1);

  return (
    <div>
      <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Security Posture</div>
      <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 20 }}>Aggregated across JFrog Xray, SonarQube, Prisma Cloud, and GitLab.</div>

      {/* KPI cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 12, marginBottom: 24 }}>
        <KpiCard label="Total Images" value={stats.total_images} />
        <KpiCard label="Critical CVEs" value={stats.critical_cves} color="oklch(0.80 0.17 25)" />
        <KpiCard label="High Code Issues" value={stats.high_code_issues} color="oklch(0.80 0.15 55)" />
        <KpiCard label="Failing Pipelines" value={stats.failing_pipelines} color="oklch(0.78 0.16 25)" />
        <KpiCard label="Last Sync" value={relTime(stats.last_sync)} />
      </div>

      {/* Charts row */}
      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1.4fr", gap: 16, marginBottom: 16 }}>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>Open Vulnerabilities by Severity</div>
          {(["critical", "high", "medium", "low"] as const).map(s => (
            <div key={s} style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                <span style={{ color: C.textSub, textTransform: "capitalize" }}>{s}</span>
                <span style={{ color: C.textMuted }}>{sev[s]}</span>
              </div>
              <div style={{ height: 8, background: "oklch(0.24 0.008 250)", borderRadius: 4, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${(sev[s] / maxSev) * 100}%`, background: SEV[s].fg, borderRadius: 4 }} />
              </div>
            </div>
          ))}
        </div>

        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Tool Health</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
            {stats.tool_health.map(t => <ToolHealthCard key={t.tool} tool={t} />)}
          </div>
        </div>
      </div>

      {/* Tables row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
          <div style={{ padding: "14px 16px", fontSize: 13, fontWeight: 600, borderBottom: `1px solid ${C.borderLight}` }}>Top Vulnerable Images</div>
          {stats.top_vuln_images.map(img => (
            <Link key={img.id} href={`/images/${img.id}`} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderBottom: `1px solid ${C.borderRow}`, textDecoration: "none", color: "inherit" }}>
              <div>
                <div style={{ fontSize: 13, fontFamily: "ui-monospace,monospace" }}>{img.name}:{img.tag}</div>
                <div style={{ fontSize: 11, color: C.textMuted }}>{img.registry}</div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <span style={{ background: SEV.critical.bg, color: SEV.critical.fg, fontSize: 11, padding: "2px 7px", borderRadius: 5, fontWeight: 600 }}>{img.critical}C</span>
                <span style={{ background: SEV.high.bg, color: SEV.high.fg, fontSize: 11, padding: "2px 7px", borderRadius: 5, fontWeight: 600 }}>{img.high}H</span>
              </div>
            </Link>
          ))}
        </div>

        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
          <div style={{ padding: "14px 16px", fontSize: 13, fontWeight: 600, borderBottom: `1px solid ${C.borderLight}` }}>Recent Pipeline Failures</div>
          {stats.recent_failures.map(p => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderBottom: `1px solid ${C.borderRow}` }}>
              <div>
                <div style={{ fontSize: 13 }}>{p.project} <span style={{ color: C.textMuted, fontSize: 11 }}>· {p.ref}</span></div>
                <div style={{ fontSize: 11, color: C.textMuted }}>{relTime(p.started_at)}</div>
              </div>
              <div style={{ fontSize: 11, color: "oklch(0.75 0.16 25)", fontFamily: "ui-monospace,monospace" }}>{p.total_findings} findings</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
