"use client";
import { useEffect, useState } from "react";
import { C } from "@/lib/tokens";
import type { IntegrationToolState, FormState } from "@/lib/integrations/useIntegrations";
import { LABELS, DESCRIPTIONS, ACCENT, type Tool } from "@/lib/integrations/config";
import IntegrationFields from "./IntegrationFields";

interface AddIntegrationPanelProps {
  availableTools: Tool[];
  getState: (tool: Tool) => IntegrationToolState;
  actions: {
    updateForm: (tool: Tool, patch: Partial<FormState>) => void;
    testConnection: (tool: Tool) => Promise<void>;
    save: (tool: Tool) => Promise<void>;
  };
  onClose: () => void;
}

export default function AddIntegrationPanel({ availableTools, getState, actions, onClose }: AddIntegrationPanelProps) {
  const [pickedTool, setPickedTool] = useState<Tool | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const state = pickedTool ? getState(pickedTool) : null;

  async function handleSave() {
    if (!pickedTool) return;
    try {
      await actions.save(pickedTool);
      onClose();
    } catch {
      // leave the panel open — saving flag already reset by the hook
    }
  }

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "oklch(0 0 0 / 0.4)", zIndex: 10 }} />
      <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: 420, background: "oklch(0.17 0.005 250)", borderLeft: `1px solid ${C.border}`, zIndex: 11, padding: 22, overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>
            {pickedTool ? `Connect ${LABELS[pickedTool]}` : "Add Integration"}
          </div>
          <span onClick={onClose} style={{ cursor: "pointer", color: C.textMuted, fontSize: 20, lineHeight: 1 }}>×</span>
        </div>

        {!pickedTool && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {availableTools.map(tool => {
              const accent = ACCENT[tool];
              return (
                <div
                  key={tool}
                  onClick={() => setPickedTool(tool)}
                  className="settings-picker-tile"
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: 12, borderRadius: 8, border: `1px solid ${C.border}`, cursor: "pointer" }}
                >
                  <span style={{
                    width: 30, height: 30, borderRadius: "50%", background: accent.bg, color: accent.fg,
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, flexShrink: 0,
                  }}>
                    {LABELS[tool][0]}
                  </span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{LABELS[tool]}</div>
                    <div style={{ fontSize: 11.5, color: C.textMuted }}>{DESCRIPTIONS[tool]}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {pickedTool && state && (
          <div>
            <div onClick={() => setPickedTool(null)} style={{ fontSize: 11.5, color: C.accentFg, cursor: "pointer", marginBottom: 14 }}>
              ← Back
            </div>
            <IntegrationFields
              tool={pickedTool}
              form={state.form}
              secretSet={state.integration?.secret_set}
              onChange={patch => actions.updateForm(pickedTool, patch)}
            />

            {state.test.status !== "idle" && (
              <div style={{
                fontSize: 11.5, marginBottom: 10, padding: "6px 10px", borderRadius: 6,
                background: state.test.status === "ok" ? "oklch(0.28 0.05 150)" : state.test.status === "fail" ? "oklch(0.30 0.08 25)" : C.inset,
                color: state.test.status === "ok" ? "oklch(0.75 0.12 150)" : state.test.status === "fail" ? "oklch(0.80 0.16 25)" : C.textMuted,
              }}>
                {state.test.status === "testing" ? "Testing…" : state.test.message}
              </div>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => actions.testConnection(pickedTool)} disabled={state.test.status === "testing"} style={{ background: C.inset, color: C.text, border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 12px", fontSize: 12, cursor: "pointer" }}>
                Test Connection
              </button>
              <button onClick={handleSave} disabled={state.saving} style={{ background: C.accentBg, color: C.accentFg, border: `1px solid ${C.accentBorder}`, borderRadius: 6, padding: "6px 12px", fontSize: 12, cursor: "pointer", opacity: state.saving ? 0.7 : 1 }}>
                {state.saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
