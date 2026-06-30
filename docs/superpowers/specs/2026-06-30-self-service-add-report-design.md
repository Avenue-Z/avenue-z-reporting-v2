# Self-service "Add new report" — Design

**Date:** 2026-06-30
**Status:** Approved (design); pending implementation plan
**Branch:** `feat/self-service-add-report`

## Summary

Let any internal Avenue Z staff member stand up a new client dashboard end-to-end
from the Reporting tool hub, with no code change or DB edit. From
`/tools/reporting`, an **"Add new report"** card opens a modal where the user
enters a **client name** and a **TripleWhale shop ID** (`*.myshopify.com`). On
submit we validate the shop against TripleWhale, provision (create or fill in)
the client row, install a **TripleWhale-only starter dashboard**, and redirect to
the new dashboard. The hub lists every client dashboard dynamically, so newly
created ones appear immediately.

First clients to onboard this way: **Begin Health, Elix, Lovebug** (we already
have their TripleWhale data). They are examples of the self-service flow, not a
hardcoded list.

## Goals

- Fully self-service: a user provides a TripleWhale shop ID and the DB is updated
  accordingly — no manual SQL, no redeploy.
- The new dashboard renders real data immediately (TripleWhale-only, using metrics
  verified to return data).
- Never clobber an existing built dashboard.

## Non-goals

