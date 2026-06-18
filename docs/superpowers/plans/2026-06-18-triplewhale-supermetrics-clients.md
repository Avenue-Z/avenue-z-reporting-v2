# Real TripleWhale + Supermetrics Clients — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make dashboard blocks pull real data — a real SQL-based TripleWhale client (replacing the stub) and a global-key fallback for the existing Supermetrics client — behind the unchanged `LeafAdapter` contract.

**Architecture:** New `lib/triplewhale/{client,queries}.ts` port pptx's TripleWhale SQL approach; the TW adapter resolves a `metric` via a registry → one aggregate SQL over `pixel_joined_tvf` → `twSql`. The SM adapter gains a `resolveSmApiKey` helper that falls back to a global `SUPERMETRICS_API_KEY`. A new nullable `clients.triplewhale_shop_id` column carries the per-client shop.

**Tech Stack:** TypeScript (strict), `fetch` (DI'd for tests, Node `Response` in tests), Drizzle/Neon, `tsx` + `node:assert`.

## Global Constraints

- TypeScript strict; **no `any`** in new files.
- Tests are **pure** — no live API/DB, no `.env`. Run `npx tsx <file>.test.ts`. `node:assert` strict, top-level assertions (or `async function run(){…}; run().catch(e=>{console.error(e);process.exit(1)})`), final `console.log('ok')`.
- TripleWhale: `POST https://api.triplewhale.com/api/v2/orcabase/api/sql`, header `x-api-key`, body `{ shopId, query, period:{startDate,endDate}, currency? }`. Response is a bare array OR `{ success, message, data }`. Dates `YYYY-MM-DD`.
- TW metric registry keys: `ad_spend, revenue, blended_roas, purchases, cpa, conv_rate, sessions, clicks, impressions`. SQL aggregates over `pixel_joined_tvf` with `attribution_window='7_days'`, `model='Triple Attribution'` (pptx defaults).
- Env vars: `TRIPLE_WHALE_API_KEY`, `SUPERMETRICS_API_KEY`.
- Keep `lib/supermetrics/client.ts` unchanged. Network adapter wrappers are thin I/O (not unit-tested directly; covered via `resolveBlock` DI). Pure logic is unit-tested.
- Commit per task with the message shown. Stage only the task's files; never the unrelated uncommitted paid-search edits.

---

## Inter-Component Dependency Map

```
  schema+migration (T1)    TW client (T2)    TW queries (T3)    SM fallback (T6)
   clients.triplewhale_     twSql/twValue/    metric registry +   resolveSmApiKey
   shop_id (+ migration)    Tw*Error          buildMetricSql      + adapter use
        │                     │   │                 │
        │            ┌────────┘   └──────┐          │
        ▼            ▼                   ▼          (independent)
   (Client type)  errors mapError (T4)  │
        │          + Tw* mapping        │
        └──────────────┬────────────────┘
                       ▼
            TW adapter rewrite (T5)  ← needs T1 (shop_id type) + T2 (client) + T3 (queries)
```

**Edges = imports/consumes.** T4 needs T2 (imports `TwQueryError`/`TwRateLimitError`). T5 needs T1+T2+T3 (not T4 — the adapter throws the existing `DisconnectedError`/`NoDataError` + `TwQueryError` from the client, and `mapError` is only used at runtime by resolve.ts).

### Parallelization waves

| Wave | Tasks (parallel) | Unblocked by |
|---|---|---|
| 0 | **T1 schema+migration**, **T2 TW client**, **T3 TW queries**, **T6 SM fallback** | nothing — 4 disjoint, independent |
| 1 | **T4 errors mapping**, **T5 TW adapter rewrite** | T4←T2; T5←T1+T2+T3 (different files) |

Same model: parallel implementers (no-git mode), controller commits sequentially per task + reviews each.

---

## File Structure

```
lib/triplewhale/
  client.ts            # NEW: twSql, twValue, TwQueryError, TwRateLimitError
  client.test.ts
  queries.ts           # NEW: TwMetric, TW_METRIC_SQL, isTwMetric, buildMetricSql
  queries.test.ts
lib/dashboard/
  errors.ts            # MODIFY: map TwRateLimitError/TwQueryError
  errors.test.ts       # MODIFY: + cases
  adapters/
    triplewhale.ts     # REWRITE: real resolveTripleWhaleLeaf (stub removed)
    triplewhale.test.ts# DELETE (stub test obsolete; coverage in client/queries tests)
    supermetrics.ts    # MODIFY: + resolveSmApiKey, global-key fallback
    supermetrics.test.ts # MODIFY: + resolveSmApiKey tests
lib/db/schema.ts       # MODIFY: + triplewhale_shop_id column
drizzle/00NN_*.sql     # generated (committed; applied to R&D branch by controller)
```

---

## Task 1: Schema column + migration (`lib/db/schema.ts`)

**Files:** Modify `lib/db/schema.ts`; create (generated) `drizzle/00NN_*.sql` + meta.

**Interfaces:** Produces `clients.triplewhaleShopId` (`text`, nullable) → `Client.triplewhaleShopId: string | null` consumed by Task 5.

- [ ] **Step 1: Add the column** — in the `clients` pgTable, immediately after the `dashboardConfig` line:

```ts
  triplewhaleShopId: text('triplewhale_shop_id'),
```

- [ ] **Step 2: Generate the migration (offline)**

Run: `npm run db:generate`
Expected: new `drizzle/00NN_*.sql` containing `ALTER TABLE "clients" ADD COLUMN "triplewhale_shop_id" text;` + meta snapshot update.

- [ ] **Step 3: Verify**

Run:
```bash
grep -r "triplewhale_shop_id" drizzle/*.sql && echo "migration present"
npx tsc --noEmit 2>&1 | grep "lib/db/schema" || echo "schema ok"
```
Expected: the `ADD COLUMN` line, `migration present`, `schema ok`. **Do NOT run `db:migrate`** (controller applies it to the R&D branch).

- [ ] **Step 4: Commit**

```bash
git add lib/db/schema.ts drizzle/
git commit -m "feat(db): add nullable triplewhale_shop_id column to clients"
```

---

## Task 2: TripleWhale client (`lib/triplewhale/client.ts`)

**Files:** Create `lib/triplewhale/client.ts`, `lib/triplewhale/client.test.ts`.

**Interfaces:**
- Produces: `TwQueryError`, `TwRateLimitError` (classes); `twSql(args, opts?): Promise<Record<string, unknown>[]>`; `twValue(rows): number | null`.
- `twSql` args: `{ apiKey: string; shopId: string; query: string; startDate: string; endDate: string; currency?: string }`; opts: `{ fetchImpl?: typeof fetch; maxRetries?: number; retryDelayMs?: number }`.

- [ ] **Step 1: Write the failing test**

```ts
// lib/triplewhale/client.test.ts
// Run: npx tsx lib/triplewhale/client.test.ts
import { strict as assert } from 'node:assert'
import { twSql, twValue, TwQueryError, TwRateLimitError } from './client'

const ok = (body: unknown, init?: ResponseInit) => new Response(JSON.stringify(body), { status: 200, ...init })

async function run() {
  // request shape: x-api-key header + period + shopId in body
  {
    let captured: { url: string; init: RequestInit } | null = null
    const fetchImpl = (async (url: string, init: RequestInit) => { captured = { url, init }; return ok([{ value: 5 }]) }) as unknown as typeof fetch
    const rows = await twSql({ apiKey: 'k', shopId: 'shop.myshopify.com', query: 'SELECT 1 AS value', startDate: '2026-06-01', endDate: '2026-06-07' }, { fetchImpl })
    assert.equal((rows[0] as { value: number }).value, 5)
    assert.ok(captured!.url.endsWith('/orcabase/api/sql'))
    assert.equal((captured!.init.headers as Record<string, string>)['x-api-key'], 'k')
    const body = JSON.parse(captured!.init.body as string)
    assert.equal(body.shopId, 'shop.myshopify.com')
    assert.deepEqual(body.period, { startDate: '2026-06-01', endDate: '2026-06-07' })
  }
  // envelope {data}
  {
    const fetchImpl = (async () => ok({ success: true, data: [{ value: 9 }] })) as unknown as typeof fetch
    const rows = await twSql({ apiKey: 'k', shopId: 's', query: 'q', startDate: 'a', endDate: 'b' }, { fetchImpl })
    assert.equal((rows[0] as { value: number }).value, 9)
  }
  // success:false → TwQueryError
  {
    const fetchImpl = (async () => ok({ success: false, message: 'bad sql' })) as unknown as typeof fetch
    await assert.rejects(twSql({ apiKey: 'k', shopId: 's', query: 'q', startDate: 'a', endDate: 'b' }, { fetchImpl }), (e: unknown) => e instanceof TwQueryError)
  }
  // 429 then 200 → retries, returns
  {
    let n = 0
    const fetchImpl = (async () => { n++; return n === 1 ? new Response('', { status: 429, headers: { 'Retry-After': '0' } }) : ok([{ value: 1 }]) }) as unknown as typeof fetch
    const rows = await twSql({ apiKey: 'k', shopId: 's', query: 'q', startDate: 'a', endDate: 'b' }, { fetchImpl, retryDelayMs: 0 })
    assert.equal((rows[0] as { value: number }).value, 1)
    assert.equal(n, 2)
  }
  // 429 exhausted → TwRateLimitError
  {
    const fetchImpl = (async () => new Response('', { status: 429, headers: { 'Retry-After': '0' } })) as unknown as typeof fetch
    await assert.rejects(twSql({ apiKey: 'k', shopId: 's', query: 'q', startDate: 'a', endDate: 'b' }, { fetchImpl, retryDelayMs: 0, maxRetries: 1 }), (e: unknown) => e instanceof TwRateLimitError)
  }
  // 4xx → TwQueryError (no retry)
  {
    const fetchImpl = (async () => new Response('nope', { status: 400 })) as unknown as typeof fetch
    await assert.rejects(twSql({ apiKey: 'k', shopId: 's', query: 'q', startDate: 'a', endDate: 'b' }, { fetchImpl }), (e: unknown) => e instanceof TwQueryError)
  }
  // twValue
  assert.equal(twValue([{ value: '12.5' }]), 12.5)
  assert.equal(twValue([]), null)
  assert.equal(twValue([{ value: null }]), null)
  assert.equal(twValue([{ value: 'x' }]), null)
  console.log('ok')
}
run().catch((e) => { console.error(e); process.exit(1) })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx lib/triplewhale/client.test.ts`
Expected: FAIL with `Cannot find module './client'`

- [ ] **Step 3: Write the implementation**

```ts
// lib/triplewhale/client.ts
const BASE_URL = 'https://api.triplewhale.com/api/v2'
const DEFAULT_MAX_RETRIES = 3

/** Non-retryable / rejected TripleWhale query. */
export class TwQueryError extends Error {}
/** Rate limited after retries exhausted. */
export class TwRateLimitError extends Error {
  readonly retryAfter: number
  constructor(retryAfter: number) {
    super(`TripleWhale rate limit; retry after ${retryAfter}s`)
    this.retryAfter = retryAfter
  }
}

export interface TwSqlArgs {
  apiKey: string
  shopId: string
  query: string
  startDate: string
  endDate: string
  currency?: string
}
export interface TwSqlOpts {
  fetchImpl?: typeof fetch
  maxRetries?: number
  /** Override all retry waits (tests pass 0); default honors Retry-After / backoff. */
  retryDelayMs?: number
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function twSql(args: TwSqlArgs, opts: TwSqlOpts = {}): Promise<Record<string, unknown>[]> {
  const fetchImpl = opts.fetchImpl ?? fetch
  const maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES
  const body = JSON.stringify({
    shopId: args.shopId,
    query: args.query,
    period: { startDate: args.startDate, endDate: args.endDate },
    ...(args.currency ? { currency: args.currency } : {}),
  })

  for (let attempt = 0; ; attempt++) {
    const res = await fetchImpl(`${BASE_URL}/orcabase/api/sql`, {
      method: 'POST',
      headers: { 'x-api-key': args.apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
      body,
    })

    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('Retry-After') ?? 10)
      if (attempt >= maxRetries) throw new TwRateLimitError(retryAfter)
      await sleep(opts.retryDelayMs ?? Math.min(retryAfter, 10) * 1000)
      continue
    }
    if (res.status >= 500) {
      if (attempt >= maxRetries) throw new TwQueryError(`TripleWhale ${res.status}`)
      await sleep(opts.retryDelayMs ?? 2 ** attempt * 1000)
      continue
    }
    if (!res.ok) throw new TwQueryError(`TripleWhale ${res.status}`)

    const json = (await res.json()) as unknown
    if (Array.isArray(json)) return json as Record<string, unknown>[]
    if (json && typeof json === 'object') {
      const o = json as { success?: boolean; message?: string; data?: unknown }
      if (o.success === false) throw new TwQueryError(`TripleWhale SQL rejected: ${o.message ?? 'unknown error'}`)
      return (Array.isArray(o.data) ? o.data : []) as Record<string, unknown>[]
    }
    throw new TwQueryError('Unexpected TripleWhale response shape')
  }
}

/** Extract the single aggregate `value` from a result; null when absent/non-numeric. */
export function twValue(rows: Record<string, unknown>[]): number | null {
  if (rows.length === 0) return null
  const v = rows[0]?.value
  if (v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx lib/triplewhale/client.test.ts`
Expected: `ok`

- [ ] **Step 5: Commit**

```bash
git add lib/triplewhale/client.ts lib/triplewhale/client.test.ts
git commit -m "feat(triplewhale): SQL client (twSql, twValue, typed errors)"
```

---

## Task 3: TripleWhale queries/registry (`lib/triplewhale/queries.ts`)

**Files:** Create `lib/triplewhale/queries.ts`, `lib/triplewhale/queries.test.ts`.

**Interfaces:** Produces `TwMetric` (type), `TW_METRIC_SQL: Record<TwMetric, string>`, `isTwMetric(s): s is TwMetric`, `buildMetricSql(metric: TwMetric): string`.

- [ ] **Step 1: Write the failing test**

```ts
// lib/triplewhale/queries.test.ts
// Run: npx tsx lib/triplewhale/queries.test.ts
import { strict as assert } from 'node:assert'
import { TW_METRIC_SQL, isTwMetric, buildMetricSql } from './queries'

// seeded avenue-z metrics must all be supported
for (const m of ['ad_spend', 'blended_roas', 'conv_rate', 'sessions']) {
  assert.equal(isTwMetric(m), true, `${m} should be a known metric`)
}
assert.equal(isTwMetric('nonsense'), false)

// expressions present
assert.equal(TW_METRIC_SQL.ad_spend, 'SUM(spend)')
assert.ok(TW_METRIC_SQL.blended_roas.includes('NULLIF(SUM(spend), 0)'))

// buildMetricSql wires expr + placeholders + table
const sql = buildMetricSql('ad_spend')
assert.ok(sql.includes('SUM(spend) AS value'))
assert.ok(sql.includes('pixel_joined_tvf'))
assert.ok(sql.includes('@startDate') && sql.includes('@endDate'))
assert.ok(sql.includes("attribution_window = '7_days'"))
console.log('ok')
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx lib/triplewhale/queries.test.ts`
Expected: FAIL with `Cannot find module './queries'`

- [ ] **Step 3: Write the implementation**

```ts
// lib/triplewhale/queries.ts

export type TwMetric =
  | 'ad_spend'
  | 'revenue'
  | 'blended_roas'
  | 'purchases'
  | 'cpa'
  | 'conv_rate'
  | 'sessions'
  | 'clicks'
  | 'impressions'

/** SELECT expression (aliased AS value) for each metric, over pixel_joined_tvf columns. */
export const TW_METRIC_SQL: Record<TwMetric, string> = {
  ad_spend: 'SUM(spend)',
  revenue: 'SUM(order_revenue)',
  blended_roas: 'SUM(order_revenue) / NULLIF(SUM(spend), 0)',
  purchases: 'SUM(orders_quantity)',
  cpa: 'SUM(spend) / NULLIF(SUM(orders_quantity), 0)',
  conv_rate: 'SUM(orders_quantity) / NULLIF(SUM(sessions), 0) * 100',
  sessions: 'SUM(sessions)',
  clicks: 'SUM(clicks)',
  impressions: 'SUM(impressions)',
}

export function isTwMetric(s: string): s is TwMetric {
  return Object.prototype.hasOwnProperty.call(TW_METRIC_SQL, s)
}

/**
 * Single-row aggregate query (blended across channels) for one metric.
 * `@startDate`/`@endDate` are substituted server-side from `period`.
 * pixel_joined_tvf args + attribution settings are pptx defaults — validate
 * per-shop in TW's SQL Builder if numbers look off.
 */
export function buildMetricSql(metric: TwMetric): string {
  return `SELECT ${TW_METRIC_SQL[metric]} AS value
FROM pixel_joined_tvf(
  subscription_filter      = NULL,
  include_custom_ad_spend  = true,
  sales_platform_filter    = NULL,
  use_click_date           = false
)
WHERE event_date BETWEEN @startDate AND @endDate
  AND attribution_window = '7_days'
  AND model = 'Triple Attribution'`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx lib/triplewhale/queries.test.ts`
Expected: `ok`

- [ ] **Step 5: Commit**

```bash
git add lib/triplewhale/queries.ts lib/triplewhale/queries.test.ts
git commit -m "feat(triplewhale): metric registry + aggregate SQL builder"
```

---

## Task 6: Supermetrics global-key fallback (`lib/dashboard/adapters/supermetrics.ts`)

(Listed here as it belongs to Wave 0; numbered 6 to keep T4/T5 as the Wave-1 pair.)

**Files:** Modify `lib/dashboard/adapters/supermetrics.ts`, `lib/dashboard/adapters/supermetrics.test.ts`.

**Interfaces:** Produces `resolveSmApiKey(smApiKeyEnvVar: string | null | undefined, env: NodeJS.ProcessEnv): string | undefined`.

- [ ] **Step 1: Add the failing test** — append to `lib/dashboard/adapters/supermetrics.test.ts` before its final `console.log('ok')`:

```ts
import { resolveSmApiKey } from './supermetrics'

// per-client var present → use it
assert.equal(resolveSmApiKey('SM_X', { SM_X: 'perclient', SUPERMETRICS_API_KEY: 'global' } as NodeJS.ProcessEnv), 'perclient')
// per-client var name set but value missing → fall back to global
assert.equal(resolveSmApiKey('SM_X', { SUPERMETRICS_API_KEY: 'global' } as NodeJS.ProcessEnv), 'global')
// no per-client var name → global
assert.equal(resolveSmApiKey(null, { SUPERMETRICS_API_KEY: 'global' } as NodeJS.ProcessEnv), 'global')
// neither → undefined
assert.equal(resolveSmApiKey(null, {} as NodeJS.ProcessEnv), undefined)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx lib/dashboard/adapters/supermetrics.test.ts`
Expected: FAIL (`resolveSmApiKey` is not exported)

- [ ] **Step 3: Implement** — in `lib/dashboard/adapters/supermetrics.ts`, add the helper near the other pure helpers:

```ts
/** Per-client key var wins; otherwise fall back to the global SUPERMETRICS_API_KEY. */
export function resolveSmApiKey(
  smApiKeyEnvVar: string | null | undefined,
  env: NodeJS.ProcessEnv,
): string | undefined {
  const perClient = smApiKeyEnvVar ? env[smApiKeyEnvVar] : undefined
  return perClient ?? env.SUPERMETRICS_API_KEY
}
```

And replace the key resolution inside `resolveSupermetricsLeaf`:

```ts
  const client = await getClientBySlug(ctx.slug)
  const apiKey = resolveSmApiKey(client?.smApiKeyEnvVar, process.env)
  if (!apiKey) throw new DisconnectedError(`Supermetrics not connected for ${ctx.slug}`)
```

(Remove the old `const envVar = …` / `const apiKey = envVar ? …` lines.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx lib/dashboard/adapters/supermetrics.test.ts`
Expected: `ok`

- [ ] **Step 5: Type-check + commit**

Run: `npx tsc --noEmit 2>&1 | grep "lib/dashboard/adapters/supermetrics" || echo "sm ok"` → `sm ok`

```bash
git add lib/dashboard/adapters/supermetrics.ts lib/dashboard/adapters/supermetrics.test.ts
git commit -m "feat(dashboard): Supermetrics global-key fallback (resolveSmApiKey)"
```

---

## Task 4: Error mapping for TripleWhale (`lib/dashboard/errors.ts`)

**Files:** Modify `lib/dashboard/errors.ts`, `lib/dashboard/errors.test.ts`.

**Interfaces:** Consumes `TwQueryError`, `TwRateLimitError` (`@/lib/triplewhale/client`, Task 2). `mapError` now maps them.

- [ ] **Step 1: Add the failing test** — append to `lib/dashboard/errors.test.ts` before its final `console.log('ok')`:

```ts
import { TwQueryError, TwRateLimitError } from '@/lib/triplewhale/client'
assert.equal(mapError(new TwRateLimitError(5)), 'rate-limited')
assert.equal(mapError(new TwQueryError('bad')), 'invalid-metric')
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx lib/dashboard/errors.test.ts`
Expected: FAIL (TW errors map to `'error'`, not the expected values)

- [ ] **Step 3: Implement** — in `lib/dashboard/errors.ts` add the import and two branches in `mapError` (after the `NoDataError` check):

```ts
import { TwQueryError, TwRateLimitError } from '@/lib/triplewhale/client'
```
```ts
  if (e instanceof TwRateLimitError) return 'rate-limited'
  if (e instanceof TwQueryError) return 'invalid-metric'
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx lib/dashboard/errors.test.ts`
Expected: `ok`

- [ ] **Step 5: Commit**

```bash
git add lib/dashboard/errors.ts lib/dashboard/errors.test.ts
git commit -m "feat(dashboard): map TripleWhale errors (rate-limited / invalid-metric)"
```

---

## Task 5: TripleWhale adapter rewrite (`lib/dashboard/adapters/triplewhale.ts`)

**Files:** Rewrite `lib/dashboard/adapters/triplewhale.ts`; **delete** `lib/dashboard/adapters/triplewhale.test.ts`.

**Interfaces:**
- Consumes: `twSql`, `twValue`, `TwQueryError` (`@/lib/triplewhale/client`, Task 2); `isTwMetric`, `buildMetricSql` (`@/lib/triplewhale/queries`, Task 3); `client.triplewhaleShopId` (Task 1); `DisconnectedError`, `NoDataError` (`../errors`); `getClientBySlug`/`parseDateRange`/`resolveCompareIso` (lazy).
- Produces: `resolveTripleWhaleLeaf(b, ctx, dateRange, compareRange): Promise<LeafValue>` (signature unchanged → registry still works).

**Note:** the stub (`stubValue`) and its test are removed. `resolveTripleWhaleLeaf` is a thin I/O wrapper (lazy DB imports, like the SM adapter) — its pure pieces live in Tasks 2/3 and are tested there; this task verifies via tsc + the full suite.

- [ ] **Step 1: Replace the file contents**

```ts
// lib/dashboard/adapters/triplewhale.ts
import { twSql, twValue, TwQueryError } from '@/lib/triplewhale/client'
import { buildMetricSql, isTwMetric } from '@/lib/triplewhale/queries'
import type { LeafValue, TripleWhaleBinding } from '../types'
import { DisconnectedError, NoDataError } from '../errors'

/**
 * Resolve one TripleWhale metric for a client over a date range via the SQL API.
 * DB/date helpers are dynamically imported (they transitively load lib/db/client,
 * which throws at import without DATABASE_URL) — keeps this module env-free to import.
 */
export async function resolveTripleWhaleLeaf(
  b: TripleWhaleBinding,
  ctx: { slug: string },
  dateRange: string,
  compareRange: string | null,
): Promise<LeafValue> {
  if (!isTwMetric(b.metric)) throw new TwQueryError(`Unknown TripleWhale metric: ${b.metric}`)

  const { getClientBySlug } = await import('@/lib/db/queries')
  const { parseDateRange } = await import('@/lib/ga4/client')
  const { resolveCompareIso } = await import('@/lib/paid-search/base')

  const apiKey = process.env.TRIPLE_WHALE_API_KEY
  const shopId = (await getClientBySlug(ctx.slug))?.triplewhaleShopId
  if (!apiKey || !shopId) throw new DisconnectedError(`TripleWhale not connected for ${ctx.slug}`)

  const query = buildMetricSql(b.metric)
  const fetchValue = async (isoRange: string): Promise<number> => {
    const [startDate, endDate] = isoRange.split(',')
    const rows = await twSql({ apiKey, shopId, query, startDate, endDate })
    const v = twValue(rows)
    if (v === null) throw new NoDataError(`no TripleWhale data for ${b.metric} in ${isoRange}`)
    return v
  }

  const { startDate, endDate } = parseDateRange(dateRange)
  const value = await fetchValue(`${startDate},${endDate}`)
  const compareIso = resolveCompareIso(dateRange, compareRange)
  const prevValue = compareIso ? await fetchValue(compareIso) : undefined

  return { value, prevValue }
}
```

- [ ] **Step 2: Delete the obsolete stub test**

```bash
rm lib/dashboard/adapters/triplewhale.test.ts
```

- [ ] **Step 3: Type-check + full suite**

Run:
```bash
npx tsc --noEmit 2>&1 | grep "lib/dashboard\|lib/triplewhale" || echo "no new type errors"
for f in lib/triplewhale/*.test.ts lib/metrics.test.ts lib/dashboard/*.test.ts lib/dashboard/adapters/*.test.ts lib/dashboard/nl/*.test.ts; do echo "== $f"; npx tsx "$f"; done
```
Expected: `no new type errors`, and each test prints `ok`. (`triplewhale.test.ts` is gone; `client.test.ts`/`queries.test.ts` cover the logic.)

- [ ] **Step 4: Commit**

```bash
git add lib/dashboard/adapters/triplewhale.ts
git rm --cached lib/dashboard/adapters/triplewhale.test.ts 2>/dev/null || true
git commit -m "feat(dashboard): real TripleWhale adapter (SQL client; stub removed)"
```

---

## Post-implementation (controller / human — not tasks)

1. **Apply migration `00NN`** to the R&D Neon branch: `npm run db:migrate` (`.env.local` → ep-royal-king). Backward-compatible additive column.
2. **Seed `avenue-z.triplewhale_shop_id`** with a real shop (value from the human; e.g. `something.myshopify.com`). Without it, TW blocks return `disconnected`.
3. **Env vars:** rename local `TRIPLEWHALE_API_KEY` → `TRIPLE_WHALE_API_KEY`; add `TRIPLE_WHALE_API_KEY` + `SUPERMETRICS_API_KEY` to the Vercel Preview env (branch-scoped), then redeploy.

---

## Self-Review

**Spec coverage:** §3 TW client → T2; §3.2 registry/SQL → T3; §3.3 twValue → T2; §4 adapter rewrite → T5; §5 SM fallback → T6; §6 schema+migration → T1, errors mapping → T4; §7 testing → tests in T2/T3/T4/T6 (+ T5 full-suite); §8 env/seed/apply → Post-implementation. ✅

**Placeholder scan:** none (`00NN` = generated migration number). ✅

**Type consistency:** `twSql`/`twValue`/`TwQueryError`/`TwRateLimitError` (T2) consumed identically in T4/T5; `TwMetric`/`isTwMetric`/`buildMetricSql` (T3) in T5; `resolveSmApiKey` (T6) signature matches its test; `triplewhaleShopId` (T1) read in T5; `resolveTripleWhaleLeaf` signature unchanged so the registry/`resolveBlock` are unaffected. ✅

**Out-of-band:** do not stage the unrelated uncommitted paid-search edits.
