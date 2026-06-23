# Persisted Supermetrics Dimension-Value Cache — Design

**Date:** 2026-06-23
**Status:** Approved (pending spec review)
**Relates to:** the Supermetrics dimension filters feature (`2026-06-23-supermetrics-dimension-filters-design.md`). That made dimension VALUES discoverable; this moves the slow discovery off the interactive path.

## Goal

Make Supermetrics dimension-value lookups in the builder **instant** by reading
from a persisted (DB) cache, and run the slow Supermetrics query that fills it
**off the click path** (on-demand button + a nightly cron re-warm). Today a
single value lookup is **30–128s** (a full SM data query) — slow enough to be
unusable interactively and to exceed request timeouts (the cause of the earlier
`Failed to fetch` crash).

## Background (measured)

- `smDimensions` (field list, metadata): **0.7s**.
- `smDimensionValues` (the values — a `fields=[column]` data query): **128s** over
  30 days, **36s** over 7 days. No "distinct values" shortcut exists in SM.
- The existing `getSmDimensionValues` server action runs this live on the
  interactive path → slow + timeout-prone.
- Existing infra to reuse: `app/api/cache-warm/route.ts` (cron-driven, auth via
  `Authorization: Bearer CRON_SECRET`, `maxDuration: 60`, parallel `Promise.all`)
  and `vercel.json` `crons`. A single Vercel function caps at 60s by default but
  Pro allows `maxDuration` up to 300s — enough for a 128s query.

## Scope

**In scope (v1):** persist **Supermetrics dimension VALUES only**; read them from
the DB in the builder; populate on-demand via a long-running route; keep fresh via
a nightly cron that re-warms already-cached rows.

