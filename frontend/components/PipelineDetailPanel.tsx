"use client";
import { useEffect } from "react";
import { C, sevStyle, relTime } from "@/lib/tokens";
import type { PipelineOut } from "@/lib/api";
import DemoBadge from "@/components/DemoBadge";

interface Props {
  pipeline: PipelineOut | null;
  onClose: () => void;
}

export default function PipelineDetailPanel({ pipeline, onClose }: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!pipeline) return null;
  const p = pipeline;
  const status = p.status ?? "unknown";
  const failedJobs = p.failed_jobs ?? [];
  const findings = p.findings ?? [];

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "oklch(0 0 0 / 0.4)", zIndex: 10 }} />
      <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: 420, background: "oklch(0.17 0.005 250)", borderLeft: `1px solid ${C.border}`, zIndex: 11, padding: 22, overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
            {p.project}
            {p.is_seed && <DemoBadge />}
          </div>
          <span onClick={onClose} style={{ cursor: "pointer", color: C.textMuted, fontSize: 20, lineHeight: 1 }}>×</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <span style={{ ...sevStyle(status), width: "fit-content" }}>{status}</span>
          <span style={{ fontFamily: "ui-monospace,monospace", fontSize: 12, color: C.textSub }}>{p.ref}</span>
        </div>

        <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 18 }}>
          Started {relTime(p.started_at)} · Finished {p.finished_at ? relTime(p.finished_at) : "—"}
        </div>

        <div style={{ display: "flex", gap: 20, marginBottom: 20 }}>
          {([["SAST", p.sast], ["Dependency", p.dep_scan], ["Secrets", p.secret_detection]] as const).map(([label, count]) => (
            <div key={label}>
              <div style={{ fontSize: 17, fontWeight: 700 }}>{count}</div>
              <div style={{ fontSize: 11, color: C.textMuted }}>{label}</div>
            </div>
          ))}
        </div>

        {status === "failed" && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Why it failed</div>
            {failedJobs.length > 0 ? (
              <div style={{ background: C.inset, border: `1px solid ${C.border}`, borderRadius: 7, overflow: "hidden" }}>
                {failedJobs.map((j, i) => (
                  <div
                    key={i}
                    style={{
                      padding: "8px 10px",
                      borderLeft: `2px solid ${sevStyle("failed").color}`,
                      borderBottom: i < failedJobs.length - 1 ? `1px solid ${C.borderRow}` : "none",
                    }}
                  >
                    <div style={{ fontSize: 12.5, fontFamily: "ui-monospace,monospace" }}>
                      <span style={{ color: C.textMuted }}>[{j.stage ?? "?"}] </span>
                      {j.name ?? "unknown job"}
                    </div>
                    <div style={{ fontSize: 12, color: C.textSub, marginTop: 2, fontFamily: "ui-monospace,monospace" }}>
                      {j.failure_reason ?? "no failure reason reported"}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: C.textMuted, fontFamily: "ui-monospace,monospace" }}>
                // no job-level failure data captured for this pipeline
              </div>
            )}
          </div>
        )}

        {findings.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Scan findings</div>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 7, padding: "4px 12px" }}>
              {findings.map((f, i) => (
                <div
                  key={i}
                  style={{ fontSize: 12, color: C.textSub, padding: "7px 0", borderBottom: i < findings.length - 1 ? `1px solid ${C.borderRow}` : "none" }}
                >
                  <span style={{ color: C.textMuted }}>{f.cat} — </span>
                  {f.text}
                </div>
              ))}
            </div>
          </div>
        )}

        {p.web_url && (
          <a href={p.web_url} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, color: C.accentFg }}>
            Open in GitLab ↗
          </a>
        )}
      </div>
    </>
  );
}