- Shopify-direct or GA4/Supermetrics blocks in the starter template. The named
  clients only have TripleWhale connected, so the template is TW-only. (Kind
  Patches' Shopify/GA4 blocks are not reused.)
- Editing or deleting clients from the UI (separate concern).
- A dynamic TripleWhale shop picker / discovery. The user supplies the shop ID
  directly. (Could be a later enhancement.)
- Creating `users` rows. The dashboard is an internal-staff view; a `clients` row
  is sufficient for it to render.

## Context (current state)

- **Reporting hub** `/tools/reporting` is rendered by the generic
  `app/tools/[teamSlug]/page.tsx`, driven by the static `TEAMS` constant in
  `lib/constants.ts` (one hardcoded card → Kind Patches).
- **Dashboards** live per-client in `clients.dashboardConfig` (jsonb), rendered at
  `/dashboard/[clientSlug]/configurable-dashboard`.
- **Clients in DB today:** `begin-health`, `renaissance`, `avenue-z`,
  `kind-patches`. Elix and Lovebug do not exist yet; Begin Health exists but has
  no `triplewhaleShopId` and no dashboard.
- **TripleWhale wiring:** `clients.triplewhaleShopId` (a `*.myshopify.com` domain)
  + a shared `TRIPLE_WHALE_API_KEY` env var. The TW adapter
  (`lib/dashboard/adapters/triplewhale.ts`) resolves the shop ID per request from
  `getClientBySlug(ctx.slug)` — so dashboard block configs never embed the shop ID.
- **`/tools`** is auth-guarded by `proxy.ts`.

## Approach (chosen)

**Dynamic reporting hub + modal form.** A dedicated `/tools/reporting` route reads
the client list from the DB and renders dashboard cards + the Add card; the Add
card opens a modal that calls a server action. Chosen over a full-page form (extra
navigation) and over keeping the static hub (would not be self-service — new
dashboards wouldn't appear without editing `TEAMS`).

## Architecture & components

### Routing
- **`app/tools/reporting/page.tsx`** (NEW, Server Component). A static `reporting`
  segment takes precedence over the dynamic `[teamSlug]`, so this overrides the
  generic team page for Reporting only; AEO and other teams keep the generic page.
  - Reads `getClientsWithDashboards()`.
  - Renders one card per dashboard → `/dashboard/[slug]/configurable-dashboard`,
    plus the "Add new report" card (gated to internal staff).
  - The `/tools` team-list card for Reporting continues to link here.

### Components
- **`components/dashboard/add-report/add-report-card.tsx`** (client) — the dashed
  "Add new report" card; opens the modal.
- **`components/dashboard/add-report/add-report-dialog.tsx`** (client) —
  `createPortal` modal (same pattern as `share-dialog.tsx` / `add-block-dialog.tsx`)
  with two fields: **Client name**, **TripleWhale shop ID**. Submit calls the
  action via `useTransition`; shows inline validation errors; on `ok` redirects
  with `router.push(url)`; on `code:'exists'` shows "already has a report — open
  it instead" linking to the existing dashboard.

### Server action
- **`app/actions/reports.ts`** → `createClientReport({ name, triplewhaleShopId })`.

### Pure helpers
- **`lib/dashboard/starter-template.ts`** → `buildStarterTemplate(): DashboardConfig`
  (client-agnostic; pure; unit-testable).
- **slugify** helper (`"Love Bug"` → `love-bug`), reused/added near the dashboard
  helpers.

### Queries
- **`lib/db/queries.ts`** → `getClientsWithDashboards()` returning `{ slug, name,
  logoUrl }` for clients where `dashboardConfig IS NOT NULL`, sorted by name.

## `createClientReport` — behavior

Input: `{ name: string, triplewhaleShopId: string }`. Returns a discriminated
result: `{ ok: true, url }` | `{ ok: false, error }` | `{ ok: false, code: 'exists', url }`.

1. **Auth.** `auth()`; require internal staff. `permissions.ts` currently keeps
   `INTERNAL_ROLES` private and only exports `canEditDashboard(role, clientSlug,
   targetSlug)` (which needs a target client that doesn't exist yet at creation
   time). Add and export `isInternalStaff(role: string): boolean` (the
   `INTERNAL_ROLES.has(role)` check) and use it here. Reject non-internal.
2. **Validate input.** `name` non-empty (trimmed); `triplewhaleShopId` matches the
   `*.myshopify.com` pattern (reuse `isValidShop` from `lib/shopify/oauth.ts`).
3. **TripleWhale probe.** Run `twSql` for `ad_spend` over the last 30 days with the
   given shop ID. Success with a numeric value (≥ 0) → valid. Error or empty →
   return `{ ok:false, error:'No TripleWhale data for that shop ID. Check the shop and try again.' }`
   and write nothing. (Best-effort: confirms the shop is reachable under our TW
   account; a valid shop with genuinely zero recent spend still passes because the
   call returns a number.)
4. **Resolve slug.** `slug = slugify(name)`.
5. **Upsert with guardrail** (look up existing by slug):
   - **No existing client** → insert a new `clients` row: `slug`, `name`,
     `triplewhaleShopId`, `dashboardConfig = template`. NOT-NULL columns rely on
     schema defaults (`enabledReports` → set `[]`; `hiddenReports` default `[]`;
     `maxSeats` default `5`).
   - **Exists, `dashboardConfig` null** → update: set `triplewhaleShopId` and
     `dashboardConfig = template`. (Begin Health case.)
   - **Exists, `dashboardConfig` present** → return `{ ok:false, code:'exists',
     url }`. Never overwrite.
6. **Persist.** Validate `template` through `parseDashboardConfig` before writing
   (guards against template drift). `revalidateTag('db','max')`; revalidate the
   hub + new dashboard path.
7. Return `{ ok:true, url: '/dashboard/<slug>/configurable-dashboard' }`.

## TripleWhale starter template (`buildStarterTemplate`)

All data blocks `source:'triplewhale'`, metrics verified to return real data.
Static header blocks use the `__static__` sentinel binding (as in
`scripts/seed-kind-patches-dashboard.ts`). Client-agnostic: the shop ID is
resolved per-request by the TW adapter, so the same template serves every client.
No channel filter (show all channels).

| Block | Kind | Metric / binding | Format |
|---|---|---|---|
| Paid Media Overview | header (h1) | `__static__` | — |
| Total Ad Spend | kpi | `ad_spend` | currency |
| Blended ROAS | kpi | `blended_roas` | multiple |
| Revenue | kpi | `revenue` | currency |
| Purchases | kpi | `purchases` | count |
| CPA | kpi | `cpa` | currency |
| Conversion Rate | kpi | `conv_rate` | percent |
| Sessions | kpi | `sessions` | count |
| Clicks | kpi | `clicks` | count |
| Spend by Channel | header (h2) | `__static__` | — |
| Spend by Channel | bar | `ad_spend`, dim `channel` | currency |
| Channel Performance | header (h2) | `__static__` | — |
| Channel ROAS | table | `blended_roas`, dim `channel` | multiple |

`defaultRange`: `last_30_days`, compare `previous_period` (matches Kind Patches).
Layout: positioned on the 12-col grid (KPIs 4-per-row at w:3 h:2; headers full
width; bar w:6 h:4; table w:6 h:5).

## Permissions

- The Add card and the server action are gated to **internal staff**
  (`INTERNAL_ADMIN` + `INTERNAL_ANALYST`) via the new `isInternalStaff(role)`
  helper, consistent with `canEditDashboard` treating all internal staff as
  editors. Client roles never see the card; the action re-checks server-side.

## Error handling & edge cases

- Invalid shop format → inline modal error; nothing written.
- Failed/empty TW probe → inline error; nothing written.
- Existing dashboard for the slug → non-destructive "already has a report — open
  instead" with a link.
- Pending state during submit (TW probe bounded by the existing 15s `twSql`
  timeout).
- Duplicate slug from a genuinely different brand name that slugifies the same →
  the unique `slug` constraint guards it; surface a friendly error.

## Testing

- **`lib/dashboard/starter-template.test.ts`** — `buildStarterTemplate()` passes
  `parseDashboardConfig`; expected block count and kinds; every data block is
  `source:'triplewhale'`.
- **slugify test** — `"Love Bug"` → `love-bug`; trims/lowercases/strips punctuation.
- **Manual smoke** — provision Elix and Lovebug via the modal against live
  credentials; confirm each dashboard renders real TW data and appears on the hub;
  confirm re-adding Begin Health fills the gap and re-adding a client with a
  dashboard shows the "open instead" path.

## Out-of-scope / future

- Dynamic TripleWhale shop discovery (auto-suggest shop IDs).
- Adding Shopify-direct / GA4 blocks once those connections exist for a client.
- Editing/removing clients and dashboards from the hub.
