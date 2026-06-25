# Remove Demo Mode (sample-data toggle) — Design

**Date:** 2026-06-25
**Branch:** `feat/remove-demo-mode`

## Summary

Remove the **global demo-mode toggle** — the mechanism that lets a
`demoMode`-flagged user swap a client's real data for the `lib/demo-data/*`
sample datasets in the peec-ai report sections. After this change, every user
sees real data only; the existing `demoMode=false` code path becomes the sole
path.

## Explicitly out of scope

These are separate systems and are **not** touched:

- **Demo login / fake-auth bypass** — `demoLoginInternal` / `demoLoginClient` /
  `demoLogout` in `app/actions/demo-auth.ts`, `getDemoSession()` and the
  `demo-session` cookie in `lib/demo-auth.ts`, the `demo-session` read in
  `app/api/glean/meeting-brief/route.ts`, the `demoLogout` form in
  `portal-sidebar.tsx`, and the demo-login buttons on the login page. All kept.
- **Per-section local fallback data** — `DEMO_KPIS` / `isDemo` in `reddit-ads`,
  `exec-summary`, `tiktok-shop`, and other non-peec sections. These are local
  placeholders shown when a section has no real-data wiring or env vars yet;
  they are independent of the toggle and stay as-is.

## Behavior change

A formerly demo-flagged user now sees **real data only** — identical to how a
`demoMode=false` user behaves today. The `demoMode` prop already defaults to
`false` everywhere, so this is pure dead-code elimination of the
already-present fallback path, not new behavior. Sections with no configured
provider continue to show their existing "not configured" empty states (e.g.
peec-ai's "No AEO provider is configured for this client.").

## Database decision

Remove `demoMode` from application code, but **keep the `demo_mode` DB column**
(no Drizzle migration in this PR — reversible, no data loss). The column drop is
deferred and recorded in two visible places:

1. A `// TODO(remove-demo-mode): drop the demo_mode column via migration` note
   on the `users` table in `lib/db/schema.ts`.
2. A root-level `MIGRATIONS-PENDING.md` entry.

## Removal surface

### 1. Auth / session / types
- `auth.ts` — drop `token.demoMode` (3 assignment sites) and
  `session.user.demoMode`.
- `types/next-auth.d.ts` — drop the two `demoMode` field declarations.
- `lib/db/schema.ts` — drop `demoMode` from the inferred `users` type; add the
  TODO note (column stays).

### 2. Resolver, toggle control, datasets (delete)
- `lib/demo-data/resolve.ts` (`resolveDemoMode`)
- `app/actions/demo-mode.ts` (`setDemoMode`)
- `components/layout/demo-mode-toggle.tsx` (`DemoModeToggle`)
- The entire `lib/demo-data/` directory (all sample datasets + `badge.tsx`'s
  `SampleDataBadge`).

### 3. Layouts / routers — stop resolving & threading the prop
- `app/dashboard/layout.tsx`, `app/tools/layout.tsx` — remove the
  `resolveDemoMode` call and the `demoModeEffective` prop passed to `<Sidebar>`.
- `app/dashboard/[clientSlug]/reports/page.tsx` and
  `app/portal/[clientSlug]/reports/[reportSlug]/page.tsx` — remove the
  `resolveDemoMode` block and stop passing `demoMode` into report components
  (update the `getReportComponent` / `getReportSection` signatures).
- `components/layout/sidebar.tsx`, `components/layout/portal-sidebar.tsx` —
  remove the `demoModeEffective` prop and the `<DemoModeToggle>` render. Keep
  the `demoLogout` form in `portal-sidebar.tsx`.

### 4. peec-ai sections — collapse to the real-data path
For each of `index.tsx`, `pr-influence.tsx`, `content-impact.tsx`,
`technical-audit.tsx`, `technical-audit-tables.tsx`,
`sentiment-insights-section.tsx`:

- Remove the `demoMode` / `isDemo` props from signatures and call sites.
- Delete `if (demoMode) { ...substitute sample data... }` blocks.
- Drop `demoMode ||` guards (e.g. `peecConfigured = !!config?.peecCustomerProjectId`).
- Collapse `isDemo` / `prIsDemo` / `calendarIsDemo ? demoValue : realValue`
  ternaries to `realValue`; remove now-dead local demo arrays
  (`sectionBDemo*`, the per-card `demo:` literals, etc.).
- Remove `<SampleDataBadge>` usages and the `@/lib/demo-data/badge` import, plus
  all other `@/lib/demo-data/*` imports.

## Verification

- Typecheck clean (`tsc --noEmit` via the project's script) — catches every
  orphaned reference to a removed symbol.
- Production build succeeds.
- `grep -rn "demoMode\|resolveDemoMode\|demo-data\|DemoModeToggle\|SampleDataBadge"`
  over `app/`, `components/`, `lib/`, `auth.ts`, `types/` returns **no** hits.
- `grep -rn "demo-session\|getDemoSession\|demoLogin\|demoLogout"` still returns
  the intentionally-kept fake-login hits (sanity check that the login system was
  not touched).
