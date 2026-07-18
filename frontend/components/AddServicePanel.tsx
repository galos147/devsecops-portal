"use client";
import { useEffect, useState } from "react";
import { api, type ServiceOut, type CodeProjectOut, type ImageOut, type PipelineOut } from "@/lib/api";
import { C } from "@/lib/tokens";

const fieldStyle = { background: C.inset, border: `1px solid ${C.border}`, borderRadius: 7, padding: "8px 10px", color: C.text, fontSize: 13, width: "100%" };

interface Props {
  initial?: ServiceOut;
  onClose: () => void;
  onSaved: (svc: ServiceOut) => void;
}

export default function AddServicePanel({ initial, onClose, onSaved }: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [codeProjectKey, setCodeProjectKey] = useState(initial?.code_project_key ?? "");
  const [pipelineProject, setPipelineProject] = useState(initial?.pipeline_project ?? "");
  const [imageName, setImageName] = useState(initial?.image_name ?? "");
  const [projects, setProjects] = useState<CodeProjectOut[]>([]);
  const [pipelineProjects, setPipelineProjects] = useState<string[]>([]);
  const [images, setImages] = useState<ImageOut[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    api.projects().then(setProjects);
    api.pipelines().then((pipelines: PipelineOut[]) => setPipelineProjects([...new Set(pipelines.map(p => p.project))]));
    api.images().then(setImages);
  }, []);

  async function save() {
    setSaving(true);
    const body = {
      name,
      code_project_key: codeProjectKey || undefined,
      pipeline_project: pipelineProject || undefined,
      image_name: imageName || undefined,
    };
    const result = initial ? await api.updateService(initial.id, body) : await api.createService(body);
    setSaving(false);
    onSaved(result);
  }

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "oklch(0 0 0 / 0.4)", zIndex: 10 }} />
      <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: 420, background: "oklch(0.17 0.005 250)", borderLeft: `1px solid ${C.border}`, zIndex: 11, padding: 22, overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{initial ? "Edit Service" : "Add Service"}</div>
          <span onClick={onClose} style={{ cursor: "pointer", color: C.textMuted, fontSize: 20, lineHeight: 1 }}>×</span>
        </div>

        <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 4 }}>Name</div>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. auth-gateway" style={{ ...fieldStyle, marginBottom: 16 }} />

        <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 4 }}>SonarQube project</div>
        <select value={codeProjectKey} onChange={e => setCodeProjectKey(e.target.value)} style={{ ...fieldStyle, marginBottom: 16 }}>
          <option value="">— not linked —</option>
          {projects.map(p => <option key={p.project_key} value={p.project_key}>{p.name}</option>)}
        </select>

        <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 4 }}>GitLab project</div>
        <select value={pipelineProject} onChange={e => setPipelineProject(e.target.value)} style={{ ...fieldStyle, marginBottom: 16 }}>
          <option value="">— not linked —</option>
          {pipelineProjects.map(p => <option key={p} value={p}>{p}</option>)}
        </select>

        <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 4 }}>Image</div>
        <select value={imageName} onChange={e => setImageName(e.target.value)} style={{ ...fieldStyle, marginBottom: 20 }}>
          <option value="">— not linked —</option>
          {images.map(i => <option key={i.id} value={i.name}>{i.name}:{i.tag}</option>)}
        </select>

        <button onClick={save} disabled={saving || name.trim() === ""} style={{ background: C.accentBg, color: C.accentFg, border: `1px solid ${C.accentBorder}`, borderRadius: 6, padding: "8px 14px", fontSize: 12.5, cursor: "pointer", opacity: saving || name.trim() === "" ? 0.6 : 1 }}>
          {saving ? "Saving…" : initial ? "Save Changes" : "Create Service"}
        </button>
      </div>
    </>
  );
}
