# PR Influence Matchback: All-Time Placements, Cited Within Selected Timeframe (FB-067) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the PR Influence "Which secured PR placements are showing up in AI citations?" card treat the placement list as all-time and dynamically show only placements whose domain is CITED within the selected timeframe (not secured within it), per Tina 2026-07-09.

**Architecture:** Extract the matchback logic (currently inline in the `pr-influence.tsx` RSC as `buildMatchback` plus three inline derivations) into a single pure, dependency-free function `computePlacementMatchback` in `lib/pr-proof/matchback.ts`, so its behavior can be verified by real unit tests against realistic Peec/PR-Proof fixtures. The RSC then calls that helper. Copy and comments are updated to match the new semantics.

**Tech Stack:** Next.js 16 RSC (server component), TypeScript strict, Vitest.

## Global Constraints

- Behavior (Tina 2026-07-09, verbatim intent): placements are an all-time list; the card only shows placements **being cited within the selected timeframe**; the timeframe must **not** filter by secured/publish date. A placement secured in January is valid under a 7-day window if it is cited in that window. The section may be empty at times, which is acceptable.
- "Cited within the selected timeframe" is derived from `urlCitations`, which `pr-influence.tsx` already fetches for the selected range (`getUrlCitations(clientSlug, { startDate: resolvedMain.startDate, endDate: resolvedMain.endDate })`). Matching is **domain-level** (a placement counts as cited if any URL on its domain is cited in the period) — same granularity the card already uses.
- The "N of M placements cited by AI" summary keeps M = all-time total placements (`prData.totalPlacements`) and N = placements cited within the timeframe (and, when a model filter is active, cited by a selected engine).
- Model-filter behavior is unchanged: a placement is kept only if at least one of its citing engines is in the selected set; a period-cited placement with no engine attribution is shown under all-models but dropped under a model filter. The displayed `aiEnginesCiting` is the full set of citing engines, not filtered to the selection (matches current behavior).
- Keep the "Cited by AI" column (Tina specced it; removing a column is out of scope). It will read "Yes" for every shown row.
- Exact subtitle copy (verbatim): `See which of your all-time secured PR placements are being cited in AI-generated answers within the selected timeframe, and how they are shaping brand visibility, sentiment, and reputation across your tracked prompts.`
- Exact empty-state copy (verbatim, both occurrences): `No PR placements cited by AI in the selected timeframe.`
- No em dashes or en dashes anywhere (prose, code comments, commit messages, docs). Use periods, commas, parentheses, or colons.
- Work on branch `qa-checklist` (already cut off `origin/dev`, currently at the dev tip with no diff). Do not merge to any branch without Thomas's explicit go.
- Do not remove `editorialDomains` or `coverage` from the RSC. They are still used by the Top Editorial Domains table and the synopsis context. Only the matchback-specific derivations are removed.

---

## File Structure

- **Create** `lib/pr-proof/matchback.ts` — pure function `computePlacementMatchback(placements, urlCitations, models)` plus `normHost` helper and the `MatchbackRow` / `MatchbackResult` types. Zero DB/network/framework imports so it is unit-testable in isolation. This is the single source of truth for the matchback logic.
- **Create** `lib/pr-proof/matchback.test.ts` — Vitest suite covering the real behaviors (cited-in-period inclusion, secured-date irrelevance, exclusion when not cited, model filtering, empty period, host normalization, domain-level dedupe, N-of-M invariants).
- **Modify** `components/report-sections/peec-ai/pr-influence.tsx` — delete the inline `buildMatchback` function, the `MatchbackRow` type, and the `matchbackRows` / `filteredMatchbackRows` / `placementsCitedByAI` / `matchbackTableRows` derivations; replace with one call to `computePlacementMatchback`; update the render and the synopsis-context field to use its result.
- **Modify** `components/report-sections/peec-ai/pr-influence-tables.tsx` — subtitle, both empty-state strings, and the descriptive comment block for `PRPlacementMatchbackTable`.
- **Modify** `docs/official-feedback/feedback-log.md` — append the FB-067 entry (Task 4).

---

### Task 1: Pure `computePlacementMatchback` helper + comprehensive tests

**Files:**
- Create: `lib/pr-proof/matchback.ts`
- Test: `lib/pr-proof/matchback.test.ts`

