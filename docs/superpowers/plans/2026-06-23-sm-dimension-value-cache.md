# Persisted SM Dimension-Value Cache Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Supermetrics dimension-value lookups in the builder instant by reading from a DB cache, and move the slow (~128s) SM query off the click path into an on-demand + cron-refreshed route.

**Architecture:** A new `sm_dimension_value_cache` table holds values keyed by `(clientSlug, dsId, account, column)`. `getSmDimensionValues` becomes a DB read (instant). A `maxDuration: 300` route runs the live query in two modes — POST (session "Load values" button, refresh one) and GET (cron `CRON_SECRET`, refresh all stale rows in parallel) — upserting results. The builder shows a dropdown when cached, else free-text + a "Load values" button.

**Tech Stack:** Next.js App Router (route handler + server action), Neon Postgres + Drizzle, the existing `cache-warm` cron/`CRON_SECRET` pattern, `tsx` + `node:assert` for pure tests. No new dependencies.

## Global Constraints

- TypeScript strict; **no `any`** in new files.
- All Supermetrics calls server-side only; `smDimensionValues` (the ~128s query) runs **only in the refresh route**, never on the interactive read path.
- Reuse: `smDimensionValues` (`@/lib/supermetrics/discovery`), `resolveSmApiKey` (`@/lib/dashboard/adapters/supermetrics`), `getClientBySlug` + `parseDateRange`, `auth` (`@/auth`) + `canEditDashboard`, the Drizzle `db` client, the `cache-warm` route's `CRON_SECRET` auth pattern, `SearchCombobox`.
- Migration committed to `/drizzle` (repo convention). **Do not run `db:migrate`** in a task — applying to Neon is a controller step after review (additive new table).
- Pure-logic tests env-free: `npx tsx <file>.test.ts`, `node:assert` strict, final `console.log('ok')`. DB helpers, route, and UI: no env-bound unit tests — verified by `tsc` (+ build), consistent with `lib/db/queries.ts` / `app/api/*`.
- Commit per task with the message shown; **path-scope each commit** (`git commit -- <files>`).

---

## Inter-Component Dependency Map

```
  T1 DB layer                              T3 cron-auth helper (pure)
  (schema table + migration + queries)     (isValidCronAuth + test)
       │            │                              │
       ▼            ▼                              │
  T2 read action   ────────────────┐              │
  (getSmDimensionValues → DB read)  │              │
                                    ▼              ▼
                              T4 refresh route (POST button + GET cron) + vercel.json cron
                              (needs T1 query helpers + T3 auth helper)
       │                            │
       └─────────────┬──────────────┘
                     ▼  (getSmDimensionValues read + POST the route)
              T5 SmFilterRow UI (read-from-cache + "Load values")
              (needs T2, T4)
```

**Edges = imports/consumes.** T2←T1. T4←T1,T3. T5←T2,T4.

### Parallelization waves

| Wave | Tasks (parallel, disjoint files) | Unblocked by |
|---|---|---|
| 0 | **T1 DB layer**, **T3 cron-auth helper** | nothing |
| 1 | **T2 read action** (←T1), **T4 refresh route** (←T1,T3) | wave 0 |
| 2 | **T5 UI** (←T2,T4) | wave 1 |

---

## File Structure
```
lib/db/
  schema.ts                                   # MODIFY: + smDimensionValueCache table (+ `unique` import)
  queries.ts                                  # MODIFY: + get/upsert/listStale helpers (+ and/lt imports)
drizzle/
  0010_<generated>.sql                        # NEW: migration (committed; NOT applied in-task)
lib/dashboard/
  discovery-refresh.ts                        # NEW: isValidCronAuth (pure) + SM_DIM_CACHE_TTL_MS
  discovery-refresh.test.ts                   # NEW
app/actions/
  dashboard.ts                                # MODIFY: getSmDimensionValues -> DB read
app/api/discovery/sm-dimension-values/
  route.ts                                    # NEW: POST (button) + GET (cron), maxDuration 300
vercel.json                                   # MODIFY: + daily cron
components/dashboard/add-block/
  leaf-builder.tsx                            # MODIFY: SmFilterRow read-from-cache + Load values
```

