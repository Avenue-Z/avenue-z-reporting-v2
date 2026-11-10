# Executive Overview CRM Wiring (Half B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the shipped-but-unconsumed `lib/salesforce/` data layer into the Executive Overview page, replacing the two hardcoded `NeedsConnection` blocks and the two hardcoded unconnected journey stubs with real data that degrades honestly.

**Architecture:** Two new presentational server components (`pipeline-performance.tsx`, `contact-pacing.tsx`) render `PipelineData` and `WeeklyContacts`. One new predicate module (`lib/salesforce/configured.ts`) answers two separate questions: is the CLIENT configured, and can THIS DEPLOYMENT reach the API. `index.tsx` gains two guarded fetches and a three-way render per block; `stages.ts` gains three optional `StageInput` fields and populates the two CRM stubs. No file under `lib/salesforce/` other than the new `configured.ts` is modified.

**Tech Stack:** Next.js 16 App Router (RSC), TypeScript strict, Tailwind v4, Vitest + `@testing-library/react` (jsdom), Drizzle/Neon for the client row.

**Spec:** `docs/superpowers/specs/2026-08-24-exec-overview-crm-wiring-design.md` (PR #219). The plan argues from the spec; executors read both. Section references below (`§3.4`, `§4.1`, etc.) point into that document.

**Parent plan:** `docs/superpowers/plans/2026-08-16-renaissance-crm-pipeline.md`, Tasks 7 to 10. **Its code snippets are stale** and must not be copied verbatim; the spec's §2 logs 14 specific departures. Where this plan and the parent plan disagree, this plan wins.

---

## Global Constraints

Copied verbatim from the parent plan's Global Constraints. Every task below implicitly includes all of these.

- **No em or en dashes** in prose, comments, or commit messages. Rendered em dashes for null values in copied formatters stay verbatim. (Applies to this plan's own prose, to every code comment you write, and to every commit message.)
- **On-screen copy never names a CRM vendor.** Labels say CRM, not Salesforce or HubSpot. The `NeedsConnection` card keeps `sourceName="CRM"`.
- **CORRECTION, recorded after Half A shipped: `openDeals`, `totalPipeline`, and `weightedPipeline` never carry a year-over-year delta.** Openness is evaluated as of now, so a deal whose close date fell in the prior-year window has had a full year to close. Only `closedWon` keeps a delta. Do not build any UI expecting all four tiles to have a comparison.
- **Never touch `components/report-sections/hubspot-performance/`, `inbound-funnel/`, `demand-overview/`, `ga4/`, or `charts/`.** No file under `lib/hubspot/` changes.
- **`tsc` is not in CI.** Run `npx tsc --noEmit` before every commit. `check:rsc` and `npm test` are in CI.
- **Do NOT run `npm run db:migrate` or `npm run db:seed`.** Migration `0021_old_silver_centurion` is already applied and verified on dev (2026-08-21), so this branch needs no migration step at all. See spec §6.
- **Commit after every task.**
- **Both new components are server components.** No `'use client'` directive in either. `npm run check:rsc` enforces this.

## Branch

Cut from `dev`, per `CLAUDE.md` Stage 1:

```bash
git fetch origin
git checkout -b feat/exec-overview-crm-wiring origin/dev
```

Do not branch from `docs/exec-overview-crm-wiring-design` (PR #219): that branch carries only the spec, and this feature branch needs a clean diff for its own review PR.

## Gates, run after every task

```bash
npx vitest run components/report-sections/executive-overview/ lib/salesforce/
npx tsc --noEmit
npm run check:rsc
```

All three must be green before the task's commit.

---

## File Structure

**Created**

| File | Responsibility |
|---|---|
| `lib/salesforce/configured.ts` | The two predicates. `isSalesforceConfigured` (client row state) and `canQuerySalesforce` (adds the env check). No other logic. |
| `lib/salesforce/configured.test.ts` | Pins both predicates, and pins the case where they disagree. |
| `components/report-sections/executive-overview/pipeline-performance.tsx` | Renders `PipelineData`: four KPI tiles, owner bar list, caveat region. |
| `components/report-sections/executive-overview/pipeline-performance.test.tsx` | Tile values, six degradation signals, delta suppression, zero-division guard, window labels. |
| `components/report-sections/executive-overview/contact-pacing.tsx` | Renders `WeeklyContacts`: three KPI tiles, weekly bar row with a marked in-progress bar. |
| `components/report-sections/executive-overview/contact-pacing.test.tsx` | Tile values, the no-completed-week pair, the partial-bar marking, the whole-block NoData guard. |

**Modified**

| File | Change |
|---|---|
| `components/report-sections/executive-overview/reshape.ts` | Add `fmtUsd`. |
| `components/report-sections/executive-overview/stages.ts` | `StageInput` gains three optional fields; the two CRM stubs become real. |
| `components/report-sections/executive-overview/stages.test.ts` | One existing test reworded; six new cases. |
| `components/report-sections/executive-overview/index.tsx` | Two guarded fetches, two three-way renders, `crmConnected` passed to `buildStages`, the page-level window label moved. |
| `vitest.config.ts` | Pin `lib/salesforce/configured.test.ts`. |
| `lib/salesforce/base.ts` | Comment only, pointing at `canQuerySalesforce`. No behaviour change. |

**Why `configured.ts` is its own module and not an addition to `base.ts`:** `pipeline.orchestration.test.ts` mocks `smQuery` wholesale. A test importing the predicate from `base.ts` would drag that mock in. See spec §3.6.

**Why the two components are separate files:** they take different props, have no shared state, and are reviewed independently. `stages.ts` reads both data shapes but renders neither.

---

## Task 1: The two connectedness predicates

The foundation everything else guards on. Doing it first means Tasks 5 and 6 have a real import to call rather than a placeholder.

**Files:**
- Create: `lib/salesforce/configured.ts`
- Create: `lib/salesforce/configured.test.ts`
- Modify: `vitest.config.ts:32` (append one line after the existing `lib/salesforce/contacts.test.ts` entry)
- Modify: `lib/salesforce/base.ts:33-35` (comment only)

**Interfaces:**
- Consumes: `Client` from `@/lib/db/schema` (`typeof clients.$inferSelect`). Relevant fields: `salesforceConfig: SalesforceConfig | null` where `SalesforceConfig` is `{ salesforceAccountId: string; wonStageName?: string }`, and `smApiKeyEnvVar: string | null`.
- Produces:
  - `isSalesforceConfigured(client: Client | null | undefined): boolean`
  - `canQuerySalesforce(client: Client | null | undefined): boolean`

  Tasks 5 and 6 both import from `@/lib/salesforce/configured`.

**Why two predicates and not one (spec §3.6):** `sm_api_key_env_var` names the client's *shared* Supermetrics key, read by `lib/meta/base.ts:13`, `lib/paid-search/base.ts:14`, `lib/linkedin/base.ts:13` and `lib/dashboard/adapters/supermetrics.ts:106` as well. Whether that variable holds a value is a fact about the deployment, not about the client. A single predicate that reads `process.env` would render "Connect your CRM to see this" to a fully configured client on any preview or staging build scoped without the key.

- [ ] **Step 1: Write the failing test**

Create `lib/salesforce/configured.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest'
import { isSalesforceConfigured, canQuerySalesforce } from './configured'
import type { Client } from '@/lib/db/schema'

const ENV_VAR = 'SM_API_KEY_TEST_CLIENT'

/** Only the two fields these predicates read. Cast because the real Client row
 *  has ~40 columns and none of the others affect the answer. */
function client(over: Partial<Client> = {}): Client {
  return {
    salesforceConfig: { salesforceAccountId: '00D15000000Em4GEAS' },
    smApiKeyEnvVar: ENV_VAR,
    ...over,
  } as Client
}

afterEach(() => {
  delete process.env[ENV_VAR]
})

describe('isSalesforceConfigured', () => {
  it('is true with an account id and an env var NAME, whether or not that var is set', () => {
    expect(isSalesforceConfigured(client())).toBe(true)
    process.env[ENV_VAR] = 'key-123'
    expect(isSalesforceConfigured(client())).toBe(true)
  })

  it('is false without an account id', () => {
    expect(isSalesforceConfigured(client({ salesforceConfig: null }))).toBe(false)
  })

  it('is false without an env var name', () => {
    expect(isSalesforceConfigured(client({ smApiKeyEnvVar: null }))).toBe(false)
  })

  it('is false for a null or undefined client', () => {
    expect(isSalesforceConfigured(null)).toBe(false)
    expect(isSalesforceConfigured(undefined)).toBe(false)
  })
})

describe('canQuerySalesforce', () => {
  it('is true only when the named env var actually holds a value', () => {
    process.env[ENV_VAR] = 'key-123'
    expect(canQuerySalesforce(client())).toBe(true)
  })

  it('is false when the env var is unset: salesforceQuery would throw at base.ts:35', () => {
    expect(canQuerySalesforce(client())).toBe(false)
  })

  it('is false when the env var is set to an empty string', () => {
    process.env[ENV_VAR] = ''
    expect(canQuerySalesforce(client())).toBe(false)
  })

  it('is false without an account id, even with the key set: salesforceQuery throws at base.ts:33', () => {
    process.env[ENV_VAR] = 'key-123'
    expect(canQuerySalesforce(client({ salesforceConfig: null }))).toBe(false)
  })

  it('is false for a null client', () => {
    expect(canQuerySalesforce(null)).toBe(false)
  })
})

describe('the two predicates disagree on exactly one case', () => {
  // This is the whole point of the split. Collapsing them back into one
  // predicate is what reintroduces "Connect your CRM to see this" on a
  // preview deploy that is simply missing the shared Supermetrics key.
  it('configured but unreachable: configured true, queryable false', () => {
    expect(isSalesforceConfigured(client())).toBe(true)
    expect(canQuerySalesforce(client())).toBe(false)
  })

  it('canQuerySalesforce is never true where isSalesforceConfigured is false', () => {
    process.env[ENV_VAR] = 'key-123'
    for (const c of [client({ salesforceConfig: null }), client({ smApiKeyEnvVar: null }), null]) {
      if (!isSalesforceConfigured(c)) expect(canQuerySalesforce(c)).toBe(false)
    }
  })
})
```

- [ ] **Step 2: Run the test and confirm it fails for the right reason**

```bash
npx vitest run lib/salesforce/configured.test.ts
```

Expected: FAIL with a resolution error on `./configured` ("Failed to resolve import"). If it fails with anything else, stop and read the error: the file does not exist yet, so a resolution failure is the only correct failure.

Note: `vitest.config.ts` pins `lib/salesforce/*` suites file by file rather than by glob, so this run works by explicit path but the file is not yet in the default `npm test` set. Step 5 fixes that.

- [ ] **Step 3: Write the implementation**

Create `lib/salesforce/configured.ts`:

```ts
import type { Client } from '@/lib/db/schema'

/**
 * Whether this CLIENT has a CRM configured. Row state only, and deliberately
 * does NOT read process.env.
 *
 * sm_api_key_env_var names the client's shared Supermetrics key, which Meta,
 * Paid Search, LinkedIn and the configurable dashboard read too. Whether that
 * variable holds a value is a property of the deployment, not of the client, so
 * a preview or staging build missing it would otherwise render "Connect your
 * CRM to see this" to a client who is fully configured. Use this to decide what
 * to TELL the reader; use canQuerySalesforce to decide whether to FETCH.
 */
export function isSalesforceConfigured(client: Client | null | undefined): boolean {
  return !!(client?.salesforceConfig?.salesforceAccountId && client?.smApiKeyEnvVar)
}

/**
 * Whether THIS DEPLOYMENT can actually run the query: exactly the conjunction
 * salesforceQuery enforces (base.ts:33 and :35). Used to skip a fetch that is
 * certain to throw, never to decide connectedness.
 */
export function canQuerySalesforce(client: Client | null | undefined): boolean {
  const envVar = client?.smApiKeyEnvVar
  return isSalesforceConfigured(client) && !!(envVar && process.env[envVar])
}
```

- [ ] **Step 4: Run the test and confirm it passes**

```bash
npx vitest run lib/salesforce/configured.test.ts
```

Expected: PASS, 12 tests.

- [ ] **Step 5: Pin the new suite in vitest.config.ts**

`vitest.config.ts` lists `lib/salesforce/*` suites individually, not by glob (a glob would sweep in non-vitest assertion scripts elsewhere in the repo). Add one line immediately after `'lib/salesforce/contacts.test.ts',` at line 32:

```ts
      'lib/salesforce/configured.test.ts',
```

The two new component tests need no pin: `components/report-sections/**/*.test.{ts,tsx}` at line 46 is already a glob.

- [ ] **Step 6: Point base.ts at the predicate**

In `lib/salesforce/base.ts`, directly above the two throws at `:33` and `:35`, add:

```ts
  // These two throws stay distinct: each names WHICH half is missing, which a
  // boolean cannot. canQuerySalesforce (lib/salesforce/configured.ts) is the
  // caller-side mirror of exactly this conjunction and is pinned to it by
  // configured.test.ts, so the guard and the precondition cannot drift apart.
  // Callers deciding what to TELL the reader want isSalesforceConfigured
  // instead: a missing env var is a deployment problem, not an unconnected CRM.
```

Change no logic in this file.

- [ ] **Step 7: Run the gates**

```bash
npx vitest run components/report-sections/executive-overview/ lib/salesforce/
npx tsc --noEmit
npm run check:rsc
```

Expected: all green. The full `lib/salesforce/` run should now include `configured.test.ts`.

- [ ] **Step 8: Commit**

```bash
git add lib/salesforce/configured.ts lib/salesforce/configured.test.ts lib/salesforce/base.ts vitest.config.ts
git commit -m "feat(salesforce): split CRM connectedness from query reachability

Two predicates, not one. isSalesforceConfigured reads the client row only;
canQuerySalesforce adds the env check and mirrors salesforceQuery's own
precondition (base.ts:33 and :35).

sm_api_key_env_var is the client's shared Supermetrics key, also read by Meta,
Paid Search, LinkedIn and the dashboard adapter, so whether it holds a value is
a fact about the deployment rather than the client. Collapsing the two
questions renders 'Connect your CRM to see this' to a fully configured client
on any preview build scoped without that key. configured.test.ts pins the one
case where the two answers differ."
```

---

## Task 2: `fmtUsd`

Tiny, but it is a real dependency of Tasks 3 and 4 and it belongs to neither of them. Its own task so the shared formatter is written once and both consumers import it.

**Files:**
- Modify: `components/report-sections/executive-overview/reshape.ts` (add after `fmtPct`, which ends at line 23)
- Test: `components/report-sections/executive-overview/reshape.fmtusd.test.ts` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: `fmtUsd(n: number | null | undefined): string`. Imported by `pipeline-performance.tsx` (Task 3) and `stages.ts` (Task 5).

**Why here and not a `stages.ts`-local helper:** `reshape.ts` is this section's existing formatter module (`fmtNum`, `fmtPct`, `fmtDuration`, `fmtDate`), and it is the only place both `stages.ts` and `pipeline-performance.tsx` can share one implementation. The parent plan's suggestion of a stages-local helper would duplicate it. See spec §4.3.

- [ ] **Step 1: Write the failing test**

Create `components/report-sections/executive-overview/reshape.fmtusd.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { fmtUsd } from './reshape'

describe('fmtUsd', () => {
  it('formats whole dollars with a thousands separator and no cents', () => {
    expect(fmtUsd(1234567)).toBe('$1,234,567')
  })

  it('rounds rather than truncating', () => {
    expect(fmtUsd(1234.6)).toBe('$1,235')
  })

  it('formats zero as $0, which is a real value here', () => {
    expect(fmtUsd(0)).toBe('$0')
  })

  it('returns the null glyph for null and undefined, matching fmtNum', () => {
    expect(fmtUsd(null)).toBe('—')
    expect(fmtUsd(undefined)).toBe('—')
  })

  it('formats a negative amount, which closed-won can genuinely be (credits, refunds)', () => {
    expect(fmtUsd(-5000)).toBe('-$5,000')
  })
})
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
npx vitest run components/report-sections/executive-overview/reshape.fmtusd.test.ts
```

Expected: FAIL with `fmtUsd is not a function` (the module resolves; the export does not exist).

- [ ] **Step 3: Write the implementation**

In `components/report-sections/executive-overview/reshape.ts`, immediately after `fmtPct` (which ends at line 23), add:

```ts
export function fmtUsd(n: number | null | undefined): string {
  if (n == null) return '—'
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  })
}
```

The `n == null` early return uses the null glyph verbatim, exactly as `fmtNum` and `fmtPct` above it do. That glyph is a pre-existing rendered null value and is exempt from the em-dash constraint.

- [ ] **Step 4: Run the test and confirm it passes**

```bash
npx vitest run components/report-sections/executive-overview/reshape.fmtusd.test.ts
```

Expected: PASS, 5 tests. If the negative case fails, check whether your Node's ICU renders `-$5,000` or `($5,000)`; assert on whichever this repo's Node produces and note it in the test.

- [ ] **Step 5: Run the gates and commit**

```bash
npx vitest run components/report-sections/executive-overview/ lib/salesforce/
npx tsc --noEmit
npm run check:rsc
git add components/report-sections/executive-overview/reshape.ts components/report-sections/executive-overview/reshape.fmtusd.test.ts
git commit -m "feat(exec-overview): add fmtUsd to the section's formatter module

Shared by pipeline-performance.tsx and stages.ts, which is why it lives in
reshape.ts alongside fmtNum and fmtPct rather than local to either consumer."
```

---

## Task 3: `PipelinePerformance`

The larger of the two components. Implements spec §4.1 in full: four tiles, six degradation signals, the owner list's three states, the caveat region, and both halves of §3.4's delta-suppression rule.

**Files:**
- Create: `components/report-sections/executive-overview/pipeline-performance.tsx`
- Create: `components/report-sections/executive-overview/pipeline-performance.test.tsx`

**Interfaces:**
- Consumes: `PipelineData` and `OwnerRow` from `@/lib/salesforce/types`; `KpiCard` from `./kpi-card`; `fmtNum` and `fmtUsd` from `./reshape` (Task 2).
- Produces: `PipelinePerformance({ data }: { data: PipelineData }): JSX.Element`. Imported by `index.tsx` in Task 6.

**The shape of `PipelineData` you are rendering** (from `lib/salesforce/types.ts:11-90`, read it before you start):

```ts
interface PipelineKpi { value: number; delta?: number }

interface PipelineData {
  openDeals: PipelineKpi
  totalPipeline: PipelineKpi
  closedWon: PipelineKpi
  weightedPipeline: PipelineKpi
  byOwner: { owner: string; count: number; amount: number }[] | null
  ownersTruncated: boolean
  stageTruncated: boolean
  unrecognizedClosedFlags: number
  wonStageUnmatched: boolean
  openUnavailable: boolean
  wonUnavailable: boolean
}
```

**`KpiCard`'s props you will use** (from `./kpi-card`, `KpiCardProps`): `title: string`, `value: string | number`, `delta?: number`, `deltaLabel?: string`, `comparisonExpected?: boolean`, `subValue?: string`, `tooltip?: string`.

**The trap this component exists to avoid, in one paragraph.** `KpiCard` tests `delta !== undefined` **before** it tests `comparisonExpected` (`kpi-card.tsx:61-77`). So a tile can render the null glyph as its value and a confident percentage directly underneath it, in the same card, with nothing in the component to stop it. And it is reachable: `transformPipeline` builds Closed Won as `kpi(wonCur.amount, wonPrior?.amount)` (`pipeline.ts:194`), and `wonCur.amount` is `0` whenever the closed-won fetch failed or the won stage was renamed. If the prior-year fetch succeeded with a positive amount, `pct()` yields exactly `-100` and the page publishes a fabricated total collapse to a client during an outage. Every `delta` you pass must therefore be computed by the helper in Step 3, never read straight off `data`.

- [ ] **Step 1: Write the failing test**

Create `components/report-sections/executive-overview/pipeline-performance.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PipelinePerformance } from './pipeline-performance'
import type { PipelineData } from '@/lib/salesforce/types'

/** Healthy baseline. Every figure is distinct so a getByText assertion cannot
 *  pass by coincidence: the parent plan's fixture reused 131 twice. */
function data(over: Partial<PipelineData> = {}): PipelineData {
  return {
    openDeals:        { value: 297 },
    totalPipeline:    { value: 4_820_000 },
    closedWon:        { value: 1_375_000, delta: 15.7 },
    weightedPipeline: { value: 2_140_000 },
    byOwner: [
      { owner: 'Dana Reyes', count: 41, amount: 900_000 },
      { owner: 'Sam Okonkwo', count: 18, amount: 410_000 },
    ],
    ownersTruncated: false,
    stageTruncated: false,
    unrecognizedClosedFlags: 0,
    wonStageUnmatched: false,
    openUnavailable: false,
    wonUnavailable: false,
    ...over,
  }
}

describe('healthy render', () => {
  it('formats all four tile values', () => {
    render(<PipelinePerformance data={data()} />)
    expect(screen.getByText('297')).toBeInTheDocument()
    expect(screen.getByText('$4,820,000')).toBeInTheDocument()
    expect(screen.getByText('$1,375,000')).toBeInTheDocument()
    expect(screen.getByText('$2,140,000')).toBeInTheDocument()
  })

  it('renders Closed Won\'s delta with its year-over-year label', () => {
    render(<PipelinePerformance data={data()} />)
    expect(screen.getByText(/15\.7%\s*vs same period last year/)).toBeInTheDocument()
  })

  it('renders the owner list in the order given, with counts', () => {
    render(<PipelinePerformance data={data()} />)
    const owners = screen.getAllByTestId('owner-row').map((n) => n.textContent)
    expect(owners[0]).toContain('Dana Reyes')
    expect(owners[0]).toContain('41')
    expect(owners[1]).toContain('Sam Okonkwo')
  })

  it('renders no caveat lines when nothing is degraded', () => {
    render(<PipelinePerformance data={data()} />)
    expect(screen.queryByTestId('caveat')).not.toBeInTheDocument()
  })
})

describe('openUnavailable', () => {
  it('dashes the three open tiles instead of showing $0, and leaves Closed Won alone', () => {
    render(<PipelinePerformance data={data({
      openDeals: { value: 0 }, totalPipeline: { value: 0 }, weightedPipeline: { value: 0 },
      openUnavailable: true,
    })} />)
    expect(screen.queryByText('$0')).not.toBeInTheDocument()
    expect(screen.getAllByText("Couldn't load open pipeline.")).toHaveLength(3)
    // Closed Won comes from a separate query with its own flag.
    expect(screen.getByText('$1,375,000')).toBeInTheDocument()
  })
})

describe('wonUnavailable', () => {
  it('dashes Closed Won and suppresses the fabricated -100 delta', () => {
    // The regression test. closedWon.delta is -100 whenever the current fetch
    // degraded to 0 against a healthy prior year.
    render(<PipelinePerformance data={data({
      closedWon: { value: 0, delta: -100 }, wonUnavailable: true,
    })} />)
    expect(screen.queryByText(/100\.0%/)).not.toBeInTheDocument()
    expect(screen.queryByText('$0')).not.toBeInTheDocument()
    expect(screen.getByText("Couldn't load closed-won data.")).toBeInTheDocument()
  })

  it('takes comparisonExpected off too: an unloadable tile promises nothing', () => {
    render(<PipelinePerformance data={data({
      closedWon: { value: 0, delta: -100 }, wonUnavailable: true,
    })} />)
    expect(screen.queryByText(/vs same period last year/)).not.toBeInTheDocument()
  })
})

describe('wonStageUnmatched', () => {
  it('dashes the value rather than publishing a plausible $0, and keeps the placeholder', () => {
    render(<PipelinePerformance data={data({
      closedWon: { value: 0, delta: -100 }, wonStageUnmatched: true,
    })} />)
    expect(screen.queryByText('$0')).not.toBeInTheDocument()
    expect(screen.queryByText(/100\.0%/)).not.toBeInTheDocument()
    expect(screen.getByText(/vs same period last year/)).toBeInTheDocument()
    expect(screen.getByText(/won stage.*renamed/i)).toBeInTheDocument()
  })

  it('yields to wonUnavailable when both are set', () => {
    render(<PipelinePerformance data={data({
      closedWon: { value: 0 }, wonUnavailable: true, wonStageUnmatched: true,
    })} />)
    expect(screen.getByText("Couldn't load closed-won data.")).toBeInTheDocument()
    expect(screen.queryByText(/won stage.*renamed/i)).not.toBeInTheDocument()
  })
})

describe('baseline-corrupting flags suppress the delta but keep the value', () => {
  it('stageTruncated: value stays, delta goes, placeholder and caveat render', () => {
    // The flag ORs in wonPriorRows.length >= STAGE_MAX_ROWS (pipeline.ts:296-299),
    // so a truncated baseline inflates the growth percentage without bound.
    render(<PipelinePerformance data={data({ stageTruncated: true })} />)
    expect(screen.getByText('$1,375,000')).toBeInTheDocument()
    expect(screen.queryByText(/15\.7%/)).not.toBeInTheDocument()
    expect(screen.getByText(/vs same period last year/)).toBeInTheDocument()
    expect(screen.getByText(/row limit/i)).toBeInTheDocument()
  })

  it('unrecognizedClosedFlags: same treatment, and the caveat names the owner breakdown too', () => {
    // countUnrecognizedClosed includes ownerRows (pipeline.ts:295) and
    // transformByOwner drops unreadable rows (pipeline.ts:208), so a caveat
    // naming only "these totals" would leave the distorted list uncaveated.
    render(<PipelinePerformance data={data({ unrecognizedClosedFlags: 3 })} />)
    expect(screen.getByText('$1,375,000')).toBeInTheDocument()
    expect(screen.queryByText(/15\.7%/)).not.toBeInTheDocument()
    const caveat = screen.getByText(/unreadable open\/closed status/i)
    expect(caveat.textContent).toMatch(/3 rows/)
    expect(caveat.textContent).toMatch(/owner breakdown/i)
    // Rows, never deals: the open and won windows overlap, so one bad deal
    // can contribute more than once.
    expect(caveat.textContent).not.toMatch(/deals/i)
  })
})

describe('suppression that must not spread', () => {
  it('ownersTruncated keeps Closed Won\'s delta and adds no caveat to the grid', () => {
    render(<PipelinePerformance data={data({ ownersTruncated: true })} />)
    expect(screen.getByText(/15\.7%\s*vs same period last year/)).toBeInTheDocument()
    expect(screen.getByText('Owner list may be incomplete.')).toBeInTheDocument()
    expect(screen.queryByText(/row limit/i)).not.toBeInTheDocument()
  })
})

describe('owner list, three distinct states', () => {
  it('null renders a fetch failure, never "no owners"', () => {
    render(<PipelinePerformance data={data({ byOwner: null })} />)
    expect(screen.getByText('Owner breakdown unavailable.')).toBeInTheDocument()
    expect(screen.queryByText('No open deals by owner.')).not.toBeInTheDocument()
  })

  it('[] renders a genuine empty, distinct from the failure copy', () => {
    render(<PipelinePerformance data={data({ byOwner: [] })} />)
    expect(screen.getByText('No open deals by owner.')).toBeInTheDocument()
    expect(screen.queryByText('Owner breakdown unavailable.')).not.toBeInTheDocument()
  })

  it('every owner at zero produces a finite width, never NaN%', () => {
    const { container } = render(<PipelinePerformance data={data({
      byOwner: [{ owner: 'Dana Reyes', count: 0, amount: 0 }],
    })} />)
    expect(container.innerHTML).not.toContain('NaN')
  })
})

describe('window labels', () => {
  it('names each window on the section line and per tile', () => {
    render(<PipelinePerformance data={data()} />)
    expect(screen.getByText('Open pipeline is as of today. Closed won is year to date.')).toBeInTheDocument()
    expect(screen.getAllByText('Open as of today')).toHaveLength(3)
    expect(screen.getByText('Year to date')).toBeInTheDocument()
  })

  it('a tile caveat replaces that tile\'s window label rather than joining it', () => {
    render(<PipelinePerformance data={data({ wonUnavailable: true })} />)
    expect(screen.queryByText('Year to date')).not.toBeInTheDocument()
    expect(screen.getByText("Couldn't load closed-won data.")).toBeInTheDocument()
    // The three open tiles keep theirs: this flag does not touch them.
    expect(screen.getAllByText('Open as of today')).toHaveLength(3)
  })
})

describe('vendor neutrality', () => {
  it('names no CRM vendor', () => {
    const { container } = render(<PipelinePerformance data={data({
      byOwner: null, ownersTruncated: true, stageTruncated: true,
      unrecognizedClosedFlags: 2, wonStageUnmatched: true,
      openUnavailable: true, wonUnavailable: true,
    })} />)
    expect(container.textContent ?? '').not.toMatch(/Salesforce|HubSpot/i)
  })
})
```

- [ ] **Step 2: Run the test and confirm it fails for the right reason**

```bash
npx vitest run components/report-sections/executive-overview/pipeline-performance.test.tsx
```

Expected: FAIL with a resolution error on `./pipeline-performance`. Nothing else should fail yet.

- [ ] **Step 3: Write the implementation**

Create `components/report-sections/executive-overview/pipeline-performance.tsx`. No `'use client'`.

```tsx
import type { PipelineData } from '@/lib/salesforce/types'
import { KpiCard } from './kpi-card'
import { fmtNum, fmtUsd } from './reshape'

const NULL_GLYPH = '—'

/**
 * Order matters: the block renders tiles, then the owner list, then the caveat
 * region. The region is LAST because one of its lines describes the owner list
 * as well as the tiles (unrecognizedClosedFlags counts owner-query rows too,
 * pipeline.ts:295), and a caveat printed above the list would visually
 * disclaim only the numbers.
 */
export function PipelinePerformance({ data }: { data: PipelineData }) {
  const {
    openDeals, totalPipeline, closedWon, weightedPipeline,
    byOwner, ownersTruncated, stageTruncated, unrecognizedClosedFlags,
    wonStageUnmatched, openUnavailable, wonUnavailable,
  } = data

  // KpiCard tests `delta !== undefined` BEFORE `comparisonExpected`
  // (kpi-card.tsx:61-77), so a tile can render the null glyph as its value with
  // a confident percentage underneath it. Closed Won's delta is exactly -100
  // whenever the current fetch degraded to 0 against a healthy prior year
  // (pipeline.ts:194 + :105-111), so this is a live wire, not a hypothetical.
  //
  // Two separate reasons to withhold it, per the design doc section 3.4:
  //   - the VALUE is gone      (wonUnavailable, wonStageUnmatched)
  //   - the BASELINE is corrupt (stageTruncated, unrecognizedClosedFlags: both
  //     also fire on the prior-year won query, so the ratio is unsafe even
  //     though each total is merely low)
  // Do not "restore" this by reading closedWon.delta directly.
  const wonValueGone   = wonUnavailable || wonStageUnmatched
  const baselineDirty  = stageTruncated || unrecognizedClosedFlags > 0
  const wonDelta       = wonValueGone || baselineDirty ? undefined : closedWon.delta
  // The greyed null-glyph placeholder KpiCard renders under comparisonExpected
  // is honest wherever a comparison was genuinely expected and merely cannot
  // arrive. It comes off only when the tile could not be loaded at all: an
  // unloadable tile promises nothing.
  const wonComparisonExpected = !wonUnavailable

  // wonUnavailable wins over wonStageUnmatched: "could not load" is the more
  // fundamental statement, and only one subValue slot exists per tile.
  const wonCaveat =
    wonUnavailable   ? "Couldn't load closed-won data."
    : wonStageUnmatched ? 'No deals matched the won stage; it may have been renamed.'
    : 'Year to date'

  const openCaveat = openUnavailable ? "Couldn't load open pipeline." : 'Open as of today'
  const openValue = (k: { value: number }, fmt: (n: number) => string) =>
    openUnavailable ? NULL_GLYPH : fmt(k.value)

  const caveats: string[] = []
  if (stageTruncated) {
    caveats.push('Deal totals hit the row limit and may be undercounted.')
  }
  if (unrecognizedClosedFlags > 0) {
    // Rows, never "N deals": the open and won query windows overlap, so one bad
    // deal can contribute more than once (types.ts, unrecognizedClosedFlags).
    // Names the owner breakdown too, because the count spans the owner query
    // and transformByOwner drops unreadable rows (pipeline.ts:295, :208).
    caveats.push(
      `${unrecognizedClosedFlags.toLocaleString()} rows had an unreadable open/closed status, ` +
      'so these totals and the owner breakdown are shifted by an unknown amount.',
    )
  }

  const ownerMax = byOwner?.length ? Math.max(...byOwner.map((o) => o.count)) : 0

  return (
    <div className="space-y-6">
      <p className="text-xs text-text-muted">
        Open pipeline is as of today. Closed won is year to date.
      </p>

      <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
        <KpiCard title="Open Deals"        value={openValue(openDeals, fmtNum)}        subValue={openCaveat} />
        <KpiCard title="Total Pipeline"    value={openValue(totalPipeline, fmtUsd)}    subValue={openCaveat} />
        <KpiCard
          title="Closed Won"
          value={wonValueGone ? NULL_GLYPH : fmtUsd(closedWon.value)}
          delta={wonDelta}
          deltaLabel="vs same period last year"
          comparisonExpected={wonComparisonExpected}
          subValue={wonCaveat}
        />
        <KpiCard title="Weighted Pipeline" value={openValue(weightedPipeline, fmtUsd)} subValue={openCaveat} />
      </div>

      <div className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-widest text-text-muted">
          Open Deals by Owner
        </h3>
        {byOwner === null ? (
          // null is a FAILED fetch. Collapsing it into the [] rendering would
          // misreport an outage as "this client has no owners", which is the
          // exact confusion the null/empty distinction exists to prevent.
          <p className="text-sm text-text-muted">Owner breakdown unavailable.</p>
        ) : byOwner.length === 0 ? (
          <p className="text-sm text-text-muted">No open deals by owner.</p>
        ) : (
          <div className="space-y-2">
            {byOwner.map((o) => (
              <div key={o.owner} data-testid="owner-row" className="flex items-center gap-3 text-sm">
                <span className="w-40 flex-shrink-0 truncate text-text-muted">{o.owner}</span>
                <span className="h-2 flex-1 rounded bg-white/[0.06]">
                  <span
                    className="block h-2 rounded bg-brand-green"
                    // ownerMax === 0 is every owner at a zero count. Short-circuit
                    // rather than dividing, which would emit width: NaN%.
                    style={{ width: ownerMax === 0 ? '0%' : `${(o.count / ownerMax) * 100}%` }}
                  />
                </span>
                <span className="w-12 flex-shrink-0 text-right font-bold text-white">{fmtNum(o.count)}</span>
              </div>
            ))}
          </div>
        )}
        {ownersTruncated && (
          // Stays with the list rather than joining the caveat region below: it
          // is a statement about this list's completeness, not about any number.
          <p className="text-xs text-text-muted">Owner list may be incomplete.</p>
        )}
      </div>

      {caveats.length > 0 && (
        <div data-testid="caveat" className="space-y-1">
          {caveats.map((c) => (
            <p key={c} className="text-xs text-text-muted">{c}</p>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run the test and confirm it passes**

```bash
npx vitest run components/report-sections/executive-overview/pipeline-performance.test.tsx
```

Expected: PASS, 18 tests.

If the `stageTruncated` caveat test fails on `getByText(/row limit/i)` matching two nodes, that means your caveat region rendered both lines; check that the fixture sets only `stageTruncated`.

- [ ] **Step 5: Run the gates and commit**

```bash
npx vitest run components/report-sections/executive-overview/ lib/salesforce/
npx tsc --noEmit
npm run check:rsc
git add components/report-sections/executive-overview/pipeline-performance.tsx components/report-sections/executive-overview/pipeline-performance.test.tsx
git commit -m "feat(exec-overview): render Pipeline Performance from PipelineData

Four tiles, the owner list's three states, and all six degradation signals.

The load-bearing part is delta suppression. KpiCard tests delta before
comparisonExpected (kpi-card.tsx:61-77), and closedWon.delta is exactly -100
whenever the current fetch degraded to 0 against a healthy prior year, so a
tile could render a dash above a confident total collapse during an outage.
Two families of flag withhold the delta: those that take the value away
(wonUnavailable, wonStageUnmatched) and those that corrupt the baseline
(stageTruncated, unrecognizedClosedFlags, both of which also fire on the
prior-year won query). ownersTruncated suppresses nothing, and a test pins
that so the rule cannot spread.

The unrecognizedClosedFlags caveat names the owner breakdown as well as the
totals, because the count spans the owner query (pipeline.ts:295) and
transformByOwner drops unreadable rows (pipeline.ts:208)."
```

---

## Task 4: `ContactPacing`

Implements spec §4.2. Three tiles, a weekly bar row whose final bar is the week in progress, and three guards that each say what they replace.

**Files:**
- Create: `components/report-sections/executive-overview/contact-pacing.tsx`
- Create: `components/report-sections/executive-overview/contact-pacing.test.tsx`

**Interfaces:**
- Consumes: `WeeklyContacts` from `@/lib/salesforce/types`; `KpiCard` from `./kpi-card`; `NoData` from `./no-data`; `fmtNum` from `./reshape`.
- Produces: `ContactPacing({ data }: { data: WeeklyContacts }): JSX.Element`. Imported by `index.tsx` in Task 6.

**The shape you are rendering** (from `lib/salesforce/types.ts:93-125`):

```ts
interface WeekBucket { week: string; contacts: number }   // week is '2026-W33'

interface WeeklyContacts {
  weeks: WeekBucket[]
  currentWeek: number
  currentWeekPartial: boolean
  daysElapsedInCurrentWeek: number   // 1 (Monday) through 7 (Sunday)
  previousWeek: number
  priorYearWeek?: number
  completedWeekOverWeek?: number
}
```

**The undocumented state you must handle.** `WeeklyContacts` carries no degradation flags, which is how this stayed hidden. `transformWeeklyContacts` builds `previousWeek` as `completed.at(-1)?.contacts ?? 0` (`contacts.ts:153`), so when no completed week exists the tile publishes a confident `0` for a week that does not exist. That is the state of every client from January 1 until the year's first ISO week completes (the window is `year_to_date`, `contacts.ts:194`), plus any client whose first contact ever landed in the week now in progress.

The condition is derivable without touching Half A. `gapFill` returns a contiguous run of ISO weeks from the first observed week through the current one, and `[]` for no input (`contacts.ts:98-122`). The window cannot produce a bucket after the current week, so the last element of `weeks` is always the week in progress and every earlier element is completed:

> **`weeks.length < 2` means no completed week exists.**

`currentWeekPartial` is NOT a usable discriminant for any of this: the shipped transform sets it to `true` unconditionally (`contacts.ts:173`).

- [ ] **Step 1: Write the failing test**

Create `components/report-sections/executive-overview/contact-pacing.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ContactPacing } from './contact-pacing'
import type { WeeklyContacts } from '@/lib/salesforce/types'

/** Healthy baseline: three weeks, the last in progress. Every figure distinct. */
function data(over: Partial<WeeklyContacts> = {}): WeeklyContacts {
  return {
    weeks: [
      { week: '2026-W31', contacts: 240 },
      { week: '2026-W32', contacts: 186 },
      { week: '2026-W33', contacts: 52 },
    ],
    currentWeek: 52,
    currentWeekPartial: true,
    daysElapsedInCurrentWeek: 3,
    previousWeek: 186,
    priorYearWeek: 149,
    completedWeekOverWeek: -22.5,
    ...over,
  }
}

describe('healthy render', () => {
  it('renders all three tile figures', () => {
    render(<ContactPacing data={data()} />)
    expect(screen.getByText('52')).toBeInTheDocument()
    expect(screen.getByText('186')).toBeInTheDocument()
    expect(screen.getByText('149')).toBeInTheDocument()
  })

  it('gives Current Week no delta: a partial week against a complete one is invalid', () => {
    render(<ContactPacing data={data()} />)
    expect(screen.queryByText(/vs prior period/)).not.toBeInTheDocument()
    // The only percentage on screen belongs to Previous Week.
    expect(screen.getAllByText(/%/)).toHaveLength(1)
  })

  it('puts completedWeekOverWeek on Previous Week, where both sides are complete', () => {
    render(<ContactPacing data={data()} />)
    expect(screen.getByText(/22\.5%\s*vs prior complete week/)).toBeInTheDocument()
  })

  it('discloses the partial week with a colon, not an em dash', () => {
    render(<ContactPacing data={data()} />)
    expect(screen.getByText('Partial week: 3 of 7 days.')).toBeInTheDocument()
  })

  it('renders the window label', () => {
    render(<ContactPacing data={data()} />)
    expect(screen.getByText('Year to date, by ISO week.')).toBeInTheDocument()
  })
})

describe('Prior Year Week is always rendered, never dropped', () => {
  it('dashes when absent rather than removing the tile', () => {
    render(<ContactPacing data={data({ priorYearWeek: undefined })} />)
    expect(screen.getByText('Prior Year Week')).toBeInTheDocument()
    expect(screen.queryByText('149')).not.toBeInTheDocument()
  })
})

describe('no completed week exists (weeks.length < 2)', () => {
  const solo = data({
    weeks: [{ week: '2026-W01', contacts: 12 }],
    currentWeek: 12,
    daysElapsedInCurrentWeek: 2,
    previousWeek: 0,            // the ?? 0 at contacts.ts:153, not a count
    priorYearWeek: undefined,
    completedWeekOverWeek: undefined,
  })

  it('dashes Previous Week instead of publishing a confident 0', () => {
    render(<ContactPacing data={solo} />)
    expect(screen.getByText('Previous Week')).toBeInTheDocument()
    expect(screen.queryByText('0')).not.toBeInTheDocument()
    expect(screen.getByText('No completed week yet this year.')).toBeInTheDocument()
  })

  it('promises no comparison at all: no percentage and no placeholder', () => {
    render(<ContactPacing data={solo} />)
    expect(screen.queryByText(/%/)).not.toBeInTheDocument()
    expect(screen.queryByText(/vs prior complete week/)).not.toBeInTheDocument()
  })

  it('dashes Prior Year Week for the same reason', () => {
    render(<ContactPacing data={solo} />)
    expect(screen.getByText('Prior Year Week')).toBeInTheDocument()
  })

  it('still renders Current Week, which is a real partial count', () => {
    render(<ContactPacing data={solo} />)
    expect(screen.getByText('12')).toBeInTheDocument()
  })
})

describe('a completed week that is genuinely zero', () => {
  it('renders 0, not the glyph: the derivation must not degenerate into "dash any zero"', () => {
    render(<ContactPacing data={data({
      weeks: [{ week: '2026-W32', contacts: 0 }, { week: '2026-W33', contacts: 52 }],
      previousWeek: 0,
      completedWeekOverWeek: undefined,
      priorYearWeek: undefined,
    })} />)
    expect(screen.getByText('0')).toBeInTheDocument()
    expect(screen.queryByText('No completed week yet this year.')).not.toBeInTheDocument()
  })
})

describe('the in-progress bar is marked', () => {
  it('marks only the final bucket', () => {
    const { container } = render(<ContactPacing data={data()} />)
    const bars = Array.from(container.querySelectorAll('[data-week]'))
    expect(bars).toHaveLength(3)
    expect(bars.slice(0, 2).every((b) => b.getAttribute('data-partial') !== 'true')).toBe(true)
    expect(bars[2].getAttribute('data-partial')).toBe('true')
  })

  it('captions the row so the marking is legible without hovering', () => {
    render(<ContactPacing data={data()} />)
    expect(screen.getByText('Final bar is the current week in progress: 3 of 7 days.')).toBeInTheDocument()
  })

  it('labels buckets by week number', () => {
    render(<ContactPacing data={data()} />)
    expect(screen.getByText('W31')).toBeInTheDocument()
    expect(screen.getByText('W33')).toBeInTheDocument()
  })
})

describe('guards', () => {
  it('empty weeks replaces the WHOLE block, tiles included', () => {
    // Chart-only replacement would leave three tiles reading 0, 0 and the glyph
    // stacked above the words "No data for this period."
    render(<ContactPacing data={data({
      weeks: [], currentWeek: 0, previousWeek: 0,
      priorYearWeek: undefined, completedWeekOverWeek: undefined,
    })} />)
    expect(screen.getByText('No data for this period.')).toBeInTheDocument()
    expect(screen.queryByText('Current Week')).not.toBeInTheDocument()
    expect(screen.queryByText('Previous Week')).not.toBeInTheDocument()
    expect(screen.queryByText('Prior Year Week')).not.toBeInTheDocument()
  })

  it('every bucket at zero produces a finite height, never NaN%', () => {
    const { container } = render(<ContactPacing data={data({
      weeks: [{ week: '2026-W32', contacts: 0 }, { week: '2026-W33', contacts: 0 }],
      currentWeek: 0, previousWeek: 0,
    })} />)
    expect(container.innerHTML).not.toContain('NaN')
  })
})

describe('vendor neutrality', () => {
  it('names no CRM vendor', () => {
    const { container } = render(<ContactPacing data={data()} />)
    expect(container.textContent ?? '').not.toMatch(/Salesforce|HubSpot/i)
  })
})
```

- [ ] **Step 2: Run the test and confirm it fails for the right reason**

```bash
npx vitest run components/report-sections/executive-overview/contact-pacing.test.tsx
```

Expected: FAIL with a resolution error on `./contact-pacing`.

- [ ] **Step 3: Write the implementation**

Create `components/report-sections/executive-overview/contact-pacing.tsx`. No `'use client'`.

```tsx
import type { WeeklyContacts } from '@/lib/salesforce/types'
import { KpiCard } from './kpi-card'
import { NoData } from './no-data'
import { fmtNum } from './reshape'

const NULL_GLYPH = '—'

/** '2026-W33' to 'W33'. */
function weekLabel(week: string): string {
  return `W${week.split('-W')[1] ?? ''}`
}

export function ContactPacing({ data }: { data: WeeklyContacts }) {
  const {
    weeks, currentWeek, currentWeekPartial, daysElapsedInCurrentWeek,
    previousWeek, priorYearWeek, completedWeekOverWeek,
  } = data

  // gapFill returns [] only when the query produced no usable bucket at all
  // (contacts.ts:99). In that state currentWeek and previousWeek are both 0 and
  // both comparisons are undefined, so replacing only the CHART would leave
  // three tiles reading 0, 0 and a dash stacked above "No data for this
  // period.": a confident zero with the disclaimer printed under it rather
  // than on it. Replace the whole block.
  if (weeks.length === 0) return <NoData />

  // weeks is a contiguous run of ISO weeks through the current one, and the
  // window cannot emit a bucket after today, so the last element is always the
  // week in progress and every earlier element is a completed week. Fewer than
  // two elements therefore means no completed week exists, and previousWeek's
  // 0 is the `?? 0` at contacts.ts:153 rather than a count.
  //
  // currentWeekPartial cannot serve as this discriminant: the shipped
  // transform sets it to true unconditionally (contacts.ts:173).
  const hasCompletedWeek = weeks.length >= 2

  return (
    <div className="space-y-6">
      <p className="text-xs text-text-muted">Year to date, by ISO week.</p>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <KpiCard
          title="Current Week"
          value={fmtNum(currentWeek)}
          // No delta by design: comparing a partial week against a complete one
          // renders as an ~85 percent collapse on a Monday. completedWeekOverWeek
          // lives on Previous Week, where both sides are full weeks.
          subValue={currentWeekPartial ? `Partial week: ${daysElapsedInCurrentWeek} of 7 days.` : undefined}
        />
        <KpiCard
          title="Previous Week"
          value={hasCompletedWeek ? fmtNum(previousWeek) : NULL_GLYPH}
          delta={hasCompletedWeek ? completedWeekOverWeek : undefined}
          deltaLabel="vs prior complete week"
          // Both come off when the value is dashed: with no completed week there
          // is no comparison to promise, so this is the whole-tile-unavailable
          // case, not the placeholder case.
          comparisonExpected={hasCompletedWeek}
          subValue={hasCompletedWeek ? undefined : 'No completed week yet this year.'}
        />
        <KpiCard
          title="Prior Year Week"
          // Always rendered, never dropped. Absent covers three cases that look
          // identical here (failed compare fetch, no bucket for the matching ISO
          // week number, no completed week to match against), and removing the
          // tile hides which, while also changing the block's shape so a reader
          // cannot tell a missing comparison from one never offered.
          value={priorYearWeek != null ? fmtNum(priorYearWeek) : NULL_GLYPH}
        />
      </div>

      <div className="space-y-2">
        <div className="flex h-32 items-end gap-1">
          {weeks.map((b, i) => {
            const max = Math.max(...weeks.map((w) => w.contacts))
            const isPartial = i === weeks.length - 1
            return (
              <div key={b.week} className="flex flex-1 flex-col items-center gap-1">
                <span
                  data-week={b.week}
                  data-partial={isPartial ? 'true' : undefined}
                  className={
                    isPartial
                      ? 'w-full rounded-t border-t-2 border-dashed border-white/40 bg-white/20'
                      : 'w-full rounded-t bg-white/60'
                  }
                  // max === 0 is every bucket at zero. Short-circuit rather than
                  // dividing, which would emit height: NaN%.
                  style={{ height: max === 0 ? '0%' : `${(b.contacts / max) * 100}%` }}
                />
                <span className="text-[10px] text-text-muted">{weekLabel(b.week)}</span>
              </div>
            )
          })}
        </div>
        {/* The final bar covers only the days elapsed so far. Drawn at full
            scale with nothing distinguishing it, it reads on a Monday as a
            collapse: the same misreading the Current Week tile refuses to
            publish as a number. Dropping the bar is not the answer either,
            since Current Week is this block's headline. */}
        <p className="text-xs text-text-muted">
          Final bar is the current week in progress: {daysElapsedInCurrentWeek} of 7 days.
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run the test and confirm it passes**

```bash
npx vitest run components/report-sections/executive-overview/contact-pacing.test.tsx
```

Expected: PASS, 17 tests.

If "gives Current Week no delta" fails because `getAllByText(/%/)` finds more than one node, check that the healthy fixture leaves `priorYearWeek` a plain number and that no tile is emitting a stray placeholder.

- [ ] **Step 5: Run the gates and commit**

```bash
npx vitest run components/report-sections/executive-overview/ lib/salesforce/
npx tsc --noEmit
npm run check:rsc
git add components/report-sections/executive-overview/contact-pacing.tsx components/report-sections/executive-overview/contact-pacing.test.tsx
git commit -m "feat(exec-overview): render Contact Creation from WeeklyContacts

Three tiles over a weekly bar row.

WeeklyContacts carries no degradation flags, which is how two states stayed
hidden. previousWeek is `completed.at(-1)?.contacts ?? 0` (contacts.ts:153), so
with no completed week the tile publishes a confident 0 for a week that does
not exist: the state of every client from January 1 until the year's first ISO
week completes. Derived as weeks.length < 2 from gapFill's contract rather than
reopening the Half A types, and the tile dashes. currentWeekPartial cannot
serve as the discriminant, since the transform sets it true unconditionally.

The final bar is the week in progress and is now marked as such rather than
plotted at full scale, where on a Monday it reads as a collapse. Empty weeks
replaces the entire block, tiles included: chart-only replacement would leave
three tiles reading zero above the words 'No data for this period.'"
```

---

## Task 5: The two journey stubs become real

Implements spec §4.3. `StageInput` gains three optional fields and the hardcoded unconnected stubs populate.

**Files:**
- Modify: `components/report-sections/executive-overview/stages.ts` (`StageInput` at `:6-35`; the two stubs at `:132-150`)
- Modify: `components/report-sections/executive-overview/stages.test.ts` (reword one existing test, add six)

**Interfaces:**
- Consumes: `PipelineData` and `WeeklyContacts` from `@/lib/salesforce/types`; `fmtUsd` from `./reshape` (Task 2). The two components from Tasks 3 and 4 are NOT imported here: `stages.ts` reads both data shapes but renders neither.
- Produces: `StageInput` gains

  ```ts
  pipeline?: PipelineData | null
  contacts?: WeeklyContacts | null
  crmConnected?: boolean
  ```

  `buildStages` keeps its existing signature otherwise. Task 6 passes all three.

**Why optional and not required:** the file's existing convention for later-added fields (`peecConnected?`, `now?`), and it avoids churning all 22 `buildStages` calls in `stages.test.ts` for no behavioural gain. There is exactly one production call site.

**Why `crmConnected` exists at all:** keying the stubs off data presence alone means a configured client whose contacts fetch rejects gets "Not connected" and "Connect your CRM to see this" on the journey card while the block eight lines below it on the same screen says "Couldn't load contact data." That is verbatim the defect `peecConnected` was added to fix (`stages.ts:23-30`, `:101-108`).

- [ ] **Step 1: Write the failing tests**

In `components/report-sections/executive-overview/stages.test.ts`, first **replace** the existing test named `'always marks the two CRM stages unconnected and gives them no metric: this page has no CRM data source'` (it is false by construction once this ships) with:

```ts
  it('marks the two CRM stages unconnected only when the client has no CRM configured', () => {
    const s = buildStages({ totals, cmpTotals, peec, peecConnected: true, trendRows: [], crmConnected: false })
    const crm = s.filter(x => x.key === 'inbound' || x.key === 'pipeline')
    expect(crm).toHaveLength(2)
    for (const stage of crm) {
      expect(stage.connected).toBe(false)
      expect(stage.metric).toBeUndefined()
      expect(stage.delta).toBeUndefined()
      expect(stage.unconnectedHint).toContain('CRM')
    }
  })
```

Then append these fixtures and tests to the same file:

```ts
import type { PipelineData, WeeklyContacts } from '@/lib/salesforce/types'

const pipelineFixture: PipelineData = {
  openDeals:        { value: 297 },
  totalPipeline:    { value: 4_820_000 },
  closedWon:        { value: 1_375_000, delta: 15.7 },
  weightedPipeline: { value: 2_140_000 },
  byOwner: [{ owner: 'Dana Reyes', count: 41, amount: 900_000 }],
  ownersTruncated: false,
  stageTruncated: false,
  unrecognizedClosedFlags: 0,
  wonStageUnmatched: false,
  openUnavailable: false,
  wonUnavailable: false,
}

const contactsFixture: WeeklyContacts = {
  weeks: [
    { week: '2026-W31', contacts: 240 },
    { week: '2026-W32', contacts: 186 },
    { week: '2026-W33', contacts: 52 },
  ],
  currentWeek: 52,
  currentWeekPartial: true,
  daysElapsedInCurrentWeek: 3,
  previousWeek: 186,
  priorYearWeek: 149,
  completedWeekOverWeek: -22.5,
}

describe('CRM stages, populated', () => {
  it('populates the inbound card from contacts, with a hero label and a week-to-date badge', () => {
    const s = buildStages({ totals, cmpTotals, peec, peecConnected: true, trendRows: [], contacts: contactsFixture, crmConnected: true })
    const inbound = s.find(x => x.key === 'inbound')!
    expect(inbound.metric).toBe('52')
    expect(inbound.badge).toBe('WEEK TO DATE')
    expect(inbound.subMetric).toBe('3 of 7 days so far')
    // The shipped stub carried NO heroLabel, so "retained" would ship a blank
    // hover reveal. It has to be written out.
    expect(inbound.heroLabel).toBeTruthy()
    expect(inbound.connected).toBeUndefined()
    // Partial week against a complete one is structurally invalid.
    expect(inbound.delta).toBeUndefined()
  })

  it('populates the pipeline card from pipeline, with an as-of-today badge', () => {
    const s = buildStages({ totals, cmpTotals, peec, peecConnected: true, trendRows: [], pipeline: pipelineFixture, crmConnected: true })
    const p = s.find(x => x.key === 'pipeline')!
    expect(p.metric).toBe('$4,820,000')
    expect(p.badge).toBe('AS OF TODAY')
    expect(p.subMetric).toBe('297 open deals')
    expect(p.heroLabel).toBeTruthy()
    expect(p.delta).toBeUndefined()
    expect(p.connector).toBeUndefined()   // last stage in the row
  })

  it('dashes the inbound Previous Week stat when no completed week exists', () => {
    const s = buildStages({
      totals, cmpTotals, peec, peecConnected: true, trendRows: [], crmConnected: true,
      contacts: { ...contactsFixture, weeks: [{ week: '2026-W01', contacts: 12 }], previousWeek: 0, completedWeekOverWeek: undefined, priorYearWeek: undefined },
    })
    const stat = s.find(x => x.key === 'inbound')!.stats!.find(st => st.label === 'Previous Week')!
    expect(stat.value).toBe('—')
  })

  it('dashes the pipeline card\'s Closed Won stat under wonUnavailable and under wonStageUnmatched', () => {
    // Two explicit fixtures rather than a computed key: a computed property in
    // an object literal widens to `string`, so the spread would stop
    // typechecking against PipelineData.
    const degraded: PipelineData[] = [
      { ...pipelineFixture, closedWon: { value: 0, delta: -100 }, wonUnavailable: true },
      { ...pipelineFixture, closedWon: { value: 0, delta: -100 }, wonStageUnmatched: true },
    ]
    for (const pipeline of degraded) {
      const s = buildStages({ totals, cmpTotals, peec, peecConnected: true, trendRows: [], crmConnected: true, pipeline })
      const stat = s.find(x => x.key === 'pipeline')!.stats!.find(st => st.label === 'Closed Won')!
      expect(stat.value).toBe('—')
    }
  })

  it('does not state a deal count beside a dashed metric', () => {
    const s = buildStages({
      totals, cmpTotals, peec, peecConnected: true, trendRows: [], crmConnected: true,
      pipeline: { ...pipelineFixture, openDeals: { value: 0 }, totalPipeline: { value: 0 }, weightedPipeline: { value: 0 }, openUnavailable: true },
    })
    const p = s.find(x => x.key === 'pipeline')!
    expect(p.metric).toBe('—')
    expect(p.subMetric).toBe("Couldn't load open pipeline.")
  })
})

describe('CRM stages, crmConnected decides the unconnected treatment', () => {
  it('configured with no data dashes the cards rather than saying "not connected"', () => {
    // This is the case that would otherwise contradict the block below it on
    // the same screen, which renders "Couldn't load contact data."
    const s = buildStages({ totals, cmpTotals, peec, peecConnected: true, trendRows: [], crmConnected: true })
    for (const stage of s.filter(x => x.key === 'inbound' || x.key === 'pipeline')) {
      expect(stage.connected).toBeUndefined()
      expect(stage.metric).toBe('—')
    }
  })

  it('falls back to data presence when crmConnected is omitted, for older callers', () => {
    // crmConnected omitted on purpose here; peecConnected still supplied, per
    // the spec's section 2 drift row 4.
    const s = buildStages({ totals, cmpTotals, peec, peecConnected: true, trendRows: [] })
    expect(s.find(x => x.key === 'inbound')?.connected).toBe(false)

    const withData = buildStages({ totals, cmpTotals, peec, peecConnected: true, trendRows: [], contacts: contactsFixture })
    expect(withData.find(x => x.key === 'inbound')?.connected).toBeUndefined()
  })

  it('keeps the CRM-specific hint on both stubs in every branch', () => {
    for (const input of [
      { crmConnected: false },
      { crmConnected: true },
      { crmConnected: true, contacts: contactsFixture, pipeline: pipelineFixture },
    ]) {
      const s = buildStages({ totals, cmpTotals, peec, peecConnected: true, trendRows: [], ...input })
      for (const stage of s.filter(x => x.key === 'inbound' || x.key === 'pipeline')) {
        expect(stage.unconnectedHint).toBe('Connect your CRM to see this')
      }
    }
  })
})
```

- [ ] **Step 2: Run the tests and confirm they fail for the right reason**

```bash
npx vitest run components/report-sections/executive-overview/stages.test.ts
```

Expected: the new tests FAIL on `metric` being `undefined` and `connected` being `false` (the stubs are still hardcoded), and TypeScript flags `pipeline`, `contacts` and `crmConnected` as unknown properties on `StageInput`. Both are correct failures.

- [ ] **Step 3: Extend `StageInput`**

In `components/report-sections/executive-overview/stages.ts`, add these three fields to `StageInput` (after `peecConnected?` and before `now?`), and add the type import at the top of the file:

```ts
import type { PipelineData, WeeklyContacts } from '@/lib/salesforce/types'
import { fmtNum, fmtPct, fmtUsd, pct } from './reshape'
```

```ts
  /** Pipeline tile data, or null when the fetch failed or the client has no CRM. */
  pipeline?: PipelineData | null
  /** Weekly contact data, or null when the fetch failed or the client has no CRM. */
  contacts?: WeeklyContacts | null
  /**
   * Whether the CLIENT is CONFIGURED for a CRM, independent of whether either
   * fetch returned data. Exactly the same distinction peecConnected draws
   * above: a configured client whose fetch failed must NOT read "not
   * connected", it dashes. Comes from isSalesforceConfigured (client row
   * state), never from canQuerySalesforce: a deployment missing the shared
   * Supermetrics key is a load failure, not an unconnected CRM. When omitted,
   * falls back to data presence for older callers.
   */
  crmConnected?: boolean
```

Add the three to the destructured parameter list at `:64`:

```ts
export function buildStages({ totals, cmpTotals, peec, trendRows, peecConnected, pipeline, contacts, crmConnected, now = new Date() }: StageInput): DemandStage[] {
```

- [ ] **Step 4: Replace the two stubs**

Replace the `inbound` and `pipeline` stub objects (currently `stages.ts:132-150`) with:

```ts
    {
      key: 'inbound', source: 'Inbound Funnel', label: 'Online Contacts',
      color: CHART_COLORS.positive,
      connector: 'becomes pipeline',
      metric: contacts ? fmtNum(contacts.currentWeek) : '—',
      // The window label for this card: the hero is week to date, not the
      // page's 30 days.
      badge: contacts ? 'WEEK TO DATE' : undefined,
      subMetric: contacts ? `${contacts.daysElapsedInCurrentWeek} of 7 days so far` : undefined,
      // Never a delta on this metric: it is a partial week, and the only
      // comparison the source offers is between two COMPLETE weeks.
      delta: undefined,
      // Written out, not "retained": the stub this replaces carried no
      // heroLabel at all, so retaining would ship a blank hover reveal.
      heroLabel: contacts ? 'new contacts created so far this week' : undefined,
      stats: contacts ? [
        // weeks.length < 2 means no completed week exists, so previousWeek's 0
        // is the `?? 0` at contacts.ts:153 rather than a count.
        { label: 'Previous Week',  value: contacts.weeks.length >= 2 ? fmtNum(contacts.previousWeek) : '—' },
        { label: 'Week over Week', value: contacts.completedWeekOverWeek != null ? `${contacts.completedWeekOverWeek > 0 ? '+' : ''}${contacts.completedWeekOverWeek.toFixed(1)}%` : '—' },
        { label: 'Prior Year Week', value: contacts.priorYearWeek != null ? fmtNum(contacts.priorYearWeek) : '—' },
      ] : undefined,
      // Only `false` triggers the unconnected treatment (demand-journey.tsx:128-133),
      // so a configured client with no data omits this and simply dashes.
      connected: (crmConnected ?? (contacts != null)) ? undefined : false,
      unconnectedHint: 'Connect your CRM to see this',
    },
    {
      key: 'pipeline', source: 'Pipeline', label: 'Open Pipeline',
      color: CHART_COLORS.neutral,
      // No connector: last stage in the row.
      metric: pipeline ? (pipeline.openUnavailable ? '—' : fmtUsd(pipeline.totalPipeline.value)) : '—',
      badge: pipeline ? 'AS OF TODAY' : undefined,
      // Must not keep stating a deal count beside a dashed value: that is the
      // same defect as a live delta under a dashed number, in a different field.
      subMetric: pipeline
        ? (pipeline.openUnavailable ? "Couldn't load open pipeline." : `${fmtNum(pipeline.openDeals.value)} open deals`)
        : undefined,
      // Named explicitly rather than reading totalPipeline.delta, which is
      // always undefined but would read like a live wire waiting to be fixed.
      delta: undefined,
      heroLabel: pipeline ? 'open pipeline as of today' : undefined,
      stats: pipeline ? [
        // Dashes under both flags, matching the block below: a renamed stage
        // makes the true figure unknown, not zero.
        { label: 'Closed Won',        value: pipeline.wonUnavailable || pipeline.wonStageUnmatched ? '—' : fmtUsd(pipeline.closedWon.value) },
        { label: 'Weighted Pipeline', value: pipeline.openUnavailable ? '—' : fmtUsd(pipeline.weightedPipeline.value) },
      ] : undefined,
      connected: (crmConnected ?? (pipeline != null)) ? undefined : false,
      unconnectedHint: 'Connect your CRM to see this',
    },
```

`unconnectedHint` can stay on the object in every branch, exactly as the AEO stage keeps its own hint unconditionally: `demand-journey.tsx:128-133` reads it only when `connected === false`.

- [ ] **Step 5: Run the tests and confirm they pass**

```bash
npx vitest run components/report-sections/executive-overview/stages.test.ts
```

Expected: PASS, including all 22 pre-existing `buildStages` calls, which pass none of the three new fields and must be unaffected.

- [ ] **Step 6: Run the gates and commit**

```bash
npx vitest run components/report-sections/executive-overview/ lib/salesforce/
npx tsc --noEmit
npm run check:rsc
git add components/report-sections/executive-overview/stages.ts components/report-sections/executive-overview/stages.test.ts
git commit -m "feat(exec-overview): populate the two CRM journey stages

StageInput gains pipeline, contacts and crmConnected, all optional, matching
the file's convention for peecConnected and now.

crmConnected is what stops the card and the block telling one client two
stories. Keying the stubs off data presence alone gives a configured client
whose fetch rejected 'Connect your CRM to see this' on the card while the block
eight lines below says 'Couldn't load contact data', which is verbatim the
defect peecConnected was added to fix.

Both cards carry an explicit heroLabel: the stubs they replace had none, so
'retaining' one would have shipped a blank hover reveal. The pipeline card's
Closed Won stat dashes under wonStageUnmatched, matching the block."
```

---

## Task 6: Wire it into the page

Implements spec §4.4 and §3.5. The last task, and the only one that changes what a client sees.

**Files:**
- Modify: `components/report-sections/executive-overview/index.tsx` (imports at `:1-14`; the client lookup at `:49`; the `Promise.allSettled` array at `:53-81`; its destructure at `:47-52`; the `buildStages` call at `:115`; the page label at `:119`; the two CRM sections at `:140-149`)

**Interfaces:**
- Consumes: `isSalesforceConfigured` and `canQuerySalesforce` from `@/lib/salesforce/configured` (Task 1); `getSalesforcePipeline` and `getSalesforceWeeklyContacts` from `@/lib/salesforce/{pipeline,contacts}`; `PipelinePerformance` (Task 3); `ContactPacing` (Task 4); `LoadFailed` from `./no-data`; `buildStages`' three new fields (Task 5).
- Produces: nothing new. This is the terminal consumer.

**The cached fetchers' signatures** (both already exported, do NOT use the `...Impl` variants here):

```ts
getSalesforcePipeline(slug: string): Promise<PipelineData>          // pipeline.ts:310
getSalesforceWeeklyContacts(slug: string): Promise<WeeklyContacts>  // contacts.ts:218
```

**Why two flags and not one.** `canFetch` gates the request, so no doomed call is issued. `hasCrm` gates what the reader is TOLD, so a preview or staging build missing the shared Supermetrics key renders a load failure rather than telling a configured client to connect a CRM they already connected. See spec §3.6.

**Why the middle branch matters differently per block.** `getSalesforcePipelineImpl` wraps all four of its queries in `.catch(() => null)` and always resolves, so a CRM outage returns a fully populated object with its flags set rather than a rejection: the Task 3 caveats carry the weight there. `getSalesforceWeeklyContactsImpl` leaves its primary query uncaught, so a failure rejects and `val()` yields null. What reaches `LoadFailed` on the pipeline block is the configured-but-unreachable client, where `canFetch` is false and no fetch happens at all.

- [ ] **Step 1: Add the imports**

At the top of `components/report-sections/executive-overview/index.tsx`:

```ts
import { getSalesforcePipeline } from '@/lib/salesforce/pipeline'
import { getSalesforceWeeklyContacts } from '@/lib/salesforce/contacts'
import { isSalesforceConfigured, canQuerySalesforce } from '@/lib/salesforce/configured'
import { PipelinePerformance } from './pipeline-performance'
import { ContactPacing } from './contact-pacing'
import { LoadFailed } from './no-data'
```

`NeedsConnection` is already imported at `:5` and stays: it is still the third branch.

- [ ] **Step 2: Derive the two flags**

Immediately after the existing `peecConfigured` line (`:49`), which already has `client` in scope so neither costs a query:

```ts
  // Two questions, two predicates (lib/salesforce/configured.ts).
  //   hasCrm   decides what we TELL the reader (LoadFailed vs NeedsConnection)
  //   canFetch decides whether we ISSUE the request at all
  // They differ on exactly one case: a configured client on a deployment whose
  // shared Supermetrics key is unset. Using canFetch for the render decision
  // there would tell them to connect a CRM they already connected.
  const hasCrm   = isSalesforceConfigured(client)
  const canFetch = canQuerySalesforce(client)
```

- [ ] **Step 3: Append the two fetches**

Add two entries at the END of the existing `Promise.allSettled` array (after the `peecConfigured ? getPeecOverview(...)` line at `:81`), and two names at the end of the destructure:

```ts
    canFetch ? getSalesforcePipeline(clientSlug)       : Promise.resolve(null),
    canFetch ? getSalesforceWeeklyContacts(clientSlug) : Promise.resolve(null),
```

```ts
  const [
    totalsRes, cmpTotalsRes, trendRes, cmpTrendRes,
    channelRes, cmpChannelRes, channelSMRes,
    audienceRes, cmpAudienceRes, peecRes,
    pipelineRes, contactsRes,
  ] = await Promise.allSettled([
```

Order matters: `Promise.allSettled` is positional, so appending to the array and to the destructure must happen together.

- [ ] **Step 4: Unwrap and pass through**

After the existing `const peec = val(peecRes)` line:

```ts
  const pipeline = val(pipelineRes)
  const contacts = val(contactsRes)
```

Then extend the `buildStages` call at `:115`. Pass `hasCrm`, NOT `canFetch`, so the cards and the blocks read the same guard:

```ts
  const stages = buildStages({
    totals, cmpTotals, peec, trendRows, peecConnected: peecConfigured,
    pipeline, contacts, crmConnected: hasCrm,
  })
```

- [ ] **Step 5: Move the page-level window label**

`index.tsx:119` prints one `Last 30 days` line above the entire page. None of the CRM data is on that window: the open tiles are as-of-today, Closed Won is year to date, the contact bars are year-to-date ISO weeks. Left where it is, it becomes a false caption for six new numbers.

Delete the standalone line above `<DemandJourney />`:

```tsx
      <p className="text-xs font-bold uppercase tracking-widest text-text-muted">Last 30 days</p>
```

and re-add it inside the Web Analytics `<section>`, directly under its `<h2>` and above the KPI grid:

```tsx
      <section className="space-y-6">
        <h2 className="text-sm font-bold uppercase tracking-widest text-text-muted">Web Analytics</h2>
        <p className="text-xs font-bold uppercase tracking-widest text-text-muted">Last 30 days</p>
```

The demand journey and the two CRM sections now each carry their own window, on the card badge or under the block heading.

- [ ] **Step 6: Replace the two hardcoded blocks**

Replace the two `<NeedsConnection sourceName="CRM" />` calls at `:142` and `:147`:

```tsx
      <section className="space-y-6">
        <h2 className="text-sm font-bold uppercase tracking-widest text-text-muted">Contact Creation</h2>
        {contacts ? <ContactPacing data={contacts} />
          : hasCrm ? <LoadFailed message="Couldn't load contact data." />
          : <NeedsConnection sourceName="CRM" />}
      </section>

      <section className="space-y-6">
        <h2 className="text-sm font-bold uppercase tracking-widest text-text-muted">Pipeline Performance</h2>
        {pipeline ? <PipelinePerformance data={pipeline} />
          : hasCrm ? <LoadFailed message="Couldn't load pipeline data." />
          : <NeedsConnection sourceName="CRM" />}
      </section>
```

The parent plan routes a configured-but-failed fetch to `NeedsConnection`. That tells a connected client to connect their CRM, the same class of error the `peecConnected` fix corrects. `LoadFailed` already exists in `no-data.tsx` for exactly this distinction, and this file already uses that pattern for `trendFailed`, `audienceFailed` and `channelFailed`.

- [ ] **Step 7: Run the gates**

```bash
npx vitest run components/report-sections/executive-overview/ lib/salesforce/
npx tsc --noEmit
npm run check:rsc
```

Expected: all green. `check:rsc` is the one that catches a `'use client'` slipping into either new component, or a client component receiving a non-serializable prop.

- [ ] **Step 8: Commit**

```bash
git add components/report-sections/executive-overview/index.tsx
git commit -m "feat(exec-overview): wire the CRM blocks and cards into the page

Two guarded fetches appended to the existing Promise.allSettled, and a
three-way render per block replacing the hardcoded NeedsConnection.

canFetch gates the request so no doomed call is issued; hasCrm gates what the
reader is told. They differ on exactly one case, a configured client on a
deployment whose shared Supermetrics key is unset, and using the wrong one
there tells that client to connect a CRM they already connected. hasCrm is
what reaches buildStages as crmConnected, so the journey cards and the blocks
cannot disagree.

The page-level 'Last 30 days' line moves into the Web Analytics section: none
of the CRM data is on that window, so left where it was it became a false
caption for six new numbers."
```

---

## Task 7: Review record and PR

Per `CLAUDE.md` Stage 1, the feature does not merge to `dev` until a standalone review-record doc has cleared as its own PR.

**Files:**
- Create: `docs/qa/exec-overview-crm-wiring-code-review.md`

- [ ] **Step 1: Open the feature PR**

```bash
git push -u origin feat/exec-overview-crm-wiring
gh pr create --base dev --title "feat(exec-overview): CRM wiring (Half B)" --body "..."
```

Reviewers are Paul and Thomas. CI (type-check, tests) must be green before it merges to `dev`, and every reviewer comment must be resolved on the branch first.

- [ ] **Step 2: Write the review record**

`docs/qa/exec-overview-crm-wiring-code-review.md`, written against the FEATURE BRANCH and citing its diff range. Follow the skeleton in `CLAUDE.md` exactly: header with the precise diff range and a line stating no code changes; §1 How it works; §2 Verification method; §3 findings table (`# | Sev | Status | Location | Finding`); §4 Detail; §5 Follow-ups.

§1 must answer, from the doc alone, the questions a client can plausibly ask:
- Where does Total Pipeline come from? (sum of open-deal amounts over a 19-calendar-year window, openness evaluated as of now, `pipeline.ts:69-72`)
- Why does Closed Won sometimes show a dash with no percentage? (spec §3.4: the value is gone, or the baseline is corrupt)
- How is the owner list ranked? (`transformByOwner` sorts by open deal count descending, `pipeline.ts:223`)
- Why is there no year-over-year on the three open tiles? (structurally invalid: a prior-year window has had a year to close, and the live check on 2026-08-16 rendered +29,600 percent before this was fixed)

§4 must record the three decisions the spec says belong there: §3.3's non-discriminant, §3.4's suppression rule, and §3.6's two predicates.

- [ ] **Step 3: Open the review PR**

Its own PR off `dev`, titled `docs(review): Executive Overview CRM wiring code review record`, changing no code. It is the gate that must clear before the feature merges to `dev`.

- [ ] **Step 4: Commit**

```bash
git add docs/qa/exec-overview-crm-wiring-code-review.md
git commit -m "docs(review): Executive Overview CRM wiring code review record"
```

---

## Out of scope

Named here so no task quietly absorbs them:

- **Live verification against a running dev server** using the service cookie the crons mint. Cannot be done from an agent session; hand back to Paul rather than claiming it.
- **Enablement.** The per-environment `UPDATE clients SET salesforce_config = ...` is a separate operational step. Migration 0021 is already applied on dev; staging and production still need it, run via `DATABASE_URL_UNPOOLED='<target-direct-url>' npx tsx --env-file=.env.local scripts/migrate-http.ts`, never `npm run db:migrate`.
- **A `PipelineKpi` discriminant.** Spec §3.3 decides against it: no rendered surface needs the distinction.
- **The three auth/connections pages hardcoding `[PLATFORM_IDS.SALESFORCE]: false`.**
- **Lead-quality colouring, form tables, and the online/offline contact split.** None exists in the source data.
- **Owner names being real people on a client-facing page.** Worth a product call; the existing HubSpot equivalent does the same.
