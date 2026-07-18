# Frontend Deep Dive

Next.js 14 (App Router) + TypeScript, under `frontend/`. See
[`docs/ARCHITECTURE.md`](ARCHITECTURE.md) for how this fits into the whole
system. The `.claude/skills/portal-conventions/SKILL.md` skill in this repo
captures the same conventions in a more operational, "how to write code
here" form — this doc is the reference version.

## App Router structure

```
app/
  layout.tsx              root layout — html/head/fonts only, no chrome, no auth
  login/page.tsx          bare login form — inherits ONLY the root layout
  (dashboard)/            route group (doesn't affect URLs) — everything else
    layout.tsx            owns Sidebar + Topbar chrome, wraps children in AuthProvider
    page.tsx               "/"            — Dashboard
    services/               "/services"    (+ [id] detail)
    images/                 "/images"      (+ [id] detail, tabs: Vulns/Packages/Compliance/Layers)
    vulnerabilities/         "/vulnerabilities" (+ [cveId] detail)
    code-quality/           "/code-quality"
    pipelines/               "/pipelines"
    search/                 "/search"      (results only — see note below)
    settings/               layout.tsx (tab bar: Integrations/Users, admin-only guard)
      page.tsx               "/settings"        — Integrations
      users/page.tsx          "/settings/users"  — user management (admin-only)
    packages/               "/packages" — a client-side redirect to /images
                                          (Package Inventory lives as a tab there, not its own page)
middleware.ts              cookie-presence gate — redirects to /login if the session
                            cookie is absent, redirects away from /login if present
next.config.mjs            rewrites /api/* to the backend — same-origin from the browser's POV
```

`/search` has **no input box of its own** — the only place to type a query
is the Topbar's search field (present on every dashboard page), which
navigates to `/search?q=...` on Enter. There's deliberately no "Search" nav
item in the Sidebar for this reason — it would just lead to a page telling
you to look elsewhere.

## Auth on the frontend

- `middleware.ts` does a **cheap cookie-presence check only** — it can't
  validate the session against Postgres from Edge middleware without an
  extra network round trip. Real enforcement is the backend's `401`s.
  Middleware just prevents chrome from flashing before the client-side
  check resolves.
- `lib/auth/AuthContext.tsx` — `AuthProvider` (mounted by the `(dashboard)`
  layout) calls `api.me()` once, redirects to `/login` on failure, renders
  nothing while that check is in flight, and exposes `{user, logout}` via
  `useAuth()`. This is the **one** React Context in the app — everything
  else is local component state or the hook pattern below.
- `Sidebar.tsx` filters out the Settings nav entry when
  `user?.role !== "admin"`; `Topbar.tsx` shows the username + a logout
  action. Both are UX conveniences — the real access control is the
  backend's per-router gating (see `docs/BACKEND.md`).

## Styling convention

**Inline `style={{...}}` objects only** — no Tailwind, no CSS modules, no
styled-components. Color/typography tokens live in `lib/tokens.ts`:

| Export | Purpose |
|---|---|
| `C` | Named oklch colors (backgrounds, borders, text at several weights, accent) |
| `SEV` / `sevStyle(sev)` | Severity→pill-style mapping (critical/high/medium/low/pass/fail/running/etc.) |
| `demoBadgeStyle` | The muted "Demo" badge style for `is_seed` rows |
| `connectionPillStyle(kind)` | Settings' Connected/Not-connected pill |
| `relTime(iso)` | "3h ago"-style relative timestamps |

`app/globals.css` is reserved for the small number of things inline style
genuinely can't express: `:hover` rules (`.settings-add-tile:hover` etc.)
and the `.rule-html` descendant-selector rules that style server-sanitized
HTML rendered via `dangerouslySetInnerHTML` in `FixPanel` (SonarQube rule
descriptions — bleach-sanitized on the backend, see `docs/BACKEND.md`;
this is the one place in the app that renders dynamically-injected markup,
so it needs real CSS rather than inline props on elements React didn't
create).

