# Renaissance CRM Data, Pipeline Half: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Renaissance's Overview page real Salesforce data for Pipeline Performance, the Open Pipeline journey card, and weekly contact pacing, sourced through Supermetrics.

**Architecture:** A `lib/salesforce/` integration built as a faithful sibling of `lib/meta/` and `lib/linkedin/`: a typed config object stored on the client's database row, a `DS_IDS` entry, a thin `salesforceQuery` wrapper, and pure `transform*` functions that turn Supermetrics records into tile data. The Overview page (PR 207) then swaps its needs-connection placeholders for real components when config is present. Salesforce returns records rather than aggregates, so all summing happens in tested pure functions.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Drizzle + Neon Postgres, Supermetrics Data API, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-13-crm-parity-scorecard.md`

## Two halves, one dependency

**Half A (Tasks 1 to 6): the data layer.** Standalone. Depends only on `dev`. Builds and ships against this branch as it is.

**Half B (Tasks 7 to 10): the page wiring.** Modifies `components/report-sections/executive-overview/`, which exists only on branch `Executive-Overview-Duplicate-Ren` (PR 207). **Half B cannot start until PR 207 has merged to `dev` and this branch has been rebased onto it.** Task 7 is that rebase and is a hard gate.

Do not attempt to cherry-pick or merge the Overview branch into this one to skip the gate. Two PRs stay two PRs; both promote to staging together.

## Global Constraints

- **Account resolution always pins the Salesforce org id from `clients.salesforce_config`.** The literal string `list.all_accounts` must never appear anywhere in this codebase.
- **The org id lives in the database row, never in code.** This is the exact mistake that made the HubSpot sections unusable for any second client. Do not repeat it.
- **`opportunity_probability` is 0 to 100. Divide by 100 before multiplying by amount.** Porting the HubSpot formula unchanged overstates Weighted Pipeline by 100x. A test pins this.
- **CORRECTION, recorded after Half A shipped: `openDeals`, `totalPipeline`, and `weightedPipeline` never carry a year-over-year delta.** Openness is evaluated as of now, not as of the historical window, so a deal whose close date fell in the prior-year window has had a full year to close. Live check on 2026-08-16: the 2026 year-to-date window held 297 open deals; the same window in 2025 held exactly one still-open deal, carrying $0. Left unfixed, the open-deals tile rendered +29,600 percent. These three tiles suppress delta unconditionally, by design, even when the compare set has healthy nonzero values, because the comparison itself is structurally invalid, not because the data is missing. Only `closedWon` keeps a delta (it read +15.7 percent live), because closed-won is recorded at close time and does not decay with elapsed time. Half B must not build any UI expecting all four tiles to have a comparison.
- **On-screen copy never names a CRM vendor.** Labels say CRM, not Salesforce or HubSpot. The `NeedsConnection` card keeps `sourceName="CRM"`.
- **"Won" means the stage literal `Closed Won` exactly** (capital C, capital W, one space, no hyphen). Never `opportunity_is_won`, which also covers roughly 1,822 renewals carrying $0.
- **Sum by stage after fetching; never `find()` a stage row.** When `opportunity_probability` is in the field list, Supermetrics returns one row per (stage, probability) pair, so `Closed Won` appears twice. A `find()` silently drops the second row.
- **Salesforce fields come back as JS numbers and booleans, not strings**, despite `parseSmRows` typing them as `Record<string,string>`. Compare booleans with `=== true`, never `=== 'True'`. `Number(x)` on a number is harmless and is used for clarity.
- **Truncation is undetectable.** `meta.result.total_rows` counts returned rows plus header; `paginate` is always null. Set `maxRows` well above expected cardinality and treat `rows.length === maxRows` as a warning condition.
- **Never touch `components/report-sections/hubspot-performance/`, `inbound-funnel/`, `demand-overview/`, `ga4/`, or `charts/`.** No file under `lib/hubspot/` changes.
- **No em or en dashes** in prose, comments, or commit messages. Rendered em dashes for null values in copied formatters stay verbatim.
- **`tsc` is not in CI.** Run `npx tsc --noEmit` before every commit. `check:rsc` and `npm test` are in CI.
- **Do NOT run `npm run db:migrate` or `npm run db:seed`.** Generate the migration only; the coordinator applies it per environment. Seed is stale in both directions and would clobber live client rows.
- Commit after every task.

---

## File Structure

**Created**

| File | Responsibility |
|---|---|
| `lib/salesforce/base.ts` | `salesforceQuery` wrapper + `resolveCompareIso`, sibling of `lib/meta/base.ts` |
| `lib/salesforce/base.test.ts` | node:assert script for `resolveCompareIso`, sibling of `lib/meta/base.test.ts` |
| `lib/salesforce/types.ts` | Row and output types, `number`-typed after transform |
| `lib/salesforce/pipeline.ts` | `transformPipeline` (pure) + `getSalesforcePipeline` (fetch) |
| `lib/salesforce/pipeline.test.ts` | Vitest, pure-function tests for `transformPipeline` and `transformByOwner` |
| `lib/salesforce/pipeline.orchestration.test.ts` | Vitest, mocks `@/lib/salesforce/base`; covers `getSalesforcePipeline`'s failure paths (failed owner fetch, failed compare fetch, stage/owner truncation) kept separate so the mock never touches the pure-function tests |
| `lib/salesforce/contacts.ts` | `transformWeeklyContacts` (pure) + `getSalesforceWeeklyContacts` (fetch) |
| `lib/salesforce/contacts.test.ts` | Vitest, mocks `@/lib/salesforce/base` |
| `drizzle/0021_*.sql` | Generated by drizzle-kit, one `ALTER TABLE` |
| `components/report-sections/executive-overview/pipeline-performance.tsx` | Presentational, four KPI cards + by-owner bars |
| `components/report-sections/executive-overview/pipeline-performance.test.tsx` | Renders from fixture props |
| `components/report-sections/executive-overview/contact-pacing.tsx` | Presentational, weekly bars |
| `components/report-sections/executive-overview/contact-pacing.test.tsx` | Renders from fixture props |

**Modified, additively**

| File | Change |
|---|---|
| `lib/db/schema.ts` | `SalesforceConfig` interface + `salesforceConfig` jsonb column |
| `lib/supermetrics/constants.ts` | `SALESFORCE: 'SF'` in `DS_IDS` |
| `MIGRATIONS-PENDING.md` | one delivered-awaiting-apply entry |
| `scripts/seed.ts` | `salesforceConfig` field, null for avenue-z, populated for renaissance |
| `vitest.config.ts` | three new `lib/salesforce/*.test.ts` entries in the pinned include list (`base.test.ts` stays out, by convention: it is a node:assert script, not a vitest suite) |
| `components/report-sections/executive-overview/index.tsx` | two fetches, two conditional renders |
| `components/report-sections/executive-overview/stages.ts` | pipeline stage populated when data present |
| `components/report-sections/executive-overview/stages.test.ts` | null-CRM and populated-CRM cases |

**Not modified, deliberately.** `lib/db/schema.ts` `ReportSlug` (already has `'salesforce'`), `lib/constants.ts` `REPORT_NAMES` (already has `salesforce`), `lib/platforms/constants.ts` (already has the platform), the three auth pages' hardcoded `[PLATFORM_IDS.SALESFORCE]: false` (a separate product decision, recorded in Follow-ups).

---

## Half A: the data layer

### Task 1: Config type, column, and data-source id

