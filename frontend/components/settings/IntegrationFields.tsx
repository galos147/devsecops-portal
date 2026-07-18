"use client";
import { C } from "@/lib/tokens";
import type { FormState } from "@/lib/integrations/useIntegrations";
import { SECRET_LABEL, USERNAME_LABEL, EXTRA_FIELD, HAS_USERNAME_FIELD, type Tool } from "@/lib/integrations/config";

export const inputStyle = { width: "100%", background: C.inset, border: `1px solid ${C.border}`, borderRadius: 6, padding: "7px 10px", color: C.text, fontSize: 12.5, outline: "none", fontFamily: "ui-monospace,monospace", boxSizing: "border-box" as const };
export const fieldLabel = { fontSize: 10.5, color: C.textMuted, textTransform: "uppercase" as const, letterSpacing: "0.04em", marginBottom: 4, display: "block" };

interface IntegrationFieldsProps {
  tool: Tool;
  form: FormState;
  secretSet?: boolean;
  onChange: (patch: Partial<FormState>) => void;
}

export default function IntegrationFields({ tool, form, secretSet, onChange }: IntegrationFieldsProps) {
  const extraField = EXTRA_FIELD[tool];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 12 }}>
      <div>
        <label style={fieldLabel}>URL</label>
        <input style={inputStyle} value={form.url} placeholder="https://…" onChange={e => onChange({ url: e.target.value })} />
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        {HAS_USERNAME_FIELD[tool] && (
          <div style={{ flex: 1 }}>
            <label style={fieldLabel}>{USERNAME_LABEL[tool]}</label>
            <input style={inputStyle} value={form.username} onChange={e => onChange({ username: e.target.value })} />
          </div>
        )}
        <div style={{ flex: 1 }}>
          <label style={fieldLabel}>{SECRET_LABEL[tool]}</label>
          <input style={inputStyle} type="password" value={form.secret}
            placeholder={secretSet ? "•••••••• (saved — leave blank to keep)" : ""}
            onChange={e => onChange({ secret: e.target.value })} />
        </div>
      </div>
      {extraField && (
        <div>
          <label style={fieldLabel}>{extraField.label}</label>
          <input style={inputStyle} value={form.extra} placeholder={extraField.placeholder} onChange={e => onChange({ extra: e.target.value })} />
        </div>
      )}
    </div>
  );
}