---

## Task 1: DB layer — cache table + query helpers (`lib/db/schema.ts`, `lib/db/queries.ts`)

**Files:** Modify `lib/db/schema.ts`, `lib/db/queries.ts`; generate + commit a `/drizzle` migration.

**Interfaces:**
- Produces: `smDimensionValueCache` table; `getCachedSmDimensionValues(slug, dsId, account, column): Promise<{ values: string[]; fetchedAt: Date } | null>`; `upsertSmDimensionValues(slug, dsId, account, column, values): Promise<void>`; `listStaleSmDimensionCacheRows(olderThan: Date): Promise<{ clientSlug: string; dsId: string; account: string; column: string }[]>`.

**Note:** DB code — verified by `tsc` + migration generation (no env-bound unit test). Do not run `db:migrate`.

- [ ] **Step 1: Add the table** — in `lib/db/schema.ts`, add `unique` to the pg-core import and define the table (place it after the `users` table):

```ts
// import line becomes:
import { pgTable, uuid, text, jsonb, timestamp, pgEnum, index, boolean, unique } from 'drizzle-orm/pg-core'

// new table:
export const smDimensionValueCache = pgTable('sm_dimension_value_cache', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientSlug: text('client_slug').notNull(),
  dsId: text('ds_id').notNull(),
  account: text('account').notNull(),
  column: text('column').notNull(),
  values: jsonb('values').$type<string[]>().notNull(),
  fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique('sm_dim_cache_key').on(t.clientSlug, t.dsId, t.account, t.column)])
```

- [ ] **Step 2: Generate the migration**

Run: `npm run db:generate`
Expected: a new `drizzle/0010_*.sql` creating `sm_dimension_value_cache` with the unique constraint. (Do NOT run `db:migrate`.)

- [ ] **Step 3: Add query helpers** — in `lib/db/queries.ts`, extend the imports and append the helpers:

```ts
// imports: add `and, lt` (eq already present) and the new table
import { eq, and, lt } from 'drizzle-orm'
import { clients, users, smDimensionValueCache, type Client, type User, type ClientRole } from './schema'

/** Cached distinct values for one SM dimension (per client/dsId/account). null if not cached. */
export async function getCachedSmDimensionValues(
  slug: string, dsId: string, account: string, column: string,
): Promise<{ values: string[]; fetchedAt: Date } | null> {
  const row = await db
    .select({ values: smDimensionValueCache.values, fetchedAt: smDimensionValueCache.fetchedAt })
    .from(smDimensionValueCache)
    .where(and(
      eq(smDimensionValueCache.clientSlug, slug),
      eq(smDimensionValueCache.dsId, dsId),
      eq(smDimensionValueCache.account, account),
      eq(smDimensionValueCache.column, column),
    ))
    .limit(1)
  return row[0] ?? null
}

/** Insert-or-update the cached values, stamping fetchedAt = now. */
export async function upsertSmDimensionValues(
  slug: string, dsId: string, account: string, column: string, values: string[],
): Promise<void> {
  await db
    .insert(smDimensionValueCache)
    .values({ clientSlug: slug, dsId, account, column, values })
    .onConflictDoUpdate({
      target: [smDimensionValueCache.clientSlug, smDimensionValueCache.dsId, smDimensionValueCache.account, smDimensionValueCache.column],
      set: { values, fetchedAt: new Date() },
    })
}

/** Cache rows older than `olderThan` (the cron re-warm list). */
export async function listStaleSmDimensionCacheRows(
  olderThan: Date,
): Promise<{ clientSlug: string; dsId: string; account: string; column: string }[]> {
  return db
    .select({
      clientSlug: smDimensionValueCache.clientSlug,
      dsId: smDimensionValueCache.dsId,
      account: smDimensionValueCache.account,
      column: smDimensionValueCache.column,
    })
    .from(smDimensionValueCache)
    .where(lt(smDimensionValueCache.fetchedAt, olderThan))
}
```