No icon library — plain Unicode glyphs (`⌕`, `×`, `←`, `↗`) or colored
monogram badges built from the same `oklch(L C H)` formula already used for
severity colors (see `lib/integrations/config.ts`'s `ACCENT` map).

## State & data-fetching conventions

- **Plain hooks, no global state library.** `AuthContext` is the sole
  exception (see above) — everything else is `useState`/`useEffect` local
  to a component or a custom hook.
- **Data fetching**: a hand-rolled `api` object in `lib/api.ts` (`get`/
  `post`/`put`/`del` helpers over `fetch`, base path `/api`). No
  react-query/SWR. `fetch`'s default same-origin credentials behavior is
  enough for the session cookie to flow — no explicit `credentials:` needed.
- **The config + hook + component modularity split** — established for
  Settings (`lib/integrations/config.ts` + `useIntegrations.ts` +
  `components/settings/*`) and Users (`lib/users/useUsers.ts` +
  `components/settings/UsersTable.tsx`/`AddUserPanel.tsx`). Apply this
  split to a page once it has real state/actions to justify it (multiple
  tool configs, CRUD flows) — **not** a default for every page.
  `code-quality/page.tsx` (~220 lines) and `images/page.tsx` (~245 lines)
  are still monolithic single-component pages and are the next natural
  candidates if they grow further, but splitting them isn't done pre-emptively.
- **Forms**: plain controlled `<input>`/`onChange`, no form library.

## Established component conventions

**Slide-over panel** — the one recurring "detail" or "create" UI shape in
this app: a fixed dim backdrop (`position: fixed, inset: 0, background:
oklch(0 0 0 / 0.4), zIndex: 10`) plus a fixed 420px right panel (`zIndex:
11`, `overflowY: auto`), `×` and `Escape` both close. Four implementations
share this exact shell: `components/FixPanel.tsx`,
`components/settings/AddIntegrationPanel.tsx`,
`components/AddServicePanel.tsx`, `components/settings/AddUserPanel.tsx`.
Don't invent a new modal/dialog pattern — extend this one.

**Destructive actions are visually demoted, not hidden** — a muted
"Danger zone" footer (subtle red-tinted top border) with plain
underlined-text actions, separated from routine controls by a divider.
See `IntegrationCard.tsx` and `UsersTable.tsx`'s Delete/Deactivate links.
Confirmation is a plain `window.confirm(...)` — no custom confirm-modal
component exists.

**Data provenance** — any seedable row renders `<DemoBadge/>` when
`is_seed` is true (`components/DemoBadge.tsx`, wrapping `demoBadgeStyle`).

## Page/component inventory (current)

Pages: Dashboard, Services (list+detail), Images (list+detail, 4 tabs),
Vulnerabilities (list+detail), Code Quality (2 tabs: Projects/Issues),
Pipelines (list, detail via `PipelineDetailPanel`), Search (results only),
Settings (Integrations tab, Users tab), Login.

Reusable components: `Sidebar`, `Topbar`, `SeverityBadge`, `KpiCard`,
`DemoBadge`, `ToolHealthCard`, `FixPanel`, `PipelineDetailPanel`,
`AddServicePanel`, and the `settings/` subfolder (`IntegrationCard`,
`IntegrationFields`, `AddIntegrationCard`, `AddIntegrationPanel`,
`UsersTable`, `AddUserPanel`).

**Before claiming a frontend change is done**: `cd frontend && npx tsc
--noEmit` — the Docker build runs `next build`, which type-checks the
*entire* project in production mode and fails on any TS error anywhere,
even in files a change didn't touch. And remember **the Docker frontend
does not hot-reload** — `docker compose build frontend && docker compose
up -d --force-recreate --renew-anon-volumes frontend` is required to see
changes at `localhost:3000` (plain `up -d` is not reliably sufficient, the
anonymous `.next` volume can serve stale content).