**Out of scope (v1):** caching SM field/account lists (~0.7s, already fast) or any
TripleWhale discovery (fast `SELECT DISTINCT`); a fully async fire-and-forget
refresh with job status (v1's "Load values" runs synchronously); cache
invalidation UI beyond the cron + manual reload.

## Decisions (confirmed with user)

1. Cache **SM dimension values only**.
2. **On-demand populate + nightly cron re-warm** (the cache rows are the warm-list).
3. The "Load values" button **blocks ~1–2 min** the first time a dimension is
   loaded (acceptable one-time internal action; cron keeps it fresh after).
4. Cache key includes **`clientSlug`** (matches the read path; two clients sharing
   an account cache separately — accepted).

## Architecture

```
SmFilterRow (builder)
  pick dimension ─▶ getSmDimensionValues(slug, dsId, account, column)   [DB read, instant]
     cached  ─▶ value dropdown (+ "updated <relative>")
     miss    ─▶ free-text input + [Load values] button
                  └─▶ POST /api/discovery/sm-dimension-values  (button mode)
                        runs smDimensionValues (~128s) ─▶ upsert row ─▶ re-read ─▶ dropdown

cron (vercel.json, nightly)
  GET /api/discovery/sm-dimension-values  (cron mode, Bearer CRON_SECRET)
    select rows where fetchedAt < now-24h ─▶ refresh in parallel ─▶ upsert
```

## Components & Interfaces

### DB table — `lib/db/schema.ts` (MODIFY) + migration
```ts
export const smDimensionValueCache = pgTable('sm_dimension_value_cache', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientSlug: text('client_slug').notNull(),
  dsId: text('ds_id').notNull(),
  account: text('account').notNull(),
  column: text('column').notNull(),
  values: jsonb('values').$type<string[]>().notNull(),
  fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique().on(t.clientSlug, t.dsId, t.account, t.column)])
```
Generate the Drizzle migration and commit it under `/drizzle`.

### Query helpers — `lib/db/queries.ts` (MODIFY)
- `getCachedSmDimensionValues(slug, dsId, account, column): Promise<{ values: string[]; fetchedAt: Date } | null>` — single-row read by the unique key.
- `upsertSmDimensionValues(slug, dsId, account, column, values): Promise<void>` — `insert … onConflictDoUpdate` setting `values` + `fetchedAt = now`.
- `listStaleSmDimensionCacheRows(olderThan: Date): Promise<Row[]>` — rows with `fetchedAt < olderThan` (for the cron).

### Read action — `app/actions/dashboard.ts` (MODIFY `getSmDimensionValues`)
Replace the live-query body with a DB read:
```ts
export async function getSmDimensionValues(slug, dsId, account, column):
  Promise<{ ok: true; values: string[]; fetchedAt: string | null; cached: boolean } | { ok: false; error: string }>
```
- Same auth gate (`auth` + `canEditDashboard`).
- Read via `getCachedSmDimensionValues`. Hit → `{ ok:true, values, fetchedAt, cached:true }`.
  Miss → `{ ok:true, values: [], fetchedAt: null, cached:false }`. Never runs SM live.

### Refresh route — `app/api/discovery/sm-dimension-values/route.ts` (NEW), `maxDuration = 300`
Two modes, mirroring `cache-warm`'s auth handling:
- **Button mode** — request carries a logged-in session. Body `{ slug, dsId, account, column }`.
  Gate with `auth` + `canEditDashboard(slug)`. Resolve the SM key (`resolveSmApiKey`),
  run `smDimensionValues(apiKey, dsId, account, column, last30dRange)`, `upsertSmDimensionValues`,
  return `{ ok:true, values }`. On error → `{ ok:false, error }` (never throws).
- **Cron mode** — `Authorization: Bearer ${CRON_SECRET}`. No body. `listStaleSmDimensionCacheRows(now-24h)`,
  refresh each in **parallel** (`Promise.all`), resolving the SM key per row's `clientSlug`,
  upserting results; return a summary `{ refreshed, failed }`. Bounded by `maxDuration: 300`;
  failures per-row are logged and skipped, not fatal.
- Distinguish modes by presence of a valid `CRON_SECRET` bearer (cron) vs a session (button).

### Cron registration — `vercel.json` (MODIFY)
Add a daily entry:
```json
{ "path": "/api/discovery/sm-dimension-values", "schedule": "0 7 * * *" }
```

### UI — `components/dashboard/add-block/leaf-builder.tsx` (`SmFilterRow`, MODIFY)
- On dimension pick → `getSmDimensionValues` (DB read).
- `cached:true` → value `SearchCombobox` from `values`; show a subtle "updated <relative from fetchedAt>".
- `cached:false` → free-text value `input` + a **"Load values"** button. Click → `fetch('/api/discovery/sm-dimension-values', { method:'POST', body })` (spinner, "~1–2 min"), then re-call `getSmDimensionValues` → swap to the dropdown. Free-text stays editable while loading.
- Wrap calls in try/catch (already the pattern) so a failure degrades to free-text, never crashes.

## Data Flow

build a filter → pick dimension → DB read (instant). First time for that
(slug,dsId,account,column): free-text + Load values → 300s route runs the live SM
query once → row upserted → dropdown. Thereafter: instant DB read for everyone;
nightly cron refreshes rows older than 24h.

## Error / Loading / Empty States

- DB read fail → `{ ok:false }` → free-text fallback (no crash).
- Refresh (button) fail/timeout → error message on the row; free-text remains; row not written.
- Cron per-row failure → logged, skipped; other rows still refresh.
- Dimension with no data → empty `values` cached (valid result); UI shows "no values" + free-text.

## Testing

Env-free pure `tsx`/`node:assert` tests where logic is pure:
- A `selectStaleRows(rows, now, ttlMs)` helper (or the predicate) — pure, tested.
- The button/cron **mode-discrimination** helper (given headers → 'cron' | 'session' | 'unauthorized') — pure, tested.
DB query helpers + the route + UI are verified by `tsc` + `npm run build` + manual,
consistent with how `lib/db/queries.ts` and `app/api/*` are handled in this repo
(no env-bound unit tests). The migration is verified by `drizzle-kit` generate +
a successful build.

## File Structure
```
lib/db/
  schema.ts                    # MODIFY: + smDimensionValueCache table
  queries.ts                   # MODIFY: + get/upsert/listStale helpers
drizzle/
  <generated>.sql              # NEW: migration (committed)
app/actions/
  dashboard.ts                 # MODIFY: getSmDimensionValues -> DB read
app/api/discovery/sm-dimension-values/
  route.ts                     # NEW: button + cron refresh (maxDuration 300)
components/dashboard/add-block/
  leaf-builder.tsx             # MODIFY: SmFilterRow read-from-cache + Load values
vercel.json                    # MODIFY: + daily cron
```

## Global Constraints
- TypeScript strict; no `any` in new files.
- All Supermetrics calls server-side only; `smDimensionValues` runs only in the
  refresh route (server), never the interactive read path.
- Reuse: `smDimensionValues` (`@/lib/supermetrics/discovery`), `resolveSmApiKey`,
  `getClientBySlug`/`parseDateRange`, `auth` + `canEditDashboard`, the `db`
  client + Drizzle, the `cache-warm` route's `CRON_SECRET` auth pattern,
  `SearchCombobox`.
- SQL/filter safety unchanged: `smDimensionValues` already sanitizes the column.
- No new npm dependency.
- Migration committed to `/drizzle` (per repo convention).
