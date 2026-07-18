"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, type ServiceDetailOut, type ServiceOut, type VulnOut, type PipelineOut } from "@/lib/api";
import { C, SEV, sevStyle, relTime } from "@/lib/tokens";
import DemoBadge from "@/components/DemoBadge";
import SeverityBadge from "@/components/SeverityBadge";
import FixPanel, { type FixPanelData } from "@/components/FixPanel";
import PipelineDetailPanel from "@/components/PipelineDetailPanel";
import AddServicePanel from "@/components/AddServicePanel";

type Tab = "quality" | "pipelines" | "image";

function NotLinked({ text }: { text: string }) {
  return (
    <div style={{ padding: 24, textAlign: "center", color: C.textMuted, fontSize: 13, background: C.card, border: `1px solid ${C.border}`, borderRadius: 10 }}>
      {text}
    </div>
  );
}

export default function ServiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [svc, setSvc] = useState<ServiceDetailOut | null>(null);
  const [tab, setTab] = useState<Tab>("quality");
  const [fixPanel, setFixPanel] = useState<FixPanelData | null>(null);
  const [selectedPipeline, setSelectedPipeline] = useState<PipelineOut | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  useEffect(() => { api.service(id).then(setSvc); }, [id]);
  if (!svc) return <div style={{ color: C.textMuted, padding: 40 }}>Loading…</div>;

  function openFix(v: VulnOut) {
    setFixPanel({
      title: v.cve_id, severity: v.severity, description: v.description,
      cvssLine: v.cvss_score ? `CVSS ${v.cvss_score}` : undefined,
      packageLine: v.package_name ? `Package: ${v.package_name} ${v.installed_version} → ${v.fixed_version ?? "no fix"}` : undefined,
    });
    api.fixSuggestion(v.cve_id).then(fix => {
      setFixPanel(prev => prev ? { ...prev, suggestion: fix.suggestion_text, copyCmd: fix.copy_cmd, advisoryUrl: fix.advisory_url } : null);
    }).catch(() => {});
  }

  function handleDelete() {
    if (window.confirm(`Delete the service "${svc!.name}"? This only removes the mapping — the linked SonarQube project, GitLab pipelines, and image data are untouched.`)) {
      api.deleteService(svc!.id).then(() => router.push("/services"));
    }
  }

  const tabStyle = (active: boolean) => ({
    padding: "10px 16px", fontSize: 13, cursor: "pointer",
    borderBottom: active ? `2px solid ${C.accentFg}` : "2px solid transparent",
    color: active ? C.accentFg : C.textSub, fontWeight: active ? 600 : 400,
  });
  const TH = { fontSize: 11, color: C.textMuted, textTransform: "uppercase" as const, letterSpacing: "0.03em" };
  const vulnCols = "1.4fr 1fr 0.8fr 0.8fr 0.8fr 0.8fr 0.7fr";
  const pipelineCols = "1.3fr 0.8fr 0.6fr 0.6fr 0.9fr 1fr";

  const asServiceOut: ServiceOut = {
    id: svc.id, name: svc.name, is_seed: svc.is_seed,
    code_project_key: svc.code_project_key,
    pipeline_project: svc.pipeline_project,
    image_name: svc.image_name,
  };

  return (
    <div>
      <span onClick={() => router.push("/services")} style={{ cursor: "pointer", fontSize: 12.5, color: C.textSub }}>← Back to Services</span>
      <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "10px 0 4px" }}>
        <div style={{ fontSize: 22, fontWeight: 700 }}>{svc.name}</div>
        {svc.is_seed && <DemoBadge />}
      </div>
      <div style={{ display: "flex", gap: 14, marginBottom: 16 }}>
        <span onClick={() => setEditOpen(true)} style={{ fontSize: 11.5, color: C.textMuted, cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 2 }}>Edit</span>
        <span onClick={handleDelete} style={{ fontSize: 11.5, color: C.textMuted, cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 2 }}>Delete</span>
      </div>

      <div style={{ display: "flex", gap: 4, borderBottom: `1px solid ${C.borderLight}`, marginBottom: 16 }}>
        <div style={tabStyle(tab === "quality")} onClick={() => setTab("quality")}>Code Quality</div>
        <div style={tabStyle(tab === "pipelines")} onClick={() => setTab("pipelines")}>Pipelines</div>
        <div style={tabStyle(tab === "image")} onClick={() => setTab("image")}>Image & Vulnerabilities</div>
      </div>

      {tab === "quality" && (
        svc.code_project ? (
          <div>
            <div style={{ display: "flex", gap: 16, marginBottom: 18 }}>
              {([["Bugs", svc.code_project.bugs], ["Vulns", svc.code_project.vulnerabilities], ["Code Smells", svc.code_project.code_smells], ["Coverage", svc.code_project.coverage + "%"]] as const).map(([label, value]) => (
                <div key={label}>
                  <div style={{ fontSize: 17, fontWeight: 700 }}>{value}</div>
                  <div style={{ fontSize: 11, color: C.textMuted }}>{label}</div>
                </div>
              ))}
              <span style={{ ...(svc.code_project.quality_gate === "passed" ? SEV.pass : SEV.fail), fontSize: 11, padding: "4px 10px", borderRadius: 6, fontWeight: 700, height: "fit-content" }}>
                {svc.code_project.quality_gate?.toUpperCase()}
              </span>
            </div>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1.8fr 0.5fr 0.9fr 0.8fr", padding: "10px 16px", borderBottom: `1px solid ${C.borderLight}` }}>
                {["File", "Message", "Line", "Severity", "Effort"].map(h => <div key={h} style={TH}>{h}</div>)}
              </div>
              {svc.code_issues.map(i => (
                <div key={i.id} style={{ display: "grid", gridTemplateColumns: "1.5fr 1.8fr 0.5fr 0.9fr 0.8fr", padding: "11px 16px", borderBottom: `1px solid ${C.borderRow}`, alignItems: "center" }}>
                  <div style={{ fontFamily: "ui-monospace,monospace", fontSize: 12, color: C.textSub, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{i.file_path}</div>
                  <div style={{ fontSize: 12.5 }}>{i.message}</div>
                  <div style={{ fontSize: 12, fontFamily: "ui-monospace,monospace", color: C.textMuted }}>{i.line_number}</div>
                  <span style={sevStyle(i.severity ?? "info")}>{i.severity}</span>
                  <div style={{ fontSize: 12, color: C.textMuted }}>{i.effort}</div>
                </div>
              ))}
            </div>
          </div>
        ) : <NotLinked text="No SonarQube project linked to this service — edit this service to link one." />
      )}

      {tab === "pipelines" && (
        svc.pipelines.length > 0 ? (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: pipelineCols, padding: "10px 16px", borderBottom: `1px solid ${C.borderLight}` }}>
              {["Branch", "Status", "SAST", "Dep", "Secrets", "Started"].map(h => <div key={h} style={TH}>{h}</div>)}
            </div>
            {svc.pipelines.map(p => (
              <div key={p.id} onClick={() => setSelectedPipeline(p)} style={{ display: "grid", gridTemplateColumns: pipelineCols, padding: "11px 16px", borderBottom: `1px solid ${C.borderRow}`, cursor: "pointer", alignItems: "center" }}>
                <div style={{ fontSize: 12, fontFamily: "ui-monospace,monospace", color: C.textSub }}>{p.ref}</div>
                <span style={{ ...sevStyle(p.status ?? "unknown"), width: "fit-content" }}>{p.status}</span>
                <div style={{ fontSize: 12.5 }}>{p.sast}</div>
                <div style={{ fontSize: 12.5 }}>{p.dep_scan}</div>
                <div style={{ fontSize: 12.5 }}>{p.secret_detection}</div>
                <div style={{ fontSize: 12, color: C.textMuted }}>{relTime(p.started_at)}</div>
              </div>
            ))}
          </div>
        ) : (
          <NotLinked text={
            svc.pipeline_project
              ? `No pipeline runs found for ${svc.pipeline_project}.`
              : "No GitLab project linked to this service — edit this service to link one."
          } />
        )
      )}

      {tab === "image" && (
        svc.image ? (
          <div>
            <div style={{ display: "flex", gap: 18, fontSize: 12, color: C.textMuted, marginBottom: 14 }}>
              <span style={{ fontFamily: "ui-monospace,monospace", color: C.text }}>{svc.image.name}:{svc.image.tag}</span>
              <span>{svc.image.registry}</span>
              <span>{svc.image.size_mb} MB</span>
              <span>Scanned {relTime(svc.image.last_scanned_at)}</span>
            </div>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
              <div style={{ display: "grid", gridTemplateColumns: vulnCols, padding: "10px 16px", borderBottom: `1px solid ${C.borderLight}` }}>
                {["CVE ID", "Package", "Installed", "Fixed", "Severity", "Status", ""].map(h => <div key={h} style={TH}>{h}</div>)}
              </div>
              {svc.image.vulnerabilities.map(v => (
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
          </div>
        ) : <NotLinked text="No image linked to this service — edit this service to link one." />
      )}

      <FixPanel data={fixPanel} onClose={() => setFixPanel(null)} />
      <PipelineDetailPanel pipeline={selectedPipeline} onClose={() => setSelectedPipeline(null)} />
      {editOpen && (
        <AddServicePanel
          initial={asServiceOut}
          onClose={() => setEditOpen(false)}
          onSaved={() => { setEditOpen(false); api.service(id).then(setSvc); }}
        />
      )}
    </div>
  );
}