**Files:**
- Modify: `lib/db/schema.ts`
- Modify: `lib/supermetrics/constants.ts`
- Create: `drizzle/0021_*.sql` (generated)
- Modify: `MIGRATIONS-PENDING.md`

**Interfaces:**
- Consumes: nothing
- Produces: `SalesforceConfig { salesforceAccountId: string }`, `clients.salesforceConfig`, `DS_IDS.SALESFORCE === 'SF'`

- [ ] **Step 1: Add the config interface**

In `lib/db/schema.ts`, immediately after the `LinkedInConfig` interface, add:

```ts
export interface SalesforceConfig {
  /** Salesforce org id, 18 chars, e.g. '00D15000000Em4GEAS'. Passed as the Supermetrics ds_accounts value. */
  salesforceAccountId: string
}
```

- [ ] **Step 2: Add the column**

In the `clients` table definition, immediately after the `linkedinConfig` line, add:

```ts
  salesforceConfig: jsonb('salesforce_config').$type<SalesforceConfig>(),
```

- [ ] **Step 3: Add the data-source id**

In `lib/supermetrics/constants.ts`, add `SALESFORCE: 'SF',` to `DS_IDS` after `SHOPIFY`. Update the doc comment above it from `Verified live: AW, FA, LIA, SHP.` to `Verified live: AW, FA, LIA, SHP, SF.` Do not add an `SM_TIME_DIMENSION` entry; that map is `Partial` and only the dashboard builder reads it.

- [ ] **Step 4: Generate the migration**

Run: `npm run db:generate`
Expected: a new file `drizzle/0021_old_silver_centurion.sql` containing exactly `ALTER TABLE "clients" ADD COLUMN "salesforce_config" jsonb;`, plus a snapshot and a journal entry. Verify with `grep -l salesforce_config drizzle/*.sql`. **Do not run `db:migrate`.**

- [ ] **Step 5: Record the pending migration**

Append to `MIGRATIONS-PENDING.md`, matching the format of the existing entries:

```markdown
## Add clients.salesforce_config (delivered, awaiting apply)

- Migration: `drizzle/0021_old_silver_centurion.sql`
- Adds one nullable jsonb column. No data change, no backfill.
- Apply per environment with `npm run db:migrate` against that environment's DATABASE_URL_UNPOOLED, then set the value for renaissance with a targeted UPDATE (see this plan's "Enablement, per environment" section, below). Never via db:seed.
```

- [ ] **Step 6: Verify types**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add lib/db/schema.ts lib/supermetrics/constants.ts drizzle/ MIGRATIONS-PENDING.md
git commit -m "feat(salesforce): config type, column, and data-source id

SalesforceConfig carries the org id, stored on the client row the same
way Meta and LinkedIn account ids are. That is the whole reason the
HubSpot sections cannot serve a second client: their pipeline and stage
ids live in shared code. This integration keeps every per-client
identifier in the database from the start.

DS_IDS gains SF, verified live against Supermetrics. Migration is
generated only, not applied; MIGRATIONS-PENDING records it."
```

---

### Task 2: The query wrapper

**Files:**
- Create: `lib/salesforce/base.ts`
- Create: `lib/salesforce/base.test.ts`

**Interfaces:**
- Consumes: `SalesforceConfig` from Task 1, `smQuery`/`parseSmRows`/`DS_IDS` from `@/lib/supermetrics/client`
- Produces: `salesforceQuery(slug, fields, dateRange, opts?)`, `resolveCompareIso(dateRange, compareRange)`

- [ ] **Step 1: Write the failing test**

Create `lib/salesforce/base.test.ts`:

```ts
// Run: npx tsx --env-file=.env.local lib/salesforce/base.test.ts
import { strict as assert } from 'node:assert'
import { resolveCompareIso } from './base'

assert.equal(resolveCompareIso('2026-01-01,2026-01-31', null), null)
assert.equal(resolveCompareIso('2026-01-01,2026-01-31', 'previous_period'), '2025-12-01,2025-12-31')
console.log('ok')
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx tsx --env-file=.env.local lib/salesforce/base.test.ts`
Expected: FAIL, cannot find module `./base`.

- [ ] **Step 3: Create the wrapper**

Create `lib/salesforce/base.ts`. This is `lib/meta/base.ts` with three substitutions and one addition (the `maxRows` default):

```ts
import { smQuery, parseSmRows, DS_IDS } from '@/lib/supermetrics/client'
import { getClientBySlug } from '@/lib/db/queries'
import { parseDateRange, deriveCompareRange } from '@/lib/ga4/client'

/**
 * Salesforce via Supermetrics. Returns records, not aggregates: a query with a
 * dimension yields one row per distinct dimension value, and truncation at
 * maxRows is not detectable from the response (no total, no paging token).
 * Callers set maxRows comfortably above expected cardinality and treat
 * rows.length === maxRows as a warning.
 *
 * Field values arrive as JS numbers and booleans even though parseSmRows types
 * them as strings. Compare booleans with === true, never with 'True'.
 */
export async function salesforceQuery(
  slug: string,
  fields: string[],
  dateRange: string,
  opts: { filters?: string; settings?: Record<string, unknown>; maxRows?: number } = {},
): Promise<Record<string, string>[]> {
  const client = await getClientBySlug(slug)
  const accountId = client?.salesforceConfig?.salesforceAccountId
  const envVar = client?.smApiKeyEnvVar
  if (!accountId || !envVar) throw new Error(`salesforce_config / sm_api_key_env_var missing for ${slug}`)
  const apiKey = process.env[envVar]
  if (!apiKey) throw new Error(`Missing env var ${envVar}`)
  const { startDate, endDate } = parseDateRange(dateRange)
  const result = await smQuery({
    apiKey,
    dsId: DS_IDS.SALESFORCE,
    dsAccounts: accountId,
    fields,
    dateRange: `${startDate},${endDate}`,
    filters: opts.filters,
    settings: opts.settings,
    maxRows: opts.maxRows ?? 500,
  })
  return parseSmRows(result)
}

