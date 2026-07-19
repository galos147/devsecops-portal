export const TOOLS = ["jfrog", "sonarqube", "prisma", "gitlab", "dependency_track"] as const;
export type Tool = (typeof TOOLS)[number];

export const LABELS: Record<Tool, string> = {
  jfrog: "JFrog Xray",
  sonarqube: "SonarQube",
  prisma: "Prisma Cloud",
  gitlab: "GitLab",
  dependency_track: "Dependency-Track",
};

export const SECRET_LABEL: Record<Tool, string> = {
  jfrog: "Password / API Key",
  sonarqube: "Token",
  prisma: "Secret Key",
  gitlab: "Token",
  dependency_track: "API Key",
};

export const USERNAME_LABEL: Record<Tool, string> = {
  jfrog: "Username",
  sonarqube: "Username (unused)",
  prisma: "Access Key",
  gitlab: "Username (unused)",
  dependency_track: "Username (unused)",
};

// Whether this tool actually uses the username/access-key field — sonarqube,
// gitlab, and dependency_track all authenticate with a token/key alone, so
// the field is hidden rather than shown disabled.
export const HAS_USERNAME_FIELD: Record<Tool, boolean> = {
  jfrog: true,
  sonarqube: false,
  prisma: true,
  gitlab: false,
  dependency_track: false,
};

export const EXTRA_FIELD: Partial<Record<Tool, { label: string; placeholder: string }>> = {
  jfrog: { label: "Repositories (comma-separated)", placeholder: "docker-local, docker-prod" },
};

export const DESCRIPTIONS: Record<Tool, string> = {
  jfrog: "Container image vulnerability scanning",
  sonarqube: "Static code quality & security analysis",
  prisma: "Cloud security posture management",
  gitlab: "CI/CD pipeline & SAST results",
  dependency_track: "SBOM-based software composition analysis",
};

// Same oklch(L C H) formula as SEV in lib/tokens.ts, one hue per tool.
export const ACCENT: Record<Tool, { bg: string; fg: string }> = {
  jfrog: { bg: "oklch(0.30 0.08 245)", fg: "oklch(0.75 0.14 245)" },
  sonarqube: { bg: "oklch(0.28 0.05 150)", fg: "oklch(0.72 0.12 150)" },
  prisma: { bg: "oklch(0.30 0.08 300)", fg: "oklch(0.75 0.14 300)" },
  gitlab: { bg: "oklch(0.30 0.08 55)", fg: "oklch(0.78 0.14 55)" },
  dependency_track: { bg: "oklch(0.30 0.08 200)", fg: "oklch(0.75 0.14 200)" },
};
