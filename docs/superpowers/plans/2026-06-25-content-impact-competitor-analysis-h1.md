# FB-040: Content Impact §H.1 Competitor Analysis — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild §H.1 (Top Competitor Domains table) on the Content Impact tab to Tina's spec: rename the SectionCard wrapper to "Competitor Analysis" with a new subtitle, rename the sub-header above the table, drop the "Theme Coverage" column, and replace the three metric columns with **AI Visibility / Citation Share / Prompt Coverage** — each rendered with a percentage-point delta vs. the compare period when one is selected.

**Architecture:** Zero new data fetches. All three metric values and two of three deltas already exist on the in-scope `TopDomain` and `coverage` / `coveragePrior` objects fetched at the top of [content-impact.tsx](components/report-sections/peec-ai/content-impact.tsx). The third delta (Prompt Coverage delta) is computed inline by mirroring the existing `getPromptCoverage` helper against the already-fetched `coveragePrior`. §H.2 (`CompetitorUrlsBrandAbsentTable`) is untouched.

**Tech Stack:** Next.js 15 App Router (RSC), TypeScript strict, Tailwind v4, `SortableTable` (existing internal component), `renderDelta` (existing module-scope helper at [content-impact-tables.tsx:97](components/report-sections/peec-ai/content-impact-tables.tsx:97)).

## Global Constraints

- **Literal interpretation only.** If Tina's feedback below does not name a behavior, change, or rename, do not make it.
- **Compare-period gating.** Deltas appear ONLY when `compareIso !== null`. When `compareIso === null`, the delta value passed to `renderDelta` is `null` and the helper renders nothing (no badge, no `0.0pp`).
- **No em-dashes** in any new code, comment, copy, or commit message. Use commas, periods, or hyphens.
- **Truth-grounded.** When `coverageAvailable === false` or `totalTrackedPrompts === 0`, Prompt Coverage value renders `--` (NOT `0%`). Same rule applies to the prior-period equivalent: if prior coverage is unavailable, the delta is `null`.
- **No new fetches.** Reuse `peecData?.topDomains` (current + prior baked in by `buildTopDomains`), `coverage`, `coveragePrior`. Do not add a new `getDomainCoverage` call. Do not add a new Peec endpoint call.
- **No demo fallbacks for the new columns.** The previous H.1 had `demoPromptCov` / `demoThemeCov` arrays gated on `calendarIsDemo`. Tina is rebuilding around the real data; demo fills are dropped. In demo mode (`calendarIsDemo === true`), the table will show whatever the demo `peecData` provides; real Peec demo data already populates `topDomains`. Prompt Coverage will render `--` in demo if `coverage` is empty, which mirrors the truth-grounded rule above.
- **Tina's exact copy** (verbatim, no rewording):
  - SectionCard title: `Competitor Analysis`
  - SectionCard subtitle: `See which competitor domains are gaining or losing ground across AI Visibility, Citation Share, and Prompt Coverage for your target prompts.`
  - Sub-header above the H.1 table: `Which competitor domains are winning for our target prompts?`
  - Column headers (left to right): `Domain`, `AI Visibility`, `Citation Share`, `Prompt Coverage`
- **§H.2 untouched.** `CompetitorUrlsBrandAbsentTable` and its IIFE at [content-impact.tsx:1386-1485](components/report-sections/peec-ai/content-impact.tsx:1386) are NOT modified. The sub-header `Where are competitors cited and we're absent?` and all H.2 columns stay exactly as they are.
- **Delete dead code.** `getThemeCoverage` (helper at [content-impact.tsx:528-529](components/report-sections/peec-ai/content-impact.tsx:528)) and `TT.themeCoverage` (at [content-impact-tables.tsx:26](components/report-sections/peec-ai/content-impact-tables.tsx:26)) are used only by the old §H.1 column. Verify no other consumer via grep, then delete completely. No back-compat shims, no `// removed for FB-040` comments.

## File Structure

Two files change. No new files.

- **`components/report-sections/peec-ai/content-impact-tables.tsx`** (~564 lines)
  - Redefine `CompetitorDomainsCitedRow` interface: replace `citationCount` / `promptCoverage` / `themeCoverage` with `aiVisibility` + `aiVisibilityDelta` + `citationShare` + `citationShareDelta` + `promptCoverage` + `promptCoverageDelta`. All deltas typed `number | null` to allow no-compare-period state.
  - Rewrite `CompetitorDomainsCitedTable` columns array: 4 columns (Domain + 3 metric cols), each metric col renders value with `renderDelta(delta, 'pp')` appended.
  - Rewrite the sub-header `<h4>` text to Tina's exact copy.
  - Delete `TT.themeCoverage` entry from the shared TT constant.
