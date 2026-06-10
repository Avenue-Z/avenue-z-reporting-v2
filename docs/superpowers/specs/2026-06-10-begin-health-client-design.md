# Begin Health client + Paid Media tab — design

**Status:** approved by Thomas 2026-06-10
**Repos involved:** `Avenue-Z/avenue-z-reporting-v2` (this repo) embeds
`Avenue-Z/begin-health-dashboard` via iframe.

## Goal

Add **Begin Health** as a third client on the internal Avenue Z reporting
platform (alongside Avenue Z and Renaissance), and expose a new **Paid Media**
report tab — visible only on Begin Health — that embeds the existing
standalone `begin-health-dashboard` (HTML + Apps Script + Google Sheet).

The change is strictly additive. Avenue Z and Renaissance must not see any
new tab, and no existing report code is touched.

## Non-goals

- Porting the begin-health-dashboard HTML/JS into a React component.
- Replacing the dashboard's Apps Script / Google Sheet backend.
- Replacing the dashboard's password-gated editor mode with Auth.js roles.
- Wiring GA4 / HubSpot / Peec data sources for Begin Health.

## Architecture

Two independent, additive changes on a single feature branch
(`feat/begin-health-client`):

1. **Platform-wide:** introduce one new `ReportSlug` value, `paid-media`.
   It is added to `ReportSlug`, `REPORT_NAMES`, `ALL_REPORT_SLUGS`, and the
   Reports group in `NAV_GROUPS`. Every existing client gets `paid-media`
   appended to their `hiddenReports` array so it is invisible to them.
2. **Begin Health specific:** insert one `clients` row with slug
   `begin-health`, no logo, no GA4/HubSpot/etc., and `enabledReports` set
   to the same five reports the other clients have plus `paid-media`. Add
   a `PaidMediaReport` component that renders an iframe of
   `https://begin-health-dashboard.vercel.app`.

The dashboard's iframe `src` was verified to return HTTP 200 with no
`x-frame-options` and no CSP `frame-ancestors`, so it embeds cleanly.

## Components

### Code changes (touched files)

| File | Change |
|---|---|
| `lib/db/schema.ts` | Add `'paid-media'` to the `ReportSlug` union literal. |
| `lib/constants.ts` | (a) Add `'paid-media': 'Paid Media'` to `REPORT_NAMES`. (b) Insert `'paid-media'` into the Reports group of `NAV_GROUPS` between `'peec-ai'` and `'ga4'`. (c) Insert `'paid-media'` into `ALL_REPORT_SLUGS` at the same position. |
| `app/dashboard/[clientSlug]/reports/[reportSlug]/page.tsx` | Import `PaidMediaReport`, add `case 'paid-media': return <PaidMediaReport />` to the `getReportComponent` switch. |
| `components/report-sections/paid-media/index.tsx` *(new)* | Single RSC. Renders a full-height iframe of `https://begin-health-dashboard.vercel.app` with the sandbox flags below. |
| `scripts/seed-begin-health.ts` *(new)* | Idempotent Drizzle script that (a) upserts the `begin-health` client row and (b) updates every other client to include `paid-media` in `hiddenReports`. Run once locally by Thomas against the Neon production DB. |

### Iframe configuration

```tsx
<iframe
  src="https://begin-health-dashboard.vercel.app"
  title="Begin Health — Paid Media Recap"
  className="block h-[calc(100vh-12rem)] w-full rounded-lg border border-white/[0.06] bg-bg-surface"
  loading="lazy"
  sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"
  referrerPolicy="no-referrer-when-downgrade"
/>
```

Sandbox flag justifications:

- `allow-scripts` — index.html runs inline JS.
- `allow-same-origin` — html2canvas needs document access; Apps Script fetch
  uses `Content-Type: text/plain` which is a CORS simple request and works
  cross-origin, but the editor password and DOM read APIs need same-origin
  context.
- `allow-forms` — login overlay is a real `<form>`.
- `allow-popups` — jsPDF saves trigger a popup/download window in some
  browsers.
- `allow-downloads` — PDF export.

### `begin-health` client row (initial state)

| Column | Value |
|---|---|
| `slug` | `begin-health` |
| `name` | `Begin Health` |
| `logoUrl` | `null` (falls back to "B" initial avatar) |
| `domain` | `null` |
| `ga4PropertyId` | `null` |
| `gscSiteUrl` | `null` |
| `hubspotTokenEnvVar` | `null` |
| All other source-config columns | `null` |
| `enabledReports` | `['demand-overview','peec-ai','paid-media','ga4','inbound-funnel','hubspot-performance','request-a-report']` — same set Avenue Z has, with `paid-media` inserted. |
| `hiddenReports` | `[]` |

