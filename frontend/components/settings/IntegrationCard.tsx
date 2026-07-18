"use client";
import { C, relTime, connectionPillStyle } from "@/lib/tokens";
import type { IntegrationToolState, FormState } from "@/lib/integrations/useIntegrations";
import { LABELS, ACCENT, type Tool } from "@/lib/integrations/config";
import IntegrationFields from "./IntegrationFields";

interface IntegrationCardProps {
  tool: Tool;
  state: IntegrationToolState;
  onFormChange: (patch: Partial<FormState>) => void;
  onTest: () => void;
  onSave: () => void;
  onSync: () => void;
  onUnregister: () => void;
  onDeleteData: () => void;
}

export default function IntegrationCard({ tool, state, onFormChange, onTest, onSave, onSync, onUnregister, onDeleteData }: IntegrationCardProps) {
  const { integration: it, form, status: s, syncing, test, saving } = state;
  const ok = s?.status === "success";
  const accent = ACCENT[tool];

  function handleUnregister() {
    if (window.confirm(
      `Unregister ${LABELS[tool]}? This clears the saved connection only — any records already synced from it ` +
      `(images, CVEs, projects, pipelines, etc.) stay in the database and keep showing up elsewhere in the app. ` +
      `Use "Delete demo data" separately if you want to clear out seed/demo records specifically.`
    )) {
      onUnregister();
    }
  }

  function handleDeleteData() {
    if (window.confirm(
      `Delete ${LABELS[tool]}'s demo data? This only removes seed/demo records (marked with the "Demo" badge) — ` +
      `it does not touch the saved connection or any real data ${LABELS[tool]} has actually synced. This can't be undone.`
    )) {
      onDeleteData();
    }
  }

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 18 }}>
      {/* Header: monogram + name + status pill — no actions here */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{
            width: 26, height: 26, borderRadius: "50%", background: accent.bg, color: accent.fg,
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, flexShrink: 0,
          }}>
            {LABELS[tool][0]}
          </span>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{LABELS[tool]}</div>
        </div>
        <span style={connectionPillStyle("connected")}>Connected</span>
      </div>

      <IntegrationFields tool={tool} form={form} secretSet={it?.secret_set} onChange={onFormChange} />

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
        <button onClick={onTest} disabled={test.status === "testing"} style={{ background: C.inset, color: C.text, border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 12px", fontSize: 12, cursor: "pointer" }}>
          Test Connection
        </button>
        <button onClick={onSave} disabled={saving} style={{ background: C.accentBg, color: C.accentFg, border: `1px solid ${C.accentBorder}`, borderRadius: 6, padding: "6px 12px", fontSize: 12, cursor: "pointer", opacity: saving ? 0.7 : 1 }}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>

      {/* Sync status — condensed to one line */}
      <div style={{ borderTop: `1px solid ${C.borderLight}`, paddingTop: 12, paddingBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 11.5, color: C.textMuted }}>
          Synced {relTime(s?.last_sync)} · {s?.records_synced ?? 0} record{(s?.records_synced ?? 0) === 1 ? "" : "s"}
        </div>
        <button onClick={onSync} disabled={syncing} style={{ background: C.accentBg, color: C.accentFg, border: `1px solid ${C.accentBorder}`, borderRadius: 6, padding: "6px 12px", fontSize: 12, cursor: syncing ? "default" : "pointer", opacity: syncing ? 0.7 : 1 }}>
          {syncing ? "Syncing…" : "Sync Now"}
        </button>
      </div>
      {s?.status === "running" && (
        <div style={{ fontSize: 11, color: C.textMuted, marginTop: -8, marginBottom: 12 }}>
          {s.phase ?? "Working…"}
          {s.total_items ? ` · ${s.processed_items ?? 0}/${s.total_items}` : s.processed_items ? ` · ${s.processed_items} processed` : ""}
        </div>
      )}
      {s && !ok && s.error && (
        <div style={{ fontSize: 11.5, color: "oklch(0.72 0.16 25)", marginBottom: 12 }}>⚠ {s.error}</div>
      )}

      {/* Danger zone — visually demoted, separated from everything above */}
      <div style={{ borderTop: `1px solid oklch(0.30 0.05 25 / 0.4)`, paddingTop: 10 }}>
        <div style={{ fontSize: 10, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>Danger zone</div>
        <div style={{ display: "flex", gap: 14 }}>
          <span onClick={handleUnregister} style={{ fontSize: 11, color: C.textMuted, cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 2 }}>
            Unregister
          </span>
          <span onClick={handleDeleteData} style={{ fontSize: 11, color: C.textMuted, cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 2 }}>
            Delete demo data
          </span>
        </div>
      </div>
    </div>
  );
}