- **`components/report-sections/peec-ai/content-impact.tsx`** (~1491 lines)
  - Rewrite the §H.1 IIFE at lines 1354-1381 to build rows in the new shape, sourcing AI Visibility from `d.retrieved` / `d.retrievedDelta`, Citation Share from `d.citationRate` / `d.citationRateDelta`, Prompt Coverage current from existing `getPromptCoverage(d.domain)`, Prompt Coverage prior from a new `getPromptCoveragePrior(d.domain)` helper (defined inline in the same scope as `getPromptCoverage`). Delta = current minus prior when both available AND `compareIso !== null`; otherwise `null`.
  - Add `getPromptCoveragePrior` helper next to `getPromptCoverage` at lines 524-527, mirroring its shape against `coveragePrior` + a `coveragePriorAvailable` flag.
  - Swap SectionCard `title` and `description` props at lines 1351-1352 to Tina's exact copy.
  - Delete `getThemeCoverage` helper at lines 528-529 (after grep confirms no other consumer).
  - Delete `domainTagIds` import from the `getUrlCitations` import line at line 11 if grep confirms it is no longer used after `getThemeCoverage` is removed.

---

### Task 1: Redefine `CompetitorDomainsCitedRow` and rebuild `CompetitorDomainsCitedTable`

**Files:**
- Modify: `components/report-sections/peec-ai/content-impact-tables.tsx`

**Interfaces:**
- Consumes: existing `SortableTable`, `SortableColumn`, `renderDelta(delta, 'pp')`, `TT.aiCitations`, `TT.promptCoverage`. New tooltip needed for AI Visibility — add `TT.aiVisibility` sourced from `PEEC.retrieved.text` (`"Percentage of chats where at least one URL from this domain appeared as a source."`).
- Produces: updated `CompetitorDomainsCitedRow` interface and `CompetitorDomainsCitedTable` component, consumed by `content-impact.tsx` in Task 2.

- [ ] **Step 1: Grep to confirm `TT.themeCoverage` is only referenced by the old H.1 table**

Run:
```
grep -rn "themeCoverage\|TT\.themeCoverage" components/report-sections/peec-ai/
```
Expected output: matches only inside `content-impact-tables.tsx` (the TT entry at line 26 and the column block inside `CompetitorDomainsCitedTable`) and the IIFE in `content-impact.tsx` at lines 1361-1373 (the `getThemeCoverage` / `themeCovReal` / `demoThemeCov` references that Task 2 will delete). No other file should match. If a match appears outside these two files, stop and ask the human.

- [ ] **Step 2: Delete `TT.themeCoverage` entry**

In `components/report-sections/peec-ai/content-impact-tables.tsx`, locate lines 8-28:

```ts
// ─── Shared tooltip constants ─────────────────────────────────────────────────
const TT = {
  sessions:           GA4.session.text,
  users:              'An active user has had a session that meets any of the engaged-session criteria. (GA4.)',
  views:              'A user-initiated event when content loads or refreshes on a website. (GA4.)',
  engagementRate:     GA4.engagementRate.text,
  aiReferredSessions: 'GA4 sessions whose source matches the AI referrer domain list (chat.openai.com, perplexity.ai, gemini.google.com, etc.). (GA4 filtered by Avenue Z internal referrer list.)',
  aiCitations:        PEEC.citations.text,
  position:           PEEC.position.text,
  promptCoverage:     'Percentage of tracked prompts where this domain appears. (Avenue Z internal.)',
  aiEngines:          'List of AI engines where this URL or domain was cited. (Peec AI source data.)',
  aiBotActivity:      'Server log entries identifying named AI crawler bots (GPTBot, PerplexityBot, ClaudeBot, etc.) visiting this URL. (Avenue Z internal — server log analysis.)',
  matchStatus:        'Whether the published URL was found in GA4 (matched), missing (unmatched), is a redirect, or is unpublished. (Avenue Z internal.)',
  contentAction:      'Was this content created new, optimized from existing, or some other action? (Avenue Z internal — content calendar.)',
  recommendedAction:  "Suggested next action based on the row's data. (Avenue Z internal — heuristic.)",
  postLaunchAILift:   'Change in AI citations after content publication. (Avenue Z internal — Peec data.)',
  opportunityPriority:'Composite priority ranking based on competitor mentions and prompt coverage. (Avenue Z internal.)',
  suggestedPRAngle:   'Suggested PR positioning for the brand. (Avenue Z internal.)',
  themeCoverage:      'Themes the domain consistently covers. (Avenue Z internal — manual review.)',
  calendarField:      'From the content calendar sheet. (Avenue Z internal.)',
}
```

Note: the em-dash inside `aiBotActivity` and `recommendedAction` is pre-existing copy not introduced by this task, leave untouched. Two changes:
1. Delete the `themeCoverage` line entirely.
2. Add a new entry `aiVisibility:       PEEC.retrieved.text,` right above `aiCitations:`. PEEC is already imported at line 6.

Final state of the TT block:

