"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, type ServiceOut } from "@/lib/api";
import { C, SEV, sevStyle } from "@/lib/tokens";
import DemoBadge from "@/components/DemoBadge";
import AddServicePanel from "@/components/AddServicePanel";

const notLinkedStyle = { color: C.textMuted, fontSize: 12 };

export default function ServicesPage() {
  const router = useRouter();
  const [services, setServices] = useState<ServiceOut[]>([]);
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => { api.services().then(setServices); }, []);

  const TH = { fontSize: 11, color: C.textMuted, textTransform: "uppercase" as const, letterSpacing: "0.03em" };
  const cols = "1.6fr 1fr 1fr 1fr";

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>Services</div>
        <button onClick={() => setAddOpen(true)} style={{ background: C.accentBg, color: C.accentFg, border: `1px solid ${C.accentBorder}`, borderRadius: 6, padding: "7px 14px", fontSize: 12.5, cursor: "pointer" }}>
          + Add Service
        </button>
      </div>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: cols, padding: "10px 16px", borderBottom: `1px solid ${C.borderLight}` }}>
          {["Name", "Code Quality", "Last Pipeline", "Top Vuln"].map(h => <div key={h} style={TH}>{h}</div>)}
        </div>
        {services.length === 0 && (
          <div style={{ padding: 24, textAlign: "center", color: C.textMuted, fontSize: 13 }}>
            No services defined yet — click "+ Add Service" to link a SonarQube project, GitLab project, and/or image together.
          </div>
        )}
        {services.map(s => (
          <div key={s.id} onClick={() => router.push("/services/" + s.id)} style={{ display: "grid", gridTemplateColumns: cols, padding: "11px 16px", borderBottom: `1px solid ${C.borderRow}`, cursor: "pointer", alignItems: "center" }}>
            <div style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
              {s.name}
              {s.is_seed && <DemoBadge />}
            </div>
            {s.quality_gate ? (
              <span style={{ ...(s.quality_gate === "passed" ? SEV.pass : SEV.fail), fontSize: 11, padding: "3px 8px", borderRadius: 5, fontWeight: 600, textTransform: "uppercase", width: "fit-content" }}>{s.quality_gate}</span>
            ) : <span style={notLinkedStyle}>Not linked</span>}
            {s.last_pipeline_status ? (
              <span style={{ ...sevStyle(s.last_pipeline_status), width: "fit-content" }}>{s.last_pipeline_status}</span>
            ) : <span style={notLinkedStyle}>Not linked</span>}
            {s.top_vuln_severity ? (
              <span style={{ ...sevStyle(s.top_vuln_severity), width: "fit-content" }}>{s.top_vuln_severity}</span>
            ) : <span style={notLinkedStyle}>Not linked</span>}
          </div>
        ))}
      </div>

      {addOpen && (
        <AddServicePanel
          onClose={() => setAddOpen(false)}
          onSaved={svc => { setServices(prev => [...prev, svc]); setAddOpen(false); }}
        />
      )}
    </div>
  );
}
