# Health & Alerting Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A scheduled cron sweep that detects per-section / per-data-source failures across every client and posts only state changes (newly broken / recovered) to an internal Slack channel.

**Architecture:** A request-scoped collector (`AsyncLocalStorage`) observes every data fetch as it flows through the existing `cached()` wrapper. In "health mode" (`?health=1`), each report page invokes its section component to completion under that collector, then emits the collected pass/fail as an inline JSON `<script id="report-health">` beacon. A cron route (`/api/health/sweep`) crawls every client×report URL on both surfaces, parses the beacon + HTTP status into a per-unit status, diffs against a `health_state` DB table, and Slacks only the transitions.

**Tech Stack:** Next.js 16 App Router (RSC), TypeScript (strict), Drizzle ORM + Neon Postgres, Node `AsyncLocalStorage`, Vercel Cron. Tests are plain `node:assert` files run with `tsx` (no test framework in this repo).

## Global Constraints

- **TypeScript strict, no `any`.** Type all shapes in `lib/health/types.ts`.
- **Test pattern (match existing repo style):** plain `.test.ts` files using `import { strict as assert } from 'node:assert'` with bare top-level assertion blocks ending in `console.log('<file>: all assertions passed')`. Run a test with `npx tsx <path>.test.ts`. There is no `test` npm script and no describe/it framework — do not add one.
- **Data fetches are server-side only.** All new render-path code is server components / server modules. No `'use client'` in any health module.
- **Surgical changes.** The only edit to `lib/cache.ts` is two additive `recordFetch(...)` calls. Do not touch `app/api/cache-warm/route.ts`.
- **Slack delivery:** Slack incoming webhook in env `SLACK_HEALTH_WEBHOOK_URL`. Sweep auth reuses the existing `CRON_SECRET`.
- **Health unit key format (verbatim):** `` `${surface}:${clientSlug}:${section}` `` where `surface` is `'portal' | 'dashboard'`.
- **Beacon contract (verbatim):** an inline `<script id="report-health" type="application/json">` whose body is `JSON.stringify(beacon)` with every `<` replaced by `<`.

---

### Task 1: Health types + request-scoped collector

**Files:**
- Create: `lib/health/types.ts`
- Create: `lib/health/collector.ts`
- Test: `lib/health/collector.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - Types: `Surface = 'portal' | 'dashboard'`, `HealthStatus = 'ok' | 'down'`, `SourceHealth`, `HealthBeacon`, `ProbeResult`, `StoredHealth`, `Transition` (exact shapes below).
  - `runWithCollector<T>(fn: () => T): T`
  - `recordFetch(rec: SourceHealth): void`
  - `getCollected(): SourceHealth[]`

- [ ] **Step 1: Create the shared types**

`lib/health/types.ts`:

```typescript
export type Surface = 'portal' | 'dashboard'
export type HealthStatus = 'ok' | 'down'

/** One data fetch's outcome, recorded by the cached() wrapper during render. */
export interface SourceHealth {
  vendor: string
  fn: string
  ok: boolean
  error?: string
}

/** Serialized in-page by <ReportHealthBeacon> and parsed by the sweep. */
export interface HealthBeacon {
  surface: Surface
  clientSlug: string
  section: string
  sources: SourceHealth[]
  renderError?: string
}

/** A probed unit's resolved status after the sweep combines HTTP + beacon. */
export interface ProbeResult {
  key: string
  surface: Surface
  clientSlug: string
  section: string
  status: HealthStatus
  detail?: string
}

/** The subset of a health_state row the differ needs. */
export interface StoredHealth {
  key: string
  status: HealthStatus
  detail: string | null
}

/** A status change worth announcing to Slack. */
export interface Transition {
  key: string
  surface: Surface
  clientSlug: string
  section: string
  from: HealthStatus
  to: HealthStatus
  detail?: string
}
```

- [ ] **Step 2: Write the failing collector test**

`lib/health/collector.test.ts`:

```typescript
import { strict as assert } from 'node:assert'
import { runWithCollector, recordFetch, getCollected } from './collector'

// records inside a synchronous collector scope
runWithCollector(() => {
  recordFetch({ vendor: 'ga4', fn: 'getX', ok: true })
  recordFetch({ vendor: 'hubspot', fn: 'getY', ok: false, error: 'boom' })
  const got = getCollected()
  assert.equal(got.length, 2)
  assert.equal(got[1].ok, false)
  assert.equal(got[1].error, 'boom')
})

// context survives awaits inside the scope
await runWithCollector(async () => {
  await Promise.resolve()
  recordFetch({ vendor: 'a', fn: 'b', ok: true })
  assert.equal(getCollected().length, 1)
})

// no-op outside any scope: never throws, returns empty
recordFetch({ vendor: 'x', fn: 'y', ok: true })
assert.deepEqual(getCollected(), [])