- [ ] **Step 4: Type-check gate**

Run: `npx tsc --noEmit 2>&1 | grep -E "lib/db/(schema|queries)" || echo "db ok"`
Expected: `db ok`

- [ ] **Step 5: Commit**

```bash
git add lib/db/schema.ts lib/db/queries.ts drizzle/
git commit -m "feat(db): sm_dimension_value_cache table + query helpers" -- lib/db/schema.ts lib/db/queries.ts drizzle/
```

---

## Task 3: Cron-auth helper (`lib/dashboard/discovery-refresh.ts`)

**Files:** Create `lib/dashboard/discovery-refresh.ts`, `lib/dashboard/discovery-refresh.test.ts`.

**Interfaces:**
- Produces: `SM_DIM_CACHE_TTL_MS` (number); `isValidCronAuth(authHeader: string | null, cronSecret: string | undefined): boolean`.

- [ ] **Step 1: Write the failing test** — create `lib/dashboard/discovery-refresh.test.ts`:

```ts
// Run: npx tsx lib/dashboard/discovery-refresh.test.ts
import { strict as assert } from 'node:assert'
import { isValidCronAuth, SM_DIM_CACHE_TTL_MS } from './discovery-refresh'

// valid only when secret is set AND header matches exactly
assert.equal(isValidCronAuth('Bearer s3cret', 's3cret'), true)
assert.equal(isValidCronAuth('Bearer wrong', 's3cret'), false)
assert.equal(isValidCronAuth('s3cret', 's3cret'), false)            // missing "Bearer "
assert.equal(isValidCronAuth(null, 's3cret'), false)
assert.equal(isValidCronAuth('Bearer s3cret', undefined), false)    // no secret configured
assert.equal(isValidCronAuth('Bearer ', ''), false)                 // empty secret never valid
assert.equal(SM_DIM_CACHE_TTL_MS, 24 * 60 * 60 * 1000)
console.log('ok')
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx lib/dashboard/discovery-refresh.test.ts`
Expected: FAIL with `Cannot find module './discovery-refresh'`

- [ ] **Step 3: Implement** — create `lib/dashboard/discovery-refresh.ts`:

```ts
/** Re-warm cache rows older than this. */
export const SM_DIM_CACHE_TTL_MS = 24 * 60 * 60 * 1000

/** True iff a cron secret is configured and the Authorization header matches `Bearer <secret>`. */
export function isValidCronAuth(authHeader: string | null, cronSecret: string | undefined): boolean {
  if (!cronSecret) return false
  return authHeader === `Bearer ${cronSecret}`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx lib/dashboard/discovery-refresh.test.ts`
Expected: `ok`

- [ ] **Step 5: Commit**

```bash
git add lib/dashboard/discovery-refresh.ts lib/dashboard/discovery-refresh.test.ts
git commit -m "feat(dashboard): cron-auth helper for discovery refresh" -- lib/dashboard/discovery-refresh.ts lib/dashboard/discovery-refresh.test.ts
```

---

## Task 2: Read action → DB cache (`app/actions/dashboard.ts`)

**Files:** Modify `app/actions/dashboard.ts`.

**Interfaces:**
- Consumes: `getCachedSmDimensionValues` (T1).
- Produces: `getSmDimensionValues(slug, dsId, account, column): Promise<{ ok: true; values: string[]; fetchedAt: string | null; cached: boolean } | { ok: false; error: string }>` (now a DB read).

**Note:** tsc-gated. The old live-query version of this action is fully replaced.

- [ ] **Step 1: Add the import** — in `app/actions/dashboard.ts`, add `getCachedSmDimensionValues` to the existing `@/lib/db/queries` import (which already imports `getClientBySlug`).

- [ ] **Step 2: Replace `getSmDimensionValues`** — replace the entire existing `getSmDimensionValues` function with the DB-read version:

```ts
/** Cached SM dimension values (DB read, instant). Population happens out-of-band
 *  via /api/discovery/sm-dimension-values. `cached:false` means not yet populated. */
export async function getSmDimensionValues(
  slug: string,
  dsId: string,
  account: string,
  column: string,
): Promise<{ ok: true; values: string[]; fetchedAt: string | null; cached: boolean } | { ok: false; error: string }> {
  const session = await auth()
  if (!session?.user) return { ok: false, error: 'unauthenticated' }
  if (!canEditDashboard(session.user.role, session.user.clientSlug, slug)) return { ok: false, error: 'forbidden' }
  try {
    const row = await getCachedSmDimensionValues(slug, dsId, account, column)
    if (!row) return { ok: true, values: [], fetchedAt: null, cached: false }
    return { ok: true, values: row.values, fetchedAt: row.fetchedAt.toISOString(), cached: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'cache read failed' }
  }
}
```

(Leave `getSmDimensions` and the rest unchanged. `smDimensionValues`/`parseDateRange`/`resolveSmApiKey` imports may now be unused *by this action* — they are still used by `getSmDimensions`/other actions, so do not remove them unless `tsc` flags them unused.)

- [ ] **Step 3: Type-check gate**

Run: `npx tsc --noEmit 2>&1 | grep "app/actions/dashboard" || echo "actions ok"`
Expected: `actions ok`

- [ ] **Step 4: Commit**

```bash
git add app/actions/dashboard.ts
git commit -m "feat(dashboard): getSmDimensionValues reads from cache" -- app/actions/dashboard.ts
```

---

## Task 4: Refresh route + cron (`app/api/discovery/sm-dimension-values/route.ts`, `vercel.json`)

**Files:** Create `app/api/discovery/sm-dimension-values/route.ts`; modify `vercel.json`.

**Interfaces:**
- Consumes: `auth` (`@/auth`), `canEditDashboard` (`@/lib/dashboard/permissions`), `getClientBySlug` (`@/lib/db/queries`), `upsertSmDimensionValues` + `listStaleSmDimensionCacheRows` (T1), `resolveSmApiKey` (`@/lib/dashboard/adapters/supermetrics`), `smDimensionValues` (`@/lib/supermetrics/discovery`), `parseDateRange` (`@/lib/ga4/client`), `isValidCronAuth` + `SM_DIM_CACHE_TTL_MS` (T3).
- Produces: `POST` (button: refresh one) and `GET` (cron: refresh stale) handlers; `maxDuration = 300`.

**Note:** server route — verified by `tsc` + build (no env-bound unit test; the cron-auth + discovery parsing are covered by their own tasks).

- [ ] **Step 1: Write the route** — create `app/api/discovery/sm-dimension-values/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { canEditDashboard } from '@/lib/dashboard/permissions'
import { getClientBySlug, upsertSmDimensionValues, listStaleSmDimensionCacheRows } from '@/lib/db/queries'
import { resolveSmApiKey } from '@/lib/dashboard/adapters/supermetrics'
import { smDimensionValues } from '@/lib/supermetrics/discovery'
import { parseDateRange } from '@/lib/ga4/client'
import { isValidCronAuth, SM_DIM_CACHE_TTL_MS } from '@/lib/dashboard/discovery-refresh'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

async function refreshOne(slug: string, dsId: string, account: string, column: string): Promise<void> {
  const apiKey = resolveSmApiKey((await getClientBySlug(slug))?.smApiKeyEnvVar, process.env)
  if (!apiKey) throw new Error('disconnected')
  const { startDate, endDate } = parseDateRange('last_30_days')
  const values = await smDimensionValues(apiKey, dsId, account, column, { startDate, endDate })
  await upsertSmDimensionValues(slug, dsId, account, column, values)
}

/** Button mode: refresh one dimension for a logged-in editor. */
export async function POST(req: Request): Promise<Response> {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 })
  const body = (await req.json()) as { slug?: unknown; dsId?: unknown; account?: unknown; column?: unknown }
  const { slug, dsId, account, column } = body
  if (typeof slug !== 'string' || typeof dsId !== 'string' || typeof account !== 'string' || typeof column !== 'string') {
    return NextResponse.json({ ok: false, error: 'bad request' }, { status: 400 })
  }
  if (!canEditDashboard(session.user.role, session.user.clientSlug, slug)) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  }
  try {
    await refreshOne(slug, dsId, account, column)
    const { getCachedSmDimensionValues } = await import('@/lib/db/queries')
    const row = await getCachedSmDimensionValues(slug, dsId, account, column)
    return NextResponse.json({ ok: true, values: row?.values ?? [] })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'refresh failed' }, { status: 200 })
  }
}

/** Cron mode: re-warm all rows older than the TTL, in parallel. */
export async function GET(req: Request): Promise<Response> {
  if (!isValidCronAuth(req.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }
  const stale = await listStaleSmDimensionCacheRows(new Date(Date.now() - SM_DIM_CACHE_TTL_MS))
  const results = await Promise.allSettled(stale.map((r) => refreshOne(r.clientSlug, r.dsId, r.account, r.column)))
  const refreshed = results.filter((r) => r.status === 'fulfilled').length
  return NextResponse.json({ ok: true, refreshed, failed: results.length - refreshed })
}
```