```ts
// ─── Shared tooltip constants ─────────────────────────────────────────────────
const TT = {
  sessions:           GA4.session.text,
  users:              'An active user has had a session that meets any of the engaged-session criteria. (GA4.)',
  views:              'A user-initiated event when content loads or refreshes on a website. (GA4.)',
  engagementRate:     GA4.engagementRate.text,
  aiReferredSessions: 'GA4 sessions whose source matches the AI referrer domain list (chat.openai.com, perplexity.ai, gemini.google.com, etc.). (GA4 filtered by Avenue Z internal referrer list.)',
  aiVisibility:       PEEC.retrieved.text,
  aiCitations:        PEEC.citations.text,
  position:           PEEC.position.text,
  promptCoverage:     'Percentage of tracked prompts where this domain appears. (Avenue Z internal.)',
  aiEngines:          'List of AI engines where this URL or domain was cited. (Peec AI source data.)',
  aiBotActivity:      'Server log entries identifying named AI crawler bots (GPTBot, PerplexityBot, ClaudeBot, etc.) visiting this URL. (Avenue Z internal — server log analysis.)',
  matchStatus:        'Whether the published URL was found in GA4 (matched), missing (unmatched), is a redirect, or is unpublished. (Avenue Z internal.)',
  contentAction:      'Was this content created new, optimized from existing, or some other action? (Avenue Z internal — content calendar.)',
  recommendedAction:  "Suggested next action based on the row's data. (Avenue Z internal — heuristic.)",
  postLaunchAILift:   'Change in AI citations after content publication. (Avenue Z internal — Peec data.)',
  opportunityPriority:'Composite priority ranking based on competitor mentions and prompt coverage. (Avenue Z internal.)',
  suggestedPRAngle:   'Suggested PR positioning for the brand. (Avenue Z internal.)',
  calendarField:      'From the content calendar sheet. (Avenue Z internal.)',
}
```

- [ ] **Step 3: Redefine the `CompetitorDomainsCitedRow` interface and rebuild `CompetitorDomainsCitedTable`**

In `components/report-sections/peec-ai/content-impact-tables.tsx`, locate the §H.1 block at lines 386-462:

```ts
// ═════════════════════════════════════════════════════════════════════════════
// 6. Top Competitor / Corporate Domains Cited in AI (Section H.1)
// ═════════════════════════════════════════════════════════════════════════════
export interface CompetitorDomainsCitedRow {
  domain: string
  citationCount: number
  promptCoverage: number | null
  themeCoverage: number | null
}

export function CompetitorDomainsCitedTable({
  rows,
  emptyMessage,
}: {
  rows: CompetitorDomainsCitedRow[]
  emptyMessage: string
}) {
  const maxCitations = Math.max(...rows.map((r) => r.citationCount), 1)

  const columns: SortableColumn<CompetitorDomainsCitedRow>[] = [
    {
      key: 'domain', label: 'Domain',
      accessor: (r) => r.domain,
      render: (r) => (
        <span className="block max-w-[150px] truncate font-medium text-white/80" title={r.domain}>{r.domain}</span>
      ),
    },
    {
      key: 'citationCount', label: 'Citation Count', align: 'right',
      tooltip: TT.aiCitations,
      accessor: (r) => r.citationCount,
      render: (r) => {
        const barWidth = (r.citationCount / maxCitations) * 100
        return (
          <div className="flex items-center justify-end gap-2">
            <div className="h-3 w-20 overflow-hidden rounded bg-white/[0.04]">
              <div className="h-full rounded bg-[#FF4444]/40" style={{ width: `${barWidth}%` }} />
            </div>
            <span className="tabular-nums text-white/60">{r.citationCount.toFixed(1)}%</span>
          </div>
        )
      },
    },
    {
      key: 'promptCoverage', label: 'Prompt Coverage %', align: 'right',
      tooltip: TT.promptCoverage,
      accessor: (r) => r.promptCoverage ?? -1,
      render: (r) => (
        <span className="tabular-nums text-white">
          {r.promptCoverage !== null ? `${r.promptCoverage}%` : '--'}
        </span>
      ),
    },
    {
      key: 'themeCoverage', label: 'Theme Coverage', align: 'right',
      tooltip: TT.themeCoverage,
      accessor: (r) => r.themeCoverage ?? -1,
      render: (r) => (
        <span className="tabular-nums text-white/60">
          {r.themeCoverage != null ? `${r.themeCoverage} theme${r.themeCoverage !== 1 ? 's' : ''}` : '--'}
        </span>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-3">
      <h4 className="text-xs font-bold text-white/60">Which competitor or corporate domains are cited most?</h4>
      <SortableTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.domain}
        initialPageSize={10}
        emptyMessage={emptyMessage}
      />
    </div>
  )
}
```

Replace the entire block above with the following:

