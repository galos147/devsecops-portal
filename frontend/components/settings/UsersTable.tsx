"use client";
import { C, relTime } from "@/lib/tokens";
import type { UserOut } from "@/lib/api";

interface Props {
  users: UserOut[];
  onToggleActive: (u: UserOut) => void;
  onToggleRole: (u: UserOut) => void;
  onDelete: (u: UserOut) => void;
}

export default function UsersTable({ users, onToggleActive, onToggleRole, onDelete }: Props) {
  const TH = { fontSize: 11, color: C.textMuted, textTransform: "uppercase" as const, letterSpacing: "0.03em" };
  const cols = "1.3fr 0.8fr 0.8fr 1fr 1.4fr";

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
      <div style={{ display: "grid", gridTemplateColumns: cols, padding: "10px 16px", borderBottom: `1px solid ${C.borderLight}` }}>
        {["Username", "Role", "Status", "Created", ""].map(h => <div key={h} style={TH}>{h}</div>)}
      </div>
      {users.map(u => (
        <div key={u.id} style={{ display: "grid", gridTemplateColumns: cols, padding: "11px 16px", borderBottom: `1px solid ${C.borderRow}`, alignItems: "center" }}>
          <div style={{ fontSize: 13 }}>{u.username}</div>
          <div style={{ fontSize: 12.5, textTransform: "capitalize" }}>{u.role}</div>
          <span style={{
            background: u.is_active ? "oklch(0.28 0.05 150)" : C.inset,
            color: u.is_active ? "oklch(0.72 0.12 150)" : C.textMuted,
            fontSize: 11, padding: "3px 8px", borderRadius: 5, fontWeight: 600, width: "fit-content",
          }}>
            {u.is_active ? "Active" : "Deactivated"}
          </span>
          <div style={{ fontSize: 12, color: C.textMuted }}>{relTime(u.created_at)}</div>
          <div style={{ display: "flex", gap: 14 }}>
            <span onClick={() => onToggleRole(u)} style={{ fontSize: 11, color: C.textMuted, cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 2 }}>
              {u.role === "admin" ? "Make Member" : "Make Admin"}
            </span>
            <span onClick={() => onToggleActive(u)} style={{ fontSize: 11, color: C.textMuted, cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 2 }}>
              {u.is_active ? "Deactivate" : "Reactivate"}
            </span>
            <span onClick={() => onDelete(u)} style={{ fontSize: 11, color: C.textMuted, cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 2 }}>
              Delete
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