- [ ] **Step 2: Register the cron** — in `vercel.json`, add a daily entry to the `crons` array:

```json
{ "path": "/api/discovery/sm-dimension-values", "schedule": "0 7 * * *" }
```

- [ ] **Step 3: Type-check gate**

Run: `npx tsc --noEmit 2>&1 | grep "api/discovery/sm-dimension-values" || echo "route ok"`
Expected: `route ok`

- [ ] **Step 4: Commit**

```bash
git add app/api/discovery/sm-dimension-values/route.ts vercel.json
git commit -m "feat(dashboard): SM dimension-value refresh route (button + cron)" -- app/api/discovery/sm-dimension-values/route.ts vercel.json
```

---

## Task 5: Builder UI — read cache + Load values (`components/dashboard/add-block/leaf-builder.tsx`)

**Files:** Modify `components/dashboard/add-block/leaf-builder.tsx` (the `SmFilterRow` component).

**Interfaces:**
- Consumes: `getSmDimensionValues` (T2, now returns `{ values, fetchedAt, cached }`); the refresh route `POST /api/discovery/sm-dimension-values` (T4); `SearchCombobox`, `ComboOption`, `ctrl` (existing).

**Note:** UI — verified by `tsc` + the full pure-test suite + manual.

- [ ] **Step 1: Rewrite `SmFilterRow`** — replace the existing `SmFilterRow` component body with the cache-aware version (read from cache; if not cached, free-text + a "Load values" button that POSTs the refresh route, then re-reads):

```tsx
function SmFilterRow({
  filter,
  dimensions,
  slug,
  dsId,
  account,
  onChange,
  onRemove,
}: {
  filter: { column: string; value: string }
  dimensions: ComboOption[]
  slug: string
  dsId: string
  account: string
  onChange: (f: { column: string; value: string }) => void
  onRemove: () => void
}) {
  const [values, setValues] = useState<ComboOption[]>([])
  const [cached, setCached] = useState(false)
  const [loading, startLoad] = useTransition()
  const [refreshing, setRefreshing] = useState(false)

  const read = () => {
    if (filter.column === '' || account === '') { setValues([]); setCached(false); return }
    startLoad(async () => {
      try {
        const r = await getSmDimensionValues(slug, dsId, account, filter.column)
        if (r.ok && r.cached) { setValues(r.values.map((v) => ({ value: v, label: v }))); setCached(true) }
        else { setValues([]); setCached(false) }
      } catch { setValues([]); setCached(false) }
    })
  }

  useEffect(read, [filter.column, slug, dsId, account])

  const loadValues = async () => {
    if (filter.column === '' || account === '') return
    setRefreshing(true)
    try {
      await fetch('/api/discovery/sm-dimension-values', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, dsId, account, column: filter.column }),
      })
    } catch { /* fall through to re-read */ }
    setRefreshing(false)
    read()
  }

  return (
    <div className="flex items-center gap-2">
      <SearchCombobox
        value={filter.column}
        options={dimensions}
        placeholder="Dimension"
        onChange={(column) => onChange({ column, value: '' })}
      />
      {cached ? (
        <SearchCombobox
          value={filter.value}
          options={values}
          disabled={filter.column === '' || account === ''}
          loading={loading}
          placeholder="Value"
          onChange={(v) => onChange({ column: filter.column, value: v })}
        />
      ) : (
        <div className="flex flex-1 items-center gap-2">
          <input
            className={ctrl}
            value={filter.value}
            onChange={(e) => onChange({ column: filter.column, value: e.target.value })}
            placeholder="Value (type, or load)"
          />
          <button
            type="button"
            onClick={loadValues}
            disabled={refreshing || filter.column === '' || account === ''}
            className="shrink-0 rounded-md border border-white/10 px-2 py-1.5 text-xs text-white/70 hover:bg-white/[0.06] disabled:opacity-40"
          >
            {refreshing ? 'Loading… (~1–2 min)' : 'Load values'}
          </button>
        </div>
      )}
      <button type="button" onClick={onRemove} className="text-text-muted hover:text-white" aria-label="Remove filter">✕</button>
    </div>
  )
}
```