```ts
// ═════════════════════════════════════════════════════════════════════════════
// 6. Top Competitor / Corporate Domains Cited in AI (Section H.1)
// ═════════════════════════════════════════════════════════════════════════════
export interface CompetitorDomainsCitedRow {
  domain: string
  aiVisibility: number
  aiVisibilityDelta: number | null
  citationShare: number
  citationShareDelta: number | null
  promptCoverage: number | null
  promptCoverageDelta: number | null
}

export function CompetitorDomainsCitedTable({
  rows,
  emptyMessage,
}: {
  rows: CompetitorDomainsCitedRow[]
  emptyMessage: string
}) {
  const maxCitationShare = Math.max(...rows.map((r) => r.citationShare), 1)

  const columns: SortableColumn<CompetitorDomainsCitedRow>[] = [
    {
      key: 'domain', label: 'Domain',
      accessor: (r) => r.domain,
      render: (r) => (
        <span className="block max-w-[150px] truncate font-medium text-white/80" title={r.domain}>{r.domain}</span>
      ),
    },
    {
      key: 'aiVisibility', label: 'AI Visibility', align: 'right',
      tooltip: TT.aiVisibility,
      accessor: (r) => r.aiVisibility,
      render: (r) => (
        <span className="tabular-nums text-white">
          {r.aiVisibility.toFixed(1)}%
          {renderDelta(r.aiVisibilityDelta, 'pp')}
        </span>
      ),
    },
    {
      key: 'citationShare', label: 'Citation Share', align: 'right',
      tooltip: TT.aiCitations,
      accessor: (r) => r.citationShare,
      render: (r) => {
        const barWidth = (r.citationShare / maxCitationShare) * 100
        return (
          <div className="flex items-center justify-end gap-2">
            <div className="h-3 w-20 overflow-hidden rounded bg-white/[0.04]">
              <div className="h-full rounded bg-[#FF4444]/40" style={{ width: `${barWidth}%` }} />
            </div>
            <span className="tabular-nums text-white/60">
              {r.citationShare.toFixed(1)}%
              {renderDelta(r.citationShareDelta, 'pp')}
            </span>
          </div>
        )
      },
    },
    {
      key: 'promptCoverage', label: 'Prompt Coverage', align: 'right',
      tooltip: TT.promptCoverage,
      accessor: (r) => r.promptCoverage ?? -1,
      render: (r) => (
        <span className="tabular-nums text-white">
          {r.promptCoverage !== null ? `${r.promptCoverage}%` : '--'}
          {renderDelta(r.promptCoverageDelta, 'pp')}
        </span>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-3">
      <h4 className="text-xs font-bold text-white/60">Which competitor domains are winning for our target prompts?</h4>
      <SortableTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.domain}
        initialPageSize={10}
        emptyMessage={emptyMessage}
      />
    </div>
  )
}
```