**Interfaces:**
- Consumes: `PRPlacement` from `@/lib/pr-proof/types` (`{ client, outlet, headline, publicationDate, link, domain, impact, dateAdded }`, all strings); `UrlCitation` from `@/lib/peec/url-citations` (`{ url, urlKey, domain, classification, title, citationCount, citationRate, citationAvg, engines: string[], mentionedBrandIds, competitorBrandNames, mentionsYourBrand }`); `AEOModel` from `@/lib/peec/models` (a string-union type).
- Produces:
  - `normHost(s: string): string`
  - `interface MatchbackRow { outlet: string; headline: string; link: string; publicationDate: string; citedByAI: boolean; aiEnginesCiting: string[] }`
  - `interface MatchbackResult { rows: MatchbackRow[]; citedCount: number; totalPlacements: number }`
  - `computePlacementMatchback(placements: PRPlacement[], urlCitations: UrlCitation[], models: AEOModel[] | null): MatchbackResult`
  - `rows` contains only placements cited within the period (and, under a model filter, cited by a selected engine). `citedCount === rows.length`. `totalPlacements === placements.length`.

- [ ] **Step 1: Write the failing test file**

Create `lib/pr-proof/matchback.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { computePlacementMatchback, normHost } from './matchback'
import type { PRPlacement } from './types'
import type { UrlCitation } from '@/lib/peec/url-citations'

// ── Fixture factories ────────────────────────────────────────────────────────
function placement(over: Partial<PRPlacement> = {}): PRPlacement {
  return {
    client: 'Avenue Z',
    outlet: "O'Dwyer's PR",
    headline: 'On the Move: McGinnis Joins Board of Penta Group',
    publicationDate: '2026-01-27',
    link: 'https://odwyerpr.com/story/123',
    domain: 'odwyerpr.com',
    impact: '',
    dateAdded: '',
    ...over,
  }
}

function citation(over: Partial<UrlCitation> = {}): UrlCitation {
  return {
    url: 'https://odwyerpr.com/story/123',
    urlKey: 'odwyerpr.com/story/123',
    domain: 'odwyerpr.com',
    classification: 'editorial',
    title: null,
    citationCount: 3,
    citationRate: 1,
    citationAvg: 1,
    engines: ['ChatGPT'],
    mentionedBrandIds: [],
    competitorBrandNames: [],
    mentionsYourBrand: false,
    ...over,
  }
}

describe('normHost', () => {
  it('lowercases, trims, and strips a leading www.', () => {
    expect(normHost('  WWW.OdwyerPR.com ')).toBe('odwyerpr.com')
  })
  it('is idempotent on already-normalized hosts', () => {
    expect(normHost('odwyerpr.com')).toBe('odwyerpr.com')
  })
})

describe('computePlacementMatchback', () => {
  it('includes a placement whose domain is cited in the period, with its engines', () => {
    const res = computePlacementMatchback(
      [placement()],
      [citation({ engines: ['ChatGPT', 'Google'] })],
      null,
    )
    expect(res.rows).toHaveLength(1)
    expect(res.rows[0].citedByAI).toBe(true)
    expect(res.rows[0].outlet).toBe("O'Dwyer's PR")
    expect(res.rows[0].aiEnginesCiting.sort()).toEqual(['ChatGPT', 'Google'])
    expect(res.citedCount).toBe(1)
    expect(res.totalPlacements).toBe(1)
  })

  it('excludes a placement whose domain has no citation in the period', () => {
    const res = computePlacementMatchback(
      [placement({ domain: 'techround.co.uk' })],
      [citation({ domain: 'odwyerpr.com' })],
      null,
    )
    expect(res.rows).toHaveLength(0)
    expect(res.citedCount).toBe(0)
    // M is still the all-time count even when nothing is cited.
    expect(res.totalPlacements).toBe(1)
  })

  it('THE TINA CASE: a January-secured placement cited in the current window is shown (secured date is irrelevant)', () => {
    const res = computePlacementMatchback(
      [placement({ publicationDate: '2026-01-27', domain: 'odwyerpr.com' })],
      [citation({ domain: 'odwyerpr.com' })], // urlCitations is already the selected window
      null,
    )
    expect(res.rows).toHaveLength(1)
    expect(res.rows[0].publicationDate).toBe('2026-01-27')
  })

  it('shows a period-cited placement with no engine data under all-models, with empty engines', () => {
    const res = computePlacementMatchback(
      [placement()],
      [citation({ engines: [] })],
      null,
    )
    expect(res.rows).toHaveLength(1)
    expect(res.rows[0].aiEnginesCiting).toEqual([])
    expect(res.rows[0].citedByAI).toBe(true)
  })

  it('drops a period-cited placement with no engine data when a model filter is active', () => {
    const res = computePlacementMatchback(
      [placement()],
      [citation({ engines: [] })],
      ['ChatGPT'],
    )
    expect(res.rows).toHaveLength(0)
    expect(res.citedCount).toBe(0)
    expect(res.totalPlacements).toBe(1)
  })

  it('under a model filter, keeps only placements cited by a selected engine', () => {
    const res = computePlacementMatchback(
      [
        placement({ domain: 'odwyerpr.com', outlet: 'ODwyer' }),
        placement({ domain: 'prweek.com', outlet: 'PRWeek' }),
      ],
      [
        citation({ domain: 'odwyerpr.com', engines: ['ChatGPT'] }),
        citation({ domain: 'prweek.com', engines: ['Google'] }),
      ],
      ['ChatGPT'],
    )
    expect(res.rows.map((r) => r.outlet)).toEqual(['ODwyer'])
  })

  it('under a multi-model filter, keeps placements cited by any selected engine (union)', () => {
    const res = computePlacementMatchback(
      [
        placement({ domain: 'odwyerpr.com', outlet: 'ODwyer' }),
        placement({ domain: 'prweek.com', outlet: 'PRWeek' }),
      ],
      [
        citation({ domain: 'odwyerpr.com', engines: ['ChatGPT'] }),
        citation({ domain: 'prweek.com', engines: ['Google'] }),
      ],
      ['ChatGPT', 'Google'],
    )
    expect(res.rows.map((r) => r.outlet).sort()).toEqual(['ODwyer', 'PRWeek'])
  })

  it('displays the FULL engine set for a kept row, not only the selected engine', () => {
    const res = computePlacementMatchback(
      [placement()],
      [citation({ engines: ['Google', 'ChatGPT', 'Perplexity'] })],
      ['ChatGPT'],
    )
    expect(res.rows).toHaveLength(1)
    expect(res.rows[0].aiEnginesCiting.sort()).toEqual(['ChatGPT', 'Google', 'Perplexity'])
  })

  it('returns an empty table but the correct all-time denominator when nothing is cited in the period', () => {
    const res = computePlacementMatchback(
      [placement(), placement({ domain: 'prweek.com' }), placement({ domain: 'techround.co.uk' })],
      [], // no citations in this period
      null,
    )
    expect(res.rows).toHaveLength(0)
    expect(res.citedCount).toBe(0)
    expect(res.totalPlacements).toBe(3)
  })

  it('matches domains case-insensitively and ignoring a leading www. on either side', () => {
    const res = computePlacementMatchback(
      [placement({ domain: 'WWW.ODWYERPR.COM' })],
      [citation({ domain: 'odwyerpr.com' })],
      null,
    )
    expect(res.rows).toHaveLength(1)
  })

  it('counts a placement once and unions engines when the domain has multiple cited URLs', () => {
    const res = computePlacementMatchback(
      [placement({ domain: 'odwyerpr.com' })],
      [
        citation({ urlKey: 'odwyerpr.com/a', url: 'https://odwyerpr.com/a', engines: ['ChatGPT'] }),
        citation({ urlKey: 'odwyerpr.com/b', url: 'https://odwyerpr.com/b', engines: ['Google'] }),
      ],
      null,
    )
    expect(res.rows).toHaveLength(1)
    expect(res.rows[0].aiEnginesCiting.sort()).toEqual(['ChatGPT', 'Google'])
  })

  it('includes both placements when two placements share a cited domain (domain-level)', () => {
    const res = computePlacementMatchback(
      [
        placement({ domain: 'odwyerpr.com', link: 'https://odwyerpr.com/a', outlet: 'A' }),
        placement({ domain: 'odwyerpr.com', link: 'https://odwyerpr.com/b', outlet: 'B' }),
      ],
      [citation({ domain: 'odwyerpr.com', engines: ['ChatGPT'] })],
      null,
    )
    expect(res.rows.map((r) => r.outlet).sort()).toEqual(['A', 'B'])
  })

  it('does not invent rows for cited domains that match no placement', () => {
    const res = computePlacementMatchback(
      [placement({ domain: 'odwyerpr.com' })],
      [
        citation({ domain: 'odwyerpr.com', engines: ['ChatGPT'] }),
        citation({ domain: 'forbes.com', engines: ['Google'] }),
      ],
      null,
    )
    expect(res.rows).toHaveLength(1)
    expect(res.rows[0].outlet).toBe("O'Dwyer's PR")
  })

  it('passes through outlet, headline, link, and publicationDate to the row', () => {
    const res = computePlacementMatchback(
      [placement({ outlet: 'PRWeek', headline: 'Big News', link: 'https://prweek.com/x', publicationDate: '2025-06-25', domain: 'prweek.com' })],
      [citation({ domain: 'prweek.com' })],
      null,
    )
    expect(res.rows[0]).toMatchObject({
      outlet: 'PRWeek',
      headline: 'Big News',
      link: 'https://prweek.com/x',
      publicationDate: '2025-06-25',
    })
  })

  it('citedCount always equals rows.length (invariant)', () => {
    const res = computePlacementMatchback(
      [placement({ domain: 'odwyerpr.com' }), placement({ domain: 'prweek.com' }), placement({ domain: 'nomatch.com' })],
      [citation({ domain: 'odwyerpr.com' }), citation({ domain: 'prweek.com' })],
      null,
    )
    expect(res.citedCount).toBe(res.rows.length)
    expect(res.citedCount).toBe(2)
    expect(res.totalPlacements).toBe(3)
  })

  it('handles an empty placement list', () => {
    const res = computePlacementMatchback([], [citation()], null)
    expect(res.rows).toHaveLength(0)
    expect(res.totalPlacements).toBe(0)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail (module not found)**

Run: `npx vitest run lib/pr-proof/matchback.test.ts`
Expected: FAIL with a module-resolution error (`Cannot find module './matchback'`) because the implementation does not exist yet.

- [ ] **Step 3: Write the implementation**

Create `lib/pr-proof/matchback.ts`:

```ts
// lib/pr-proof/matchback.ts
// FB-067: pure PR placement matchback. Extracted from the inline logic in
// pr-influence.tsx so it can be unit tested against realistic fixtures.
//
// Tina 2026-07-09: the placement list is ALL TIME. The card dynamically shows
// only placements whose domain is CITED within the selected timeframe, NOT
// placements secured within the timeframe. "Cited within the timeframe" is read
// from urlCitations, which the caller fetches for the selected date range.
// Matching is domain-level (a placement is cited if any URL on its domain is
// cited in the period), consistent with how the card already reports engines.

