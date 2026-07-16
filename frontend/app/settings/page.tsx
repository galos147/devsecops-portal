"use client";
import { useEffect, useState } from "react";
import { api, type SyncStatus, type IntegrationOut } from "@/lib/api";
import { C, relTime } from "@/lib/tokens";

const TOOLS = ["jfrog", "sonarqube", "prisma", "gitlab"] as const;
const LABELS: Record<string, string> = { jfrog: "JFrog Xray", sonarqube: "SonarQube", prisma: "Prisma Cloud", gitlab: "GitLab" };
const SECRET_LABEL: Record<string, string> = { jfrog: "Password / API Key", sonarqube: "Token", prisma: "Secret Key", gitlab: "Token" };
const USERNAME_LABEL: Record<string, string> = { jfrog: "Username", sonarqube: "Username (unused)", prisma: "Access Key", gitlab: "Username (unused)" };

interface FormState { url: string; username: string; secret: string; extra: string }
type TestState = { status: "idle" } | { status: "testing" } | { status: "ok"; message: string } | { status: "fail"; message: string };

const emptyForm = (): FormState => ({ url: "", username: "", secret: "", extra: "" });

export default function SettingsPage() {
  const [status, setStatus] = useState<Record<string, SyncStatus>>({});
  const [syncing, setSyncing] = useState<Record<string, boolean>>({});
  const [integrations, setIntegrations] = useState<Record<string, IntegrationOut>>({});
  const [forms, setForms] = useState<Record<string, FormState>>({});
  const [testResults, setTestResults] = useState<Record<string, TestState>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  useEffect(() => {
    api.syncStatus().then(setStatus);
    api.integrations().then(list => {
      const byTool: Record<string, IntegrationOut> = {};
      const initialForms: Record<string, FormState> = {};
      for (const it of list) {
        byTool[it.tool] = it;
        initialForms[it.tool] = { url: it.url ?? "", username: it.username ?? "", secret: "", extra: it.extra ?? "" };
      }
      setIntegrations(byTool);
      setForms(initialForms);
    });
  }, []);

  function updateForm(tool: string, patch: Partial<FormState>) {
    setForms(f => ({ ...f, [tool]: { ...(f[tool] ?? emptyForm()), ...patch } }));
    setTestResults(t => ({ ...t, [tool]: { status: "idle" } }));
  }

  async function testConnection(tool: string) {
    setTestResults(t => ({ ...t, [tool]: { status: "testing" } }));
    const form = forms[tool] ?? emptyForm();
    try {
      const result = await api.testIntegration(tool, {
        url: form.url || undefined,
        username: form.username || undefined,
        secret: form.secret || undefined,
      });
      setTestResults(t => ({ ...t, [tool]: result.ok ? { status: "ok", message: result.message } : { status: "fail", message: result.message } }));
    } catch {
      setTestResults(t => ({ ...t, [tool]: { status: "fail", message: "Request failed — check the URL is reachable" } }));
    }
  }

  async function save(tool: string) {
    setSaving(s => ({ ...s, [tool]: true }));
    const form = forms[tool] ?? emptyForm();
    try {
      const updated = await api.updateIntegration(tool, {
        url: form.url,
        username: form.username,
        secret: form.secret || undefined,
        extra: form.extra || undefined,
      });
      setIntegrations(i => ({ ...i, [tool]: updated }));
      setForms(f => ({ ...f, [tool]: { url: updated.url ?? "", username: updated.username ?? "", secret: "", extra: updated.extra ?? "" } }));
    } finally {
      setSaving(s => ({ ...s, [tool]: false }));
    }
  }

  function triggerSync(tool: string) {
    setSyncing(s => ({ ...s, [tool]: true }));
    setTimeout(() => {
      api.triggerSync(tool).then(() => api.syncStatus().then(setStatus)).finally(() => {
        setSyncing(s => ({ ...s, [tool]: false }));
      });
    }, 900);
  }

  const inputStyle = { width: "100%", background: C.inset, border: `1px solid ${C.border}`, borderRadius: 6, padding: "7px 10px", color: C.text, fontSize: 12.5, outline: "none", fontFamily: "ui-monospace,monospace", boxSizing: "border-box" as const };
  const fieldLabel = { fontSize: 10.5, color: C.textMuted, textTransform: "uppercase" as const, letterSpacing: "0.04em", marginBottom: 4, display: "block" };

  return (
    <div>
      <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Settings — Integrations</div>
      <div style={{ fontSize: 12.5, color: C.textMuted, marginBottom: 18 }}>Connect each tool here — no editing config files or restarting anything.</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        {TOOLS.map(tool => {
          const it = integrations[tool];
          const form = forms[tool] ?? emptyForm();
          const s = status[tool];
          const ok = s?.status === "success";
          const syncing_ = syncing[tool];
          const test = testResults[tool] ?? { status: "idle" as const };
          const saving_ = saving[tool];
          const sourceLabel = it?.source === "database" ? "Saved" : it?.source === "env" ? "From .env" : "Not configured";
          const sourceColor = it?.source === "database" ? "oklch(0.72 0.12 150)" : it?.source === "env" ? "oklch(0.75 0.13 245)" : C.textMuted;

          return (
            <div key={tool} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: s ? (ok ? "oklch(0.72 0.12 150)" : "oklch(0.78 0.16 25)") : C.textMuted, flexShrink: 0 }} />
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{LABELS[tool]}</div>
                </div>
                <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.03em", textTransform: "uppercase", color: sourceColor }}>{sourceLabel}</span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 12 }}>
                <div>
                  <label style={fieldLabel}>URL</label>
                  <input style={inputStyle} value={form.url} placeholder="https://…" onChange={e => updateForm(tool, { url: e.target.value })} />
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <label style={fieldLabel}>{USERNAME_LABEL[tool]}</label>
                    <input style={inputStyle} value={form.username} onChange={e => updateForm(tool, { username: e.target.value })} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={fieldLabel}>{SECRET_LABEL[tool]}</label>
                    <input style={inputStyle} type="password" value={form.secret}
                      placeholder={it?.secret_set ? "•••••••• (saved — leave blank to keep)" : ""}
                      onChange={e => updateForm(tool, { secret: e.target.value })} />
                  </div>
                </div>
                {tool === "jfrog" && (
                  <div>
                    <label style={fieldLabel}>Repository</label>
                    <input style={inputStyle} value={form.extra} placeholder="docker-local" onChange={e => updateForm(tool, { extra: e.target.value })} />
                  </div>
                )}
              </div>

              {test.status !== "idle" && (
                <div style={{
                  fontSize: 11.5, marginBottom: 10, padding: "6px 10px", borderRadius: 6,
                  background: test.status === "ok" ? "oklch(0.28 0.05 150)" : test.status === "fail" ? "oklch(0.30 0.08 25)" : C.inset,
                  color: test.status === "ok" ? "oklch(0.75 0.12 150)" : test.status === "fail" ? "oklch(0.80 0.16 25)" : C.textMuted,
                }}>
                  {test.status === "testing" ? "Testing…" : test.message}
                </div>
              )}

              <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                <button onClick={() => testConnection(tool)} disabled={test.status === "testing"} style={{ background: C.inset, color: C.text, border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 12px", fontSize: 12, cursor: "pointer" }}>
                  Test Connection
                </button>
                <button onClick={() => save(tool)} disabled={saving_} style={{ background: C.accentBg, color: C.accentFg, border: `1px solid ${C.accentBorder}`, borderRadius: 6, padding: "6px 12px", fontSize: 12, cursor: "pointer", opacity: saving_ ? 0.7 : 1 }}>
                  {saving_ ? "Saving…" : "Save"}
                </button>
              </div>

              <div style={{ borderTop: `1px solid ${C.borderLight}`, paddingTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 11.5, color: C.textMuted, marginBottom: 2 }}>Last sync: {relTime(s?.last_sync)}</div>
                  <div style={{ fontSize: 11.5, color: C.textMuted }}>Records synced: {s?.records_synced ?? 0}</div>
                </div>
                <button onClick={() => triggerSync(tool)} disabled={syncing_} style={{ background: C.accentBg, color: C.accentFg, border: `1px solid ${C.accentBorder}`, borderRadius: 6, padding: "6px 12px", fontSize: 12, cursor: syncing_ ? "default" : "pointer", opacity: syncing_ ? 0.7 : 1 }}>
                  {syncing_ ? "Syncing…" : "Sync Now"}
                </button>
              </div>
              {s && !ok && s.error && (
                <div style={{ fontSize: 11.5, color: "oklch(0.72 0.16 25)", marginTop: 8 }}>⚠ {s.error}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