Key changes:
- Interface fields swapped: `citationCount` → `citationShare`, dropped `themeCoverage`, added `aiVisibility`, added a `*Delta: number | null` field for each of the three metrics.
- Columns array reordered to match Tina's left-to-right: Domain, AI Visibility, Citation Share, Prompt Coverage. Theme Coverage column deleted entirely.
- Each metric column appends `renderDelta(r.<field>Delta, 'pp')` to its value cell. `renderDelta` already returns `null` (rendering nothing) when the delta is `null`, so no compare-period gating logic is needed at the cell level.
- Citation Share keeps the red bar styling, identical to the prior Citation Count column (Tina did not ask to drop it).
- Prompt Coverage header text changed from `Prompt Coverage %` to `Prompt Coverage` (Tina's literal text).
- `maxCitations` renamed to `maxCitationShare` for accuracy.
- Sub-header `<h4>` text replaced verbatim with Tina's copy.

- [ ] **Step 4: Run tsc to verify the file still type-checks**

Run:
```
npx tsc --noEmit
```
Expected: zero output. If `content-impact.tsx` errors here, that is expected because Task 2 has not yet aligned the row builder to the new interface. Continue to Task 2 to fix it. Do not commit Task 1 until tsc is clean across both files (the commit will be a combined commit at the end of Task 2).

- [ ] **Step 5: Do not commit yet**

Hold off on `git commit`. Task 2 modifies `content-impact.tsx` to consume the new interface; commit both files together at the end of Task 2 so the branch never lands a type-broken intermediate state.

---

### Task 2: Rewrite the §H.1 row builder and SectionCard header in `content-impact.tsx`

**Files:**
- Modify: `components/report-sections/peec-ai/content-impact.tsx`

**Interfaces:**
- Consumes: updated `CompetitorDomainsCitedRow` from Task 1 (fields: `domain`, `aiVisibility`, `aiVisibilityDelta`, `citationShare`, `citationShareDelta`, `promptCoverage`, `promptCoverageDelta`).
- Consumes: existing `filteredCompetitorDomains: TopDomain[]` at [line 488](components/report-sections/peec-ai/content-impact.tsx:488). `TopDomain` shape (verified): `{ domain: string; retrieved: number; retrievedDelta: number; citationRate: number; citationRateDelta: number; type: string }`.
- Consumes: existing `coverage: DomainCoverage` (current period) at [line 370](components/report-sections/peec-ai/content-impact.tsx:370) and `coveragePrior: DomainCoverage` (prior period) at [line 393](components/report-sections/peec-ai/content-impact.tsx:393). Both already fetched.
- Consumes: existing `compareIso: string | null`, `totalTrackedPrompts: number`, `coverageAvailable: boolean`, `getPromptCoverage(domain): number | null`.
- Consumes: existing `domainPromptIds(cov, domain): string[]` imported from `@/lib/peec/url-citations`.
- Produces: new `getPromptCoveragePrior(domain): number | null` helper, scoped to the same function as `getPromptCoverage`.

- [ ] **Step 1: Grep to confirm `getThemeCoverage` and `domainTagIds` (Content Impact import) are only used by the old §H.1**

Run:
```
grep -n "getThemeCoverage\|domainTagIds\b" components/report-sections/peec-ai/content-impact.tsx
```
Expected: matches only at the helper definition (~line 528-529) and inside the old §H.1 IIFE (~line 1361 area). The `domainTagIds` import on line 11 should also appear. No other consumer. If a match appears outside these locations, do NOT delete `getThemeCoverage`; flag it back and stop.

Then run:
```
grep -rn "domainTagIds\b" components/ lib/ 2>/dev/null
```
Expected: matches in `lib/peec/url-citations.ts` (definition + internal use by `domainTagNames`) and `components/report-sections/peec-ai/content-impact.tsx` (the import + the `getThemeCoverage` call site). If `content-impact.tsx` is the only component-side caller and the helper is only used by `getThemeCoverage`, the import can be dropped from `content-impact.tsx` after deletion. `domainTagNames` (a separate export still used at [line 1469](components/report-sections/peec-ai/content-impact.tsx:1469) by §H.2) is NOT being removed.

- [ ] **Step 2: Add `getPromptCoveragePrior` helper next to `getPromptCoverage`, and delete `getThemeCoverage`**

In `components/report-sections/peec-ai/content-impact.tsx`, locate lines 520-529:

```ts
  const totalTrackedPrompts = peecData?.trackedPrompts.length ?? 0
  const coverageAvailable =
    Object.keys(coverage.promptIdsByDomain).length > 0 ||
    Object.keys(coverage.tagIdsByDomain).length > 0
  const getPromptCoverage = (domain: string): number | null =>
    coverageAvailable && totalTrackedPrompts > 0
      ? Math.round(domainPromptIds(coverage, domain).length / totalTrackedPrompts * 100)
      : null
  const getThemeCoverage = (domain: string): number | null =>
    coverageAvailable ? domainTagIds(coverage, domain).length : null
```

Replace with:

```ts
  const totalTrackedPrompts = peecData?.trackedPrompts.length ?? 0
  const coverageAvailable =
    Object.keys(coverage.promptIdsByDomain).length > 0 ||
    Object.keys(coverage.tagIdsByDomain).length > 0
  const coveragePriorAvailable =
    Object.keys(coveragePrior.promptIdsByDomain).length > 0 ||
    Object.keys(coveragePrior.tagIdsByDomain).length > 0
  const getPromptCoverage = (domain: string): number | null =>
    coverageAvailable && totalTrackedPrompts > 0
      ? Math.round(domainPromptIds(coverage, domain).length / totalTrackedPrompts * 100)
      : null
  // FB-040: prior-period mirror of getPromptCoverage. Uses the same
  // totalTrackedPrompts denominator (tracked-prompt list is configuration,
  // not period-dependent). Returns null when prior coverage is unavailable
  // so the delta in §H.1 stays null and renders nothing.
  const getPromptCoveragePrior = (domain: string): number | null =>
    coveragePriorAvailable && totalTrackedPrompts > 0
      ? Math.round(domainPromptIds(coveragePrior, domain).length / totalTrackedPrompts * 100)
      : null
```

Two changes:
1. Add `coveragePriorAvailable` and `getPromptCoveragePrior` immediately after the existing helpers, using the same `domainPromptIds` function (imported at line 11) against the already-fetched `coveragePrior`.
2. Delete `getThemeCoverage` (last 2 lines of the original block). Do NOT replace with a comment — clean delete.

- [ ] **Step 3: Drop `domainTagIds` from the `getUrlCitations` import line if grep confirmed it has no other use**

Locate line 11:

```ts
import { getUrlCitations, getDomainCoverage, domainPromptIds, domainTagIds, domainTagNames, avgCitationsByDomain, urlPromptIds } from '@/lib/peec/url-citations'
```

If the Step 1 grep confirmed `domainTagIds` is no longer used anywhere in `content-impact.tsx` (now that `getThemeCoverage` is deleted), drop it from the import:

```ts
import { getUrlCitations, getDomainCoverage, domainPromptIds, domainTagNames, avgCitationsByDomain, urlPromptIds } from '@/lib/peec/url-citations'
```

If the grep showed any other consumer in `content-impact.tsx`, leave the import alone.

- [ ] **Step 4: Rewrite the §H.1 IIFE to build rows in the new shape**

Locate lines 1349-1382:

```tsx
      {/* ── Section H: Competitor / Third-Party Content (PRD: 2 sub-views) ── */}
      <SectionCard
        title="Which competitor or third-party pages are cited for our prompts?"
        description="Non-owned content that AI tools cite for your tracked prompts. Understanding what wins informs what to create or pitch."
      >
        {/* Sub-view 1: Top Competitor Domains */}
        {(() => {
          // filteredCompetitorDomains: model-filtered when models filter is active.
          // v1 limitation: promptCoverage and themeCoverage are not re-computed
          // per selected model — they reflect all-model aggregates from Peec data.
          const h1Rows: CompetitorDomainsCitedRow[] = filteredCompetitorDomains.slice(0, 10).map((d, i) => {
            const promptCovReal = getPromptCoverage(d.domain)
            const themeCovReal  = getThemeCoverage(d.domain)
            const demoPromptCov = [42, 31, 56, 28, 67, 19, 38, 49, 23, 35][i % 10]
            const demoThemeCov  = [3, 2, 4, 1, 5, 1, 3, 4, 2, 2][i % 10]
            // Real coverage (incl. a known 0) is shown as-is; demo fills only
            // when there's no real coverage (helpers return null).
            const promptCov = promptCovReal !== null ? promptCovReal : (calendarIsDemo ? demoPromptCov : null)
            const themeCov  = themeCovReal  !== null ? themeCovReal  : (calendarIsDemo ? demoThemeCov : null)
            return {
              domain: d.domain,
              citationCount: d.citationRate,
              promptCoverage: promptCov,
              themeCoverage: themeCov,
            }
          })
          return (
            <CompetitorDomainsCitedTable
              rows={h1Rows}
              emptyMessage="No competitor domain data available from Peec AI"
            />
          )
        })()}
```

Replace with:

```tsx
      {/* ── Section H: Competitor Analysis (PRD: 2 sub-views) ── */}
      <SectionCard
        title="Competitor Analysis"
        description="See which competitor domains are gaining or losing ground across AI Visibility, Citation Share, and Prompt Coverage for your target prompts."
      >
        {/* Sub-view 1: Top Competitor Domains — AI Visibility / Citation Share / Prompt Coverage */}
        {(() => {
          // filteredCompetitorDomains: model-filtered when models filter is active.
          // v1 limitation: promptCoverage is not re-computed per selected model;
          // it reflects all-model aggregates from Peec data.
          // Deltas (aiVisibility, citationShare, promptCoverage) gate on
          // compareIso !== null so they only appear when a compare period is on.
          const h1Rows: CompetitorDomainsCitedRow[] = filteredCompetitorDomains.slice(0, 10).map((d) => {
            const promptCovCurrent = getPromptCoverage(d.domain)
            const promptCovPrior   = compareIso ? getPromptCoveragePrior(d.domain) : null
            const promptCovDelta   = compareIso && promptCovCurrent !== null && promptCovPrior !== null
              ? promptCovCurrent - promptCovPrior
              : null
            return {
              domain: d.domain,
              aiVisibility:        d.retrieved,
              aiVisibilityDelta:   compareIso ? d.retrievedDelta : null,
              citationShare:       d.citationRate,
              citationShareDelta:  compareIso ? d.citationRateDelta : null,
              promptCoverage:      promptCovCurrent,
              promptCoverageDelta: promptCovDelta,
            }
          })
          return (
            <CompetitorDomainsCitedTable
              rows={h1Rows}
              emptyMessage="No competitor domain data available from Peec AI"
            />
          )
        })()}
```

Key changes (line-by-line so the implementer can match):
- Comment block updated, drops the `Third-Party` framing.
- `SectionCard` `title` prop → `"Competitor Analysis"` (verbatim).
- `SectionCard` `description` prop → Tina's verbatim subtitle.
- Row builder drops the unused `i` index (no demo arrays consume it), drops `themeCovReal`, drops `demoPromptCov` / `demoThemeCov`, drops `calendarIsDemo` branching for these fields.
- AI Visibility value = `d.retrieved`; delta = `d.retrievedDelta` when `compareIso` is set, else `null`.
- Citation Share value = `d.citationRate`; delta = `d.citationRateDelta` when `compareIso` is set, else `null`.
- Prompt Coverage value = `getPromptCoverage(d.domain)`; delta computed inline only when `compareIso` is set AND both current + prior return non-null.

- [ ] **Step 5: Run tsc to verify both files type-check together**

Run:
```
npx tsc --noEmit
```
Expected: zero output. If any error remains, fix it before continuing. Common pitfalls:
- A leftover reference to `getThemeCoverage` somewhere else on the page (the Step 1 grep should have caught this; if it surfaces now, re-run the grep with `2>/dev/null` and a wider scope).
- Forgot to remove `domainTagIds` from the import after deleting `getThemeCoverage`. Either re-add it to the import or finish removing it — do not leave a half-step.

- [ ] **Step 6: Sanity-check no em-dashes were introduced in this commit's diff**

Run:
```
git diff -U0 components/report-sections/peec-ai/content-impact.tsx components/report-sections/peec-ai/content-impact-tables.tsx | grep -E '^\+' | grep -- '—' || echo "OK: no new em-dashes"
```
Expected: `OK: no new em-dashes`. Pre-existing em-dashes (`recommendedAction`, `aiBotActivity`) are NOT in your diff and do not matter; this command flags only added lines.

- [ ] **Step 7: Commit Tasks 1 + 2 together**

```
git add components/report-sections/peec-ai/content-impact.tsx components/report-sections/peec-ai/content-impact-tables.tsx
git commit -m "FB-040: §H.1 Competitor Analysis: AI Visibility + Citation Share + Prompt Coverage (each w/ delta), drop Theme Coverage, swap title/subtitle/sub-header per Tina"
```

Do NOT push yet. Task 3 ships the docs in a separate commit, then both commits get pushed together.

---

### Task 3: Docs (feedback-log + changelog + status.md + sheet row) + final verify + push

**Files:**
- Modify: `docs/official-feedback/feedback-log.md`
- Modify: `docs/official-feedback/changelog.md`
- Modify: `docs/official-feedback/status.md`

**Interfaces:**
- Consumes: existing entries in these files. Append FB-040 entry to feedback-log, prepend to changelog, bump commit-count + next-FB-ID in status.
- Produces: paste-ready Column F row text for Tina's Google Sheet, surfaced at the end of Task 3 in the implementer's report.

- [ ] **Step 1: Read each doc to learn the existing format**

Run:
```
tail -80 docs/official-feedback/feedback-log.md
head -40 docs/official-feedback/changelog.md
cat docs/official-feedback/status.md
```
Expected: feedback-log has FB-NNN entries with `**Tina's ask:**` / `**Shipped:**` blocks, changelog has top-of-file dated entries, status.md has a single-block summary with the next-FB-ID and commits-ahead-count. Match the existing format exactly.

- [ ] **Step 2: Append FB-040 entry to `docs/official-feedback/feedback-log.md`**

Append at the bottom of the file (after the FB-039 block):

```markdown
## FB-040 — Content Impact §H Competitor Analysis sub-view 1

**Tab:** Content Impact
**Section:** §H Competitor Analysis (sub-view 1: top competitor domains)
**Tina's ask:**
- New section title: `Competitor Analysis`
- New section subtitle: `See which competitor domains are gaining or losing ground across AI Visibility, Citation Share, and Prompt Coverage for your target prompts.`
- New chart sub-header: `Which competitor domains are winning for our target prompts?`
- New columns: AI Visibility (& Delta), Citation Share (& Delta), Prompt Coverage (& Delta)

**Shipped:**
- §H.1 `CompetitorDomainsCitedTable` rebuilt: 4 columns (Domain + 3 metric cols), each metric col renders value with a percentage-point delta when a compare period is active.
- Column mappings: AI Visibility = `TopDomain.retrieved` (Peec `retrieved_percentage * 100`), Citation Share = `TopDomain.citationRate` (Peec `citation_rate * 100`), Prompt Coverage = existing `getPromptCoverage` helper. Deltas: `retrievedDelta` / `citationRateDelta` come pre-baked from `buildTopDomains`; Prompt Coverage delta computed inline against the already-fetched `coveragePrior` via a new `getPromptCoveragePrior` helper.
- Zero new Peec or GA4 fetches; reused `peecData.topDomains` (current + prior), `coverage`, `coveragePrior`.
- All deltas gate on `compareIso !== null` per FB-034 hotfix #2.
- Theme Coverage column + `getThemeCoverage` helper + `TT.themeCoverage` tooltip + `domainTagIds` import deleted as dead code.
- Demo fills for prompt/theme coverage removed (Tina's literal: live or `--`, no demo backfill).
- §H.2 (`CompetitorUrlsBrandAbsentTable`) untouched per literal-interpretation rule.

**Files:** `components/report-sections/peec-ai/content-impact.tsx`, `components/report-sections/peec-ai/content-impact-tables.tsx`
```

- [ ] **Step 3: Prepend FB-040 to `docs/official-feedback/changelog.md`**

Prepend immediately under the top-of-file header:

```markdown
## FB-040 — §H.1 Competitor Analysis (Content Impact)
- Rebuilt §H.1 table to Tina's spec: Domain, AI Visibility (+Δ), Citation Share (+Δ), Prompt Coverage (+Δ).
- SectionCard title → `Competitor Analysis`. Subtitle + chart sub-header swapped to Tina's verbatim copy.
- Dropped Theme Coverage column; deleted dead `getThemeCoverage` helper, `TT.themeCoverage`, and the now-unused `domainTagIds` import.
- All deltas gate on compare-period (FB-034 hotfix #2 pattern). Zero new data fetches.
- §H.2 untouched.
```

- [ ] **Step 4: Bump `docs/official-feedback/status.md`**

Open `docs/official-feedback/status.md`. Two edits:
1. Increment the `commits-ahead` count from 44 to 46 (one for the code commit at end of Task 2, one for the docs commit at end of Task 3).
2. Bump the next-FB ID from `FB-040` to `FB-041`.

If the file format is one summary block rather than discrete fields, locate the exact string and surgically replace. Show the implementer's diff in the report.

- [ ] **Step 5: Run the full verify sweep**

Run:
```
npx tsc --noEmit && \
DATABASE_URL=postgres://test:test@localhost/test npx tsx lib/ga4/client.test.ts && \
npx tsx lib/peec/bot-vs-human-scatter.test.ts && \
npx tsx lib/peec/slope-chart.test.ts && \
npx tsx lib/peec/url-citations.test.ts && \
npx tsx lib/peec/content-impact-synopsis.test.ts && \
npx tsx lib/ga4/content-derive.test.ts
```
Expected: tsc empty output; each test prints `all assertions passed` (the content-impact-synopsis test prints two such lines). If any test fails, stop and report — do not push.

- [ ] **Step 6: Commit docs**

```
git add docs/official-feedback/feedback-log.md docs/official-feedback/changelog.md docs/official-feedback/status.md
git commit -m "FB-040 docs: feedback-log + changelog + status.md bump"
```

- [ ] **Step 7: Push both commits to origin**

```
git push origin official-feedback-content-impact-tab-content-v1
```
Expected: push succeeds, two new commits on `origin/official-feedback-content-impact-tab-content-v1`.

- [ ] **Step 8: Verify final lockstep**

Run:
```
git rev-parse HEAD && git rev-parse @{u} && git status --short
```
Expected: local SHA == remote SHA, clean working tree.

- [ ] **Step 9: Produce the Sheet Column F row for Tina**

Surface this paste-ready text in the Task 3 implementer report. The orchestrator forwards it to Thomas at FB close.

| Column | Value |
|---|---|
| Tab | Content Impact |
| Your ask | Competitor Analysis — rename section, swap subtitle, new chart sub-header. Three new columns with deltas: AI Visibility, Citation Share, Prompt Coverage. |
| What shipped | Done. Section renamed to "Competitor Analysis" with your new subtitle. Sub-header now reads "Which competitor domains are winning for our target prompts?". Table now shows Domain, AI Visibility (+ change), Citation Share (+ change), Prompt Coverage (+ change). Changes appear in green/red when a compare period is on. Theme Coverage column was removed. The "Competitor URLs where brand is absent" table directly below was left alone. |

---

## Self-Review

**1. Spec coverage**

| Tina's ask | Task / Step |
|---|---|
| New section title `Competitor Analysis` | Task 2 Step 4 (SectionCard title prop) |
| New section subtitle `See which competitor domains are gaining or losing ground across AI Visibility, Citation Share, and Prompt Coverage for your target prompts.` | Task 2 Step 4 (SectionCard description prop) |
| New chart title `Which competitor domains are winning for our target prompts?` | Task 1 Step 3 (`<h4>` text in CompetitorDomainsCitedTable) |
| Column: AI Visibility (& Delta) | Task 1 Step 3 (column definition) + Task 2 Step 4 (`aiVisibility` / `aiVisibilityDelta` in row builder) |
| Column: Citation Share (& Delta) | Task 1 Step 3 (column definition, rename from "Citation Count") + Task 2 Step 4 (`citationShare` / `citationShareDelta` in row builder) |
| Column: Prompt Coverage (& Delta) | Task 1 Step 3 (column definition, rename from "Prompt Coverage %") + Task 2 Step 2 (`getPromptCoveragePrior` helper) + Task 2 Step 4 (delta computation in row builder) |
| (Implicit) Drop Theme Coverage | Task 1 Step 3 (column dropped from columns array) + Task 1 Step 2 (`TT.themeCoverage` deleted) + Task 2 Step 2 (`getThemeCoverage` deleted) + Task 2 Step 3 (`domainTagIds` import dropped) |
| §H.2 untouched | Explicit constraint in Global Constraints; no task modifies the §H.2 IIFE or its component |

All Tina items covered.

**2. Placeholder scan**

Searched the plan for TBD / TODO / "fill in" / "implement later" / "similar to Task N" / "appropriate handling" / type-name drift. Every code block is complete and inline. No placeholders.

**3. Type consistency**

| Field | Task 1 | Task 2 |
|---|---|---|
| `aiVisibility: number` | declared | populated from `d.retrieved` |
| `aiVisibilityDelta: number \| null` | declared | populated from `compareIso ? d.retrievedDelta : null` |
| `citationShare: number` | declared | populated from `d.citationRate` |
| `citationShareDelta: number \| null` | declared | populated from `compareIso ? d.citationRateDelta : null` |
| `promptCoverage: number \| null` | declared | populated from `getPromptCoverage(d.domain)` |
| `promptCoverageDelta: number \| null` | declared | populated from inline diff (Task 2 Step 4) |
| `getPromptCoveragePrior(domain: string): number \| null` | n/a | declared + used in same task |
| `coveragePriorAvailable: boolean` | n/a | declared + consumed by `getPromptCoveragePrior` |

All names line up exactly between Task 1 and Task 2.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-25-content-impact-competitor-analysis-h1.md`. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, task review (spec + quality) after each, fast iteration. Required for this branch's working rules.
2. **Inline Execution** — execute tasks in this session with checkpoints.

Which approach?