import type { PRPlacement } from './types'
import type { UrlCitation } from '@/lib/peec/url-citations'
import type { AEOModel } from '@/lib/peec/models'

/** One matchback row for the "which placements are cited" table. */
export interface MatchbackRow {
  outlet: string
  headline: string
  link: string
  publicationDate: string
  citedByAI: boolean
  aiEnginesCiting: string[]
}

export interface MatchbackResult {
  /** Placements cited within the period (and, under a model filter, cited by a
   *  selected engine). This is exactly what the table renders. */
  rows: MatchbackRow[]
  /** rows.length. The N in "N of M placements cited by AI". */
  citedCount: number
  /** placements.length. The all-time M in "N of M placements cited by AI". */
  totalPlacements: number
}

/** Normalize a host for matching: trim, lowercase, strip a leading "www.".
 *  Mirrors hostOf()/lookupHost() in lib/peec/url-citations.ts and is idempotent. */
export function normHost(s: string): string {
  return s.trim().toLowerCase().replace(/^www\./, '')
}

/**
 * Build the placement matchback for a period.
 *
 * @param placements   All-time PR-secured placements (from the PR Proof Library).
 * @param urlCitations Per-URL citations for the SELECTED date range only.
 * @param models       Active AI-model filter, or null for all models.
 */
