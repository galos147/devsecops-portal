"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, type ImageOut } from "@/lib/api";
import { C, relTime } from "@/lib/tokens";

const filterStyle = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 7, padding: "8px 10px", color: C.text, fontSize: 13 };
const inputStyle = { ...filterStyle, width: 260, outline: "none" };

function countColor(n: number, level: string) {
  const colors: Record<string, string> = { critical: "oklch(0.80 0.17 25)", high: "oklch(0.80 0.15 55)", medium: "oklch(0.82 0.13 95)", low: "oklch(0.75 0.10 150)" };
  return { fontSize: 12.5, fontWeight: n > 0 ? 600 : 400, color: n > 0 ? colors[level] : C.textMuted };
}

export default function ImagesPage() {
  const router = useRouter();
  const [images, setImages] = useState<ImageOut[]>([]);
  const [q, setQ] = useState("");
  const [registry, setRegistry] = useState("all");
  const [source, setSource] = useState("all");
  const [minSeverity, setMinSeverity] = useState("all");

  useEffect(() => { api.images().then(setImages); }, []);

  const registries = [...new Set(images.map(i => i.registry))];

  const filtered = images.filter(img => {
    if (q && !`${img.name}:${img.tag} ${img.digest}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (registry !== "all" && img.registry !== registry) return false;
    if (source !== "all" && img.source !== source) return false;
    if (minSeverity === "critical" && img.counts.critical === 0) return false;
    if (minSeverity === "high" && img.counts.critical + img.counts.high === 0) return false;
    if (minSeverity === "medium" && img.counts.critical + img.counts.high + img.counts.medium === 0) return false;
    return true;
  });

  const TH = { fontSize: 11, color: C.textMuted, textTransform: "uppercase" as const, letterSpacing: "0.03em" };
  const cols = "1.6fr 1.4fr 0.6fr 0.6fr 0.6fr 0.6fr 1fr 0.8fr";

  return (
    <div>
      <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Image Inventory</div>
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, tag, digest…" style={inputStyle} />
        <select value={registry} onChange={e => setRegistry(e.target.value)} style={filterStyle}>
          <option value="all">All registries</option>
          {registries.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <select value={source} onChange={e => setSource(e.target.value)} style={filterStyle}>
          <option value="all">All sources</option>
          <option value="jfrog">JFrog</option>
          <option value="prisma">Prisma</option>
        </select>
        <select value={minSeverity} onChange={e => setMinSeverity(e.target.value)} style={filterStyle}>
          <option value="all">Any severity</option>
          <option value="critical">Has critical</option>
          <option value="high">Has high+</option>
          <option value="medium">Has medium+</option>
        </select>
      </div>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: cols, padding: "10px 16px", borderBottom: `1px solid ${C.borderLight}` }}>
          {["Image", "Registry", "Crit", "High", "Med", "Low", "Last Scanned", "Source"].map(h => (
            <div key={h} style={TH}>{h}</div>
          ))}
        </div>
        {filtered.map(img => (
          <div key={img.id} onClick={() => router.push(`/images/${img.id}`)} style={{ display: "grid", gridTemplateColumns: cols, padding: "12px 16px", borderBottom: `1px solid ${C.borderRow}`, cursor: "pointer", alignItems: "center" }}>
            <div style={{ fontFamily: "ui-monospace,monospace", fontSize: 12.5 }}>{img.name}:{img.tag}</div>
            <div style={{ fontSize: 12, color: C.textSub }}>{img.registry}</div>
            <div style={countColor(img.counts.critical, "critical")}>{img.counts.critical}</div>
            <div style={countColor(img.counts.high, "high")}>{img.counts.high}</div>
            <div style={countColor(img.counts.medium, "medium")}>{img.counts.medium}</div>
            <div style={countColor(img.counts.low, "low")}>{img.counts.low}</div>
            <div style={{ fontSize: 12, color: C.textMuted }}>{relTime(img.last_scanned_at)}</div>
            <div style={{ fontSize: 11, color: C.textMuted, textTransform: "capitalize" }}>{img.source}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