console.log('collector.test.ts: all assertions passed')
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx tsx lib/health/collector.test.ts`
Expected: FAIL — `Cannot find module './collector'`.

- [ ] **Step 4: Implement the collector**

`lib/health/collector.ts`:

```typescript
/**
 * Request-scoped health collector.
 *
 * runWithCollector() establishes a fresh bucket for one page render (health
 * mode). The cached() wrapper calls recordFetch() for every data fetch; when
 * no collector is active (all normal traffic) recordFetch() is a no-op, so
 * this carries zero risk to live pages. <ReportHealthBeacon> reads
 * getCollected() after the section has rendered.
 */
import { AsyncLocalStorage } from 'node:async_hooks'
import type { SourceHealth } from './types'

const store = new AsyncLocalStorage<SourceHealth[]>()

export function runWithCollector<T>(fn: () => T): T {
  return store.run([], fn)
}

export function recordFetch(rec: SourceHealth): void {
  const bucket = store.getStore()
  if (bucket) bucket.push(rec)
}

export function getCollected(): SourceHealth[] {
  return store.getStore() ?? []
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx tsx lib/health/collector.test.ts`
Expected: PASS — `collector.test.ts: all assertions passed`.

- [ ] **Step 6: Commit**

```bash
git add lib/health/types.ts lib/health/collector.ts lib/health/collector.test.ts
git commit -m "feat(health): request-scoped fetch collector + shared types"
```

---

### Task 2: Beacon parser + status derivation (pure) and beacon component

**Files:**
- Create: `lib/health/derive.ts`
- Create: `lib/health/beacon.tsx`
- Test: `lib/health/derive.test.ts`

**Interfaces:**
- Consumes: `HealthBeacon`, `ProbeResult`, `Surface` from `lib/health/types.ts`.
- Produces:
  - `parseBeacon(html: string): HealthBeacon | null`
  - `deriveStatus(args: { surface: Surface; clientSlug: string; section: string; httpStatus: number | null; html: string }): ProbeResult`
  - `ReportHealthBeacon({ beacon }: { beacon: HealthBeacon }): JSX.Element` (server component)

- [ ] **Step 1: Write the failing derive test**

`lib/health/derive.test.ts`:

```typescript
import { strict as assert } from 'node:assert'
import { parseBeacon, deriveStatus } from './derive'
import type { HealthBeacon } from './types'

function html(beacon: HealthBeacon): string {
  const json = JSON.stringify(beacon).replace(/</g, '\\u003c')
  return `<html><body><script id="report-health" type="application/json">${json}</script></body></html>`
}

const okBeacon: HealthBeacon = {
  surface: 'portal', clientSlug: 'acme', section: 'ga4',
  sources: [{ vendor: 'ga4', fn: 'getSessions', ok: true }],
}

// parseBeacon round-trips
assert.deepEqual(parseBeacon(html(okBeacon)), okBeacon)
// parseBeacon returns null when absent
assert.equal(parseBeacon('<html></html>'), null)

// HTTP failure → down regardless of beacon
{
  const r = deriveStatus({ surface: 'portal', clientSlug: 'acme', section: 'ga4', httpStatus: 500, html: '' })
  assert.equal(r.status, 'down')
  assert.equal(r.key, 'portal:acme:ga4')
  assert.match(r.detail!, /HTTP 500/)
}

// fetch threw (null status) → down
{
  const r = deriveStatus({ surface: 'dashboard', clientSlug: 'acme', section: 'ga4', httpStatus: null, html: '' })
  assert.equal(r.status, 'down')
}

// 200 but no beacon → down
{
  const r = deriveStatus({ surface: 'portal', clientSlug: 'acme', section: 'ga4', httpStatus: 200, html: '<html></html>' })
  assert.equal(r.status, 'down')
  assert.match(r.detail!, /no health beacon/)
}

// 200 + failed source → down with detail
{
  const bad: HealthBeacon = { surface: 'portal', clientSlug: 'acme', section: 'ga4',
    sources: [{ vendor: 'ga4', fn: 'getSessions', ok: false, error: 'Missing env var' }] }
  const r = deriveStatus({ surface: 'portal', clientSlug: 'acme', section: 'ga4', httpStatus: 200, html: html(bad) })
  assert.equal(r.status, 'down')
  assert.match(r.detail!, /ga4\.getSessions: Missing env var/)
}

// 200 + renderError → down
{
  const errd: HealthBeacon = { surface: 'portal', clientSlug: 'acme', section: 'ga4', sources: [], renderError: 'kaboom' }
  const r = deriveStatus({ surface: 'portal', clientSlug: 'acme', section: 'ga4', httpStatus: 200, html: html(errd) })
  assert.equal(r.status, 'down')
  assert.match(r.detail!, /kaboom/)
}

// 200 + all sources ok → ok
{
  const r = deriveStatus({ surface: 'portal', clientSlug: 'acme', section: 'ga4', httpStatus: 200, html: html(okBeacon) })
  assert.equal(r.status, 'ok')
}

console.log('derive.test.ts: all assertions passed')
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx lib/health/derive.test.ts`
Expected: FAIL — `Cannot find module './derive'`.

- [ ] **Step 3: Implement derive**

`lib/health/derive.ts`:

```typescript
import type { HealthBeacon, ProbeResult, Surface } from './types'

const BEACON_RE = /<script[^>]*id="report-health"[^>]*>([\s\S]*?)<\/script>/

export function parseBeacon(html: string): HealthBeacon | null {
  const m = html.match(BEACON_RE)
  if (!m) return null
  try {
    return JSON.parse(m[1]) as HealthBeacon
  } catch {
    return null
  }
}

export function deriveStatus(args: {
  surface: Surface
  clientSlug: string
  section: string
  httpStatus: number | null
  html: string
}): ProbeResult {
  const key = `${args.surface}:${args.clientSlug}:${args.section}`
  const base = { key, surface: args.surface, clientSlug: args.clientSlug, section: args.section }

  if (args.httpStatus === null || args.httpStatus < 200 || args.httpStatus >= 400) {
    return { ...base, status: 'down', detail: `HTTP ${args.httpStatus ?? 'fetch failed'}` }
  }
  const beacon = parseBeacon(args.html)
  if (!beacon) return { ...base, status: 'down', detail: 'no health beacon' }
  if (beacon.renderError) return { ...base, status: 'down', detail: beacon.renderError }
  const failed = beacon.sources.find((s) => !s.ok)
  if (failed) return { ...base, status: 'down', detail: `${failed.vendor}.${failed.fn}: ${failed.error ?? 'error'}` }
  return { ...base, status: 'ok' }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsx lib/health/derive.test.ts`
Expected: PASS — `derive.test.ts: all assertions passed`.

- [ ] **Step 5: Implement the beacon component**

`lib/health/beacon.tsx`:

```typescript
import type { HealthBeacon } from './types'

/**
 * Renders the collected health for one page as inline JSON the sweep reads.
 * The `<` escape prevents an error string containing "</script>" from breaking
 * out of the tag. This is inert data, never executed.
 */
export function ReportHealthBeacon({ beacon }: { beacon: HealthBeacon }) {
  const json = JSON.stringify(beacon).replace(/</g, '\\u003c')
  return (
    <script
      id="report-health"
      type="application/json"
      dangerouslySetInnerHTML={{ __html: json }}
    />
  )
}
```

- [ ] **Step 6: Commit**

```bash
git add lib/health/derive.ts lib/health/derive.test.ts lib/health/beacon.tsx
git commit -m "feat(health): beacon parser, status derivation, beacon component"
```

---

### Task 3: Differ + Slack formatting (pure) and Slack poster

**Files:**
- Create: `lib/health/diff.ts`
- Create: `lib/health/slack.ts`
- Test: `lib/health/diff.test.ts`

**Interfaces:**
- Consumes: `StoredHealth`, `ProbeResult`, `Transition` from `lib/health/types.ts`.
- Produces:
  - `diffHealth(stored: StoredHealth[], observed: ProbeResult[]): { transitions: Transition[]; upserts: ProbeResult[] }`
  - `formatTransitions(transitions: Transition[]): string | null`
  - `postHealthChanges(text: string): Promise<void>`

- [ ] **Step 1: Write the failing differ + formatter test**

`lib/health/diff.test.ts`:

```typescript
import { strict as assert } from 'node:assert'
import { diffHealth, formatTransitions } from './diff'
import type { ProbeResult, StoredHealth } from './types'

const obs = (key: string, status: 'ok' | 'down', detail?: string): ProbeResult => {
  const [surface, clientSlug, section] = key.split(':')
  return { key, surface: surface as 'portal' | 'dashboard', clientSlug, section, status, detail }
}

// first sighting → no transition, but it IS upserted (silent seed)
{
  const { transitions, upserts } = diffHealth([], [obs('portal:acme:ga4', 'down', 'boom')])
  assert.equal(transitions.length, 0)
  assert.equal(upserts.length, 1)
}

// ok -> down → one transition with detail
{
  const stored: StoredHealth[] = [{ key: 'portal:acme:ga4', status: 'ok', detail: null }]
  const { transitions } = diffHealth(stored, [obs('portal:acme:ga4', 'down', 'Missing token')])
  assert.equal(transitions.length, 1)
  assert.equal(transitions[0].from, 'ok')
  assert.equal(transitions[0].to, 'down')
  assert.equal(transitions[0].detail, 'Missing token')
}

// down -> ok → recovery transition
{
  const stored: StoredHealth[] = [{ key: 'portal:acme:ga4', status: 'down', detail: 'x' }]
  const { transitions } = diffHealth(stored, [obs('portal:acme:ga4', 'ok')])
  assert.equal(transitions.length, 1)
  assert.equal(transitions[0].to, 'ok')
}

// no change → no transition
{
  const stored: StoredHealth[] = [{ key: 'portal:acme:ga4', status: 'ok', detail: null }]
  const { transitions } = diffHealth(stored, [obs('portal:acme:ga4', 'ok')])
  assert.equal(transitions.length, 0)
}

// formatter: null when empty, formatted lines otherwise
assert.equal(formatTransitions([]), null)
{
  const msg = formatTransitions([
    { key: 'portal:acme:ga4', surface: 'portal', clientSlug: 'acme', section: 'ga4', from: 'ok', to: 'down', detail: 'Missing token' },
    { key: 'dashboard:globex:meta-ads', surface: 'dashboard', clientSlug: 'globex', section: 'meta-ads', from: 'down', to: 'ok' },
  ])!
  assert.match(msg, /acme · portal · ga4 — Missing token/)
  assert.match(msg, /globex · dashboard · meta-ads — recovered/)
  assert.match(msg, /🔴/)
  assert.match(msg, /✅/)
}

console.log('diff.test.ts: all assertions passed')
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx lib/health/diff.test.ts`
Expected: FAIL — `Cannot find module './diff'`.

- [ ] **Step 3: Implement the differ + formatter**

`lib/health/diff.ts`:

```typescript
import type { ProbeResult, StoredHealth, Transition } from './types'

/**
 * Compare the stored last-known statuses with this sweep's observations.
 * Returns the transitions worth announcing (status actually changed for a
 * key we've seen before) and the full upsert set (every observed unit, so the
 * first sighting of a unit seeds the table silently — no transition).
 */
export function diffHealth(
  stored: StoredHealth[],
  observed: ProbeResult[],
): { transitions: Transition[]; upserts: ProbeResult[] } {
  const prev = new Map(stored.map((s) => [s.key, s]))
  const transitions: Transition[] = []
  for (const o of observed) {
    const before = prev.get(o.key)
    if (!before) continue
    if (before.status !== o.status) {
      transitions.push({
        key: o.key, surface: o.surface, clientSlug: o.clientSlug, section: o.section,
        from: before.status, to: o.status, detail: o.detail,
      })
    }
  }
  return { transitions, upserts: observed }
}

export function formatTransitions(transitions: Transition[]): string | null {
  if (transitions.length === 0) return null
  const lines = transitions.map((t) => {
    const icon = t.to === 'down' ? '🔴' : '✅'
    const loc = `${t.clientSlug} · ${t.surface} · ${t.section}`
    const tail = t.to === 'down' ? ` — ${t.detail ?? 'failed'}` : ' — recovered'
    return `${icon} ${loc}${tail}`
  })
  return ['*Health changes*', ...lines].join('\n')
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsx lib/health/diff.test.ts`
Expected: PASS — `diff.test.ts: all assertions passed`.

- [ ] **Step 5: Implement the Slack poster**

`lib/health/slack.ts`:

```typescript
/**
 * Post health transitions to the internal Slack channel via an incoming
 * webhook. Failures are logged, never thrown — a missed post must not fail
 * the sweep (state is still upserted, so the next real change re-alerts).
 */
export async function postHealthChanges(text: string): Promise<void> {
  const url = process.env.SLACK_HEALTH_WEBHOOK_URL
  if (!url) {
    console.error('[health] SLACK_HEALTH_WEBHOOK_URL not set; skipping Slack post')
    return
  }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
    if (!res.ok) console.error(`[health] Slack post failed: ${res.status}`)
  } catch (err) {
    console.error('[health] Slack post error', err)
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add lib/health/diff.ts lib/health/diff.test.ts lib/health/slack.ts
git commit -m "feat(health): status differ, Slack formatter and webhook poster"
```

---

### Task 4: `health_state` table, migration, and queries

**Files:**
- Modify: `lib/db/schema.ts` (append a table + inferred type after the `users` table block, around line 158)
- Modify: `lib/db/queries.ts` (append two helpers)
- Create (generated): a new file under `drizzle/` via `npm run db:generate`

**Interfaces:**
- Consumes: nothing from prior tasks (uses `lib/health/types.ts` `HealthStatus` for typing).
- Produces:
  - Drizzle table `healthState` (sql table `health_state`).
  - `getAllHealthState(): Promise<StoredHealth[]>`
  - `upsertHealthState(rows: Array<{ key: string; status: HealthStatus; detail?: string; changed: boolean }>): Promise<void>`

- [ ] **Step 1: Add the table to the schema**

In `lib/db/schema.ts`, after the `users` table definition (after line 158, before the `// --- Relations ---` comment), add:

```typescript
// Last-known health status per (surface:clientSlug:section). Written by the
// health sweep; only status *changes* are announced to Slack.
export const healthState = pgTable('health_state', {
  key: text('key').primaryKey(),
  status: text('status').notNull().$type<'ok' | 'down'>(),
  detail: text('detail'),
  since: timestamp('since', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
```

And in the inferred-types block at the bottom (after line 179), add:

```typescript
export type HealthStateRow = typeof healthState.$inferSelect
```

- [ ] **Step 2: Add the query helpers**

In `lib/db/queries.ts`, add at the end of the file (extend the existing `import` from `./schema` to include `healthState`, and the `import` from `@/lib/health/types` for `HealthStatus`/`StoredHealth`):

```typescript
import type { HealthStatus, StoredHealth } from '@/lib/health/types'
// add `healthState` to the existing `import { clients, users, ... } from './schema'`

/**
 * All stored health rows. NOT cached — the sweep needs the live table, and it
 * writes to it in the same run.
 */
export async function getAllHealthState(): Promise<StoredHealth[]> {
  const rows = await db
    .select({ key: healthState.key, status: healthState.status, detail: healthState.detail })
    .from(healthState)
  return rows.map((r) => ({ key: r.key, status: r.status as HealthStatus, detail: r.detail }))
}

/**
 * Upsert each observed unit's status. `since` is bumped only when the status
 * actually changed (changed === true); unchanged rows keep their original
 * `since` so it reflects when the current state began.
 */
export async function upsertHealthState(
  rows: Array<{ key: string; status: HealthStatus; detail?: string; changed: boolean }>,
): Promise<void> {
  for (const r of rows) {
    await db
      .insert(healthState)
      .values({ key: r.key, status: r.status, detail: r.detail ?? null })
      .onConflictDoUpdate({
        target: healthState.key,
        set: {
          status: r.status,
          detail: r.detail ?? null,
          updatedAt: new Date(),
          ...(r.changed ? { since: new Date() } : {}),
        },
      })
  }
}
```

- [ ] **Step 3: Generate the migration**

Run: `npm run db:generate`
Expected: a new `drizzle/NNNN_*.sql` file containing `CREATE TABLE "health_state"`. Inspect it to confirm it only adds the new table (no destructive changes to `clients`/`users`).

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Apply the migration to the database**

Run: `npm run db:migrate`
Expected: applies cleanly (requires `DATABASE_URL_UNPOOLED` in the environment; this is the standard repo migration command). If running where the DB is unreachable, skip this step and apply on deploy — note it in the commit body.

- [ ] **Step 6: Commit**

```bash
git add lib/db/schema.ts lib/db/queries.ts drizzle/
git commit -m "feat(health): health_state table, migration, and query helpers"
```

---

### Task 5: Instrument `cached()` to record fetch outcomes

**Files:**
- Modify: `lib/cache.ts` (the success branch ~line 88 and the catch branch ~line 94, inside the returned wrapper)

**Interfaces:**
- Consumes: `recordFetch` from `lib/health/collector.ts`.
- Produces: no new exports. Side effect: every `cached()` call now records a `SourceHealth` into the active collector (no-op when none is active).

**Note on coverage:** This instruments the main `cached()` path only. The `CACHE_DISABLED` escape (which delegates to `timed()`) and `timed()`-only wrappers are not recorded — those are not data-source fetchers in this codebase. Recording happens in the *wrapper* (not inside `impl`), so it fires on cache hits too.

- [ ] **Step 1: Add the import**

At the top of `lib/cache.ts`, after the existing imports (after line 23), add:

```typescript
import { recordFetch } from '@/lib/health/collector'
```

- [ ] **Step 2: Record on success**

In `lib/cache.ts`, in the `try` block of the returned wrapper, immediately after `const ms = Math.round(performance.now() - start)` and before the `if (PERF_LOG_ENABLED)` line (around line 87), add:

```typescript
        recordFetch({ vendor, fn, ok: true })
```

- [ ] **Step 3: Record on error**

In the `catch (err)` block, after `const message = err instanceof Error ? err.message : String(err)` and before the `if (PERF_LOG_ENABLED)` line (around line 93), add:

```typescript
        recordFetch({ vendor, fn, ok: false, error: message })
```

- [ ] **Step 4: Typecheck and verify no behavior change**

Run: `npx tsc --noEmit`
Expected: no errors.

Run the existing cache-adjacent tests to confirm nothing regressed:
Run: `npx tsx lib/health/collector.test.ts`
Expected: still PASS (collector unchanged; this confirms the import path resolves).

- [ ] **Step 5: Commit**

```bash
git add lib/cache.ts
git commit -m "feat(health): record fetch outcomes into the health collector"
```

---

### Task 6: HealthProbe component + wire both report pages

**Files:**
- Create: `lib/health/probe.tsx`
- Modify: `app/dashboard/[clientSlug]/reports/page.tsx`
- Modify: `app/portal/[clientSlug]/reports/[reportSlug]/page.tsx`

**Interfaces:**
- Consumes: `runWithCollector`, `getCollected` (collector), `ReportHealthBeacon` (beacon), `Surface`, `HealthBeacon` (types).
- Produces: `HealthProbe({ surface, clientSlug, section, element }): Promise<JSX.Element>` (async server component).

- [ ] **Step 1: Implement HealthProbe**

`lib/health/probe.tsx`:

```typescript
import type { ReactElement } from 'react'
import { runWithCollector, getCollected } from './collector'
import { ReportHealthBeacon } from './beacon'
import type { HealthBeacon, Surface } from './types'

/**
 * Health-mode renderer for one report page. Invokes the section's async
 * server-component body directly and awaits it to completion so its cached()
 * data fetches run and record into the active collector before we read it —
 * this is why health mode does not stream (no <Suspense>): we need a complete,
 * deterministic collector when we emit the beacon. The component's returned
 * tree is discarded; only the fetch side-effects matter.
 */
export async function HealthProbe({
  surface,
  clientSlug,
  section,
  element,
}: {
  surface: Surface
  clientSlug: string
  section: string
  element: ReactElement
}) {
  return runWithCollector(async () => {
    let renderError: string | undefined
    try {
      const type = element.type
      if (typeof type === 'function') {
        await (type as (props: unknown) => unknown)(element.props)
      }
    } catch (e) {
      renderError = e instanceof Error ? e.message : String(e)
    }
    const beacon: HealthBeacon = {
      surface,
      clientSlug,
      section,
      sources: getCollected(),
      ...(renderError ? { renderError } : {}),
    }
    return <ReportHealthBeacon beacon={beacon} />
  })
}
```

- [ ] **Step 2: Wire the dashboard page**

In `app/dashboard/[clientSlug]/reports/page.tsx`:

(a) Add the import near the other component imports (after line ~31):

```typescript
import { HealthProbe } from '@/lib/health/probe'
```

(b) Add `health` to the `searchParams` type (the inline type around line 107) — extend it with `health?: string`:

```typescript
  searchParams: Promise<{ section?: string; subsection?: string; dateRange?: string; compareRange?: string; period?: string; models?: string; health?: string }>
```

(c) Destructure it where the other params are destructured (around line 111), adding `health: healthParam`:

```typescript
  const { section, subsection: subsectionParam, dateRange: dateRangeParam, compareRange: compareRangeParam, period: periodParam, models: modelsParam, health: healthParam } = await searchParams
```

(d) Immediately before the final `return (` of the component (just before `<TooltipProvider ...>`, around line 168), add the health-mode branch:

```typescript
  if (healthParam === '1') {
    const element = getReportComponent(activeSection, clientSlug, dateRange, compareRange, subsection, period, submittedBy, models)
    return (
      <HealthProbe
        surface="dashboard"
        clientSlug={clientSlug}
        section={activeSection}
        element={element ?? <></>}
      />
    )
  }
```

- [ ] **Step 3: Wire the portal page**

In `app/portal/[clientSlug]/reports/[reportSlug]/page.tsx`:

(a) Add the import after the existing imports (after the `PortalReportDateRange` import):

```typescript
import { HealthProbe } from '@/lib/health/probe'
```

(b) Extend the `searchParams` type with `health?: string`:

```typescript
  searchParams: Promise<{ dateRange?: string; compareRange?: string; health?: string }>
```

(c) Destructure it:

```typescript
  const { dateRange: dateRangeParam, compareRange: compareRangeParam, health: healthParam } = await searchParams
```

(d) Immediately before the final `return (` (the `<div className="mx-auto max-w-6xl ...">`), add:

```typescript
  if (healthParam === '1') {
    const element = getReportSection(reportSlug, clientSlug, dateRange, compareRange, submittedBy)
    return (
      <HealthProbe
        surface="portal"
        clientSlug={clientSlug}
        section={reportSlug}
        element={element ?? <></>}
      />
    )
  }
```

- [ ] **Step 4: Typecheck + RSC prop check**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run check:rsc`
Expected: passes (HealthProbe is a server component receiving a server element — no client boundary crossed).

- [ ] **Step 5: Manual smoke test (dev server)**

Start the app: `npm run dev`
In another shell, hit a known client+report in health mode and confirm the beacon is present. Replace `<slug>`/`<report>` with a real enabled client and report (find one via Drizzle Studio or the dashboard):

Run: `curl -s 'http://localhost:3000/dashboard/<slug>/reports?section=ga4&health=1' --cookie "$(printf '')" | grep -o 'id="report-health"[^<]*' | head`

Expected: the request will redirect to `/login` without a session. For a logged-in smoke test, instead open the URL in your authenticated browser and view source for `report-health`. The authoritative end-to-end check happens in Task 7 via the service-cookie sweep. If you can view source and see a `<script id="report-health" type="application/json">{...}</script>` with a `sources` array, the wiring works.

- [ ] **Step 6: Commit**

```bash
git add lib/health/probe.tsx 'app/dashboard/[clientSlug]/reports/page.tsx' 'app/portal/[clientSlug]/reports/[reportSlug]/page.tsx'
git commit -m "feat(health): HealthProbe + health-mode branch on both report surfaces"
```

---

### Task 7: Shared service-cookie module + sweep route (crawler + differ + Slack)

**Files:**
- Create: `lib/auth/service-cookie.ts`
- Modify: `app/api/cache-warm/route.ts` (replace its local `mintServiceCookie` with the shared import)
- Create: `app/api/health/sweep/route.ts`

**Interfaces:**
- Consumes: `getAllClients`, `getAllHealthState`, `upsertHealthState` (queries); `deriveStatus` (derive); `diffHealth`, `formatTransitions` (diff); `postHealthChanges` (slack); `ProbeResult`, `Surface` (types).
- Produces:
  - `mintServiceCookie(secret: string, salt: string, principal: { email: string; name: string }): Promise<string>` in `lib/auth/service-cookie.ts`.
  - `GET(req: Request)` route handler in the sweep route.

**Decision (from human):** The service-cookie minting is extracted to a shared
module rather than copied. Both `cache-warm` and the sweep route import it. The
extraction must preserve cache-warm's existing behavior exactly (same token
fields, same `cache-warm@avenuez.com` principal) — only the source of the
function changes.

- [ ] **Step 0: Extract the shared service-cookie helper**

Create `lib/auth/service-cookie.ts`:

```typescript
import { encode } from '@auth/core/jwt'

/**
 * Mint a short-lived (1h) INTERNAL_ADMIN session cookie value for server-to-
 * server self-fetches (cache warming, health sweeps). The principal email/name
 * identifies the run in logs. Shared by app/api/cache-warm and app/api/health/sweep.
 */
export async function mintServiceCookie(
  secret: string,
  salt: string,
  principal: { email: string; name: string },
): Promise<string> {
  const maxAge = 60 * 60
  const now = Math.floor(Date.now() / 1000)
  return encode({
    secret,
    salt,
    maxAge,
    token: {
      sub: principal.email,
      email: principal.email,
      name: principal.name,
      role: 'INTERNAL_ADMIN',
      clientSlug: 'avenue-z',
      iat: now,
      exp: now + maxAge,
      jti: crypto.randomUUID(),
    },
  })
}
```

Then in `app/api/cache-warm/route.ts`: remove the local `mintServiceCookie`
function (lines 44–62) and its now-unused `import { encode } from '@auth/core/jwt'`
(line 23); add `import { mintServiceCookie } from '@/lib/auth/service-cookie'`;
and change its single call site (line ~110) from
`mintServiceCookie(authSecret, cookieName)` to
`mintServiceCookie(authSecret, cookieName, { email: 'cache-warm@avenuez.com', name: 'cache-warm' })`.

Verify cache-warm still typechecks: `npx tsc --noEmit` (expected: no errors).

- [ ] **Step 1: Implement the sweep route**

`app/api/health/sweep/route.ts`:

```typescript
/**
 * Health sweep. Crawls every (client × enabledReport) URL on both the portal
 * and dashboard surfaces in health mode (?health=1), parses each page's
 * health beacon + HTTP status into a per-unit status, diffs against the
 * health_state table, posts only the transitions to Slack, and upserts the
 * new statuses.
 *
 * Auth: requires `Authorization: Bearer <CRON_SECRET>` (Vercel Cron sends it).
 * Self-fetch auth: a synthetic INTERNAL_ADMIN session cookie (1h) — copied
 * from app/api/cache-warm/route.ts.
 */
import { NextResponse } from 'next/server'
import { getAllClients, getAllHealthState, upsertHealthState } from '@/lib/db/queries'
import { mintServiceCookie } from '@/lib/auth/service-cookie'
import { deriveStatus } from '@/lib/health/derive'
import { diffHealth, formatTransitions } from '@/lib/health/diff'
import { postHealthChanges } from '@/lib/health/slack'
import type { ProbeResult, Surface } from '@/lib/health/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

interface Unit {
  url: string
  surface: Surface
  clientSlug: string
  section: string
}

async function probe(u: Unit, cookieHeader: string): Promise<ProbeResult> {
  try {
    const res = await fetch(u.url, { headers: { Cookie: cookieHeader }, redirect: 'manual' })
    const html = await res.text()
    return deriveStatus({ surface: u.surface, clientSlug: u.clientSlug, section: u.section, httpStatus: res.status, html })
  } catch {
    return deriveStatus({ surface: u.surface, clientSlug: u.clientSlug, section: u.section, httpStatus: null, html: '' })
  }
}

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return NextResponse.json({ error: 'CRON_SECRET not set' }, { status: 500 })
  if (req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return new NextResponse('Unauthorized', { status: 401 })
  }
  const authSecret = process.env.AUTH_SECRET
  if (!authSecret) return NextResponse.json({ error: 'AUTH_SECRET not set' }, { status: 500 })

  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : (process.env.APP_URL ?? new URL(req.url).origin)
  const isSecure = baseUrl.startsWith('https://')
  const cookieName = isSecure ? '__Secure-authjs.session-token' : 'authjs.session-token'
  const token = await mintServiceCookie(authSecret, cookieName, { email: 'health-sweep@avenuez.com', name: 'health-sweep' })
  const cookieHeader = `${cookieName}=${token}`

  const clients = await getAllClients()
  const dr = 'last_30_days'
  const units: Unit[] = []
  for (const client of clients) {
    for (const report of client.enabledReports) {
      units.push({
        surface: 'portal', clientSlug: client.slug, section: report,
        url: `${baseUrl}/portal/${client.slug}/reports/${report}?dateRange=${dr}&health=1`,
      })
      units.push({
        surface: 'dashboard', clientSlug: client.slug, section: report,
        url: `${baseUrl}/dashboard/${client.slug}/reports?section=${report}&dateRange=${dr}&health=1`,
      })
    }
  }

  const observed = await Promise.all(units.map((u) => probe(u, cookieHeader)))
  const stored = await getAllHealthState()
  const { transitions, upserts } = diffHealth(stored, observed)

  const prev = new Map(stored.map((s) => [s.key, s.status]))
  await upsertHealthState(
    upserts.map((o) => ({
      key: o.key,
      status: o.status,
      detail: o.detail,
      changed: prev.has(o.key) && prev.get(o.key) !== o.status,
    })),
  )

  const message = formatTransitions(transitions)
  if (message) await postHealthChanges(message)

  return NextResponse.json({
    probed: observed.length,
    down: observed.filter((o) => o.status === 'down').length,
    transitions: transitions.length,
  })
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: End-to-end smoke test (dev server)**

With `npm run dev` running and `CRON_SECRET` + `AUTH_SECRET` set in `.env.local`, and at least one client seeded:

Run: `curl -s -H "Authorization: Bearer $(grep '^CRON_SECRET=' .env.local | cut -d= -f2)" http://localhost:3000/api/health/sweep`

Expected: JSON like `{"probed":N,"down":M,"transitions":K}` where `N` = 2 × (sum of enabledReports across clients). First run: `transitions` should be `0` (silent seed) and the `health_state` table now has `N` rows (verify in Drizzle Studio). A second run with no breakage should also return `transitions: 0` and post nothing to Slack.

- [ ] **Step 4: Commit**

```bash
git add lib/auth/service-cookie.ts app/api/cache-warm/route.ts app/api/health/sweep/route.ts
git commit -m "feat(health): shared service-cookie helper + /api/health/sweep cron route"
```

---

### Task 8: Cron schedule, env, and final verification

**Files:**
- Modify or create: `vercel.json`
- Modify: `CLAUDE.md` (Environment Variables section — document the new env var)

**Interfaces:**
- Consumes: the `/api/health/sweep` route from Task 7.
- Produces: a Vercel cron entry and documentation.

- [ ] **Step 1: Add the cron entry**

If `vercel.json` exists, add `/api/health/sweep` to its `crons` array. If it does not exist, create `vercel.json`:

```json
{
  "crons": [
    { "path": "/api/health/sweep", "schedule": "*/15 * * * *" }
  ]
}
```

If a `crons` array already exists (e.g. cache-warm), append the new object to it rather than overwriting.

- [ ] **Step 2: Document the env var**

In `CLAUDE.md`, under the `## Environment Variables` section, add to the env block:

```env
# Health alerting
SLACK_HEALTH_WEBHOOK_URL=             # Slack incoming webhook for the internal #health channel
```

Also set `SLACK_HEALTH_WEBHOOK_URL` in `.env.local` (for local testing) and in Vercel project env (for production). Without it, the sweep still runs and upserts state but logs `SLACK_HEALTH_WEBHOOK_URL not set` instead of posting.

- [ ] **Step 3: Full build verification**

Run: `npx tsc --noEmit`
Expected: no errors.

Run the full health unit suite:
Run: `npx tsx lib/health/collector.test.ts && npx tsx lib/health/derive.test.ts && npx tsx lib/health/diff.test.ts`
Expected: three `all assertions passed` lines.

Run: `npm run build`
Expected: build succeeds (compiles the new route and modified pages).

- [ ] **Step 4: Commit**

```bash
git add vercel.json CLAUDE.md
git commit -m "chore(health): schedule sweep cron every 15m + document env var"
```

---

## Known limitations (carried from the spec; not bugs)

- **Cache freshness:** `cached()` may return a warm successful value for a source that just broke, masking the failure for up to its TTL (default 1h). A source that throws is never cached, so newly-missing connections surface immediately; only the "broke upstream while a good value is cached" case is delayed.
- **Coverage:** only `cached()`-wrapped fetchers are observed. `timed()`-only wrappers and the `CACHE_DISABLE=1` escape path are not recorded (these are not data-source fetchers here).
- **Nested async sections:** `HealthProbe` awaits the section component's own body (where the established fetch pattern awaits all data). Data fetched by *nested* async child components below the top-level body is not captured.
- **Granularity:** one health unit per report page (no per-subsection units in v1).
- **Empty-but-successful** data (0 rows) is not flagged in v1.

## Self-review notes

- **Spec coverage:** scheduled cron sweep (Task 7/8) ✓; deep section/data-source signal via in-band collector (Tasks 1, 2, 5, 6) ✓; both surfaces (Task 6) ✓; only-on-change Slack with state table (Tasks 3, 4, 7) ✓; Slack webhook delivery (Task 3) ✓; silent first-run seed (Task 3 differ) ✓; out-of-scope items recorded above ✓.
- **Type consistency:** `runWithCollector`/`recordFetch`/`getCollected`, `parseBeacon`/`deriveStatus`, `diffHealth`/`formatTransitions`/`postHealthChanges`, `getAllHealthState`/`upsertHealthState`, `HealthProbe` are referenced with identical names/signatures across producing and consuming tasks. The `health_state` key format `${surface}:${clientSlug}:${section}` is used consistently in `deriveStatus`, `diffHealth`, and the sweep.
- **No placeholders:** every code step contains full code; every run step states the exact command and expected output.
