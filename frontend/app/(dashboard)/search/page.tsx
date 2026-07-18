"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, type SearchResults } from "@/lib/api";
import { C, sevStyle } from "@/lib/tokens";
import { Suspense } from "react";

function SearchInner() {
  const router = useRouter();
  const params = useSearchParams();
  const q = params.get("q") ?? "";
  const [results, setResults] = useState<SearchResults | null>(null);

  useEffect(() => {
    if (!q) { setResults(null); return; }
    api.search(q).then(setResults);
  }, [q]);

  const sectionLabel = { fontSize: 12, color: C.textMuted, textTransform: "uppercase" as const, letterSpacing: "0.04em", marginBottom: 8 };
  const card = { display: "flex", justifyContent: "space-between", padding: "10px 14px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, marginBottom: 6, cursor: "pointer" };
  const badge = { fontSize: 10.5, color: C.textMuted, border: `1px solid ${C.borderLight}`, borderRadius: 4, padding: "2px 6px", textTransform: "uppercase" as const };

  return (
    <div>
      <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Global Search</div>
      {!q && <div style={{ color: C.textMuted, fontSize: 13 }}>Type a query in the search bar above — CVE IDs, image names, file paths, project names.</div>}
      {q && !results && <div style={{ color: C.textMuted, fontSize: 13 }}>Searching…</div>}
      {results && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {results.images.length > 0 && (
            <div>
              <div style={sectionLabel}>Images</div>
              {results.images.map(r => (
                <div key={r.id} style={card} onClick={() => router.push(`/images/${r.id}`)}>
                  <div style={{ fontFamily: "ui-monospace,monospace", fontSize: 12.5 }}>{r.name}:{r.tag}</div>
                  <span style={badge}>{r.source}</span>
                </div>
              ))}
            </div>
          )}
          {results.cves.length > 0 && (
            <div>
              <div style={sectionLabel}>CVEs</div>
              {results.cves.map(r => (
                <div key={r.cve_id} style={card} onClick={() => router.push(`/vulnerabilities/${r.cve_id}`)}>
                  <div style={{ fontFamily: "ui-monospace,monospace", fontSize: 12.5 }}>{r.cve_id}</div>
                  <span style={sevStyle(r.severity)}>{r.severity}</span>
                </div>
              ))}
            </div>
          )}
          {results.code_issues.length > 0 && (
            <div>
              <div style={sectionLabel}>Code Issues</div>
              {results.code_issues.map(r => (
                <div key={r.id} style={{ ...card, cursor: "default" }}>
                  <div style={{ fontFamily: "ui-monospace,monospace", fontSize: 12.5 }}>{r.file_path}</div>
                  <span style={badge}>SonarQube</span>
                </div>
              ))}
            </div>
          )}
          {results.pipelines.length > 0 && (
            <div>
              <div style={sectionLabel}>Pipelines</div>
              {results.pipelines.map(r => (
                <div key={r.id} style={{ ...card, cursor: "default" }}>
                  <div style={{ fontSize: 12.5 }}>{r.project} · {r.ref}</div>
                  <span style={badge}>GitLab</span>
                </div>
              ))}
            </div>
          )}
          {results.images.length === 0 && results.cves.length === 0 && results.code_issues.length === 0 && results.pipelines.length === 0 && (
            <div style={{ color: C.textMuted, fontSize: 13 }}>No results for &quot;{q}&quot;.</div>
          )}
        </div>
      )}
    </div>
  );
}

export default function SearchPage() {
  return <Suspense><SearchInner /></Suspense>;
}
