"use client";
import { useState } from "react";
import { C } from "@/lib/tokens";
import { useAuth } from "@/lib/auth/AuthContext";
import { useUsers } from "@/lib/users/useUsers";
import type { UserOut } from "@/lib/api";
import UsersTable from "@/components/settings/UsersTable";
import AddUserPanel from "@/components/settings/AddUserPanel";

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const { users, actions } = useUsers();
  const [addOpen, setAddOpen] = useState(false);

  async function handleToggleRole(u: UserOut) {
    const nextRole = u.role === "admin" ? "member" : "admin";
    try {
      await actions.update(u.id, { role: nextRole });
    } catch {
      window.alert("Couldn't change that user's role — they may be the last remaining admin.");
    }
  }

  async function handleToggleActive(u: UserOut) {
    if (u.is_active && !window.confirm(`Deactivate ${u.username}? This immediately revokes their active session and blocks further logins.`)) return;
    try {
      await actions.update(u.id, { is_active: !u.is_active });
    } catch {
      window.alert("Couldn't change that user's status — they may be the last remaining admin.");
    }
  }

  async function handleDelete(u: UserOut) {
    if (u.id === currentUser?.id) {
      window.alert("You can't delete your own account while logged in as it.");
      return;
    }
    if (!window.confirm(`Delete ${u.username}? This can't be undone.`)) return;
    try {
      await actions.remove(u.id);
    } catch {
      window.alert("Couldn't delete that user — they may be the last remaining admin.");
    }
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 12.5, color: C.textMuted }}>Accounts that can sign in to this portal.</div>
        <button onClick={() => setAddOpen(true)} style={{ background: C.accentBg, color: C.accentFg, border: `1px solid ${C.accentBorder}`, borderRadius: 6, padding: "7px 14px", fontSize: 12.5, cursor: "pointer" }}>
          + Add User
        </button>
      </div>

      <UsersTable
        users={users}
        onToggleRole={handleToggleRole}
        onToggleActive={handleToggleActive}
        onDelete={handleDelete}
      />

      {addOpen && (
        <AddUserPanel onClose={() => setAddOpen(false)} onCreate={actions.create} />
      )}
    </div>
  );
}
