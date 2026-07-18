"use client";
import { useEffect, useState } from "react";
import { C } from "@/lib/tokens";
import type { UserCreate } from "@/lib/api";

const fieldStyle = { background: C.inset, border: `1px solid ${C.border}`, borderRadius: 7, padding: "8px 10px", color: C.text, fontSize: 13, width: "100%" };

interface Props {
  onClose: () => void;
  onCreate: (body: UserCreate) => Promise<unknown>;
}

export default function AddUserPanel({ onClose, onCreate }: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "member">("member");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleCreate() {
    setSaving(true);
    setError(null);
    try {
      await onCreate({ username, password, role });
      onClose();
    } catch {
      setError("Could not create user — username may already be taken");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "oklch(0 0 0 / 0.4)", zIndex: 10 }} />
      <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: 420, background: "oklch(0.17 0.005 250)", borderLeft: `1px solid ${C.border}`, zIndex: 11, padding: 22, overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Add User</div>
          <span onClick={onClose} style={{ cursor: "pointer", color: C.textMuted, fontSize: 20, lineHeight: 1 }}>×</span>
        </div>

        <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 4 }}>Username</div>
        <input value={username} onChange={e => setUsername(e.target.value)} style={{ ...fieldStyle, marginBottom: 14 }} />

        <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 4 }}>Password</div>
        <input type="password" value={password} onChange={e => setPassword(e.target.value)} style={{ ...fieldStyle, marginBottom: 14 }} />

        <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 4 }}>Role</div>
        <select value={role} onChange={e => setRole(e.target.value as "admin" | "member")} style={{ ...fieldStyle, marginBottom: 20 }}>
          <option value="member">Member</option>
          <option value="admin">Admin</option>
        </select>

        {error && <div style={{ fontSize: 12, color: "oklch(0.80 0.16 25)", marginBottom: 12 }}>{error}</div>}

        <button onClick={handleCreate} disabled={saving || !username || !password} style={{ background: C.accentBg, color: C.accentFg, border: `1px solid ${C.accentBorder}`, borderRadius: 6, padding: "8px 14px", fontSize: 12.5, cursor: "pointer", opacity: saving || !username || !password ? 0.6 : 1 }}>
          {saving ? "Creating…" : "Create User"}
        </button>
      </div>
    </>
  );
}
