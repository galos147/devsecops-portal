"use client";
import { useState } from "react";
import { C } from "@/lib/tokens";
import { useIntegrations } from "@/lib/integrations/useIntegrations";
import IntegrationCard from "@/components/settings/IntegrationCard";
import AddIntegrationCard from "@/components/settings/AddIntegrationCard";
import AddIntegrationPanel from "@/components/settings/AddIntegrationPanel";

export default function SettingsPage() {
  const { tools, getState, actions } = useIntegrations();
  const [addOpen, setAddOpen] = useState(false);

  const connectedTools = tools.filter(tool => getState(tool).integration?.source === "database");
  const availableTools = tools.filter(tool => !connectedTools.includes(tool));

  return (
    <div>
      <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Settings — Integrations</div>
      <div style={{ fontSize: 12.5, color: C.textMuted, marginBottom: 18 }}>Connect each tool here — no editing config files or restarting anything.</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        {connectedTools.map(tool => (
          <IntegrationCard
            key={tool}
            tool={tool}
            state={getState(tool)}
            onFormChange={patch => actions.updateForm(tool, patch)}
            onTest={() => actions.testConnection(tool)}
            onSave={() => actions.save(tool)}
            onSync={() => actions.triggerSync(tool)}
            onUnregister={() => actions.unregister(tool)}
            onDeleteData={() => actions.deleteData(tool)}
          />
        ))}
        {availableTools.length > 0 && <AddIntegrationCard onClick={() => setAddOpen(true)} />}
      </div>
      {addOpen && (
        <AddIntegrationPanel
          availableTools={availableTools}
          getState={getState}
          actions={actions}
          onClose={() => setAddOpen(false)}
        />
      )}
    </div>
  );
}