No `users` rows. Access is internal-only via Avenue Z Google sign-in
(`INTERNAL_ADMIN` / `INTERNAL_ANALYST` roles, which already see all clients).

## Data flow

```
Browser → /dashboard/begin-health/reports?section=paid-media
       → reports/[reportSlug]/page.tsx (RSC)
       → getClientBySlug('begin-health')   [Neon]
       → getReportComponent('paid-media')
       → <PaidMediaReport />
       → <iframe src="https://begin-health-dashboard.vercel.app">
              ↓ (inside iframe, browser does this directly)
              fetch('https://script.google.com/.../exec?action=list')
              → renders Begin Health weekly recap
```

The main app does **no** cross-frame data passing. The iframe is opaque to
the parent. The editor password (`AvenueZBeginHealth@`) stays inside the
iframe — Avenue Z internal viewers see the dashboard in viewer mode by
default; whoever knows the password can switch into editor mode inside the
frame.

## Error handling and known trade-offs

- **Empty data on Begin Health's non-paid-media tabs.** With no
  `ga4PropertyId`, `hubspotTokenEnvVar`, etc., the GA4 / Pipeline
  Performance / Inbound Funnel / AEO sections will throw inside their data
  fetch helpers. These throws are caught by the existing
  `ReportErrorBoundary` wrapper in the page, so the route does not crash —
  the user sees an in-section error UI. This is the documented v1 behavior.
  A v2 could add `EmptyState` guards inside each report section but is out
  of scope here per Thomas's explicit "this is literally just a begin
  health addition and modification" constraint.
- **Iframe URL drift.** `begin-health-dashboard.vercel.app` is the stable
  public alias of the standalone deployment. If that project is renamed or
  retired, the iframe breaks. Mitigation: the URL lives in exactly one
  constant inside `paid-media/index.tsx` and is trivial to update.
- **No fallback if the iframe fails to load.** Acceptable for v1. Browsers
  show their own "site can't be reached" inside the frame; the rest of the
  app stays interactive.

## Testing plan

Manual verification before merging. Recorded as a checklist in the
implementation plan.

1. **Type-check + build:** `npm run build` succeeds.
2. **Lint:** `npm run lint` passes.
3. **Avenue Z client unaffected:** `/dashboard/avenue-z/reports` sidebar
   shows the exact same tabs as before (no Paid Media item, no extra group,
   no visual shift).
4. **Renaissance client unaffected:** same as above for
   `/dashboard/renaissance/reports`.
5. **Begin Health appears on the dashboard picker** with a "B" initial
   avatar and "7 reports configured" count.
6. **Begin Health sidebar order matches the other clients** with **Paid
   Media** inserted between Answer Engine Optimization and Web Analytics.
7. **Paid Media tab loads the embedded dashboard.** Editor password still
   works inside the iframe. PDF export still works (downloads a file).
8. **Other Begin Health tabs (AEO, Web Analytics, Inbound Funnel, Pipeline
   Performance) do not crash the route** — they render the existing
   error-boundary UI or empty state.
9. **Vercel preview deploy of the feature branch** passes verification 3–8
   end-to-end before merging to `main`.

## Deployment

1. Push `feat/begin-health-client` → Vercel auto-deploys a preview.
2. Thomas runs `npx tsx scripts/seed-begin-health.ts` against the
   **production** Neon DB (DATABASE_URL pointed at prod) — the platform
   uses one DB across local dev and prod per the existing pattern.
3. After preview verification, merge to `main` → Vercel deploys production.
4. Confirm production at `https://<prod-domain>/dashboard/begin-health/reports?section=paid-media`.

## Rollback

- **Revert the merge commit** on `main`. The schema is unchanged (no
  Drizzle migration), so revert leaves the DB in a consistent state.
- The `clients` row for Begin Health can stay (harmless — no route renders
  it once the slug is removed from `REPORT_NAMES`), or be deleted with a
  one-line SQL.
- `paid-media` entries in other clients' `hiddenReports` are also harmless
  once the slug is gone.

## Out of scope (explicitly)

- Touching Avenue Z's or Renaissance's report sections, configs, or data.
- Porting the begin-health-dashboard to React.
- Re-implementing the editor password as Auth.js roles.
- GA4/HubSpot/Peec wiring for Begin Health.
- Adding Begin Health client-side user accounts.