export function resolveCompareIso(dateRange: string, compareRange: string | null): string | null {
  const r = deriveCompareRange(dateRange, compareRange)
  return r ? `${r.startDate},${r.endDate}` : null
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsx --env-file=.env.local lib/salesforce/base.test.ts`
Expected: prints `ok`.

- [ ] **Step 5: Verify types**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add lib/salesforce/base.ts lib/salesforce/base.test.ts
git commit -m "feat(salesforce): query wrapper, sibling of lib/meta/base

Reads the org id from the client row and the API key from the env var
the row names, exactly as metaQuery and linkedinQuery do. Default
maxRows is 500 rather than the global 10000 because Salesforce returns
records: a stage breakdown is under 20 rows and a by-owner breakdown
under 50, so 500 leaves headroom while keeping a runaway query bounded.

Documents the two things that bite: values arrive as numbers and
booleans despite the string typing, and truncation is invisible."
```

---

### Task 3: Pipeline transform and fetch

**Files:**
- Create: `lib/salesforce/types.ts`
- Create: `lib/salesforce/pipeline.ts`
- Create: `lib/salesforce/pipeline.test.ts`
- Modify: `vitest.config.ts`

**Interfaces:**
- Consumes: `salesforceQuery`, `resolveCompareIso` from Task 2
- Produces: `PipelineKpis`, `PipelineData` (extends `PipelineKpis`), `transformPipeline(rows, cmpRows)` returning `PipelineKpis`, `getSalesforcePipeline(slug)` returning `PipelineData`, `transformByOwner(rows, maxRows)`

- [ ] **Step 1: Write the types**

Create `lib/salesforce/types.ts`:

```ts
/** One aggregated stage row from Supermetrics. Numbers, not strings, at runtime. */
export interface StageRow {
  stage: string
  isClosed: boolean
  /** 0 to 100 as returned. Divide by 100 before weighting. */
  probability: number
  count: number
  amount: number
}

export interface PipelineKpi {
  value: number
  /**
   * Percent change vs the compare window. Undefined covers two different
   * cases: no baseline was available (compare fetch failed, or the prior
   * value was 0), or the comparison is withheld on purpose because it would
   * be structurally invalid, as it is for openDeals, totalPipeline, and
   * weightedPipeline (see Global Constraints). The two cases are not
   * distinguished in this type yet; see the note in Task 8.
   */
  delta?: number
}

export interface OwnerRow {
  owner: string
  count: number
  amount: number
}

/** The four headline tiles. What transformPipeline returns: pure aggregation, no fetch state. */
export interface PipelineKpis {
  openDeals: PipelineKpi
  totalPipeline: PipelineKpi
  closedWon: PipelineKpi
  weightedPipeline: PipelineKpi
}

/** What getSalesforcePipeline returns: the four tiles plus the fetched, fetch-state-aware pieces. */
export interface PipelineData extends PipelineKpis {
  /**
   * null means the owner query failed and we have no data. [] means the query
   * succeeded and this client genuinely has no open owners. Do not conflate
   * the two: a failed fetch must never render as "this client has no owners".
   */
  byOwner: OwnerRow[] | null
  /** True when the by-owner query hit maxRows, so the list may be truncated. */
  ownersTruncated: boolean
  /**
   * True when the stage query hit maxRows, so the four headline tiles derived
   * from it (openDeals, totalPipeline, closedWon, weightedPipeline) may be
   * undercounted. Parallel to ownersTruncated, but higher stakes: this one
   * drives the client-facing headline numbers, not just a supporting chart.
   */
  stageTruncated: boolean
}
```

- [ ] **Step 2: Write the failing test**

Create `lib/salesforce/pipeline.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { transformPipeline, transformByOwner } from './pipeline'

// Shaped exactly like parseSmRows output for the stage query. Values are numbers
// and booleans at runtime despite the string typing, so fixtures use real types.
const rows = [
  { opportunity_stage_name: 'Closed Lost',       opportunity_is_won: false, opportunity_is_closed: true,  opportunity_probability: 0,   opportunity_count: 5314, opportunity_amount: 407918882.38 },
  { opportunity_stage_name: 'Renewed',           opportunity_is_won: true,  opportunity_is_closed: true,  opportunity_probability: 100, opportunity_count: 1822, opportunity_amount: 0 },
  { opportunity_stage_name: 'Closed Won',        opportunity_is_won: true,  opportunity_is_closed: true,  opportunity_probability: 100, opportunity_count: 624,  opportunity_amount: 30352228.14 },
  { opportunity_stage_name: 'Proposal Released', opportunity_is_won: false, opportunity_is_closed: false, opportunity_probability: 25,  opportunity_count: 270,  opportunity_amount: 16333132.59 },
  { opportunity_stage_name: 'Set Up',            opportunity_is_won: false, opportunity_is_closed: false, opportunity_probability: 5,   opportunity_count: 11,   opportunity_amount: 123238.68 },
  // The trap: Closed Won appears twice when probability is a dimension.
  { opportunity_stage_name: 'Closed Won',        opportunity_is_won: true,  opportunity_is_closed: true,  opportunity_probability: 25,  opportunity_count: 1,    opportunity_amount: 15297.6 },
] as unknown as Record<string, string>[]

describe('transformPipeline', () => {
  it('counts open deals as not-closed only', () => {
    const p = transformPipeline(rows, null)
    expect(p.openDeals.value).toBe(281) // 270 + 11
  })

  it('sums open pipeline amount', () => {
    const p = transformPipeline(rows, null)
    expect(p.totalPipeline.value).toBeCloseTo(16456371.27, 2)
  })

  it('identifies won by the Closed Won stage literal, not the won flag', () => {
    const p = transformPipeline(rows, null)
    // Renewed is won=true but is NOT counted: it carries $0 and is not new business.
    expect(p.closedWon.value).toBeCloseTo(30352228.14 + 15297.6, 2)
  })

  it('sums both Closed Won rows rather than finding the first', () => {
    const p = transformPipeline(rows, null)
    expect(p.closedWon.value).toBeGreaterThan(30352228.14)
  })

  it('divides probability by 100 before weighting', () => {
    const p = transformPipeline(rows, null)
    // 16333132.59 * 0.25 + 123238.68 * 0.05
    expect(p.weightedPipeline.value).toBeCloseTo(4083283.15 + 6161.93, 0)
    // The 100x trap: if not divided, this would be ~408 million.
    expect(p.weightedPipeline.value).toBeLessThan(10_000_000)
  })

  it('suppresses delta on openDeals, totalPipeline, and weightedPipeline even with a healthy nonzero compare set', () => {
    const cmp = [
      { opportunity_stage_name: 'Proposal Released', opportunity_is_won: false, opportunity_is_closed: false, opportunity_probability: 25, opportunity_count: 200, opportunity_amount: 10_000_000 },
    ] as unknown as Record<string, string>[]
    const withCmp = transformPipeline(rows, cmp)
    expect(withCmp.openDeals.delta).toBeUndefined()
    expect(withCmp.totalPipeline.delta).toBeUndefined()
    expect(withCmp.weightedPipeline.delta).toBeUndefined()
    const noCmp = transformPipeline(rows, null)
    expect(noCmp.openDeals.delta).toBeUndefined()
  })

  it('still computes closedWon delta from its own prior, not a cross-wired one', () => {
    const cmp = [
      { opportunity_stage_name: 'Closed Won', opportunity_is_won: true, opportunity_is_closed: true, opportunity_probability: 100, opportunity_count: 500, opportunity_amount: 25_000_000 },
    ] as unknown as Record<string, string>[]
    const withCmp = transformPipeline(rows, cmp)
    expect(withCmp.closedWon.delta).toBeCloseTo(((30367525.74 - 25_000_000) / 25_000_000) * 100, 1)
    const noCmp = transformPipeline(rows, null)
    expect(noCmp.closedWon.delta).toBeUndefined()
  })

  it('returns zeros, not throws, on empty input', () => {
    const p = transformPipeline([], null)
    expect(p.openDeals.value).toBe(0)
    expect(p.closedWon.value).toBe(0)
  })
})

describe('transformByOwner', () => {
  const owners = [
    { opportunity_owner: 'Owner A', opportunity_count: 10, opportunity_amount: 500 },
    { opportunity_owner: 'Owner B', opportunity_count: 30, opportunity_amount: 100 },
  ] as unknown as Record<string, string>[]

  it('sorts by count descending', () => {
    const out = transformByOwner(owners, 500)
    expect(out.rows.map(r => r.owner)).toEqual(['Owner B', 'Owner A'])
  })

  it('flags truncation when the row count hits maxRows', () => {
    expect(transformByOwner(owners, 2).truncated).toBe(true)
    expect(transformByOwner(owners, 500).truncated).toBe(false)
  })
})
```

- [ ] **Step 3: Add the test files to the vitest include list**

In `vitest.config.ts`, the `include` array is a pinned allowlist. Add these three entries near the existing `lib/meta/kpis.test.ts` line:

```ts
    'lib/salesforce/pipeline.test.ts',
    'lib/salesforce/pipeline.orchestration.test.ts',
    'lib/salesforce/contacts.test.ts',
```

(`contacts.test.ts` does not exist yet; vitest tolerates a missing include entry. Task 4 creates it. `pipeline.orchestration.test.ts` is also created in this task, alongside `pipeline.ts`, to cover `getSalesforcePipeline`'s failure paths with `@/lib/salesforce/base` mocked; it is kept out of `pipeline.test.ts` so that mock never touches the pure-function tests. `base.test.ts` is deliberately NOT added here: it is a `node:assert` script run with `npx tsx`, not a vitest suite, same convention as `lib/meta/base.test.ts`, so `npm test` never runs it.)

- [ ] **Step 4: Run the test to verify it fails**

Run: `npx vitest run lib/salesforce/pipeline.test.ts`
Expected: FAIL, cannot resolve `./pipeline`.

- [ ] **Step 5: Write the module**

Create `lib/salesforce/pipeline.ts`:

```ts
import { salesforceQuery, resolveCompareIso } from './base'
import type { PipelineKpis, PipelineData, PipelineKpi, StageRow, OwnerRow } from './types'

const STAGE_FIELDS = [
  'opportunity_stage_name', 'opportunity_is_won', 'opportunity_is_closed',
  'opportunity_probability', 'opportunity_count', 'opportunity_amount',
]
// is_closed lets the owner breakdown filter down to open deals client-side. A
// server-side filter is avoided on purpose: a typo'd filter field returns HTTP 200
// with empty data and no error, indistinguishable from a legitimate zero result.
const OWNER_FIELDS = ['opportunity_owner', 'opportunity_is_closed', 'opportunity_count', 'opportunity_amount']
const OWNER_MAX_ROWS = 500
const STAGE_MAX_ROWS = 500

/** The only stage that means new-business won. Never use is_won: it also covers renewals carrying $0. */
const CLOSED_WON = 'Closed Won'

/** Coerces a Supermetrics numeric field to a finite number, falling back to 0
 * on anything unparseable so one bad value cannot poison an entire reduce. */
function toNumber(v: unknown): number {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}

function toStageRows(rows: Record<string, string>[]): StageRow[] {
  return rows.map((r) => ({
    stage:       String(r.opportunity_stage_name ?? ''),
    // Booleans arrive as real booleans despite the string typing.
    isClosed:    (r.opportunity_is_closed as unknown) === true,
    probability: toNumber(r.opportunity_probability),
    count:       toNumber(r.opportunity_count),
    amount:      toNumber(r.opportunity_amount),
  }))
}

function pct(current: number, prior: number | undefined): number | undefined {
  if (prior == null || prior === 0) return undefined
  return ((current - prior) / prior) * 100
}

function kpi(value: number, prior?: number): PipelineKpi {
  return { value, delta: pct(value, prior) }
}

/** A tile with delta deliberately withheld. See the comment in transformPipeline for why. */
function kpiNoDelta(value: number): PipelineKpi {
  return { value }
}

/**
 * Aggregates a stage breakdown into the four pipeline tiles.
 * Sums by stage rather than finding a row: when probability is a dimension,
 * a stage can appear on more than one row.
 */
export function transformPipeline(
  rows: Record<string, string>[],
  cmpRows: Record<string, string>[] | null,
): PipelineKpis {
  const agg = (input: StageRow[]) => {
    const open = input.filter((r) => !r.isClosed)
    const won  = input.filter((r) => r.stage === CLOSED_WON)
    return {
      openDeals:     open.reduce((s, r) => s + r.count, 0),
      totalPipeline: open.reduce((s, r) => s + r.amount, 0),
      closedWon:     won.reduce((s, r) => s + r.amount, 0),
      // Probability is 0 to 100. Divide by 100 or the result is 100x too large.
      weighted:      open.reduce((s, r) => s + r.amount * (r.probability / 100), 0),
    }
  }
  const cur = agg(toStageRows(rows))
  const prev = cmpRows ? agg(toStageRows(cmpRows)) : null
  return {
    // openDeals, totalPipeline, and weightedPipeline never carry a year-over-year
    // delta, on purpose, unconditionally, even when prev has healthy nonzero
    // values. Openness is evaluated as of now, so a prior-year window has had a
    // full year to close and trends toward zero open by construction; comparing
    // this year's open pipeline against that is not a missing comparison, it is
    // an invalid one. See Global Constraints for the live figures.
    openDeals:        kpiNoDelta(cur.openDeals),
    totalPipeline:    kpiNoDelta(cur.totalPipeline),
    // closedWon is unaffected: closed-won is a historical fact recorded at close
    // time, so comparing this year's to last year's is a sound comparison.
    closedWon:        kpi(cur.closedWon, prev?.closedWon),
    weightedPipeline: kpiNoDelta(cur.weighted),
  }
}

/**
 * Keeps only open (not-closed) rows, then aggregates by owner: one owner can
 * span more than one row now that is_closed is a dimension. Sorted by count
 * descending so the heaviest owners lead the chart.
 */
export function transformByOwner(
  rows: Record<string, string>[],
  maxRows: number,
): { rows: OwnerRow[]; truncated: boolean } {
  const open = rows.filter((r) => (r.opportunity_is_closed as unknown) !== true)
  const byOwner = new Map<string, OwnerRow>()
  for (const r of open) {
    const owner = String(r.opportunity_owner || 'Unassigned')
    const count = toNumber(r.opportunity_count)
    const amount = toNumber(r.opportunity_amount)
    const existing = byOwner.get(owner)
    if (existing) {
      existing.count += count
      existing.amount += amount
    } else {
      byOwner.set(owner, { owner, count, amount })
    }
  }
  const out = Array.from(byOwner.values()).sort((a, b) => b.count - a.count)
  return { rows: out, truncated: rows.length >= maxRows }
}

/**
 * Fetches this year to date and the same window last year, plus the by-owner
 * breakdown, and returns the assembled tile data. Compare failure degrades to
 * no deltas rather than failing the section.
 */
export async function getSalesforcePipeline(slug: string): Promise<PipelineData> {
  const dateRange = 'year_to_date'
  const cmpIso = resolveCompareIso(dateRange, 'previous_year')
  const [stageRows, cmpStageRows, ownerRows] = await Promise.all([
    salesforceQuery(slug, STAGE_FIELDS, dateRange, { maxRows: STAGE_MAX_ROWS }),
    cmpIso
      ? salesforceQuery(slug, STAGE_FIELDS, cmpIso, { maxRows: STAGE_MAX_ROWS }).catch((e) => {
          console.error(`[salesforce] pipeline compare fetch failed for ${slug}:`, e)
          return null
        })
      : Promise.resolve(null),
    salesforceQuery(slug, OWNER_FIELDS, dateRange, { maxRows: OWNER_MAX_ROWS }).catch((e) => {
      // A failed fetch must surface as byOwner: null, never as an empty list, so
      // it never reads as "this client has no owners". Log before swallowing.
      console.error(`[salesforce] owner fetch failed for ${slug}:`, e)
      return null
    }),
  ])
  const kpis = transformPipeline(stageRows, cmpStageRows)
  const owner = ownerRows ? transformByOwner(ownerRows, OWNER_MAX_ROWS) : null
  return {
    ...kpis,
    byOwner: owner ? owner.rows : null,
    ownersTruncated: owner ? owner.truncated : false,
    // Drives all four headline tiles, unlike the owner breakdown, so a silent
    // truncation here would corrupt client-facing numbers rather than just a chart.
    stageTruncated: stageRows.length >= STAGE_MAX_ROWS,
  }
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run lib/salesforce/pipeline.test.ts`
Expected: PASS, 18 tests.

- [ ] **Step 7: Verify types**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add lib/salesforce/types.ts lib/salesforce/pipeline.ts lib/salesforce/pipeline.test.ts vitest.config.ts
git commit -m "feat(salesforce): pipeline transform and fetch, tested

Pure transformPipeline aggregates a stage breakdown into the four tiles.
It sums by stage rather than finding a row, because probability as a
dimension splits Closed Won across two rows and find() would drop one.
Won means the Closed Won stage literal, never the won flag, which also
covers roughly 1,822 renewals carrying zero dollars.

The 100x trap is pinned by a test: probability arrives 0 to 100 and is
divided before weighting. A weighted pipeline in the hundreds of millions
would have looked plausible.

By-owner replaces lead source, which is blank on 99.99 percent of their
records. Truncation is flagged when the row count hits maxRows, since
the API gives no other signal."
```

---

### Task 4: Weekly contact pacing transform and fetch

**Files:**
- Create: `lib/salesforce/contacts.ts`
- Create: `lib/salesforce/contacts.test.ts`

**Interfaces:**
- Consumes: `salesforceQuery`, `resolveCompareIso` from Task 2
- Produces: `WeeklyContacts`, `transformWeeklyContacts(rows, priorYearTotal)`, `getSalesforceWeeklyContacts(slug)`

- [ ] **Step 1: Add the types**

Append to `lib/salesforce/types.ts`:

```ts
export interface WeekBucket {
  /** ISO year and week, e.g. '2026-W33'. Normalized from the API's 'YYYY|WW'. */
  week: string
  contacts: number
}

export interface WeeklyContacts {
  weeks: WeekBucket[]
  currentWeek: number
  previousWeek: number
  /** Same ISO week last year, or undefined when the compare query failed. */
  priorYearWeek?: number
  /** Percent change current vs previous week, undefined when previous is 0. */
  weekOverWeek?: number
}
```

- [ ] **Step 2: Write the failing test**

Create `lib/salesforce/contacts.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { transformWeeklyContacts } from './contacts'

// Real key format from the API: pipe-separated, zero-padded week.
const rows = [
  { yearWeekIso_created: '2026|31', contact_count: 132 },
  { yearWeekIso_created: '2026|33', contact_count: 131 },
  { yearWeekIso_created: '2026|32', contact_count: 100 },
] as unknown as Record<string, string>[]

describe('transformWeeklyContacts', () => {
  it('normalizes the pipe key to ISO form and sorts ascending', () => {
    const w = transformWeeklyContacts(rows, undefined)
    expect(w.weeks.map(b => b.week)).toEqual(['2026-W31', '2026-W32', '2026-W33'])
  })

  it('reads current and previous week from the last two buckets', () => {
    const w = transformWeeklyContacts(rows, undefined)
    expect(w.currentWeek).toBe(131)
    expect(w.previousWeek).toBe(100)
  })

  it('computes week over week from those two', () => {
    const w = transformWeeklyContacts(rows, undefined)
    expect(w.weekOverWeek).toBeCloseTo(31, 0)
  })

  it('carries prior-year week when supplied and omits it when not', () => {
    expect(transformWeeklyContacts(rows, 90).priorYearWeek).toBe(90)
    expect(transformWeeklyContacts(rows, undefined).priorYearWeek).toBeUndefined()
  })

  it('returns zeros, not throws, on empty input', () => {
    const w = transformWeeklyContacts([], undefined)
    expect(w.weeks).toEqual([])
    expect(w.currentWeek).toBe(0)
    expect(w.weekOverWeek).toBeUndefined()
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run lib/salesforce/contacts.test.ts`
Expected: FAIL, cannot resolve `./contacts`.

- [ ] **Step 4: Write the module**

Create `lib/salesforce/contacts.ts`:

```ts
import { salesforceQuery, resolveCompareIso } from './base'
import type { WeeklyContacts, WeekBucket } from './types'

const WEEK_FIELDS = ['yearWeekIso_created', 'contact_count']

/** The API returns 'YYYY|WW'. Normalize to 'YYYY-Www' so it sorts and reads as ISO. */
function normalizeWeek(key: string): string {
  const [year, week] = String(key).split('|')
  return `${year}-W${String(week ?? '').padStart(2, '0')}`
}

/** A normalized week key looks like '2026-W33'. Anything else (e.g. a missing
 * or malformed yearWeekIso_created normalizes to '-W00') is not a real week,
 * and is dropped rather than kept: '-W00' sorts first, so with exactly two
 * buckets it could otherwise land in previousWeek and produce a nonsense
 * weekOverWeek. */
const WEEK_KEY_RE = /^\d{4}-W\d{2}$/

export function transformWeeklyContacts(
  rows: Record<string, string>[],
  priorYearWeek: number | undefined,
): WeeklyContacts {
  const weeks: WeekBucket[] = rows
    .map((r) => ({ week: normalizeWeek(String(r.yearWeekIso_created ?? '')), contacts: Number(r.contact_count ?? 0) }))
    .filter((b) => WEEK_KEY_RE.test(b.week))
    .sort((a, b) => a.week.localeCompare(b.week))
  const currentWeek  = weeks.at(-1)?.contacts ?? 0
  const previousWeek = weeks.at(-2)?.contacts ?? 0
  const weekOverWeek = previousWeek > 0 ? ((currentWeek - previousWeek) / previousWeek) * 100 : undefined
  return { weeks, currentWeek, previousWeek, priorYearWeek, weekOverWeek }
}

/**
 * Weekly buckets year to date, plus the same window last year for the
 * prior-year comparison. The compare query failing degrades to no prior-year
 * figure rather than failing the block. The Contacts report type filters on
 * contact created date, so these are genuinely new contacts per week.
 */
export async function getSalesforceWeeklyContacts(slug: string): Promise<WeeklyContacts> {
  const dateRange = 'year_to_date'
  const cmpIso = resolveCompareIso(dateRange, 'previous_year')
  const [rows, cmpRows] = await Promise.all([
    salesforceQuery(slug, WEEK_FIELDS, dateRange, { maxRows: 100 }),
    cmpIso ? salesforceQuery(slug, WEEK_FIELDS, cmpIso, { maxRows: 100 }).catch(() => null) : Promise.resolve(null),
  ])
  // Prior-year week: the bucket in the compare set with the same ISO week number as our latest week.
  let priorYearWeek: number | undefined
  if (cmpRows) {
    const latest = normalizeWeek(String(rows.at(-1)?.yearWeekIso_created ?? ''))
    const wantWeek = latest.split('-W')[1]
    const hit = cmpRows.find((r) => normalizeWeek(String(r.yearWeekIso_created ?? '')).endsWith(`-W${wantWeek}`))
    if (hit) priorYearWeek = Number(hit.contact_count ?? 0)
  }
  return transformWeeklyContacts(rows, priorYearWeek)
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run lib/salesforce/contacts.test.ts`
Expected: PASS, 19 tests.

- [ ] **Step 6: Verify types**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add lib/salesforce/types.ts lib/salesforce/contacts.ts lib/salesforce/contacts.test.ts
git commit -m "feat(salesforce): weekly contact pacing, tested

The API keys weeks as YYYY pipe WW; the transform normalizes to ISO
YYYY-Www so buckets sort correctly and read as standard week ids. Current
and previous week come from the last two buckets, week over week from
those, and the prior-year figure from the compare query when it succeeds.

This is the strongest series in their Salesforce: roughly five thousand
contacts a year, steady since 2016, no gaps."
```

---

### Task 5: Live verification against Supermetrics, no dev database round trip

**CORRECTION, recorded after the fact.** This task originally instructed applying migration `0021` to dev, then running the `UPDATE` below, then probing the fetchers. I did neither the migration nor the `UPDATE`. This section now records what I actually did and why, instead of steps that were never taken.

**Why I skipped the dev migration and the UPDATE.** Dev's drizzle bookkeeping already disagrees with the repository journal: more migrations are recorded as applied in dev's database than are listed in `drizzle/meta/_journal.json` (25 recorded versus 22 entries in the journal file as it stood on this branch when I checked; the journal's entry count is itself branch-local and will not necessarily read the same on dev, so treat the count as a snapshot, not a fixed number to match against). See "Enablement, per environment," below, for the durable record of this. Running `db:migrate` against dev would apply more than this change intends on top of drift that already exists there. That is a landmine for whoever next runs `db:migrate` against dev without knowing the counts disagree, so I left it recorded here and in the commit rather than running it blind.

**What I verified instead.** Zero database access. I ran the real `transformPipeline`, `transformByOwner`, and `transformWeeklyContacts` (the pure functions) over real Renaissance responses pulled from the live Supermetrics API against real Salesforce data, querying with the org id supplied directly rather than through `getClientBySlug`. That covers strictly more risk surface than a dev round trip would have: it exercises the actual transform logic against actual live data shapes, not a mocked fixture, and it is what caught the bug below. What it does not exercise: the roughly six lines inside `salesforceQuery` in `lib/salesforce/base.ts` that read the org id off the client row and resolve the env var naming the API key, since this verification never called that wrapper. Those lines are a character-for-character clone of the equivalent lines in `lib/meta/base.ts`, which run in production daily. Also unexercised: the migration SQL applying at all, a single additive nullable jsonb column.

**It found a real bug.** By-owner deal count matched the open-deals tile exactly at 297, confirming the open-deals filter is correct rather than merely plausible. Weighted pipeline landed at 4.3M against 18.0M total, confirming the probability divide-by-100. Weekly contacts returned a full 33-bucket year-to-date series, sorted, no malformed keys. And the open-deals tile rendered +29,600 percent before the fix: see the Pipeline year-over-year note in Global Constraints for the live figures (297 open deals in 2026 YTD versus 1 in the same window a year earlier). Fixed in the commit immediately before the verification commit.

- [x] **Step 1: Run the real transforms against real Supermetrics data for renaissance**

No SQL, no migration, no UPDATE, no `getClientBySlug`. Real Salesforce data fetched from the live Supermetrics API with the org id supplied directly, then fed through the real `transformPipeline`, `transformByOwner`, and `transformWeeklyContacts`.

- [x] **Step 2: Record the result**

Actual commit: `chore(salesforce): data layer verified against live Salesforce` (`e7db8e2`), not "verified live on dev". That original wording would misstate what happened: no dev database was read or written for this. The commit body carries the 25-versus-22 journal drift and the bug found.

---

### Task 6: Seed parity

**Files:**
- Modify: `scripts/seed.ts`

- [ ] **Step 1: Add the field**

In `scripts/seed.ts`, add `salesforceConfig: SalesforceConfig | null` to the local client interface next to `linkedinConfig`, import the type from `@/lib/db/schema`, set it to `null` on the avenue-z literal, to `{ salesforceAccountId: '00D15000000Em4GEAS' }` on the renaissance literal, and include it in the insert values mapping alongside `linkedinConfig`.

- [ ] **Step 2: Verify types, do not run the seed**

Run: `npx tsc --noEmit`
Expected: clean. **Do not run `npm run db:seed`.** The seed is stale against live data in both directions; this change keeps it type-correct and honest for the next person, nothing more.

- [ ] **Step 3: Commit**

```bash
git add scripts/seed.ts
git commit -m "chore(seed): salesforceConfig field, renaissance org id

Keeps the seed type-correct and honest. Not run: the seed is stale
against the live database in both directions and would clobber real
rows. Enablement is a targeted UPDATE per environment."
```

**Half A is complete here.** Push the branch. It is reviewable and mergeable on its own; nothing in it touches a rendered page.

---

## Half B: page wiring

### Task 7: GATE. Rebase onto dev after PR 207 merges

**Do not proceed past this task until PR 207 (`Executive-Overview-Duplicate-Ren`) has merged to `dev`.**

- [ ] **Step 1: Confirm the gate**

Run: `git fetch origin && git log origin/dev --oneline -1 && git ls-tree origin/dev components/report-sections/executive-overview/ | head -1`
Expected: the second command lists at least one file. If it prints nothing, PR 207 has not merged. Stop.

- [ ] **Step 2: Rebase**

Run: `git rebase origin/dev`
Expected: clean, or at worst a trivial conflict. Both branches touch `lib/db/schema.ts` (PR 207 adds `'executive-overview'` to the `ReportSlug` union; this branch adds the `SalesforceConfig` interface and the `salesforceConfig` column), but in different hunks, so a clean rebase is the expected outcome, not a guarantee. If a conflict appears there, resolve it by keeping both additions; it does not need escalation on its own. Escalate only if a conflict appears somewhere the branches were not expected to overlap.

- [ ] **Step 3: Verify the merged state**

Run: `npx tsc --noEmit && npm test 2>&1 | tail -3`
Expected: tsc clean; the suite green including PR 207's 30 tests and Half A's 44.

- [ ] **Step 4: Push**

Run: `git push --force-with-lease`

---

### Task 8: Pipeline Performance component

**Files:**
- Create: `components/report-sections/executive-overview/pipeline-performance.tsx`
- Create: `components/report-sections/executive-overview/pipeline-performance.test.tsx`

**Interfaces:**
- Consumes: `PipelineData` from Task 3, `KpiCard` from `./kpi-card` (the executive-overview copy)
- Produces: `PipelinePerformance({ data: PipelineData })`

- [ ] **Step 1: Write the failing test**

```tsx
import { expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PipelinePerformance } from './pipeline-performance'
import type { PipelineData } from '@/lib/salesforce/types'

// openDeals, totalPipeline, and weightedPipeline never carry a delta (see Global
// Constraints); only closedWon does, and the fixture reflects that rather than
// pretending all four have one.
const data: PipelineData = {
  openDeals:        { value: 281 },
  totalPipeline:    { value: 16456371 },
  closedWon:        { value: 30367525, delta: 15.7 },
  weightedPipeline: { value: 4089445 },
  byOwner: [{ owner: 'Owner A', count: 30, amount: 100 }, { owner: 'Owner B', count: 10, amount: 500 }],
  ownersTruncated: false,
  stageTruncated: false,
}

test('renders the four tiles with formatted values', () => {
  render(<PipelinePerformance data={data} />)
  expect(screen.getByText('281')).toBeInTheDocument()
  expect(screen.getByText('$16,456,371')).toBeInTheDocument()
  expect(screen.getByText('$30,367,525')).toBeInTheDocument()
  expect(screen.getByText('$4,089,445')).toBeInTheDocument()
})

test('renders owners in the order given', () => {
  render(<PipelinePerformance data={data} />)
  const text = document.body.textContent ?? ''
  expect(text.indexOf('Owner A')).toBeLessThan(text.indexOf('Owner B'))
})

test('names no CRM vendor on screen', () => {
  render(<PipelinePerformance data={data} />)
  expect(document.body.textContent).not.toMatch(/Salesforce|HubSpot/)
})

test('shows a truncation note only when flagged', () => {
  const { rerender } = render(<PipelinePerformance data={data} />)
  expect(screen.queryByText(/may be incomplete/i)).toBeNull()
  rerender(<PipelinePerformance data={{ ...data, ownersTruncated: true }} />)
  expect(screen.getByText(/may be incomplete/i)).toBeInTheDocument()
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run components/report-sections/executive-overview/pipeline-performance.test.tsx`
Expected: FAIL, cannot resolve.

- [ ] **Step 3: Write the component**

A server component (no `'use client'`): four `KpiCard`s in a `grid grid-cols-2 gap-5 lg:grid-cols-4` using the executive-overview `KpiCard` copy, then a "Open Deals by Owner" `h3` and a plain list of horizontal bars (a `div` per owner with a width proportional to `count / max`, label left, `count` right). USD via `toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })`. Deltas passed straight through as `delta`, with `deltaLabel="vs same period last year"`. Only the closedWon tile sets `comparisonExpected`: openDeals, totalPipeline, and weightedPipeline never carry a delta by design (see Global Constraints), so their cards must not render as if a comparison is coming. When `ownersTruncated`, render a muted line: `Owner list may be incomplete.`

`byOwner` is `OwnerRow[] | null`, not just `OwnerRow[]`: `null` means the owner fetch failed and there is no data, while `[]` means the fetch succeeded and this client genuinely has no open owners right now. These must render differently. When `byOwner` is `null`, skip the bar list entirely and render a muted line instead (e.g. `Owner breakdown unavailable.`), distinct from both the populated-list case and from the truncation note above. Do not fall through to the same empty-list rendering `[]` would produce: that would silently misreport a failed fetch as "this client has no owners," which is exactly what the type's null/empty distinction exists to prevent. No vendor name anywhere.

**Open item, not resolved here:** `delta: undefined` on a `PipelineKpi` currently cannot be distinguished from "the compare fetch failed." For openDeals, totalPipeline, and weightedPipeline that ambiguity does not matter today (they are always undefined, deliberately). It will matter the moment any future tile's delta is *supposed* to be data-dependent and the UI needs to tell "no comparison exists" apart from "the comparison failed to load." Half B should decide how that distinction renders, if at all, rather than carry the ambiguity forward silently.

- [ ] **Step 4: Run to green, tsc, rsc**

Run: `npx vitest run components/report-sections/executive-overview/pipeline-performance.test.tsx && npx tsc --noEmit && npm run check:rsc`
Expected: 4 tests pass, both checks clean.

- [ ] **Step 5: Commit**

```bash
git add components/report-sections/executive-overview/pipeline-performance.tsx components/report-sections/executive-overview/pipeline-performance.test.tsx
git commit -m "feat(exec-overview): Pipeline Performance block from CRM data

Four tiles and a by-owner bar list, presentational only, taking the
already-aggregated PipelineData. By-owner stands in for lead source,
which is blank on 99.99 percent of records in their CRM. A truncation
note appears when the owner query hit its row cap, since the API gives
no other signal."
```

---

### Task 9: Contact pacing component

**Files:**
- Create: `components/report-sections/executive-overview/contact-pacing.tsx`
- Create: `components/report-sections/executive-overview/contact-pacing.test.tsx`

**Interfaces:**
- Consumes: `WeeklyContacts` from Task 4
- Produces: `ContactPacing({ data: WeeklyContacts })`

- [ ] **Step 1: Write the failing test**

```tsx
import { expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ContactPacing } from './contact-pacing'
import type { WeeklyContacts } from '@/lib/salesforce/types'

const data: WeeklyContacts = {
  weeks: [{ week: '2026-W31', contacts: 132 }, { week: '2026-W32', contacts: 100 }, { week: '2026-W33', contacts: 131 }],
  currentWeek: 131, previousWeek: 100, priorYearWeek: 90, weekOverWeek: 31,
}

test('renders current, previous and prior-year figures', () => {
  render(<ContactPacing data={data} />)
  expect(screen.getByText('131')).toBeInTheDocument()
  expect(screen.getByText('100')).toBeInTheDocument()
  expect(screen.getByText('90')).toBeInTheDocument()
})

test('omits the prior-year tile when the figure is absent', () => {
  render(<ContactPacing data={{ ...data, priorYearWeek: undefined }} />)
  expect(screen.queryByText(/prior year/i)).toBeNull()
})

test('renders one bar per week', () => {
  const { container } = render(<ContactPacing data={data} />)
  expect(container.querySelectorAll('[data-week]')).toHaveLength(3)
})

test('names no CRM vendor on screen', () => {
  render(<ContactPacing data={data} />)
  expect(document.body.textContent).not.toMatch(/Salesforce|HubSpot/)
})
```

- [ ] **Step 2: Run to verify it fails, then write the component**

Server component. Three `KpiCard`s (Current Week, Previous Week, Prior Year Week; the third only when `priorYearWeek != null`), with `weekOverWeek` as the Current Week delta and `deltaLabel="vs previous week"`. Then a simple bar row: one `div[data-week]` per bucket, height proportional to `contacts / max`, week label beneath as `W33`. No ICP/MCP coloring; a single neutral color, since no lead-quality field exists in their CRM. No vendor name.

- [ ] **Step 3: Run to green, tsc, rsc, commit**

```bash
git commit -m "feat(exec-overview): weekly contact pacing from CRM data

Current, previous and prior-year week tiles over a single-color bar row.
No lead-quality split: their CRM has no equivalent field, and inventing
one would be a business rule dressed as a migration."
```

---

### Task 10: Wire into the Overview page

**Files:**
- Modify: `components/report-sections/executive-overview/index.tsx`
- Modify: `components/report-sections/executive-overview/stages.ts`
- Modify: `components/report-sections/executive-overview/stages.test.ts`

**Interfaces:**
- Consumes: everything above
- Produces: the page renders CRM data when configured, needs-connection when not

- [ ] **Step 1: Write the failing stages tests**

In `stages.test.ts`, every existing `buildStages({...})` call gains `pipeline: null, contacts: null`. Then add:

```ts
it('populates the pipeline stage when CRM data is present', () => {
  // totalPipeline never carries a delta (see Global Constraints), so the
  // journey card's delta is undefined even though closedWon has a real one.
  const pipeline = { openDeals: { value: 281 }, totalPipeline: { value: 16456371 }, closedWon: { value: 30367525, delta: 15.7 }, weightedPipeline: { value: 4089445 }, byOwner: [], ownersTruncated: false, stageTruncated: false }
  const s = buildStages({ totals, cmpTotals, peec, trendRows: [], pipeline, contacts: null })
  const p = s.find(x => x.key === 'pipeline')!
  expect(p.connected).toBeUndefined()
  expect(p.metric).toBe('$16,456,371')
  expect(p.delta).toBeUndefined()
})

it('populates the inbound stage from weekly contacts when present', () => {
  const contacts = { weeks: [], currentWeek: 131, previousWeek: 100, weekOverWeek: 31 }
  const s = buildStages({ totals, cmpTotals, peec, trendRows: [], pipeline: null, contacts })
  const i = s.find(x => x.key === 'inbound')!
  expect(i.connected).toBeUndefined()
  expect(i.metric).toBe('131')
})

it('keeps both CRM stages unconnected when data is null', () => {
  const s = buildStages({ totals, cmpTotals, peec, trendRows: [], pipeline: null, contacts: null })
  expect(s.find(x => x.key === 'pipeline')?.connected).toBe(false)
  expect(s.find(x => x.key === 'inbound')?.connected).toBe(false)
})
```

- [ ] **Step 2: Run to verify they fail** (`StageInput` lacks the fields).

- [ ] **Step 3: Extend stages.ts**

Add `pipeline: PipelineData | null` and `contacts: WeeklyContacts | null` to `StageInput`. Replace the two stubs:

```ts
    contacts ? {
      key: 'inbound', source: 'Inbound Funnel', label: 'Online Contacts',
      metric: fmtNum(contacts.currentWeek),
      subMetric: 'this week',
      delta: contacts.weekOverWeek,
      color: CHART_COLORS.positive,
      connector: 'becomes\npipeline',
      heroLabel: 'new contacts created this week',
      stats: [
        { label: 'Previous Week',   value: fmtNum(contacts.previousWeek) },
        { label: 'Prior Year Week', value: contacts.priorYearWeek != null ? fmtNum(contacts.priorYearWeek) : '—' },
      ],
    } : {
      key: 'inbound', source: 'Inbound Funnel', label: 'Online Contacts',
      color: CHART_COLORS.positive, connector: 'becomes\npipeline', connected: false,
    },
    pipeline ? {
      key: 'pipeline', source: 'Pipeline', label: 'Open Pipeline',
      metric: fmtUsd(pipeline.totalPipeline.value),
      subMetric: `${fmtNum(pipeline.openDeals.value)} open deals`,
      // No delta: totalPipeline carries no valid year-over-year comparison (see
      // Global Constraints). Naming it explicitly rather than reading
      // pipeline.totalPipeline.delta, which would always be undefined anyway
      // but would read like a live wire waiting to be "fixed."
      delta: undefined,
      color: CHART_COLORS.neutral,
      heroLabel: `across ${fmtNum(pipeline.openDeals.value)} open deals`,
      stats: [
        { label: 'Closed Won',        value: fmtUsd(pipeline.closedWon.value) },
        { label: 'Weighted Pipeline', value: fmtUsd(pipeline.weightedPipeline.value) },
      ],
    } : {
      key: 'pipeline', source: 'Pipeline', label: 'Open Pipeline',
      color: CHART_COLORS.neutral, connected: false,
    },
```

Add a local `fmtUsd` (USD, no decimals) at the top of `stages.ts`. The label "Online Contacts" is kept for wireframe parity even though the online/offline distinction does not exist in their CRM; the sub-metric and hero label say what it actually is.

- [ ] **Step 4: Wire index.tsx**

Add imports for `getClientBySlug`, `getSalesforcePipeline`, `getSalesforceWeeklyContacts`, `PipelinePerformance`, `ContactPacing`. Before the fetch block: `const client = await getClientBySlug(clientSlug); const hasCrm = !!client?.salesforceConfig`. Append two entries to the `Promise.allSettled` array and its destructure: `hasCrm ? getSalesforcePipeline(clientSlug) : Promise.resolve(null)` and the contacts equivalent. Unwrap: `const pipeline = val(pipelineRes); const contacts = val(contactsRes)`. Pass both to `buildStages`. Replace the two `NeedsConnection` renders:

```tsx
{contacts ? <ContactPacing data={contacts} /> : <NeedsConnection sourceName="CRM" />}
...
{pipeline ? <PipelinePerformance data={pipeline} /> : <NeedsConnection sourceName="CRM" />}
```

An unconfigured client issues no Salesforce request and renders exactly what it renders today. A configured client whose fetch fails also falls back to needs-connection, which is honest: the source is configured, this render did not get data, and a placeholder beats a fabricated zero.

- [ ] **Step 5: Run everything**

Run: `npx vitest run components/report-sections/executive-overview/ lib/salesforce/ && npx tsc --noEmit && npm run check:rsc`
Expected: all green.

- [ ] **Step 6: Verify live on dev**

Start the dev server, open `/dashboard/renaissance/reports?section=executive-overview` with the service cookie the crons mint. Confirm: Pipeline Performance shows four tiles with values and a by-owner list, no vendor named; Contact Creation shows three tiles and bars; the two journey cards show real numbers with no "Not connected"; Avenue Z's pages unchanged. Then open the portal route too.

- [ ] **Step 7: Commit**

```bash
git commit -m "feat(exec-overview): CRM blocks render real data when configured

The page reads the client's salesforce_config; when present it fetches
pipeline and weekly contacts alongside the existing ten calls and
renders the two blocks and two journey cards from real data. When
absent, or when a configured fetch fails, it renders exactly what it
rendered before: the needs-connection treatment. No zeros, no vendor
names, no change for any client without config."
```

---

## Enablement, per environment

Two data changes per environment, both after that environment's deploy, both idempotent, both scoped to one row:

1. Apply migration `drizzle/0021_*.sql` (adds the column).
2. `UPDATE clients SET salesforce_config = '{"salesforceAccountId":"00D15000000Em4GEAS"}'::jsonb WHERE slug='renaissance' AND salesforce_config IS NULL;`

Never `db:seed`. Staging and production credentials are still needed for their steps.

**Before running step 1 against dev specifically:** dev's drizzle bookkeeping already disagrees with the repository journal. More migrations are recorded as applied in dev's database than are listed in `drizzle/meta/_journal.json` (25 recorded versus 22 entries in the journal file as it stood on this branch when checked; the journal's entry count is branch-local, so confirm the current count on dev rather than trusting that number). This is why `db:migrate` was deliberately not run against dev for Task 5's verification (see that task). Confirm what the extra recorded migrations actually are before running `db:migrate` against dev, or this step could apply more than it intends.

## Follow-ups, out of scope

- The three auth/connections pages hardcode `[PLATFORM_IDS.SALESFORCE]: false`. Flipping to config-driven is a separate product decision.
- Contact Creation ships without lead-quality coloring, form tables, or the online/offline split; none exists in their CRM. Recorded in the parity scorecard with the questions out to Nick.
- Owner names are real people's names on a client-facing page. Their HubSpot equivalent does the same; worth a product call.
- Revenue history before 2024 is unreliable in their data. This plan reports YTD only, so it does not cross that boundary, but any future trend chart must floor at 2024.

## Self-Review

**Spec coverage.** Every "Clean" and "Close" row in the parity scorecard's Pipeline Performance table maps to Task 3's transform; the by-owner substitute for lead source is Task 3 and Task 8; weekly pacing is Task 4 and Task 9; the 100x probability trap is a named test; the account-id-in-database rule is Task 1; the never-list-all-accounts rule is a global constraint. The four Contact Creation gaps are deliberately not built and are recorded in Follow-ups.

**Type consistency.** `PipelineData` and `WeeklyContacts` are declared once in `types.ts` (Tasks 3, 4), consumed by the components (Tasks 8, 9) and by `StageInput` (Task 10) under the same names. `salesforceQuery` is declared in Task 2 with the `(slug, fields, dateRange, opts)` shape and called that way in Tasks 3 and 4. `buildStages` gains `pipeline` and `contacts` in Task 10 and every existing test call is updated in the same task.

**Placeholder scan.** No TBDs. Task 8 and 9 component bodies are described rather than fully transcribed because they are presentational; the tests carry the exact behavior they must satisfy.

**Verified against live data.** Every field name, type, key format, and stage literal in this plan came from queries run against Renaissance's real Salesforce on 2026-08-16, not from documentation.
