# Real TripleWhale + Supermetrics Data Clients — Design

**Status:** Approved (brainstorm)
**Date:** 2026-06-18
**Branch:** `feat/configurable-dashboard-rnd`
**Builds on:** the dashboard resolution layer (#1) — the `LeafAdapter` contract (`resolveLeaf`), `parseBlockConfig`, the error model, and the existing `lib/supermetrics/client.ts`.
**Reference port source:** `/Users/paulramirez/Documents/Projects/pptx-report-filler` (Python) — `filler/sources/triplewhale/{client,queries}.py` and `filler/sources/supermetrics.py`.

---

## 1. Summary

Make dashboard blocks pull **real** data: replace the TripleWhale **stub** with a
real SQL-based TripleWhale client, and let the (already-working) Supermetrics
client run without per-client key config via a global-key fallback. Everything
plugs in behind the existing `LeafAdapter` contract, so `resolveBlock`, the
aggregate orchestrator, and `resolveBlockNL` are unaffected.

---

## 2. Key decisions (from brainstorming)

| Decision | Choice |
|---|---|
| TripleWhale | Build a real client (port pptx's SQL approach); replace the stub adapter |
| TW shop id | New `clients.triplewhale_shop_id` column (per-client); migration `0009` |
| Supermetrics | Keep the existing `lib/supermetrics/client.ts`; add a **global `SUPERMETRICS_API_KEY` fallback** in the SM adapter (no rewrite) |
| Env var names | `TRIPLE_WHALE_API_KEY` + `SUPERMETRICS_API_KEY` (rename from the `TRIPLEWHALE_API_KEY` currently in `.env.local`) |
| Contract | Unchanged `LeafAdapter`; pure logic unit-tested, network DI'd |

---

## 3. TripleWhale client (`lib/triplewhale/`)

### 3.1 `client.ts`

```ts
twSql(
  args: { apiKey: string; shopId: string; query: string; startDate: string; endDate: string; currency?: string },
  opts?: { fetchImpl?: typeof fetch },
): Promise<Record<string, unknown>[]>
```

- `POST https://api.triplewhale.com/api/v2/orcabase/api/sql`
- Headers: `x-api-key: <apiKey>`, `Content-Type: application/json`, `Accept: application/json`
- Body: `{ shopId, query, period: { startDate, endDate }, ...(currency ? { currency } : {}) }`
  (`startDate`/`endDate` are `YYYY-MM-DD`; the API substitutes `@startDate`/`@endDate` in the SQL.)
- Response: a **bare array** of row objects, OR a `{ success, message, data }` envelope — handle both (return `data` for the envelope; `success === false` → `TwQueryError`).
- Retries (max 3): **429** → wait `Retry-After` (default 10s, capped) then retry, exhausted → `TwRateLimitError`; **5xx** → backoff `2^attempt` then retry; **4xx** → `TwQueryError` (no retry). 30s timeout.

### 3.2 `queries.ts` — metric registry + SQL builder

```ts
type TwMetric = 'ad_spend' | 'revenue' | 'blended_roas' | 'purchases' | 'cpa' | 'conv_rate' | 'sessions' | 'clicks' | 'impressions'
const TW_METRIC_SQL: Record<TwMetric, string>   // the SELECT expression for each
buildMetricSql(metric: TwMetric): string         // full single-row aggregate query
isTwMetric(s: string): s is TwMetric
```

Expressions (over `pixel_joined_tvf`, columns per pptx: `spend`, `order_revenue`, `orders_quantity`, `sessions`, `clicks`, `impressions`):

| metric | SELECT expr `AS value` |
|---|---|
| `ad_spend` | `SUM(spend)` |
| `revenue` | `SUM(order_revenue)` |
| `blended_roas` | `SUM(order_revenue) / NULLIF(SUM(spend), 0)` |
| `purchases` | `SUM(orders_quantity)` |
| `cpa` | `SUM(spend) / NULLIF(SUM(orders_quantity), 0)` |
| `conv_rate` | `SUM(orders_quantity) / NULLIF(SUM(sessions), 0) * 100` |
| `sessions` | `SUM(sessions)` |
| `clicks` | `SUM(clicks)` |
| `impressions` | `SUM(impressions)` |

`buildMetricSql`:
```sql
SELECT <expr> AS value
FROM pixel_joined_tvf(
  subscription_filter      = NULL,
  include_custom_ad_spend  = true,
  sales_platform_filter    = NULL,
  use_click_date           = false
)
WHERE event_date BETWEEN @startDate AND @endDate
  AND attribution_window = '7_days'
  AND model = 'Triple Attribution'
```
(No `GROUP BY` → one blended row across channels. The `pixel_joined_tvf` args and
`7_days`/`Triple Attribution` are pptx defaults; **may need per-shop validation**
in TW's SQL Builder — see §8.)

### 3.3 Value extraction

`twValue(rows): number | null` — first row's `value` coerced to number; empty rows
or null → `null` (→ `NoDataError` in the adapter).

---

## 4. TripleWhale adapter (`lib/dashboard/adapters/triplewhale.ts` — rewrite)

`resolveTripleWhaleLeaf(b, ctx, dateRange, compareRange)`:
1. `isTwMetric(b.metric)` false → throw `TwQueryError` (→ `invalid-metric`).
2. Lazy-import `getClientBySlug`/`parseDateRange`/`resolveCompareIso` (db chain; keeps the module env-free to import, mirroring the SM adapter).
3. `apiKey = process.env.TRIPLE_WHALE_API_KEY`; `shopId = client?.triplewhaleShopId`. Either missing → `DisconnectedError`.
4. `query = buildMetricSql(b.metric)`. Current range: `parseDateRange(dateRange)` → `twSql(...)` → `twValue` (null → `NoDataError`).
5. Compare: `resolveCompareIso(dateRange, compareRange)` → if set, second `twSql` → `prevValue`.
6. Return `{ value, prevValue }`.

The stub (`stubValue`) is removed.

---

## 5. Supermetrics adapter — global-key fallback (`lib/dashboard/adapters/supermetrics.ts`)

Add a pure helper and use it in `resolveSupermetricsLeaf`:
```ts
resolveSmApiKey(smApiKeyEnvVar: string | null | undefined, env: NodeJS.ProcessEnv): string | undefined
// returns env[smApiKeyEnvVar] if set, else env.SUPERMETRICS_API_KEY, else undefined
```
Adapter uses `resolveSmApiKey(client?.smApiKeyEnvVar, process.env)`; `undefined` →
`DisconnectedError`. Existing `lib/supermetrics/client.ts` is untouched.

---

## 6. Schema + errors

- `lib/db/schema.ts`: add `triplewhaleShopId: text('triplewhale_shop_id')` to `clients` (nullable). `npm run db:generate` → migration `0009` (committed; applied to the R&D Neon branch, not run automatically).
- `lib/dashboard/errors.ts`: `mapError` adds `TwRateLimitError → 'rate-limited'`, `TwQueryError → 'invalid-metric'` (imported from `@/lib/triplewhale/client`). `DisconnectedError`/`NoDataError` reuse.

---

## 7. Testing (pure, env-free; `tsx` + `node:assert`)

- `twSql` (fake `fetchImpl`): request shape (url, `x-api-key`, body `period`), bare-list vs envelope parsing, `success:false` → error, 429-then-success retry.
- `queries`: every seeded metric (`ad_spend`, `blended_roas`, `conv_rate`, `sessions`) in the registry; `buildMetricSql` contains the expr + `@startDate`/`@endDate` + `pixel_joined_tvf`; `isTwMetric` true/false.
- `twValue`: number coercion; empty/null → null.
- `resolveSmApiKey`: per-client present; fallback to global; neither → undefined.
- `errors`: `mapError` for the two new TW errors.
- Adapter network wrappers (`resolveTripleWhaleLeaf`, `resolveSupermetricsLeaf`) are thin I/O — exercised via `resolveBlock` DI, not unit-tested directly.

---

## 8. Out of scope / open items

- **Env values:** add `TRIPLE_WHALE_API_KEY` + `SUPERMETRICS_API_KEY` to the **preview** Vercel env (neither is there yet); `.env.local` for local. Rename the local `TRIPLEWHALE_API_KEY`.
- **avenue-z shop id:** needs a real `triplewhale_shop_id` value to seed for end-to-end data; if avenue-z has no TW shop, blocks return `no-data`/`disconnected` until pointed at a client that does.
- **SQL correctness:** the `pixel_joined_tvf` args + attribution settings are pptx defaults; validate per-shop against TW's SQL Builder if numbers look off. Attribution window/model are not yet configurable per client (could be a later enhancement).
- **TripleWhale attribution/journeys endpoint** (the second pptx endpoint) is not needed for single-metric blocks — not ported.
