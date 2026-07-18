"use client";
import { useEffect, useState } from "react";
import { api, type SyncStatus, type IntegrationOut } from "@/lib/api";
import { TOOLS, type Tool } from "./config";

export interface FormState { url: string; username: string; secret: string; extra: string }
export type TestState = { status: "idle" } | { status: "testing" } | { status: "ok"; message: string } | { status: "fail"; message: string };

const emptyForm = (): FormState => ({ url: "", username: "", secret: "", extra: "" });

export interface IntegrationToolState {
  integration?: IntegrationOut;
  form: FormState;
  status?: SyncStatus;
  syncing: boolean;
  test: TestState;
  saving: boolean;
}

export function useIntegrations() {
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

  function updateForm(tool: Tool, patch: Partial<FormState>) {
    setForms(f => ({ ...f, [tool]: { ...(f[tool] ?? emptyForm()), ...patch } }));
    setTestResults(t => ({ ...t, [tool]: { status: "idle" } }));
  }

  async function testConnection(tool: Tool) {
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

  async function save(tool: Tool) {
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

  async function unregister(tool: Tool) {
    const updated = await api.unregisterIntegration(tool);
    setIntegrations(i => ({ ...i, [tool]: updated }));
    setForms(f => ({ ...f, [tool]: { url: updated.url ?? "", username: updated.username ?? "", secret: "", extra: updated.extra ?? "" } }));
    setTestResults(t => ({ ...t, [tool]: { status: "idle" } }));
  }

  async function deleteData(tool: Tool) {
    const result = await api.deleteIntegrationData(tool);
    window.alert(`Deleted ${result.deleted} record(s) synced by this tool.`);
  }

  function triggerSync(tool: Tool) {
    setSyncing(s => ({ ...s, [tool]: true }));
    api.triggerSync(tool).then(() => poll(tool)).catch(() => setSyncing(s => ({ ...s, [tool]: false })));
  }

  function poll(tool: Tool) {
    api.syncStatus().then(all => {
      setStatus(all);
      if (all[tool]?.status === "running") {
        setTimeout(() => poll(tool), 2000);
      } else {
        setSyncing(s => ({ ...s, [tool]: false }));
      }
    }).catch(() => setSyncing(s => ({ ...s, [tool]: false })));
  }

  function getState(tool: Tool): IntegrationToolState {
    return {
      integration: integrations[tool],
      form: forms[tool] ?? emptyForm(),
      status: status[tool],
      syncing: !!syncing[tool],
      test: testResults[tool] ?? { status: "idle" },
      saving: !!saving[tool],
    };
  }

  return {
    tools: TOOLS,
    getState,
    actions: { updateForm, testConnection, save, triggerSync, unregister, deleteData },
  };
}
