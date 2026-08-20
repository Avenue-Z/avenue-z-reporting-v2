# Renaissance CRM (PR 208) Code-Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve Paul's `CHANGES_REQUESTED` review on PR 208 (19 comments): make the Salesforce pipeline tiles report true open pipeline, harden numeric and boolean coercion, fix the contacts weekly aggregation, and close the `resolveCompareIso` coverage gap.

**Architecture:** All changes are in `lib/salesforce/`. The load-bearing one is the pipeline date-basis split: the three open tiles move onto their own connector-configured, wide-window query (openness is as-of-now, not close-date-YTD), while `closedWon` keeps the year-to-date close-date window. The rest are localized correctness fixes to `num.ts`, `contacts.ts`, and the transforms, each with a test that fails against the current code first.

**Tech Stack:** TypeScript strict, Vitest, Supermetrics Data API (`ds_id: SF`), Drizzle. No new dependencies.

## Global Constraints

- **This is Half A only.** Do not touch `components/`, `app/`, or anything on the `Executive-Overview-Duplicate-Ren` (PR 207) branch. Work on branch `Renaissance-CRM-Salesforce`.
- **Do not touch `lib/ga4/`, `lib/meta/`, `lib/linkedin/`, `lib/hubspot/`, or `lib/peec/`.** No blast radius on other clients.
- **`opportunity_probability` is 0 to 100. Divide by 100 before weighting.** A test pins this; keep it.
- **Won means the exact configured stage literal** (`salesforceConfig.wonStageName ?? 'Closed Won'`), never `opportunity_is_won`.
- **Booleans and numbers arrive as strings-or-native** from `parseSmRows`; always coerce through `toBool`/`toNumber`, never a bare `=== true` or `Number()`.
- **Connector settings must be pinned, not left on defaults.** `deal_date_field`, `data_fetched_by`, and `convert_to_default_currency` are passed explicitly (see Task 3, Task 6). Probe confirmed the org is single-currency, so currency conversion changes no number today, but the setting is pinned so a future multi-currency org fails loud, not silent.
- **No em or en dashes** in code, comments, or commit messages. The rendered null-display glyph already used in copied formatters stays verbatim; this module renders nothing, so it should not introduce one.
- **`tsc` is not in CI.** Run `npx tsc --noEmit` before every commit. `npm run check:rsc` and `npm test` are in CI.
- **Do NOT run `npm run db:migrate` or `npm run db:seed`.**
- **Test hygiene (this module's standard):** for every behavior asserted, construct the wrong implementation that still passes and close it; apply each mutation by hand, confirm the test fails, revert. Check for an exact `Tests  N passed (N)` line, never a grep for "failed" (deliberate-failure tests print that word to stderr). Spy on and assert every expected `console.warn`/`console.error` so output stays pristine.
- Commit after every task.

---

## File Structure

| File | Responsibility | Tasks |
|---|---|---|
| `lib/salesforce/num.ts` | `toNumber`/`toBool` coercion, actionable warns | 1 |
| `lib/salesforce/pipeline.ts` | pipeline transforms + fetch; open/won partition; date-basis split; truncation flags | 2, 3, 4 |
| `lib/salesforce/pipeline.test.ts` | pure-transform tests | 2, 3, 4 |
| `lib/salesforce/pipeline.orchestration.test.ts` | fetch/orchestration tests (mocks `./base`) | 3, 4, 8 |
| `lib/salesforce/contacts.ts` | weekly-contacts transform + fetch | 5, 6 |
| `lib/salesforce/contacts.test.ts` | contacts tests | 5, 6 |
| `lib/salesforce/base.ts` | `salesforceQuery` (already forwards `settings`); no logic change, doc only | 3 |
| `lib/salesforce/resolve-compare-iso.test.ts` | NEW vitest spec for `resolveCompareIso` | 7 |
| `lib/salesforce/base.test.ts` | delete (dead node:assert script) | 7 |
| `vitest.config.ts` | pinned include allowlist | 7 |

**Not in scope (recorded, handled elsewhere):**
- The Stage-1 review-record doc (`docs/qa/renaissance-crm-salesforce-code-review.md`). Paul offered to write it from these findings; it is not code and not part of this plan.
- `opportunity_amount_closed_won` sourcing comparison (pipeline.ts:32). This is a "make the comparison and record it" ask, folded into Task 3 Step 8 as a documented decision, not a rewrite.
- Nick questions (attribution, ICP/MCP). Answered from the catalog; not code.

---

## Task 1: `num.ts` coercion is silent on empty/null/whitespace and its warns are unactionable

Paul comments num.ts:21 (● silent zero on `''`/`null`/whitespace) and num.ts:18 (● warns name no field or client, fire per row). `parseSmRows` fills missing/short cells with `''`, so `''` is the shape a truncated response actually produces, and it currently coerces to a confident `0`.

**Files:**
- Modify: `lib/salesforce/num.ts`
- Modify: `lib/salesforce/pipeline.ts` (pass field labels at the call sites)
- Modify: `lib/salesforce/contacts.ts` (pass field labels at the call sites)
- Test: `lib/salesforce/num.test.ts` (create if absent; else extend `pipeline.test.ts`/`contacts.test.ts` coverage of the warns)

**Interfaces:**
- Consumes: nothing
- Produces: `toNumber(v: unknown, field?: string): number`, `toBool(v: unknown, field?: string): boolean`. The optional `field` label is included in the warn so an operator can see which field broke. Callers pass a stable label (e.g. `'opportunity_amount'`).

- [ ] **Step 1: Write the failing test**, create `lib/salesforce/num.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { toNumber } from './num'

describe('toNumber missing-value handling', () => {
  it.each([['empty string', ''], ['null', null], ['whitespace', '   ']])(
    'treats %s as a warned missing value, not a silent zero',
    (_label, input) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      expect(toNumber(input, 'opportunity_amount')).toBe(0)
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('opportunity_amount'),
        input,
      )
      warn.mockRestore()
    },
  )

  it('does not warn on a real zero', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(toNumber('0', 'opportunity_amount')).toBe(0)
    expect(toNumber(0, 'opportunity_amount')).toBe(0)
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('parses a padded number without warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(toNumber('  42 ', 'opportunity_count')).toBe(42)
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})
```

- [ ] **Step 2: Run it, verify it fails**, `npx vitest run lib/salesforce/num.test.ts`. Expected: FAIL (empty/null/whitespace currently return 0 without warning).

- [ ] **Step 3: Add `lib/salesforce/num.test.ts` to the vitest include allowlist** in `vitest.config.ts`, next to the existing `lib/salesforce/*.test.ts` entries.

- [ ] **Step 4: Rewrite `toNumber` and `toBool`** in `lib/salesforce/num.ts`:

```ts
/** True when v is null, undefined, or a string that is empty or whitespace only. */
function isMissing(v: unknown): boolean {
  return v == null || (typeof v === 'string' && v.trim() === '')
}

/**
 * Coerces a Supermetrics numeric field to a finite number. parseSmRows fills a
 * missing or short cell with '', so an absent value arrives as '' or undefined,
 * not just undefined; all missing shapes warn and fall back to 0 rather than
 * coercing to a confident zero. An unparseable non-empty value warns separately.
 * `field` names the column so the warn is actionable.
 */
export function toNumber(v: unknown, field = 'unknown'): number {
  if (isMissing(v)) {
    console.warn(`[salesforce] numeric field "${field}" missing, defaulting to 0:`, v)
    return 0
  }
  const n = Number(typeof v === 'string' ? v.trim() : v)
  if (Number.isFinite(n)) return n
  console.warn(`[salesforce] numeric field "${field}" unparseable, defaulting to 0:`, v)
  return 0
}

/**
 * Coerces a Supermetrics boolean field. Accepts real booleans, 'true'/'false'
 * (any case, trimmed), and 1/0 (number or string). Anything unrecognised warns
 * and fails CLOSED (returns true), because the caller uses this for is_closed
 * and the failure we prevent is overstating open pipeline.
 */
export function toBool(v: unknown, field = 'unknown'): boolean {
  if (v === true || v === false) return v
  if (v === 1 || v === 0) return v === 1
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase()
    if (s === 'true' || s === '1') return true
    if (s === 'false' || s === '0') return false
  }
  console.warn(`[salesforce] boolean field "${field}" unrecognised, defaulting to closed:`, v)
  return true
}
```

- [ ] **Step 5: Pass field labels at call sites.** In `pipeline.ts` `toStageRows`, change each coercion to include its column: `isClosed: toBool(r.opportunity_is_closed, 'opportunity_is_closed')`, `probability: toNumber(r.opportunity_probability, 'opportunity_probability')`, `count: toNumber(r.opportunity_count, 'opportunity_count')`, `amount: toNumber(r.opportunity_amount, 'opportunity_amount')`. Do the same in `transformByOwner` (`toBool(r.opportunity_is_closed, 'opportunity_is_closed')`, `toNumber(r.opportunity_count, 'opportunity_count')`, `toNumber(r.opportunity_amount, 'opportunity_amount')`) and in `contacts.ts` `toWeekBuckets` (`toNumber(r.contact_count, 'contact_count')`).

- [ ] **Step 6: Run tests to green**, `npx vitest run lib/salesforce/` then `npx tsc --noEmit`. Expected: all green, existing warn assertions in `pipeline.test.ts`/`contacts.test.ts` may need their expected message string updated to the new format (`missing`/`unrecognised`). Update them to match; do not weaken them.

- [ ] **Step 7: Mutation check**, revert `isMissing` to `return v == null` (drop the empty-string case); confirm the `''` test fails; revert back.

- [ ] **Step 8: Commit**

```bash
git add lib/salesforce/num.ts lib/salesforce/num.test.ts lib/salesforce/pipeline.ts lib/salesforce/contacts.ts vitest.config.ts
git commit -m "fix(salesforce): coerce empty/null/whitespace as warned missing, name the field

parseSmRows fills a missing cell with '', so '' is the real shape of an absent
value, not just undefined. toNumber now treats '', null, and whitespace as the
same warned missing case rather than a silent 0. Every coercion warn now names
its column so an operator can see which field broke."
```

---

## Task 2: `open` and `won` are independent filters, and `pct` sign-flips on a negative prior

Paul comments pipeline.ts:73 (● a won-stage row not flagged closed is double-counted into open and won) and pipeline.ts:47 (○ `pct(100, -50)` returns `-300`).

**Files:**
- Modify: `lib/salesforce/pipeline.ts`
- Test: `lib/salesforce/pipeline.test.ts`

**Interfaces:**
- Consumes: `toStageRows`, `wonStage` (from Task 1 and existing code)
- Produces: unchanged public surface; `won` is now `input.filter(r => r.isClosed && r.stage === wonStage)`, and `pct` withholds on a non-positive prior.

- [ ] **Step 1: Write the failing tests** in `pipeline.test.ts`:

```ts
it('does not double-count a won-stage row that is not flagged closed', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  // stage says Closed Won but is_closed is false: a mid-migration/data-entry state.
  const rows = [
    { opportunity_stage_name: 'Closed Won', opportunity_is_closed: false, opportunity_probability: 100, opportunity_count: 3, opportunity_amount: 500000 },
  ] as unknown as Record<string, string>[]
  const p = transformPipeline(rows, null)
  // It is open (not closed), so it counts toward open tiles...
  expect(p.openDeals.value).toBe(3)
  // ...but must NOT also count as closed-won.
  expect(p.closedWon.value).toBe(0)
  expect(warn).toHaveBeenCalledWith(
    expect.stringContaining('won stage but not closed'),
    expect.anything(),
  )
  warn.mockRestore()
})

it('withholds the closedWon delta when the prior is negative, not just zero', () => {
  const cur = [{ opportunity_stage_name: 'Closed Won', opportunity_is_closed: true, opportunity_probability: 100, opportunity_count: 1, opportunity_amount: 100000 }] as unknown as Record<string, string>[]
  const prior = [{ opportunity_stage_name: 'Closed Won', opportunity_is_closed: true, opportunity_probability: 100, opportunity_count: 1, opportunity_amount: -50000 }] as unknown as Record<string, string>[]
  const p = transformPipeline(cur, prior)
  expect(p.closedWon.delta).toBeUndefined()
})
```

- [ ] **Step 2: Run, verify both fail**, `npx vitest run lib/salesforce/pipeline.test.ts`. Expected: FAIL (currently double-counts, and `pct` returns a negative number).

- [ ] **Step 3: Fix the `won` filter** in `transformPipeline`'s `agg`:

```ts
    const open = input.filter((r) => !r.isClosed)
    const won  = input.filter((r) => r.isClosed && r.stage === wonStage)
    if (warnOnNoMatch) {
      const mislabeled = input.filter((r) => !r.isClosed && r.stage === wonStage)
      if (mislabeled.length > 0) {
        console.warn(`[salesforce] ${mislabeled.length} row(s) in won stage but not closed; excluded from closedWon:`,
          mislabeled.map((r) => r.stage))
      }
      if (input.length > 0 && won.length === 0) {
        console.warn(`[salesforce] no rows matched won stage "${wonStage}"; stages present:`,
          [...new Set(input.map((r) => r.stage))])
      }
    }
```

- [ ] **Step 4: Fix `pct`**, change the guard from `prior === 0` to non-positive:

```ts
function pct(current: number, prior: number | undefined): number | undefined {
  if (prior == null || prior <= 0) return undefined
  return ((current - prior) / prior) * 100
}
```

- [ ] **Step 5: Run to green, mutation check**, revert the `won` filter to `r.stage === wonStage`, confirm the double-count test fails; revert `pct` to `prior === 0`, confirm the negative-prior test fails; restore both. Then `npx tsc --noEmit`.

- [ ] **Step 6: Commit**

```bash
git add lib/salesforce/pipeline.ts lib/salesforce/pipeline.test.ts
git commit -m "fix(salesforce): partition open and won, withhold delta on a negative prior

won is now closed AND the won stage, so a won-stage row not yet flagged closed
counts once (as open) instead of inflating both tiles, and warns. pct withholds
on any non-positive prior, since closedWon amounts can go negative (credits,
refunds) and a swing from -50k to +100k should not render as down 300 percent."
```

---

## Task 3: The three open tiles are windowed by close date, so they show the overdue subset

Paul comments pipeline.ts:164 (● open tiles windowed by close date) and pipeline.ts:90 / base.ts:39 (settings never pinned). Probe (2026-08-20, read-only) confirmed: same YTD window, open pipeline reads 296 deals / $18.0M under the default close-date basis, versus 3,621 deals / $147.5M under a created-date basis. The shipped "Open Pipeline" is a small overdue subset, roughly 8x understated. Currency probe confirmed the org is single-currency (`opportunity_currency_iso_code` is blank), so no dollar figure is a mixed-currency sum today.

**The fix:** openness is evaluated as of now, so the open tiles must not be date-windowed at all. Query open deals over a wide window on the created-date basis (so no currently-open deal is excluded by its close date), and keep `closedWon` on the year-to-date close-date window (with prior-year for its delta). Pin all three connector settings explicitly.

**Files:**
- Modify: `lib/salesforce/pipeline.ts`
- Modify: `lib/salesforce/pipeline.orchestration.test.ts`
- Test: `lib/salesforce/pipeline.test.ts`
- Doc: append the decision to `docs/superpowers/specs/2026-08-13-crm-parity-scorecard.md`

**Interfaces:**
- Consumes: `salesforceQuery`, `resolveCompareIso`, `transformPipeline`
- Produces: `transformPipeline(openRows, wonRowsCurrent, wonRowsPrior, wonStage)`, the open tiles derive from `openRows` (wide-window, all currently-open deals), `closedWon` derives from `wonRowsCurrent` (YTD close-date), and its delta from `wonRowsPrior`. `getSalesforcePipelineImpl` issues the open query, the current-won query, the prior-won query, and the owner query (open scope, wide window).

- [ ] **Step 1: Add the pinned-settings and window constants** at the top of `pipeline.ts`:

```ts
// Connector settings pinned explicitly, never left on their Supermetrics defaults.
// Openness is evaluated as of now, so the open tiles must not be date-windowed by
// close date (the default deal_date_field), which would show only the overdue
// subset. They query the created-date basis over a wide window instead; we filter
// is_closed ourselves. closedWon keeps the close-date basis on a YTD window.
// convert_to_default_currency is pinned true so a future multi-currency org fails
// loud; the org is single-currency today, so it changes no number now.
const OPEN_SETTINGS = { deal_date_field: 'deal_created', convert_to_default_currency: true }
const WON_SETTINGS = { deal_date_field: 'deal_closed', convert_to_default_currency: true }
// A window wide enough to include every currently-open deal regardless of when it
// was created. Static bounds so the query is cache-stable within a day.
const OPEN_WINDOW = '2015-01-01,2035-12-31'
```

- [ ] **Step 2: Write the failing transform test** in `pipeline.test.ts`, `transformPipeline` now takes separate open and won row sets:

```ts
it('derives open tiles from the open rows and closedWon from the won rows, independently', () => {
  const openRows = [
    { opportunity_stage_name: 'Proposal', opportunity_is_closed: false, opportunity_probability: 25, opportunity_count: 10, opportunity_amount: 1000000 },
  ] as unknown as Record<string, string>[]
  const wonCur = [
    { opportunity_stage_name: 'Closed Won', opportunity_is_closed: true, opportunity_probability: 100, opportunity_count: 4, opportunity_amount: 400000 },
  ] as unknown as Record<string, string>[]
  const wonPrior = [
    { opportunity_stage_name: 'Closed Won', opportunity_is_closed: true, opportunity_probability: 100, opportunity_count: 2, opportunity_amount: 200000 },
  ] as unknown as Record<string, string>[]
  const p = transformPipeline(openRows, wonCur, wonPrior)
  expect(p.openDeals.value).toBe(10)
  expect(p.totalPipeline.value).toBe(1000000)
  expect(p.weightedPipeline.value).toBeCloseTo(250000, 0) // 1,000,000 * 0.25
  expect(p.closedWon.value).toBe(400000)
  expect(p.closedWon.delta).toBeCloseTo(100, 1) // 400k vs 200k prior
})
```

- [ ] **Step 3: Run, verify it fails** (signature mismatch). Then refactor `transformPipeline`:

```ts
export function transformPipeline(
  openRows: Record<string, string>[],
  wonRowsCurrent: Record<string, string>[],
  wonRowsPrior: Record<string, string>[] | null,
  wonStage: string = DEFAULT_WON_STAGE,
): PipelineKpis {
  const open = toStageRows(openRows).filter((r) => !r.isClosed)
  const wonCur = wonRowsFor(wonRowsCurrent, wonStage, true)
  const wonPrior = wonRowsPrior ? wonRowsFor(wonRowsPrior, wonStage, false) : null
  return {
    // Open tiles: no year-over-year delta (openness is as-of-now, see the
    // scorecard). Values come from the wide-window open query only.
    openDeals:        kpiNoDelta(open.reduce((s, r) => s + r.count, 0)),
    totalPipeline:    kpiNoDelta(open.reduce((s, r) => s + r.amount, 0)),
    weightedPipeline: kpiNoDelta(open.reduce((s, r) => s + r.amount * (r.probability / 100), 0)),
    closedWon:        kpi(wonCur, wonPrior ?? undefined),
  }
}
```

Add a `wonRowsFor(rows, wonStage, warnOnNoMatch)` helper that applies Task 2's `isClosed && stage === wonStage` filter and warns, returning the summed amount. Keep the `probability / 100` divide and the delta-suppression exactly as they are for the open tiles.

- [ ] **Step 4: Run the transform test to green.** Mutation check: swap `openRows` and `wonRowsCurrent` in the transform; confirm the test fails (open tiles would read the won amount); revert.

- [ ] **Step 5: Rewrite `getSalesforcePipelineImpl`** to issue the split queries:

```ts
export async function getSalesforcePipelineImpl(slug: string): Promise<PipelineData> {
  const wonRange = 'year_to_date'
  const wonPriorIso = resolveCompareIso(wonRange, 'previous_year')
  const client = await getClientBySlug(slug)
  const wonStage = client?.salesforceConfig?.wonStageName ?? DEFAULT_WON_STAGE

  const [openRows, wonCurRows, wonPriorRows, ownerRows] = await Promise.all([
    salesforceQuery(slug, STAGE_FIELDS, OPEN_WINDOW, { settings: OPEN_SETTINGS, maxRows: STAGE_MAX_ROWS }),
    salesforceQuery(slug, STAGE_FIELDS, wonRange, { settings: WON_SETTINGS, maxRows: STAGE_MAX_ROWS }),
    wonPriorIso
      ? salesforceQuery(slug, STAGE_FIELDS, wonPriorIso, { settings: WON_SETTINGS, maxRows: STAGE_MAX_ROWS }).catch((e) => {
          console.error(`[salesforce] pipeline won-prior fetch failed for ${slug}:`, e)
          return null
        })
      : Promise.resolve(null),
    salesforceQuery(slug, OWNER_FIELDS, OPEN_WINDOW, { settings: OPEN_SETTINGS, maxRows: OWNER_MAX_ROWS }).catch((e) => {
      console.error(`[salesforce] owner fetch failed for ${slug}:`, e)
      return null
    }),
  ])

  const kpis = transformPipeline(openRows, wonCurRows, wonPriorRows, wonStage)
  const owner = ownerRows ? transformByOwner(ownerRows, OWNER_MAX_ROWS) : null
  return {
    ...kpis,
    byOwner: owner ? owner.rows : null,
    ownersTruncated: owner ? owner.truncated : false,
    stageTruncated:
      openRows.length >= STAGE_MAX_ROWS ||
      wonCurRows.length >= STAGE_MAX_ROWS ||
      (wonPriorRows?.length ?? 0) >= STAGE_MAX_ROWS,
  }
}
```

Note: `STAGE_MAX_ROWS` may now be too small for the wide-window open query (the open set can be thousands of rows aggregated by stage, but rows are per stage-probability so still bounded; verify in Step 7). If the live open query returns rows at the cap, raise `STAGE_MAX_ROWS` and record why.

- [ ] **Step 6: Update `pipeline.orchestration.test.ts`**, the mocked `salesforceQuery` is now called four times with distinct args. Assert: the open and owner queries use `OPEN_WINDOW` + `OPEN_SETTINGS`; the won-current and won-prior queries use the YTD/prior ranges + `WON_SETTINGS`. Add a mutation-caught assertion that the open query is NOT called with `year_to_date` (that would reintroduce the bug).

- [ ] **Step 7: Live read-only verification**, write a throwaway probe under the repo root that calls `getSalesforcePipelineImpl('renaissance')` with `CACHE_DISABLE=1`, print the four tiles. Expected: open tiles in the ~$147M / ~3,600-deal range (not $18M), `weightedPipeline` well under `totalPipeline`, `closedWon` around $30M with a real delta. Confirm widening `OPEN_WINDOW` further does not materially change the open total (proves completeness). Delete the probe; confirm `git status` clean.

- [ ] **Step 8: Record the decision**, append to `docs/superpowers/specs/2026-08-13-crm-parity-scorecard.md` under "Decisions taken during the build": the date-basis split (open tiles use created-date wide window because openness is as-of-now; probe figures 296/$18M close-date vs 3,621/$147.5M created; closedWon stays close-date YTD), the single-currency confirmation, and the note that `opportunity_amount_closed_won` exists natively but the stage-literal approach is kept because it honors the per-client `wonStageName` override and excludes $0 renewals (the reason `is_won` was rejected). No em or en dashes.

- [ ] **Step 9: Full suite, then commit**

```bash
git add lib/salesforce/pipeline.ts lib/salesforce/pipeline.test.ts lib/salesforce/pipeline.orchestration.test.ts docs/superpowers/specs/2026-08-13-crm-parity-scorecard.md
git commit -m "fix(salesforce): open tiles report true open pipeline, not the overdue subset

The open tiles were windowed by close date (the default deal_date_field), so
they showed only deals already past their close date: 296 deals / \$18.0M live,
versus 3,621 / \$147.5M on the created-date basis. Openness is as-of-now, so the
open tiles now query the created-date basis over a wide window and we filter
is_closed ourselves; closedWon keeps the close-date year-to-date window. All
three connector settings are pinned explicitly. Org confirmed single-currency."
```

---

## Task 4: Truncation flags measure the wrong cardinality

Paul comments pipeline.ts:149 (○ `ownersTruncated` fires on a non-truncated list) and pipeline.ts:20 (○ cardinality comment off by 2x). `OWNER_FIELDS` includes `opportunity_is_closed` as a dimension, so one owner yields up to two rows; the raw-row count hitting the cap does not mean the distinct-owner list is truncated.

**Files:**
- Modify: `lib/salesforce/pipeline.ts`
- Test: `lib/salesforce/pipeline.test.ts`

- [ ] **Step 1: Write the failing test**, 500 raw owner rows collapsing to 3 distinct open owners must report `truncated: false`:

```ts
it('does not flag owner truncation when the distinct-owner list is well under the cap', () => {
  const rows = Array.from({ length: 500 }, (_, i) => ({
    opportunity_owner: `Owner ${i % 3}`, opportunity_is_closed: i % 2 === 0,
    opportunity_count: 1, opportunity_amount: 100,
  })) as unknown as Record<string, string>[]
  const out = transformByOwner(rows, 500)
  expect(out.rows.length).toBeLessThanOrEqual(3)
  expect(out.truncated).toBe(false)
})
```

- [ ] **Step 2: Run, verify it fails** (current code returns `truncated: rows.length >= maxRows` = true).

- [ ] **Step 3: Fix `transformByOwner`**, measure truncation against the distinct open-owner count it actually renders, not the raw row length. Because open filtering and owner de-duplication both shrink the set, truncation can only be a concern when the raw response itself was capped AND the deduped result is near the cap; the honest signal is whether the raw response length equalled the cap while distinct owners also approached it. Simplest correct form: keep `truncated` meaningful by flagging only when the raw response hit the cap AND could therefore have dropped a distinct owner, i.e. when `rawLength >= maxRows`, but document that the rendered list is deduped. Cleanest: raise `OWNER_MAX_ROWS` above the realistic ceiling (78 rows for ~39 owners x 2) so the cap is never hit in practice, and compute `truncated` from the raw length against that raised cap. Set `OWNER_MAX_ROWS = 500` (already), fix the comment to state the real cardinality (owner x is_closed, ~78 rows), and keep `truncated: rawLength >= maxRows` which is now effectively always false for this client but still correct as a guard.

Apply the same reasoning to `stageTruncated`: its cardinality is stage x is_closed x probability; update that comment too. If either flag can still fire spuriously for a plausible client, gate it on the deduped-count approaching the cap instead. State which you chose in the commit.

- [ ] **Step 4: Fix the cardinality comment** at `OWNER_FIELDS` from "About 39 owners" to "About 39 owners x is_closed, so ~78 rows".

- [ ] **Step 5: Run to green, tsc, commit**

```bash
git add lib/salesforce/pipeline.ts lib/salesforce/pipeline.test.ts
git commit -m "fix(salesforce): truncation flags reflect rendered cardinality, not raw rows

OWNER_FIELDS and STAGE_FIELDS carry is_closed/probability as dimensions, so raw
row count overstates how close the rendered distinct list is to the cap. Fixed
the flags and the cardinality comments so a complete list is not captioned
'may be incomplete'."
```

---

## Task 5: Contacts push duplicate week keys and sort by string year

Paul comments contacts.ts:28 (● duplicate week keys pushed, not merged), contacts.ts:39 (● PLAUSIBLE lexicographic sort assumes ISO year), and contacts.ts:111 (○ `toWeekBuckets` runs twice).

**Files:**
- Modify: `lib/salesforce/contacts.ts`
- Test: `lib/salesforce/contacts.test.ts`

**Interfaces:**
- Consumes: `toNumber` (Task 1), `normalizeWeek`
- Produces: `toWeekBuckets` merges by week key into a `Map` and sorts by numeric `(year, week)`; `getSalesforceWeeklyContactsImpl` calls it once and reuses the result.

- [ ] **Step 1: Write the failing tests** in `contacts.test.ts`:

```ts
it('merges duplicate week keys instead of pushing separate buckets', () => {
  const rows = [
    { yearWeekIso_created: '2026|33', contact_count: 71 },
    { yearWeekIso_created: '2026|33', contact_count: 60 },
    { yearWeekIso_created: '2026|32', contact_count: 100 },
  ] as unknown as Record<string, string>[]
  const w = transformWeeklyContacts(rows, undefined)
  expect(w.currentWeek).toBe(131)   // 71 + 60, not 71
  expect(w.previousWeek).toBe(100)
})

it('sorts by numeric year then week, so a W53 stub does not sort last', () => {
  const rows = [
    { yearWeekIso_created: '2027|53', contact_count: 5 },
    { yearWeekIso_created: '2027|01', contact_count: 80 },
    { yearWeekIso_created: '2027|02', contact_count: 90 },
  ] as unknown as Record<string, string>[]
  const w = transformWeeklyContacts(rows, undefined)
  expect(w.weeks.map(b => b.week)).toEqual(['2027-W01', '2027-W02', '2027-W53'])
})
```

- [ ] **Step 2: Run, verify both fail.**

- [ ] **Step 3: Rewrite `toWeekBuckets`** to merge and numeric-sort:

```ts
function toWeekBuckets(rows: Record<string, string>[]): WeekBucket[] {
  const byWeek = new Map<string, number>()
  for (const r of rows) {
    const week = normalizeWeek(String(r.yearWeekIso_created ?? ''))
    if (!WEEK_KEY_RE.test(week)) {
      console.warn('[salesforce] dropping malformed week key:', r.yearWeekIso_created)
      continue
    }
    byWeek.set(week, (byWeek.get(week) ?? 0) + toNumber(r.contact_count, 'contact_count'))
  }
  return [...byWeek.entries()]
    .map(([week, contacts]) => ({ week, contacts }))
    .sort((a, b) => weekOrdinal(a.week) - weekOrdinal(b.week))
}

/** '2026-W07' -> 202607, so weeks compare numerically by year then week. */
function weekOrdinal(week: string): number {
  const [y, w] = week.split('-W')
  return Number(y) * 100 + Number(w)
}
```

(Keep the existing `WEEK_KEY_RE` and `normalizeWeek`.)

- [ ] **Step 4: Call `toWeekBuckets` once** in `getSalesforceWeeklyContactsImpl`, compute `const buckets = toWeekBuckets(rows)` once, derive `latestWeek` from `buckets.at(-1)?.week`, and pass the already-bucketed data path so it is not rebuilt inside `transformWeeklyContacts`. If `transformWeeklyContacts` must stay pure over raw rows, at minimum stop the second `toWeekBuckets(rows)` at L111 by reusing the transform's output. State which refactor you chose.

- [ ] **Step 5: Run to green, mutation check**, revert the merge (`byWeek.set(week, toNumber(...))` without the `+`), confirm the duplicate-merge test fails; revert the sort to `localeCompare`, confirm the W53 test fails; restore both.

- [ ] **Step 6: Commit**

```bash
git add lib/salesforce/contacts.ts lib/salesforce/contacts.test.ts
git commit -m "fix(salesforce): merge duplicate contact weeks, sort by numeric year-week

toWeekBuckets accumulates into a Map so a duplicated week key no longer displaces
the real prior week out of the .at(-2) slot, and sorts by numeric (year, week) so
a W53 stub in a January window cannot sort last. Bucketing runs once per fetch."
```

---

## Task 6: `currentWeek` is stale and the partial-week delta is unsuppressed

Paul comments contacts.ts:53 (● `currentWeek` is the last present bucket, not the current week) and contacts.ts:60 (● `weekOverWeek`/`priorYearWeek` compare a partial week against a complete one, unsuppressed, rendering e.g. -86%). Same structural-invalidity class as the +29,600% open-deals delta, which was suppressed with a rationale; this one ships and renders.

**Files:**
- Modify: `lib/salesforce/contacts.ts`
- Test: `lib/salesforce/contacts.test.ts`

**Interfaces:**
- Consumes: `toWeekBuckets` (Task 5), an injectable `now` for time-independent tests (mirror the pattern in `stages.ts` on the 207 branch: default `new Date()`, tests pass a fixed date).
- Produces: `transformWeeklyContacts(rows, priorYearWeek, now?)` where the current-week figure is 0 (not the previous bucket) when the current ISO week is absent, and the week-over-week delta is withheld when the current bucket is the partial in-progress week.

- [ ] **Step 1: Write the failing tests** in `contacts.test.ts`, use a fixed `now`:

```ts
const MON = new Date('2026-08-17T12:00:00Z') // a Monday, ISO week 34

it('reports 0 for the current week when that week has no bucket yet, not the previous week', () => {
  const rows = [
    { yearWeekIso_created: '2026|32', contact_count: 90 },
    { yearWeekIso_created: '2026|33', contact_count: 100 },
  ] as unknown as Record<string, string>[]
  const w = transformWeeklyContacts(rows, undefined, MON)
  expect(w.currentWeek).toBe(0)      // week 34 is absent -> 0, not 100
  expect(w.previousWeek).toBe(100)   // the last complete week
})

it('withholds the week-over-week delta when the current bucket is the in-progress week', () => {
  const rows = [
    { yearWeekIso_created: '2026|33', contact_count: 130 },
    { yearWeekIso_created: '2026|34', contact_count: 18 }, // Monday-so-far partial
  ] as unknown as Record<string, string>[]
  const w = transformWeeklyContacts(rows, 125, MON)
  expect(w.weekOverWeek).toBeUndefined()
  expect(w.priorYearWeek).toBeUndefined() // partial vs complete, withheld
})
```

- [ ] **Step 2: Run, verify both fail.**

- [ ] **Step 3: Implement**, compute the expected current ISO week from `now` (reuse the `isoWeekStart`/week-number math; add a `currentIsoWeek(now)` helper returning the `YYYY-Www` key). Then:
  - `currentWeek` = the bucket whose week equals `currentIsoWeek(now)`, else `0`.
  - `previousWeek` = the latest COMPLETE week (the latest bucket whose week is strictly before the current ISO week).
  - `weekOverWeek` and `priorYearWeek` are withheld (`undefined`) when the current bucket is the in-progress week (i.e. `currentWeek` came from the current ISO week rather than a complete one). When the current ISO week is absent (0 contacts so far), compare the two latest complete weeks as before.

Document the withholding with the same reasoning the pipeline open-tile suppression uses (a structurally invalid partial-vs-complete comparison, not a stale one), and reference it.

- [ ] **Step 4: Run to green, mutation check**, revert `currentWeek` to `weeks.at(-1)`, confirm the staleness test fails; remove the partial-week withholding, confirm the delta test fails; restore.

- [ ] **Step 5: Fix the `data_fetched_by` comment and pin the setting**, Paul contacts.ts:67 (○): the "filters on contact created date by report type" comment is wrong (the source has no report-type selection); the real basis is the `data_fetched_by` connector setting (`default fetched_by_created`). Correct the comment, and pin `data_fetched_by: 'fetched_by_created'` in the settings passed by `getSalesforceWeeklyContactsImpl` (add a `CONTACT_SETTINGS` const), so a future default change does not silently switch the window to last-modified.

- [ ] **Step 6: Commit**

```bash
git add lib/salesforce/contacts.ts lib/salesforce/contacts.test.ts
git commit -m "fix(salesforce): current week reads 0 when absent, partial-week delta withheld

currentWeek now comes from the actual current ISO week (0 when that week has no
contacts yet) rather than silently promoting the previous bucket as this week.
weekOverWeek and priorYearWeek are withheld when the current bucket is the
in-progress partial week, the same structural-invalidity rule the open-deals
delta uses. The contacts window basis (data_fetched_by) is now pinned explicitly."
```

---

## Task 7: `resolveCompareIso` has zero CI coverage

Paul comments base.test.ts:3 (● the file never runs, and both orchestration suites `vi.mock` `./base`, so `resolveCompareIso` is exercised by nothing, and that is where the date-windowing bugs live).

**Files:**
- Create: `lib/salesforce/resolve-compare-iso.test.ts`
- Delete: `lib/salesforce/base.test.ts`
- Modify: `vitest.config.ts`

**Interfaces:**
- Consumes: `resolveCompareIso` from `./base`
- Produces: a real vitest spec on the CI path.

- [ ] **Step 1: Write the vitest spec** `lib/salesforce/resolve-compare-iso.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { resolveCompareIso } from './base'

describe('resolveCompareIso', () => {
  it('returns null when no compare range is requested', () => {
    expect(resolveCompareIso('2026-01-01,2026-01-31', null)).toBeNull()
  })

  it('shifts a bare ISO range back one calendar month for previous_period', () => {
    expect(resolveCompareIso('2026-01-01,2026-01-31', 'previous_period')).toBe('2025-12-01,2025-12-31')
  })

  it('shifts back one year for previous_year', () => {
    expect(resolveCompareIso('2026-01-01,2026-08-16', 'previous_year')).toBe('2025-01-01,2025-08-16')
  })

  it('resolves a named range (year_to_date) before shifting', () => {
    const prior = resolveCompareIso('year_to_date', 'previous_year')
    expect(prior).toMatch(/^\d{4}-\d{2}-\d{2},\d{4}-\d{2}-\d{2}$/)
  })
})
```

Verify the exact expected strings against the real `deriveCompareRange` behavior in a scratch run before pinning them; adjust to the true output rather than assuming.

- [ ] **Step 2: Add it to the `include` allowlist** in `vitest.config.ts`; **remove** the reference to `base.test.ts` if present.

- [ ] **Step 3: Delete the dead script**, `git rm lib/salesforce/base.test.ts`.

- [ ] **Step 4: Run, verify it runs and passes**, `npx vitest run lib/salesforce/resolve-compare-iso.test.ts`. Expected: PASS with 4 tests (not "No test files found").

- [ ] **Step 5: Commit**

```bash
git add lib/salesforce/resolve-compare-iso.test.ts vitest.config.ts
git rm lib/salesforce/base.test.ts
git commit -m "test(salesforce): cover resolveCompareIso on the CI path

base.test.ts was a node:assert script not in the vitest allowlist, and both
orchestration suites mock ./base, so the function deciding every comparison
window ran in no CI. Replaced with a real vitest spec in the allowlist."
```

---

## Task 8: Dead fixture field

Paul comments pipeline.orchestration.test.ts:31 (○): every `stageRow` fixture supplies `opportunity_is_won`, which `pipeline.ts` documents as deliberately not requested; the fixture implies a field contract the production query does not have.

**Files:**
- Modify: `lib/salesforce/pipeline.orchestration.test.ts` (and any other salesforce test fixture carrying `opportunity_is_won`)

- [ ] **Step 1: Remove `opportunity_is_won`** from every stage-row fixture in the orchestration test (and `pipeline.test.ts` if present), since production `STAGE_FIELDS` does not request it. Keep `opportunity_is_closed`, which is real.

- [ ] **Step 2: Run the full salesforce suite to green**, `npx vitest run lib/salesforce/`.

- [ ] **Step 3: Commit**

```bash
git add lib/salesforce/pipeline.orchestration.test.ts lib/salesforce/pipeline.test.ts
git commit -m "test(salesforce): drop dead opportunity_is_won from stage fixtures

Production STAGE_FIELDS deliberately omits opportunity_is_won; the fixtures
carried it, implying a field contract the real query does not have."
```

---

## Final verification (after all tasks)

- [ ] `npx tsc --noEmit` clean.
- [ ] `npm run check:rsc` clean.
- [ ] `npm test` green; record the new module test count (Paul measured 60 pre-change; expect higher).
- [ ] No em or en dashes introduced on any added line (`git diff <base>..HEAD | grep` for the glyphs on `+` lines).
- [ ] Scope: `git diff --name-only <base>..HEAD` shows only files under `lib/salesforce/`, `vitest.config.ts`, and `docs/superpowers/specs/`. Nothing under `components/`, `app/`, `lib/ga4/`, `lib/meta/`, `lib/linkedin/`, `lib/hubspot/`, `lib/peec/`.
- [ ] One live read-only re-probe of `getSalesforcePipelineImpl('renaissance')` confirming the open tiles report ~$147M, not $18M, and `closedWon` still carries a sound delta.

## Self-Review

**Spec coverage vs Paul's 19 comments:**

| Paul comment | Task |
|---|---|
| schema.ts:151 (migration ordering, CI/deploy guard) | Not a code fix to `lib/salesforce`; the guard is a CI/deploy concern already documented in `MIGRATIONS-PENDING.md`. Recorded as a follow-up in Task 3's decision note; a CI check that fails when `drizzle/` + `lib/db/schema.ts` change together is worth adding but belongs to the deploy pipeline, out of this data-layer plan. **Flag to the human.** |
| pipeline.ts:164 (date basis) | Task 3 |
| pipeline.ts:90 (currency) | Task 3 (pinned; org confirmed single-currency) |
| base.ts:39 (settings never passed) | Task 3 (pipeline), Task 6 (contacts) |
| num.ts:21 (silent zero) | Task 1 |
| num.ts:18 (unactionable warns) | Task 1 |
| pipeline.ts:73 (open/won partition) | Task 2 |
| pipeline.ts:47 (pct negative prior) | Task 2 |
| pipeline.ts:149 (ownersTruncated) | Task 4 |
| pipeline.ts:20 (cardinality comment) | Task 4 |
| pipeline.ts:32 (amount_closed_won native) | Task 3 Step 8 (comparison recorded) |
| contacts.ts:60 (partial-week delta) | Task 6 |
| contacts.ts:53 (stale currentWeek) | Task 6 |
| contacts.ts:28 (duplicate week keys) | Task 5 |
| contacts.ts:39 (lexicographic sort) | Task 5 |
| contacts.ts:67 (wrong comment, data_fetched_by) | Task 6 Step 5 |
| contacts.ts:111 (toWeekBuckets twice) | Task 5 Step 4 |
| base.test.ts:3 (no coverage) | Task 7 |
| orchestration.test.ts:31 (dead fixture) | Task 8 |

One item (schema.ts:151) is deliberately out of the data-layer scope and flagged for the human to decide (a CI guard vs the existing doc-only mitigation). Every other comment maps to a task.

**Type consistency:** `transformPipeline` changes signature in Task 3 from `(rows, cmpRows, wonStage)` to `(openRows, wonRowsCurrent, wonRowsPrior, wonStage)`; every caller (`getSalesforcePipelineImpl`, the tests) is updated in the same task. `toNumber`/`toBool` gain an optional `field` param in Task 1, backward-compatible. `transformWeeklyContacts` gains an optional `now` in Task 6, backward-compatible. `toWeekBuckets` return type is unchanged.

**Placeholder scan:** no TBDs. The two judgment steps (Task 4 truncation approach, Task 5 Step 4 refactor shape) name the options and require the implementer to state the choice, rather than leaving it unspecified.
