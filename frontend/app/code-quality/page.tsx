"use client";
import { useEffect, useState } from "react";
import { api, type CodeProjectOut, type CodeIssueOut } from "@/lib/api";
import { C, SEV, sevStyle } from "@/lib/tokens";
import FixPanel, { type FixPanelData } from "@/components/FixPanel";

const filterStyle = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 7, padding: "8px 10px", color: C.text, fontSize: 13 };

export default function CodeQualityPage() {
  const [tab, setTab] = useState<"projects" | "issues">("projects");
  const [projects, setProjects] = useState<CodeProjectOut[]>([]);
  const [issues, setIssues] = useState<CodeIssueOut[]>([]);
  const [projectFilter, setProjectFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [sevFilter, setSevFilter] = useState("all");
  const [fixPanel, setFixPanel] = useState<FixPanelData | null>(null);

  useEffect(() => {
    api.projects().then(setProjects);
    api.codeIssues().then(setIssues);
  }, []);

  const projectKeys = [...new Set(issues.map(i => i.project_key))];
  const filtered = issues.filter(i => {
    if (projectFilter !== "all" && i.project_key !== projectFilter) return false;
    if (typeFilter !== "all" && i.type !== typeFilter) return false;
    if (sevFilter !== "all" && i.severity !== sevFilter) return false;
    return true;
  });

  function openFix(issue: CodeIssueOut) {
    setFixPanel({
      title: issue.rule_id ?? issue.id,
      severity: issue.severity ?? "info",
      description: issue.message,
      packageLine: `${issue.file_path}:${issue.line_number}`,
      suggestion: `Review the ${issue.rule_id} rule and apply the recommended fix. Effort: ${issue.effort}.`,
    });
  }

  const tabStyle = (active: boolean) => ({ padding: "10px 16px", fontSize: 13, cursor: "pointer", borderBottom: active ? `2px solid ${C.accentFg}` : "2px solid transparent", color: active ? C.accentFg : C.textSub, fontWeight: active ? 600 : 400 });
  const TH = { fontSize: 11, color: C.textMuted, textTransform: "uppercase" as const, letterSpacing: "0.03em" };

  return (
    <div>
      <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Code Quality</div>
      <div style={{ display: "flex", gap: 4, borderBottom: `1px solid ${C.borderLight}`, marginBottom: 16 }}>
        <div style={tabStyle(tab === "projects")} onClick={() => setTab("projects")}>Projects</div>
        <div style={tabStyle(tab === "issues")} onClick={() => setTab("issues")}>Issues</div>
      </div>

      {tab === "projects" && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 0.9fr 0.6fr 0.9fr 0.9fr 1.2fr", padding: "10px 16px", borderBottom: `1px solid ${C.borderLight}` }}>
            {["Project", "Quality Gate", "Bugs", "Vulns", "Smells", "Coverage"].map(h => <div key={h} style={TH}>{h}</div>)}
          </div>
          {projects.map(p => (
            <div key={p.id} style={{ display: "grid", gridTemplateColumns: "1.4fr 0.9fr 0.6fr 0.9fr 0.9fr 1.2fr", padding: "12px 16px", borderBottom: `1px solid ${C.borderRow}`, alignItems: "center" }}>
              <div style={{ fontFamily: "ui-monospace,monospace", fontSize: 12.5 }}>{p.name}</div>
              <span style={{ background: p.quality_gate === "passed" ? SEV.pass.bg : SEV.fail.bg, color: p.quality_gate === "passed" ? SEV.pass.fg : SEV.fail.fg, fontSize: 11, padding: "3px 8px", borderRadius: 5, fontWeight: 600, textTransform: "capitalize", width: "fit-content" }}>{p.quality_gate}</span>
              <div style={{ fontSize: 12.5 }}>{p.bugs}</div>
              <div style={{ fontSize: 12.5 }}>{p.vulnerabilities}</div>
              <div style={{ fontSize: 12.5 }}>{p.code_smells}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ height: 6, flex: 1, background: "oklch(0.24 0.008 250)", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${p.coverage}%`, background: "oklch(0.65 0.13 150)", borderRadius: 3 }} />
                </div>
                <div style={{ fontSize: 11.5, color: C.textMuted, width: 36 }}>{p.coverage}%</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "issues" && (
        <div>
          <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
            <select value={projectFilter} onChange={e => setProjectFilter(e.target.value)} style={filterStyle}>
              <option value="all">All projects</option>
              {projectKeys.map(k => <option key={k} value={k}>{k}</option>)}
            </select>
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={filterStyle}>
              <option value="all">All types</option>
              <option value="BUG">Bug</option><option value="VULNERABILITY">Vulnerability</option><option value="CODE_SMELL">Code Smell</option>
            </select>
            <select value={sevFilter} onChange={e => setSevFilter(e.target.value)} style={filterStyle}>
              <option value="all">All severities</option>
              <option value="blocker">Blocker</option><option value="critical">Critical</option>
              <option value="major">Major</option><option value="minor">Minor</option><option value="info">Info</option>
            </select>
          </div>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1.8fr 0.5fr 0.9fr 0.8fr 0.6fr", padding: "10px 16px", borderBottom: `1px solid ${C.borderLight}` }}>
              {["File", "Message", "Line", "Severity", "Effort", ""].map(h => <div key={h} style={TH}>{h}</div>)}
            </div>
            {filtered.map(i => (
              <div key={i.id} style={{ display: "grid", gridTemplateColumns: "1.5fr 1.8fr 0.5fr 0.9fr 0.8fr 0.6fr", padding: "11px 16px", borderBottom: `1px solid ${C.borderRow}`, alignItems: "center" }}>
                <div style={{ fontFamily: "ui-monospace,monospace", fontSize: 12, color: C.textSub, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{i.file_path}</div>
                <div style={{ fontSize: 12.5 }}>{i.message}</div>
                <div style={{ fontSize: 12, fontFamily: "ui-monospace,monospace", color: C.textMuted }}>{i.line_number}</div>
                <span style={sevStyle(i.severity ?? "info")}>{i.severity}</span>
                <div style={{ fontSize: 12, color: C.textMuted }}>{i.effort}</div>
                <button onClick={() => openFix(i)} style={{ background: C.accentBg, color: C.accentFg, border: `1px solid ${C.accentBorder}`, borderRadius: 6, padding: "5px 10px", fontSize: 11, cursor: "pointer" }}>Fix</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <FixPanel data={fixPanel} onClose={() => setFixPanel(null)} />
    </div>
  );
}