- [ ] **Step 2: Type-check + full pure-test suite**

Run:
```bash
npx tsc --noEmit 2>&1 | grep -E "leaf-builder|add-block|lib/db|app/actions/dashboard|discovery" || echo "no new type errors"
npx tsx lib/dashboard/discovery-refresh.test.ts
npx tsx lib/supermetrics/discovery.test.ts
npx tsx components/dashboard/add-block/build-config.test.ts
```
Expected: `no new type errors`, and all tests print `ok`.

- [ ] **Step 3: Production build**

Run: `npm run build 2>&1 | tail -5`
Expected: build completes; the `configurable-dashboard` route + the new API route compile.

- [ ] **Step 4: Commit**

```bash
git add components/dashboard/add-block/leaf-builder.tsx
git commit -m "feat(dashboard): SM filter values read from cache + Load values button" -- components/dashboard/add-block/leaf-builder.tsx
```

---

## Post-implementation (controller, not a task)
- Apply the migration to Neon: `npm run db:migrate` (creates `sm_dimension_value_cache`).
- Ensure `CRON_SECRET` is set in the environment (already used by `cache-warm`).

## Self-Review

**Spec coverage** (against `2026-06-23-sm-dimension-value-cache-design.md`):
- Cache table keyed `(clientSlug,dsId,account,column)` + migration → T1. ✅
- DB query helpers (get/upsert/listStale) → T1. ✅
- `getSmDimensionValues` → DB read with `cached` flag → T2. ✅
- Refresh route, `maxDuration 300`, POST button (session+`canEditDashboard`, refresh one) + GET cron (`CRON_SECRET`, parallel stale refresh) → T4. ✅
- Cron registration in `vercel.json` → T4. ✅
- Pure cron-auth helper, unit-tested → T3. ✅
- UI: cached→dropdown, miss→free-text + "Load values" → T5. ✅
- `smDimensionValues` runs only in the route; resilience/try-catch in UI → T4/T5. ✅
- Out of scope (field/account caching, TW, async job, "updated <relative>" is optional polish) → none required. ✅

**Placeholder scan:** none (migration filename is drizzle-generated, not a TBD). ✅

**Type consistency:** `getCachedSmDimensionValues`/`upsertSmDimensionValues`/`listStaleSmDimensionCacheRows` (T1) consumed by T2 (read) + T4 (route); `getSmDimensionValues` returns `{values,fetchedAt,cached}` (T2) consumed by T5; `isValidCronAuth`/`SM_DIM_CACHE_TTL_MS` (T3) consumed by T4; the route POST body shape `{slug,dsId,account,column}` matches T5's `fetch` body; `refreshOne` uses `resolveSmApiKey(client?.smApiKeyEnvVar, process.env)` matching the adapter's signature. ✅

**Out-of-band:** path-scope every commit; leave unrelated working-tree edits unstaged. Do not run `db:migrate` in a task.
```