export function computePlacementMatchback(
  placements: PRPlacement[],
  urlCitations: UrlCitation[],
  models: AEOModel[] | null,
): MatchbackResult {
  // Hosts cited anywhere in the period (engine data optional), plus the union of
  // engines per host. Building citedHosts from ALL citations (not only ones with
  // engines) means a period-cited placement with no engine attribution still
  // counts as cited; it just renders with no engine chips.
  const citedHostsInPeriod = new Set<string>()
  const enginesByHost = new Map<string, Set<string>>()
  for (const c of urlCitations) {
    const h = normHost(c.domain)
    if (!h) continue
    citedHostsInPeriod.add(h)
    if (c.engines.length === 0) continue
    if (!enginesByHost.has(h)) enginesByHost.set(h, new Set())
    const set = enginesByHost.get(h)!
    for (const e of c.engines) set.add(e)
  }

  const modelSet = models && models.length > 0 ? new Set<string>(models) : null

  const rows: MatchbackRow[] = []
  for (const p of placements) {
    const h = normHost(p.domain)
    if (!citedHostsInPeriod.has(h)) continue // not cited in the selected timeframe
    const aiEnginesCiting = [...(enginesByHost.get(h) ?? [])]
    if (modelSet) {
      // A model filter needs engine attribution to decide inclusion.
      if (aiEnginesCiting.length === 0) continue
      if (!aiEnginesCiting.some((e) => modelSet.has(e))) continue
    }
    rows.push({
      outlet: p.outlet ?? p.domain,
      headline: p.headline ?? p.domain,
      link: p.link ?? '',
      publicationDate: p.publicationDate ?? '',
      citedByAI: true,
      aiEnginesCiting,
    })
  }

  return { rows, citedCount: rows.length, totalPlacements: placements.length }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/pr-proof/matchback.test.ts`
Expected: PASS, all tests green (18 tests).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/pr-proof/matchback.ts lib/pr-proof/matchback.test.ts
git commit -m "FB-067: pure computePlacementMatchback helper + tests (all-time placements, cited within selected timeframe)"
```

---

### Task 2: Wire the helper into the PR Influence RSC

**Files:**
- Modify: `components/report-sections/peec-ai/pr-influence.tsx`

**Interfaces:**
- Consumes: `computePlacementMatchback` from `@/lib/pr-proof/matchback` (Task 1). `prData?.placements` is `PRPlacement[]`; `urlCitations` is `UrlCitation[]` already scoped to the selected range; `models` is `AEOModel[] | null`.
- Produces: nothing new for later tasks. The `PRPlacementMatchbackTable` render now receives `rows={matchback.rows}`, `totalPlacements={prData?.totalPlacements ?? 0}`, `placementsCitedByAI={matchback.citedCount}`.

- [ ] **Step 1: Add the import**

In the import block near the other `pr-influence-tables` / helper imports (around line 17-27), add:

```ts
import { computePlacementMatchback } from '@/lib/pr-proof/matchback'
```

- [ ] **Step 2: Delete the inline `MatchbackRow` type and `buildMatchback` function**

Remove the entire block from `type MatchbackRow = PRPlacement & {` through the end of `function buildMatchback(...) { ... }` (currently lines 46-100). Also delete the now-unused `PRPlacementMatchbackRow` import if it is no longer referenced after Step 4 (it is referenced only by the removed `matchbackTableRows` typing) and the unused `PRPlacement` type import (`import type { PRPlacement } from '@/lib/pr-proof/types'`, line 6) if `tsc` reports it unused after this task.

- [ ] **Step 3: Replace the four inline derivations with one helper call**

Delete these existing derivations:
- `const matchbackRows = prData && data ? buildMatchback(prData.placements, editorialDomains, coverage, urlCitations) : []`
- the `const filteredMatchbackRows = models ? ... : matchbackRows` block
- `const placementsCitedByAI = filteredMatchbackRows.filter(r => r.citedByAI).length`
- the `const matchbackTableRows: PRPlacementMatchbackRow[] = filteredMatchbackRows.map(...)` block and its comment

Add, at the point where `matchbackRows` used to be defined (right after `coverageAvailable` is computed, so it is in scope for both the synopsis context and the render):

```ts
// ── FB-067 · PR Placement Matchback (all-time placements, cited within the
// selected timeframe) ────────────────────────────────────────────────────────
// Tina 2026-07-09: the placement list is all-time; the card dynamically shows
// only placements whose domain is CITED within the selected timeframe (from
// period-scoped urlCitations), not those secured within the timeframe. Pure,
// unit-tested logic lives in lib/pr-proof/matchback.ts.
const matchback = computePlacementMatchback(prData?.placements ?? [], urlCitations, models)
```

- [ ] **Step 4: Point the synopsis context at the new count**

In `synopsisContext`, change the `placementsCitedByAI,` shorthand field to:

```ts
    placementsCitedByAI: matchback.citedCount,
```

(The synopsis card itself stays gated off by `SHOW_AI_NARRATIVE`; this keeps the context internally consistent regardless.)

- [ ] **Step 5: Update the render**

Replace the existing `<PRPlacementMatchbackTable ... />` usage with:

```tsx
      {/* ── FB-067 · PR Placement Matchback (all-time placements, cited within the selected timeframe) ── */}
      <PRPlacementMatchbackTable
        rows={matchback.rows}
        totalPlacements={prData?.totalPlacements ?? 0}
        placementsCitedByAI={matchback.citedCount}
      />
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. If `tsc` flags `PRPlacement` or `PRPlacementMatchbackRow` as unused imports, remove those imports.

- [ ] **Step 7: Run the RSC boundary check and the full test suite**

Run: `npm run check:rsc && npx vitest run`
Expected: rsc-boundary passes; all tests pass (including Task 1's `matchback.test.ts`).

- [ ] **Step 8: Commit**

```bash
git add components/report-sections/peec-ai/pr-influence.tsx
git commit -m "FB-067: wire computePlacementMatchback into PR Influence RSC (cited-in-timeframe filter)"
```

---

### Task 3: Update copy and comments

**Files:**
- Modify: `components/report-sections/peec-ai/pr-influence-tables.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: the `PRPlacementMatchbackTable` subtitle, empty-state text, and comment now describe the all-time / cited-within-timeframe behavior.

- [ ] **Step 1: Rewrite the subtitle**

In `PRPlacementMatchbackTable`'s `SectionHeading`, replace the `subtitle` value with (verbatim):

```tsx
        subtitle="See which of your all-time secured PR placements are being cited in AI-generated answers within the selected timeframe, and how they are shaping brand visibility, sentiment, and reputation across your tracked prompts."
```

- [ ] **Step 2: Rewrite both empty-state strings**

There are two occurrences of `No PR placements in the selected timeframe.` in `PRPlacementMatchbackTable` (the `emptyMessage` prop on `SortableTable`, and the fallback `<p>` in the empty `<div>`). Change both to (verbatim):

```
No PR placements cited by AI in the selected timeframe.
```

- [ ] **Step 3: Update the descriptive comment block**

Replace the block comment above `PRPlacementMatchbackRow` / `PRPlacementMatchbackTable` (the one starting `// ─── 5. PR Placement Matchback (FB-029 ...`) so it states the current behavior. Use:

```tsx
// ─── 5. PR Placement Matchback (FB-029 restored, FB-067 cited-in-timeframe) ──
// Tina's PRD ask: "Did placements achieved by the PR team get cited in AI? The
// dashboard must compare a maintained list of PR-secured placements against the
// list of editorial URLs cited in tracked AI answers." Tina 2026-07-09 refined
// it: the placement list is ALL TIME, and the card dynamically shows only
// placements whose domain is CITED within the selected timeframe (not secured
// within it). The cited-in-timeframe logic is computePlacementMatchback in
// lib/pr-proof/matchback.ts (pure, unit-tested); this component only renders the
// rows it returns. Columns: Publication + Article (which placement), Publish
// Date (when secured), Cited by AI + AI Engines (how it is showing up in AI).
```

- [ ] **Step 4: Typecheck and run tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no type errors; all tests pass. (This task is copy/comment only, so no test behavior changes; the run confirms nothing regressed.)

- [ ] **Step 5: Commit**

```bash
git add components/report-sections/peec-ai/pr-influence-tables.tsx
git commit -m "FB-067: matchback copy (all-time placements, cited within selected timeframe) + empty state"
```

---

### Task 4: Verify end to end, document, push, open PR

**Files:**
- Modify: `docs/official-feedback/feedback-log.md`

**Interfaces:**
- Consumes: the merged behavior from Tasks 1 through 3.
- Produces: a pushed `qa-checklist` branch and an open PR to `dev`.

- [ ] **Step 1: Full gates**

Run: `npx tsc --noEmit && npm run check:rsc && npx vitest run`
Expected: all green.

- [ ] **Step 2: Push and deploy a preview**

```bash
git push origin qa-checklist
```
Wait for the Vercel preview for the new `qa-checklist` HEAD to reach Ready (or use the git-branch preview alias), then run the live checks in Step 3 against that exact preview.

- [ ] **Step 3: Live QA on the preview (record results)**

On the PR Influence tab for `avenue-z`, confirm each of the following and note the observed values:
1. **Last 30 Days, all models:** the card lists only placements whose domain is cited in the last 30 days. Every visible row shows "Yes". "N of M" reads N = rows shown, M = all-time total.
2. **Last 7 Days, all models:** the row set narrows to placements cited in the last 7 days. A placement with a January publish date still appears if its domain is cited in the last 7 days (secured date is irrelevant). If none are cited, the card shows "No PR placements cited by AI in the selected timeframe." and "0 of M".
3. **Year to Date, all models:** the row set is the widest (most placements cited across the year).
4. **Last 30 Days, ChatGPT only:** only placements cited by ChatGPT in the period remain; the "N of M" numerator drops accordingly; the AI Engines column still shows each row's full engine set.
5. **Subtitle** reads exactly: "See which of your all-time secured PR placements are being cited in AI-generated answers within the selected timeframe, and how they are shaping brand visibility, sentiment, and reputation across your tracked prompts."
6. No app console errors (browser-extension noise is fine).

- [ ] **Step 4: Append the feedback-log entry**

Add an FB-067 row to `docs/official-feedback/feedback-log.md` in the same format as the existing entries, summarizing: Tab = PR Influence; ask = matchback should treat placements as all-time and show only those cited within the selected timeframe (Tina 2026-07-09, not secured within the timeframe); shipped = period-scoped `computePlacementMatchback` (pure, 18 unit tests) filtering the table to cited-in-period placements, subtitle and empty-state copy updated.

- [ ] **Step 5: Commit docs and push**

```bash
git add docs/official-feedback/feedback-log.md
git commit -m "docs(FB-067): feedback-log entry for PR Influence matchback cited-in-timeframe"
git push origin qa-checklist
```

- [ ] **Step 6: Open the PR to dev**

```bash
gh pr create --base dev --head qa-checklist \
  --title "QA checklist: PR Influence matchback cited-in-timeframe (FB-067) -> dev" \
  --body "<summary of Tina's ask, the period-scoped fix, the 18 unit tests, and the live QA results from Step 3>"
```
Do not merge. Await Thomas's review and go-ahead.

---

## Self-Review

**1. Spec coverage:**
- "Copy should say all time" -> Task 3 Step 1 (subtitle).
- "Only showing placements cited within the timeframe selected" -> Task 1 (period-scoped `citedByAI` from `urlCitations` + cited-only rows) + Task 2 (RSC uses it).
- "Not secured within the timeframe" -> Task 1 filters on citation host membership, never on `publicationDate`; the Tina-case test asserts a January placement appears when cited in-window.
- "Section may be empty at times" -> Task 3 Step 2 empty-state copy + Task 1 empty-result tests.
- "N of M denominator = all-time" -> `totalPlacements = placements.length` (Task 1) and `prData?.totalPlacements` passed to the table (Task 2 Step 5); invariant test present.
- Model-filter behavior preserved -> Task 1 model tests (single, multi, no-engine drop, full-engine display).
- Keep "Cited by AI" column -> not modified in any task.

**2. Placeholder scan:** No TBD/TODO. Every code step shows complete code. The PR body in Task 4 Step 6 is intentionally a fill-from-results instruction, not code.

**3. Type consistency:** `computePlacementMatchback(placements, urlCitations, models)` and `MatchbackRow` / `MatchbackResult` are used identically in Tasks 1 and 2. `MatchbackRow` fields (`outlet, headline, link, publicationDate, citedByAI, aiEnginesCiting`) are structurally identical to `PRPlacementMatchbackRow` in `pr-influence-tables.tsx`, so `matchback.rows` is assignable to the `rows` prop without a cast. `normHost` matches the existing `hostOf`/`lookupHost` normalization (lowercase, trim, strip leading `www.`).

**Note on the "Cited by AI" column:** it now reads "Yes" for every visible row (the table only shows cited placements). This is intentional per the Global Constraints. If Thomas later wants it removed, that is a one-line column deletion in `pr-influence-tables.tsx` and is out of scope here.
