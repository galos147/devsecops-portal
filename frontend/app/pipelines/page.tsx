"use client";
import { useEffect, useState } from "react";
import { api, type PipelineOut } from "@/lib/api";
import { C, SEV, relTime } from "@/lib/tokens";

const filterStyle = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 7, padding: "8px 10px", color: C.text, fontSize: 13 };

export default function PipelinesPage() {
  const [pipelines, setPipelines] = useState<PipelineOut[]>([]);
  const [projectFilter, setProjectFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => { api.pipelines().then(setPipelines); }, []);

  const projects = [...new Set(pipelines.map(p => p.project))];
  const filtered = pipelines.filter(p => {
    if (projectFilter !== "all" && p.project !== projectFilter) return false;
    if (statusFilter !== "all" && p.status !== statusFilter) return false;
    return true;
  });

  const TH = { fontSize: 11, color: C.textMuted, textTransform: "uppercase" as const, letterSpacing: "0.03em" };
  const cols = "1.3fr 0.9fr 0.8fr 0.6fr 0.6fr 0.9fr 1fr";

  return (
    <div>
      <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Pipeline Security</div>
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <select value={projectFilter} onChange={e => setProjectFilter(e.target.value)} style={filterStyle}>
          <option value="all">All projects</option>
          {projects.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={filterStyle}>
          <option value="all">All statuses</option>
          <option value="passed">Passed</option><option value="failed">Failed</option><option value="running">Running</option>
        </select>
      </div>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: cols, padding: "10px 16px", borderBottom: `1px solid ${C.borderLight}` }}>
          {["Project", "Branch", "Status", "SAST", "Dep", "Secrets", "Started"].map(h => <div key={h} style={TH}>{h}</div>)}
        </div>
        {filtered.map(p => {
          const status = p.status ?? "unknown";
          const s = SEV[status] ?? { bg: C.card, fg: C.textSub };
          return (
            <div key={p.id}>
              <div onClick={() => setExpanded(expanded === p.id ? null : p.id)} style={{ display: "grid", gridTemplateColumns: cols, padding: "11px 16px", borderBottom: `1px solid ${C.borderRow}`, cursor: "pointer", alignItems: "center" }}>
                <div style={{ fontSize: 12.5 }}>{p.project}</div>
                <div style={{ fontSize: 12, fontFamily: "ui-monospace,monospace", color: C.textSub }}>{p.ref}</div>
                <span style={{ background: s.bg, color: s.fg, fontSize: 11, padding: "3px 8px", borderRadius: 5, fontWeight: 600, textTransform: "capitalize", width: "fit-content" }}>{status}</span>
                <div style={{ fontSize: 12.5 }}>{p.sast}</div>
                <div style={{ fontSize: 12.5 }}>{p.dep_scan}</div>
                <div style={{ fontSize: 12.5 }}>{p.secret_detection}</div>
                <div style={{ fontSize: 12, color: C.textMuted }}>{relTime(p.started_at)}</div>
              </div>
              {expanded === p.id && p.findings && p.findings.length > 0 && (
                <div style={{ background: "oklch(0.16 0.004 250)", padding: "10px 16px 12px", borderBottom: `1px solid ${C.borderRow}` }}>
                  {p.findings.map((f, i) => (
                    <div key={i} style={{ fontSize: 12, color: C.textSub, padding: "4px 0" }}>
                      <span style={{ color: C.textMuted }}>{f.cat} — </span>{f.text}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
