"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { C } from "@/lib/tokens";

const fieldStyle = { background: C.inset, border: `1px solid ${C.border}`, borderRadius: 7, padding: "8px 10px", color: C.text, fontSize: 13, width: "100%" };

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.login({ username, password });
      router.push("/");
      router.refresh();
    } catch {
      setError("Invalid username or password");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: C.bg }}>
      <form onSubmit={onSubmit} style={{ width: 320, background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 28 }}>
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>DevSecOps Portal</div>
        <div style={{ fontSize: 12.5, color: C.textMuted, marginBottom: 20 }}>Sign in to continue</div>

        <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 4 }}>Username</div>
        <input value={username} onChange={e => setUsername(e.target.value)} style={{ ...fieldStyle, marginBottom: 14 }} autoFocus />

        <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 4 }}>Password</div>
        <input type="password" value={password} onChange={e => setPassword(e.target.value)} style={{ ...fieldStyle, marginBottom: 16 }} />

        {error && <div style={{ fontSize: 12, color: "oklch(0.80 0.16 25)", marginBottom: 12 }}>{error}</div>}

        <button type="submit" disabled={submitting || !username || !password} style={{
          background: C.accentBg, color: C.accentFg, border: `1px solid ${C.accentBorder}`, borderRadius: 6,
          padding: "9px 14px", fontSize: 13, cursor: "pointer", width: "100%",
          opacity: submitting || !username || !password ? 0.6 : 1,
        }}>
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
