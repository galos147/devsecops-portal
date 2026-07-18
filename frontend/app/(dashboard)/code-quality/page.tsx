"use client";
import { useEffect, useState } from "react";
import { api, type CodeProjectOut, type CodeIssueOut } from "@/lib/api";
import { C, SEV, sevStyle } from "@/lib/tokens";
import FixPanel, { type FixPanelData } from "@/components/FixPanel";
import DemoBadge from "@/components/DemoBadge";

const filterStyle = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 7, padding: "8px 10px", color: C.text, fontSize: 13 };

function MetricTile({ label, value, danger, href }: { label: string; value: number | string; danger?: boolean; href?: string }) {
  const content = (
    <>
      <div style={{ fontSize: 10.5, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: danger ? "oklch(0.78 0.16 25)" : C.text }}>{value}</div>
    </>
  );
  if (href) {
    return (
      <a href={href} target="_blank" rel="noreferrer" title="Open in SonarQube"
        style={{ flex: 1, padding: "10px 12px", borderRight: `1px solid ${C.borderLight}`, textDecoration: "none", color: "inherit", cursor: "pointer" }}>
        {content}
      </a>
    );
  }
  return (
    <div style={{ flex: 1, padding: "10px 12px", borderRight: `1px solid ${C.borderLight}` }}>
      {content}
    </div>
  );
}

