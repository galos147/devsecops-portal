const BASE = "/api";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`);
  return res.json();
}

async function put<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`);
  return res.json();
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`);
  return res.json();
}

export const api = {
  dashboard: () => get<DashboardStats>("/dashboard/stats"),
  images: (params?: Record<string, string>) => get<ImageOut[]>(`/images${qs(params)}`),
  image: (id: string) => get<ImageDetailOut>(`/images/${id}`),
  imagePackages: (id: string) => get<PackageOut[]>(`/images/${id}/packages`),
  vulnerabilities: (params?: Record<string, string>) => get<VulnGroupOut[]>(`/vulnerabilities${qs(params)}`),
  cve: (cveId: string) => get<CveDetailOut>(`/vulnerabilities/${cveId}`),
  projects: () => get<CodeProjectOut[]>("/projects"),
  codeIssues: (params?: Record<string, string>) => get<CodeIssueOut[]>(`/code-issues${qs(params)}`),
  pipelines: (params?: Record<string, string>) => get<PipelineOut[]>(`/pipelines${qs(params)}`),
  search: (q: string) => get<SearchResults>(`/search?q=${encodeURIComponent(q)}`),
  fixSuggestion: (cveId: string) => get<FixSuggestionOut>(`/fix-suggestions/${cveId}`),
  ruleInfo: (ruleId: string) => get<RuleInfoOut>(`/rules/${encodeURIComponent(ruleId)}`),
  syncStatus: () => get<Record<string, SyncStatus>>("/sync/status"),
  triggerSync: (tool: string) => fetch(`${BASE}/sync/${tool}`, { method: "POST" }).then(r => r.json()),
  integrations: () => get<IntegrationOut[]>("/integrations"),
  updateIntegration: (tool: string, body: IntegrationUpdate) => put<IntegrationOut>(`/integrations/${tool}`, body),
  testIntegration: (tool: string, body?: TestConnectionRequest) => post<TestConnectionResult>(`/integrations/${tool}/test`, body),
};

function qs(params?: Record<string, string>): string {
  if (!params) return "";
  const p = Object.entries(params).filter(([, v]) => v && v !== "all");
  return p.length ? "?" + new URLSearchParams(p).toString() : "";
}

// Types
export interface VulnCount { critical: number; high: number; medium: number; low: number }
export interface ImageOut { id: string; name: string; tag: string; registry: string; digest?: string; size_mb?: number; last_scanned_at?: string; source: string; counts: VulnCount }
export interface VulnOut { id: string; cve_id: string; severity: string; package_name?: string; installed_version?: string; fixed_version?: string; cvss_score?: number; description?: string; source_tool?: string; status: string }
export interface ImageDetailOut extends ImageOut { vulnerabilities: VulnOut[] }
export interface VulnGroupOut { cve_id: string; severity: string; cvss_score?: number; description?: string; affected_images: number; fixed_version?: string; status: string; source_tool?: string }
export interface AffectedImageOut { id: string; name: string; tag: string; installed_version?: string; fixed_version?: string; status: string }
export interface CveDetailOut { cve_id: string; severity: string; cvss_score?: number; description?: string; published?: string; cvss_vector?: string; advisory_url?: string; suggestion?: string; copy_cmd?: string; affected_images: AffectedImageOut[] }
export interface FixSuggestionOut { cve_id: string; suggestion_text?: string; copy_cmd?: string; advisory_url?: string; published?: string; cvss_vector?: string }
export interface CodeProjectOut { id: string; project_key: string; name: string; quality_gate?: string; bugs: number; vulnerabilities: number; code_smells: number; coverage: number; hotspots: number; sonar_url?: string }
export interface CodeIssueOut { id: string; project_key: string; project_name?: string; rule_id?: string; type?: string; severity?: string; message?: string; file_path?: string; line_number?: number; status?: string; effort?: string }
export interface RuleInfoOut { rule_id: string; name?: string; type?: string; remediation_effort?: string; description?: string; rule_url?: string }
export interface PipelineOut { id: string; project: string; ref?: string; status?: string; started_at?: string; finished_at?: string; sast: number; dep_scan: number; secret_detection: number; findings?: Array<{ cat: string; text: string }> }
export interface SearchResults { images: Array<{ id: string; name: string; tag: string; source: string }>; cves: Array<{ cve_id: string; severity: string; description?: string }>; code_issues: Array<{ id: string; file_path?: string; message?: string; project_key: string }>; pipelines: Array<{ id: string; project: string; ref?: string; status?: string }> }
export interface ToolHealth { tool: string; label: string; status: string; last_sync?: string; records_synced: number }
export interface TopVulnImage { id: string; name: string; tag: string; registry: string; critical: number; high: number }
export interface RecentFailure { id: string; project: string; ref: string; started_at?: string; total_findings: number }
export interface DashboardStats { total_images: number; critical_cves: number; high_code_issues: number; failing_pipelines: number; last_sync?: string; severity_counts: VulnCount; tool_health: ToolHealth[]; top_vuln_images: TopVulnImage[]; recent_failures: RecentFailure[] }
export interface SyncStatus { status: string; last_sync?: string; records_synced: number; error?: string }
export interface PackageOut { id: string; name: string; version?: string; pkg_type?: string; license?: string; source_tool?: string; vuln_severity?: string; fix_version?: string }
export interface IntegrationOut { tool: string; label: string; url?: string; username?: string; secret_set: boolean; extra?: string; source: "database" | "env" | "none"; updated_at?: string }
export interface IntegrationUpdate { url?: string; username?: string; secret?: string; extra?: string }
export interface TestConnectionRequest { url?: string; username?: string; secret?: string }
export interface TestConnectionResult { ok: boolean; message: string }
