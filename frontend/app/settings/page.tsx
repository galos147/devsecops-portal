"use client";
import { useEffect, useState } from "react";
import { api, type SyncStatus } from "@/lib/api";
import { C, relTime } from "@/lib/tokens";

const ENV_VARS: Record<string, string[]> = {
  jfrog: ["JFROG_URL", "JFROG_API_KEY"],
  sonarqube: ["SONAR_URL", "SONAR_TOKEN"],
  prisma: ["PRISMA_URL", "PRISMA_ACCESS_KEY", "PRISMA_SECRET_KEY"],
  gitlab: ["GITLAB_URL", "GITLAB_TOKEN"],
};
const LABELS: Record<string, string> = { jfrog: "JFrog Xray", sonarqube: "SonarQube", prisma: "Prisma Cloud", gitlab: "GitLab" };

export default function SettingsPage() {
  const [status, setStatus] = useState<Record<string, SyncStatus>>({});
  const [syncing, setSyncing] = useState<Record<string, boolean>>({});

  useEffect(() => { api.syncStatus().then(setStatus); }, []);

  function triggerSync(tool: string) {
    setSyncing(s => ({ ...s, [tool]: true }));
    setTimeout(() => {
      api.triggerSync(tool).then(() => api.syncStatus().then(setStatus)).finally(() => {
        setSyncing(s => ({ ...s, [tool]: false }));
      });
    }, 900);
  }

  return (
    <div>
      <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Settings — Tool Connections</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        {Object.entries(LABELS).map(([tool, label]) => {
          const s = status[tool];
          const ok = s?.status === "success";
          const syncing_ = syncing[tool];
          return (
            <div key={tool} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: s ? (ok ? "oklch(0.72 0.12 150)" : "oklch(0.78 0.16 25)") : C.textMuted, flexShrink: 0 }} />
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{label}</div>
                </div>
                <button onClick={() => triggerSync(tool)} disabled={syncing_} style={{ background: C.accentBg, color: C.accentFg, border: `1px solid ${C.accentBorder}`, borderRadius: 6, padding: "6px 12px", fontSize: 12, cursor: syncing_ ? "default" : "pointer", opacity: syncing_ ? 0.7 : 1 }}>
                  {syncing_ ? "Syncing…" : "Sync Now"}
                </button>
              </div>
              <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 4 }}>Last sync: {relTime(s?.last_sync)}</div>
              <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 10 }}>Records synced: {s?.records_synced ?? 0}</div>
              {s && !ok && s.error && (
                <div style={{ fontSize: 12, color: "oklch(0.72 0.16 25)", marginBottom: 10 }}>⚠ {s.error}</div>
              )}
              <div style={{ borderTop: `1px solid ${C.borderLight}`, paddingTop: 10 }}>
                <div style={{ fontSize: 10.5, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>Configured via</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {(ENV_VARS[tool] ?? []).map(e => (
                    <span key={e} style={{ fontFamily: "ui-monospace,monospace", fontSize: 11, color: C.textSub, background: C.inset, border: `1px solid ${C.border}`, borderRadius: 4, padding: "3px 7px" }}>{e}</span>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