function ProjectCard({ p }: { p: CodeProjectOut }) {
  const sonarUrl = p.sonar_url;
  const sonarBase = sonarUrl?.split("/dashboard?id=")[0];
  const issuesUrl = (type: string) => sonarBase ? `${sonarBase}/project/issues?id=${p.project_key}&resolved=false&types=${type}` : undefined;
  const hotspotsUrl = sonarBase ? `${sonarBase}/security_hotspots?id=${p.project_key}` : undefined;
  const passed = p.quality_gate === "passed";

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "16px 18px 12px", borderBottom: `1px solid ${C.borderLight}` }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ fontFamily: "ui-monospace,monospace", fontSize: 15, fontWeight: 700 }}>{p.name}</div>
            {p.is_seed && <DemoBadge />}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <span style={{
              background: passed ? SEV.pass.bg : SEV.fail.bg,
              color: passed ? SEV.pass.fg : SEV.fail.fg,
              fontSize: 11.5, padding: "4px 10px", borderRadius: 6, fontWeight: 700, letterSpacing: "0.02em",
            }}>{passed ? "PASSED" : "FAILED"}</span>
            {sonarUrl && (
              <a href={sonarUrl} target="_blank" rel="noreferrer"
                title="Open in SonarQube"
                style={{ color: C.accentFg, fontSize: 16, lineHeight: 1, textDecoration: "none" }}>↗</a>
            )}
          </div>
        </div>
      </div>

      {/* Metric tiles */}
      <div style={{ display: "flex", borderBottom: `1px solid ${C.borderLight}` }}>
        <MetricTile label="Bugs"        value={p.bugs}            danger={p.bugs > 0}            href={issuesUrl("BUG")} />
        <MetricTile label="Vulns"       value={p.vulnerabilities} danger={p.vulnerabilities > 0} href={issuesUrl("VULNERABILITY")} />
        <MetricTile label="Code Smells" value={p.code_smells}                                     href={issuesUrl("CODE_SMELL")} />
        <MetricTile label="Hotspots"    value={p.hotspots}        danger={p.hotspots > 0}         href={hotspotsUrl} />
        <div style={{ flex: 1, padding: "10px 12px" }}>
          <div style={{ fontSize: 10.5, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>Coverage</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: p.coverage >= 80 ? "oklch(0.72 0.12 150)" : p.coverage >= 60 ? "oklch(0.82 0.13 95)" : "oklch(0.78 0.16 25)" }}>
            {p.coverage}%
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ padding: "10px 18px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1, height: 5, background: "oklch(0.24 0.008 250)", borderRadius: 3, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${p.coverage}%`, background: p.coverage >= 80 ? "oklch(0.65 0.13 150)" : p.coverage >= 60 ? "oklch(0.75 0.13 95)" : "oklch(0.72 0.15 25)", borderRadius: 3 }} />
          </div>
          <span style={{ fontSize: 11, color: C.textMuted, whiteSpace: "nowrap" }}>{p.coverage}% covered</span>
        </div>
      </div>
    </div>
  );
}

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
      cvssLine: issue.effort ? `Est. effort: ${issue.effort}` : undefined,
      packageLine: `${issue.file_path}:${issue.line_number}`,
    });
    if (!issue.rule_id) return;
    api.ruleInfo(issue.rule_id).then(info => {
      setFixPanel(prev => prev ? {
        ...prev,
        descriptionHtml: info.description,
        advisoryUrl: info.rule_url,
        advisoryLabel: "View Rule ↗",
      } : null);
    }).catch(() => {});
  }

  const tabStyle = (active: boolean) => ({
    padding: "10px 16px", fontSize: 13, cursor: "pointer",
    borderBottom: active ? `2px solid ${C.accentFg}` : "2px solid transparent",
    color: active ? C.accentFg : C.textSub, fontWeight: active ? 600 : 400,
  });
  const TH = { fontSize: 11, color: C.textMuted, textTransform: "uppercase" as const, letterSpacing: "0.03em" };

  const selectedProject = projects.find(p => p.project_key === projectFilter);
  const selectedSonarUrl = selectedProject?.sonar_url;

  return (
    <div>
      <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Code Quality</div>
      <div style={{ display: "flex", gap: 4, borderBottom: `1px solid ${C.borderLight}`, marginBottom: 20 }}>
        <div style={tabStyle(tab === "projects")} onClick={() => setTab("projects")}>Projects</div>
        <div style={tabStyle(tab === "issues")} onClick={() => setTab("issues")}>Issues</div>
      </div>

      {tab === "projects" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {projects.map(p => <ProjectCard key={p.id} p={p} />)}
        </div>
      )}

      {tab === "issues" && (
        <div>
          {/* Filters */}
          <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
            <select value={projectFilter} onChange={e => setProjectFilter(e.target.value)} style={filterStyle}>
              <option value="all">All projects</option>
              {projectKeys.map(k => <option key={k} value={k}>{k}</option>)}
            </select>
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={filterStyle}>
              <option value="all">All types</option>
              <option value="BUG">Bug</option><option value="VULNERABILITY">Vulnerability</option><option value="CODE_SMELL">Code Smell</option><option value="SECURITY_HOTSPOT">Security Hotspot</option>
            </select>
            <select value={sevFilter} onChange={e => setSevFilter(e.target.value)} style={filterStyle}>
              <option value="all">All severities</option>
              <option value="blocker">Blocker</option><option value="critical">Critical</option>
              <option value="major">Major</option><option value="minor">Minor</option><option value="info">Info</option>
            </select>
          </div>

          {/* Project context strip */}
          {selectedProject && (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px", marginBottom: 14, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontFamily: "ui-monospace,monospace", fontSize: 13, fontWeight: 600 }}>{selectedProject.name}</span>
              {selectedProject.is_seed && <DemoBadge />}
              <span style={{
                background: selectedProject.quality_gate === "passed" ? SEV.pass.bg : SEV.fail.bg,
                color: selectedProject.quality_gate === "passed" ? SEV.pass.fg : SEV.fail.fg,
                fontSize: 11, padding: "2px 8px", borderRadius: 4, fontWeight: 700,
              }}>{selectedProject.quality_gate?.toUpperCase()}</span>
              {selectedSonarUrl && (
                <div style={{ marginLeft: "auto" }}>
                  <a href={selectedSonarUrl} target="_blank" rel="noreferrer"
                    style={{ fontSize: 12, color: C.accentFg }}>Open in SonarQube ↗</a>
                </div>
              )}
            </div>
          )}

          {/* Issues table */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1.8fr 0.5fr 0.9fr 0.8fr 0.5fr 0.6fr", padding: "10px 16px", borderBottom: `1px solid ${C.borderLight}` }}>
              {["File", "Message", "Line", "Severity", "Effort", "", ""].map((h, idx) => <div key={idx} style={TH}>{h}</div>)}
            </div>
            {filtered.length === 0 && (
              <div style={{ padding: 24, textAlign: "center", color: C.textMuted, fontSize: 13 }}>No issues match the current filters.</div>
            )}
            {filtered.map(i => (
              <div key={i.id} style={{ display: "grid", gridTemplateColumns: "1.5fr 1.8fr 0.5fr 0.9fr 0.8fr 0.5fr 0.6fr", padding: "11px 16px", borderBottom: `1px solid ${C.borderRow}`, alignItems: "center" }}>
                <div style={{ fontFamily: "ui-monospace,monospace", fontSize: 12, color: C.textSub, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{i.file_path}</div>
                <div style={{ fontSize: 12.5 }}>{i.message}</div>
                <div style={{ fontSize: 12, fontFamily: "ui-monospace,monospace", color: C.textMuted }}>{i.line_number}</div>
                <span style={sevStyle(i.severity ?? "info")}>{i.severity}</span>
                <div style={{ fontSize: 12, color: C.textMuted }}>{i.effort}</div>
                <div>{i.is_seed && <DemoBadge />}</div>
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
