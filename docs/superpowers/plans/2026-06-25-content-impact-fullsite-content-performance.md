# FB-039: Content Impact §F Fullsite Content Performance — URL-row 6-column rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild Content Impact §F from a 9-column domain-row table ("Which of our owned pages do AI engines cite?") into a 6-column URL-row table ("What content across your domain is being cited by AI?") matching Tina's literal spec: hyperlinked Page column + 5 metric columns with comparison-period deltas.

**Architecture:** Drop the legacy `OwnedContentCitedTable` + `OwnedContentCitedRow`. Add a new `FullsiteContentPerformanceTable` + `FullsiteContentPerformanceRow` that mirrors `PlannedContentPerformanceTable`'s 6 metric+delta shape (Page + Prompt Coverage + Citation Share + AI Referral Traffic + Organic Sessions + Engagement Rate). In `content-impact.tsx`, rewrite the §F compute block: build the page universe from `urlCitations` filtered to owned domains, derive each row's 5 current + 5 prior metric values reusing the §B helpers already in scope (no new fetches), mount the new table. Update SectionCard title + subtitle.

**Tech Stack:** Recharts (not used in this FB), Tailwind, Next.js 15 RSC + client (`SortableTable` is client), node:assert + tsx tests (repo convention; this FB has no new test file because the new code is JSX + map building with no pure logic worth a dedicated unit test, and the existing 6 test files exercise the underlying helpers already).

## Global Constraints

- **Glean Chat API for all LLM inference.** Not relevant here, no LLM in this feature.
- **No em-dashes anywhere.** Use commas or hyphens in code, prose, comments, docs, copy.
- **Literal interpretation only.** Tina's title + subtitle + 6 column labels copied verbatim.
- **Truth-grounded.** When a metric is uncomputable for a URL (no GA4 row for that path, or coverage data missing), the cell shows `--`. Never fake a zero, never invent a value.
- **Universal across clients.** No per-client conditionals.
- **No new fetches.** All data must come from variables already in scope at the §F mount point (verified in plan body below).
- **Compare-period gating.** Inline deltas appear under each metric value only when `compareIso !== null`. Identical pattern to §B Watched Pages.
- **No Neon migrations.**
- **Never skip hooks. Never force-push.**

## Verbatim copy (Tina)

- **Title:** `What content across your domain is being cited by AI?`
- **Subtitle:** `See every cited page across your site and measure its performance.`
- **6 column headers in this exact order:**
  1. `Page`
  2. `Prompt Coverage`
  3. `Citation Share`
  4. `AI Referral Traffic`
  5. `Organic Sessions`
  6. `Engagement Rate`

## Data sources (confirmed in scope at content-impact.tsx §F mount point ~line 1240)

| Variable | Where defined | Use |
|---|---|---|
| `urlCitations: UrlCitation[]` | line 367 (FB-028) | Source for row universe; each has `url`, `urlKey`, `title`, `domain`, `citationCount` |
| `urlCitationsPrior: UrlCitation[]` | line 389 (FB-035) | Prior-period citations for Citation Share delta |
| `filteredOwnDomains: TopDomain[]` | line 480 | Source for owned-host filter; each `.domain` is a host string |
| `coverage: DomainCoverage` | (from FB-028) | Current-period coverage; `promptIdsByUrlKey[urlKey]` exposes per-URL prompt IDs (added in FB-035 Task 1) |
| `coveragePrior: DomainCoverage` | line 390 (FB-035) | Prior-period coverage |
| `compareIso: string \| null` | line 229 | Compare-period gate for deltas |
| `totalTrackedPrompts: number` | (§B helpers block, ~line 850) | Denominator for Prompt Coverage % |
| `totalCitationsCurrentRows: number` | line 853 | Denominator for Citation Share % |
| `totalCitationsPriorRows: number` | line 854 | Denominator for Citation Share % prior |
| `citeByKeyPrior: Map<string, UrlCitation>` | line 855 | Prior-period citationCount lookup by urlKey |
| `aiReferredForPath(path)` | line 580 | AI-referred sessions per path, current |
| `aiReferredForPathPrior(path)` | line 869 | AI-referred sessions per path, prior |
| `organicForPath(path)` | line 889 | Organic Search sessions per path, current |
| `organicForPathPrior(path)` | line 909 | Organic Search sessions per path, prior |
| `engagementRateForPath(path)` (or equivalent name) | §B block | Engagement rate per path, current |
| `engagementRateForPathPrior(path)` | line 924 | Engagement rate per path, prior |
| `urlPromptIds(cov, urlKey)` | `lib/peec/url-citations.ts:286` | Per-URL prompt count |
| `urlJoinKey` | `@/lib/url` | Path/host normalization |
| `labelFromPath` | `@/lib/url` | Topic fallback for the Page label |
| `extractPath(url)` | content-impact.tsx ~line 122 | Bare path from full URL for GA4 joins |
| `renderDelta` (inline in PlannedContentPerformanceTable, can be lifted to module scope) | content-impact-tables.tsx | Delta rendering helper to reuse for §F |

## Identifier table (must match across tasks)

| Identifier | Type | Defined in |
|---|---|---|
| `FullsiteContentPerformanceRow` | exported interface (Task 1) | content-impact-tables.tsx |
| `FullsiteContentPerformanceTable` | exported React component (Task 1) | content-impact-tables.tsx |
| Component prop `rows: FullsiteContentPerformanceRow[]` | required prop | Task 1 |
| Component prop `ga4Connected: boolean` | required prop | Task 1 |
| Component prop `emptyMessage?: string` | optional prop | Task 1 |

`FullsiteContentPerformanceRow` shape (16 fields, identical to `PlannedContentRow` minus the 3 calendar fields `contentType`/`publishDate`/`updateDate`):

```typescript
{
  pageTitle: string                       // display label (UrlCitation.title or labelFromPath fallback)
  url: string                             // full URL for the hyperlink
  promptCoverage: number | null
  promptCoverageDelta: number | null      // percentage points
  citationShare: number | null            // %
  citationShareDelta: number | null       // percentage points
  aiReferralTraffic: number | null        // count
  aiReferralTrafficDelta: number | null   // %
  organicSessions: number | null          // count
  organicSessionsDelta: number | null     // %
  engagementRate: number | null           // % (0-100)
  engagementRateDelta: number | null      // percentage points
  _key: string                            // stable React key
}
```

## Decisions documented for transparency (Tina did not specify)

- **Page label fallback:** When `UrlCitation.title` is `null`, fall back to `labelFromPath(url)`; if that returns empty, fall back to the raw URL. Truth-grounded.
- **Owned-domain filter:** `urlJoinKey(urlCitation.domain)` matches any `urlJoinKey(filteredOwnDomains[].domain)`. Same canonical matcher used everywhere else in the file.
- **Default sort:** Citation Share descending. Matches §B Watched Pages.
- **Pagination:** Top 10 with expand (`initialPageSize={10}` on `SortableTable`). Matches §B.
- **Delta gating:** When `compareIso === null`, all `*Delta` fields stay `null` so the inline delta line is omitted. Matches §B + FB-034 hotfix #2 principle.
- **Row universe:** All `urlCitations` whose `domain` matches an owned host AND whose `citationCount > 0`. "Every cited page" literal.
- **`renderDelta` reuse:** Extract the existing `renderDelta` inline helper from `PlannedContentPerformanceTable` to module scope so `FullsiteContentPerformanceTable` can reuse it. DRY across both tables.

---

### Task 1: New `FullsiteContentPerformanceTable` + shared `renderDelta` lift, delete legacy `OwnedContentCitedTable`

**Files:**
- Modify: `components/report-sections/peec-ai/content-impact-tables.tsx`

**Interfaces:**
- Consumes: existing `SortableColumn`, `SortableTable` (already imported), `SectionCard` (already imported).
- Produces:
  - Module-level helper `renderDelta(delta: number | null, mode: 'pp' | 'pct'): React.ReactNode` (lifted from PlannedContentPerformanceTable's inline copy)
  - Type `FullsiteContentPerformanceRow` (shape above)
  - Component `FullsiteContentPerformanceTable({ rows, ga4Connected, emptyMessage })`
- Removes: `OwnedContentCitedTable` export and `OwnedContentCitedRow` interface (consumer in content-impact.tsx is rewritten in Task 2 to use the new component).

- [ ] **Step 1: Lift the inline `renderDelta` helper to module scope**

Find the existing `renderDelta` arrow function inside `PlannedContentPerformanceTable` (around line 117-130 of `content-impact-tables.tsx`). It currently looks like (read the file to copy verbatim — the exact body must match what's there):

The function takes `(delta: number | null, mode: 'pp' | 'pct')`, returns `null` when delta is null, otherwise renders a small inline node with arrow + magnitude + " vs prior" or similar pattern.

Move the function definition above the `PlannedContentRow` interface so both `PlannedContentPerformanceTable` and `FullsiteContentPerformanceTable` reference the same module-level `renderDelta`. Delete the inline copy inside `PlannedContentPerformanceTable` and update the call sites in that component's column definitions to call the now-module-scoped helper (the call signature stays identical).

Verify: `grep -n "renderDelta" components/report-sections/peec-ai/content-impact-tables.tsx` after this step should show 1 definition + N call sites, with all call sites unchanged in argument shape.

- [ ] **Step 2: Add the new row type + table component**

Insert this block immediately AFTER `PlannedContentPerformanceTable`'s closing brace and BEFORE the old `OwnedContentCitedTable` declaration:

```typescript
// ──────────────────────────────────────────────────────────────────────────────
// FB-039: §F Fullsite Content Performance (URL-row, 6 columns + deltas)
// ──────────────────────────────────────────────────────────────────────────────

export interface FullsiteContentPerformanceRow {
  pageTitle: string
  url: string
  promptCoverage: number | null
  promptCoverageDelta: number | null
  citationShare: number | null
  citationShareDelta: number | null
  aiReferralTraffic: number | null
  aiReferralTrafficDelta: number | null
  organicSessions: number | null
  organicSessionsDelta: number | null
  engagementRate: number | null
  engagementRateDelta: number | null
  _key: string
}

export function FullsiteContentPerformanceTable({
  rows,
  ga4Connected,
  emptyMessage = 'No cited owned-domain pages available from Peec AI',
}: {
  rows: FullsiteContentPerformanceRow[]
  ga4Connected: boolean
  emptyMessage?: string
}) {
  const columns: SortableColumn<FullsiteContentPerformanceRow>[] = [
    {
      key: 'pageTitle', label: 'Page',
      sortable: true,
      sortValue: (r) => r.pageTitle.toLowerCase(),
      render: (r) => (
        <a
          href={r.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-white hover:underline"
          title={r.url}
        >
          {r.pageTitle}
        </a>
      ),
    },
    {
      key: 'promptCoverage', label: 'Prompt Coverage', align: 'right',
      sortable: true,
      sortValue: (r) => r.promptCoverage ?? -1,
      render: (r) => (
        <div className="flex flex-col items-end">
          <span>{r.promptCoverage !== null ? `${r.promptCoverage.toFixed(1)}%` : '--'}</span>
          {renderDelta(r.promptCoverageDelta, 'pp')}
        </div>
      ),
    },
    {
      key: 'citationShare', label: 'Citation Share', align: 'right',
      sortable: true,
      sortValue: (r) => r.citationShare ?? -1,
      render: (r) => (
        <div className="flex flex-col items-end">
          <span>{r.citationShare !== null ? `${r.citationShare.toFixed(1)}%` : '--'}</span>
          {renderDelta(r.citationShareDelta, 'pp')}
        </div>
      ),
    },
    {
      key: 'aiReferralTraffic', label: 'AI Referral Traffic', align: 'right',
      sortable: true,
      sortValue: (r) => r.aiReferralTraffic ?? -1,
      render: (r) => (
        <div className="flex flex-col items-end">
          <span>{r.aiReferralTraffic !== null ? r.aiReferralTraffic.toLocaleString() : '--'}</span>
          {renderDelta(r.aiReferralTrafficDelta, 'pct')}
        </div>
      ),
    },
    {
      key: 'organicSessions', label: 'Organic Sessions', align: 'right',
      sortable: true,
      sortValue: (r) => r.organicSessions ?? -1,
      render: (r) => (
        <div className="flex flex-col items-end">
          <span>{r.organicSessions !== null ? r.organicSessions.toLocaleString() : '--'}</span>
          {renderDelta(r.organicSessionsDelta, 'pct')}
        </div>
      ),
    },
    {
      key: 'engagementRate', label: 'Engagement Rate', align: 'right',
      sortable: true,
      sortValue: (r) => r.engagementRate ?? -1,
      render: (r) => (
        <div className="flex flex-col items-end">
          <span>{r.engagementRate !== null ? `${r.engagementRate.toFixed(1)}%` : '--'}</span>
          {renderDelta(r.engagementRateDelta, 'pp')}
        </div>
      ),
    },
  ]

  return (
    <SectionCard
      title="What content across your domain is being cited by AI?"
      description="See every cited page across your site and measure its performance."
    >
      <SortableTable
        rows={rows}
        columns={columns}
        getRowKey={(r) => r._key}
        initialPageSize={10}
        defaultSortKey="citationShare"
        defaultSortDir="desc"
        emptyMessage={ga4Connected ? emptyMessage : 'Connect GA4 page-level data to populate'}
      />
    </SectionCard>
  )
}
```

- [ ] **Step 3: Delete the legacy `OwnedContentCitedTable` + `OwnedContentCitedRow`**

Find and delete the entire `OwnedContentCitedRow` interface declaration AND the entire `OwnedContentCitedTable` function declaration. Both are obsolete after Task 2 rewrites the §F orchestrator block to use the new component.

Verify with: `grep -n "OwnedContentCited" components/report-sections/peec-ai/content-impact-tables.tsx` should produce zero matches.

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: tsc will likely error in `content-impact.tsx` because it still imports `OwnedContentCitedTable` and `OwnedContentCitedRow`. **This is expected for this task** because Task 2 wires up the new component. The error confirms the deletion is real. Note the errors but do not try to fix them in this task; Task 2 will resolve them.

- [ ] **Step 5: Commit**

```bash
git add components/report-sections/peec-ai/content-impact-tables.tsx
git commit -m "FB-039 Task 1: drop OwnedContentCitedTable, add FullsiteContentPerformanceTable + lift renderDelta to module scope"
```

(The commit lands with broken tsc until Task 2; this is acceptable because the two are tightly coupled and ship together to PR review.)

---

### Task 2: Rewrite §F orchestrator block + mount new table

**Files:**
- Modify: `components/report-sections/peec-ai/content-impact.tsx`

**Interfaces:**
- Consumes: existing in-scope vars listed in the "Data sources" table above; new `FullsiteContentPerformanceTable` + `FullsiteContentPerformanceRow` from Task 1.
- Produces: rewritten §F block (replacing line ~1240-1290 in current file).

- [ ] **Step 1: Update the imports**

In `content-impact.tsx`, find the existing import line for table components (search for `OwnedContentCitedTable,`). Replace:

```typescript
  OwnedContentCitedTable,
```

With:

```typescript
  FullsiteContentPerformanceTable,
```

If `OwnedContentCitedRow` is also imported (it likely is for the legacy `ownedRows` typing), remove that import line entirely. Add nothing for the new row type — the orchestrator declares row objects inline (the type is inferred from the prop signature).

- [ ] **Step 2: Replace the §F orchestrator block**

Find the JSX block starting with `{/* ── Section F: Owned Content Cited in AI (PRD: 9 columns) ─────────── */}` (around line 1240) and ending with the closing `})()}`  about 50 lines later. Replace the ENTIRE block (comment included) with:

```typescript
{/* ── Section F: Fullsite Content Performance (FB-039) ────────────────── */}
{(() => {
  // FB-039: row universe = owned-domain cited URLs. Owned hosts derived from
  // filteredOwnDomains (Peec /reports/domains, already model-filtered upstream).
  const ownedHostKeys = new Set<string>(
    filteredOwnDomains
      .map((d) => urlJoinKey(d.domain))
      .filter((k): k is string => k !== null),
  )

  const fullsiteRows: FullsiteContentPerformanceRow[] = urlCitations
    .filter((c) => {
      const hostKey = urlJoinKey(c.domain)
      return hostKey !== null && ownedHostKeys.has(hostKey) && (c.citationCount ?? 0) > 0
    })
    .map((c) => {
      const path = extractPath(c.url)
      const urlKey = c.urlKey

      // Prompt Coverage (current + prior, both gated on data presence).
      const currentPromptIds = urlPromptIds(coverage, urlKey)
      const priorPromptIds = compareIso ? urlPromptIds(coveragePrior, urlKey) : []
      const promptCoverage = totalTrackedPrompts > 0
        ? (currentPromptIds.length / totalTrackedPrompts) * 100
        : null
      const promptCoveragePrior = (compareIso && totalTrackedPrompts > 0 && Object.keys(coveragePrior.promptIdsByUrlKey).length > 0)
        ? (priorPromptIds.length / totalTrackedPrompts) * 100
        : null
      const promptCoverageDelta = (promptCoverage !== null && promptCoveragePrior !== null)
        ? promptCoverage - promptCoveragePrior
        : null

      // Citation Share (current + prior).
      const cite = c.citationCount ?? null
      const citePrior = citeByKeyPrior.get(urlKey)?.citationCount ?? null
      const citationShare = (cite !== null && totalCitationsCurrentRows > 0)
        ? (cite / totalCitationsCurrentRows) * 100
        : null
      const citationSharePrior = (compareIso && citePrior !== null && totalCitationsPriorRows > 0)
        ? (citePrior / totalCitationsPriorRows) * 100
        : null
      const citationShareDelta = (citationShare !== null && citationSharePrior !== null)
        ? citationShare - citationSharePrior
        : null

      // AI Referral Traffic (current + prior).
      const aiRef = aiReferredForPath(path)
      const aiRefPrior = compareIso ? aiReferredForPathPrior(path) : null
      const aiReferralTrafficDelta = (aiRef !== null && aiRefPrior !== null && aiRefPrior > 0)
        ? ((aiRef - aiRefPrior) / aiRefPrior) * 100
        : null

      // Organic Sessions (current + prior).
      const organic = organicForPath(path)
      const organicPrior = compareIso ? organicForPathPrior(path) : null
      const organicSessionsDelta = (organic !== null && organicPrior !== null && organicPrior > 0)
        ? ((organic - organicPrior) / organicPrior) * 100
        : null

      // Engagement Rate (current + prior, percentage points).
      const er = engagementRateForPath(path)
      const erPrior = compareIso ? engagementRateForPathPrior(path) : null
      const engagementRateDelta = (er !== null && erPrior !== null)
        ? er - erPrior
        : null

      const pageTitle = (c.title && c.title.trim() !== '')
        ? c.title
        : (labelFromPath(c.url) || c.url)

      return {
        pageTitle,
        url: c.url,
        promptCoverage,
        promptCoverageDelta,
        citationShare,
        citationShareDelta,
        aiReferralTraffic: aiRef,
        aiReferralTrafficDelta,
        organicSessions: organic,
        organicSessionsDelta,
        engagementRate: er,
        engagementRateDelta,
        _key: c.urlKey || c.url,
      }
    })

  return (
    <FullsiteContentPerformanceTable
      rows={fullsiteRows}
      ga4Connected={!!ga4Rows}
    />
  )
})()}
```

**Note on the `engagementRateForPath` helper:** read the file around the §B block (~lines 800-960) to confirm the exact name. The plan assumed `engagementRateForPath` based on the FB-035 pattern. If the actual helper is named differently (e.g. `engagementRateForPathCurrent`, `engagementForPath`), use the actual name in the §F block. Both current and prior helpers must exist; if only the prior is defined, mirror the §B current-period derivation inline.

- [ ] **Step 3: Add `labelFromPath` import if not present**

```bash
grep -n "labelFromPath" components/report-sections/peec-ai/content-impact.tsx
```

If `labelFromPath` is not already imported from `@/lib/url`, add it to the existing import line. (It is used in the new block to derive the Page label fallback.)

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: zero output. The errors from Task 1's deletion are now resolved by the new import + new component usage.

- [ ] **Step 5: Run all 6 existing test files (regression sweep)**

```
DATABASE_URL=postgres://test:test@localhost/test npx tsx lib/ga4/client.test.ts
npx tsx lib/peec/bot-vs-human-scatter.test.ts
npx tsx lib/peec/slope-chart.test.ts
npx tsx lib/peec/url-citations.test.ts
npx tsx lib/peec/content-impact-synopsis.test.ts
npx tsx lib/ga4/content-derive.test.ts
```

Expected: every file prints its `all assertions passed` line.

- [ ] **Step 6: Verify the page renders cleanly**

```
grep -n "FullsiteContentPerformanceTable\|OwnedContentCitedTable\|OwnedContentCitedRow" components/report-sections/peec-ai/content-impact.tsx
```

Expected output: only `FullsiteContentPerformanceTable` mentions (1 import line + 1 JSX usage). Zero references to the deleted symbols.

- [ ] **Step 7: Commit**

```bash
git add components/report-sections/peec-ai/content-impact.tsx
git commit -m "FB-039 Task 2: rewrite §F as 6-col URL-row table, new title and subtitle, drop demo-domain map and unused enginesByDomain"
```

---

### Task 3: Verify + docs + push

**Files:**
- Modify: `docs/official-feedback/feedback-log.md`
- Modify: `docs/official-feedback/changelog.md`
- Modify: `docs/official-feedback/status.md`

- [ ] **Step 1: Confirm clean state**

```
git status --short && npx tsc --noEmit
```
Expected: no unstaged changes, zero tsc output.

- [ ] **Step 2: Append FB-039 to feedback-log.md**

Open `docs/official-feedback/feedback-log.md` and insert this block immediately after the `## Closed` line (around line 17), before the existing FB-038 entry:

```markdown
### FB-039 - Fullsite Content Performance (Tina, 2026-06-25)

- **Ask (verbatim):**
  - Revised Columns:
    - Page (combine page title and hyperlink it with the URL)
    - Prompt Coverage (& Delta)
    - Citation Share (& Delta)
    - AI Referral Traffic (& Delta)
    - Organic Sessions (& Delta)
    - Engagement Rate (& Delta)
  - New Title: What content across your domain is being cited by AI?
  - New Subtitle: See every cited page across your site and measure its performance.
- **Decisions made (Tina did not specify; documented for transparency):**
  - Row universe: every UrlCitation whose host matches an owned domain AND has citationCount > 0. "Every cited page across your site" literal.
  - Page label fallback chain: UrlCitation.title, then labelFromPath(url), then raw URL. Truth-grounded.
  - Default sort: Citation Share descending. Matches §B Watched Pages.
  - Pagination: 10 with expand. Matches §B.
  - Inline deltas appear only when compareIso !== null. Matches §B and FB-034 hotfix #2 principle.
  - Owned-domain detection: urlJoinKey match against filteredOwnDomains (Peec /reports/domains, already model-filtered).
- **Files touched:**
  - components/report-sections/peec-ai/content-impact-tables.tsx: dropped OwnedContentCitedTable + OwnedContentCitedRow. Added FullsiteContentPerformanceTable + FullsiteContentPerformanceRow (6 cols, mirrors §B's metric+delta shape). Lifted renderDelta helper to module scope so both §B and §F reuse it.
  - components/report-sections/peec-ai/content-impact.tsx: rewrote §F orchestrator block. Drops demoTopics/demoClusters/demoEngines/demoPositions/demoAiSessions arrays and the enginesByDomain map (all unused after the column shape change). Builds per-URL row enrichment reusing FB-035 helpers (aiReferredForPath, organicForPath, engagementRateForPath, urlPromptIds, citeByKeyPrior, total*Citations, totalTrackedPrompts) with zero new fetches. Mounts the new table.
- **Sheet row:** Content Impact | Fullsite Content Performance: new 6-col URL-row table (Page hyperlinked, Prompt Coverage, Citation Share, AI Referral Traffic, Organic Sessions, Engagement Rate, each with comparison delta) + verbatim new title/subtitle | Done. Replaced the legacy 9-col domain-row table. Row universe is every owned cited URL. Sort default Citation Share desc, paginate at 10. Deltas show when comparison period is on. Zero new fetches: reused FB-035's per-path helpers and per-URL Peec data.
```

- [ ] **Step 3: Prepend FB-039 to changelog.md**

Open `docs/official-feedback/changelog.md` and insert this block immediately below the `---` separator (around line 9), before the existing `## FB-038` block:

```markdown
## FB-039 - Fullsite Content Performance (2026-06-25)

FB-039 | 2026-06-25 | <pending> | a | §F Fullsite Content Performance rebuilt per Tina ADD. Dropped the legacy 9-col domain-row OwnedContentCitedTable (1 row per owned domain, typically just avenuez.com). Built new 6-col URL-row FullsiteContentPerformanceTable: Page (hyperlinked title), Prompt Coverage, Citation Share, AI Referral Traffic, Organic Sessions, Engagement Rate. Each metric carries an inline comparison-period delta gated on compareIso !== null. Title and subtitle verbatim from Tina. Page label = UrlCitation.title, else labelFromPath(url), else raw URL. Row universe = urlCitations filtered to owned domains (urlJoinKey match against filteredOwnDomains) with citationCount > 0. Default sort Citation Share desc; pagination 10 with expand. Zero new fetches: per-URL prompt coverage from coverage.promptIdsByUrlKey (FB-035 Task 1), per-URL citation share from urlCitations + urlCitationsPrior (FB-035), per-path AI referral/organic/engagement from FB-035's aiReferredForPath/organicForPath/engagementRateForPath helpers. Lifted renderDelta helper to module scope in content-impact-tables.tsx so §B and §F reuse one copy. Dropped demoTopics/demoClusters/demoEngines/demoPositions/demoAiSessions arrays and enginesByDomain map from §F (all unused after the column shape change). Universal across clients. tsc clean. All 6 test files pass.
```

- [ ] **Step 4: Update status.md**

Open `docs/official-feedback/status.md`:

(a) Bump the commits-ahead count to current+3 (3 task commits) and append `+ FB-039` to the list of items in the "Active branch" paragraph.

(b) Replace the next-FB-ID line:
`- **Next FB ID:** **FB-039**.`
→
`- **Next FB ID:** **FB-040**.`

(c) Replace the bottom FB-ID line:
`FB IDs continue sequentially. **Next ID after FB-038 is FB-039.**`
→
`FB IDs continue sequentially. **Next ID after FB-039 is FB-040.**`

(d) In the Shipped FB log table, immediately above the FB-038 row, add:

```
| **FB-039** | Content Impact (content v1) | `official-feedback-content-impact-tab-content-v1` ([#77](https://github.com/Avenue-Z/avenue-z-reporting-v2/pull/77)) | (pending sha) | §F Fullsite Content Performance rebuilt per Tina ADD: dropped legacy 9-col domain-row table, added new 6-col URL-row FullsiteContentPerformanceTable (Page hyperlinked + Prompt Coverage + Citation Share + AI Referral Traffic + Organic Sessions + Engagement Rate, each with comparison-period delta). Verbatim new title and subtitle. Row universe = owned-domain cited URLs (urlJoinKey match against filteredOwnDomains, citationCount > 0). Default sort Citation Share desc, paginate 10. Page label = title, else labelFromPath, else raw URL. Compare-period gated deltas. Zero new fetches (reused FB-035 helpers + per-URL Peec data). Lifted renderDelta helper to module scope. Universal. tsc clean. |
```

- [ ] **Step 5: Em-dash sweep across FB-039 additions**

```
git diff --no-color HEAD~3 HEAD -- components/report-sections/peec-ai/content-impact-tables.tsx components/report-sections/peec-ai/content-impact.tsx docs/official-feedback/feedback-log.md docs/official-feedback/changelog.md docs/official-feedback/status.md | grep "^+" | grep "—"
```

Expected: empty. If anything appears, replace with commas or hyphens.

- [ ] **Step 6: Final tsc + 6-test sweep**

```
npx tsc --noEmit
DATABASE_URL=postgres://test:test@localhost/test npx tsx lib/ga4/client.test.ts
npx tsx lib/peec/bot-vs-human-scatter.test.ts
npx tsx lib/peec/slope-chart.test.ts
npx tsx lib/peec/url-citations.test.ts
npx tsx lib/peec/content-impact-synopsis.test.ts
npx tsx lib/ga4/content-derive.test.ts
```

Expected: tsc empty; all 6 tests print `all assertions passed`.

- [ ] **Step 7: Commit + push**

```bash
git add docs/official-feedback/feedback-log.md docs/official-feedback/changelog.md docs/official-feedback/status.md docs/superpowers/plans/2026-06-25-content-impact-fullsite-content-performance.md
git commit -m "FB-039 Task 3: docs (feedback-log + changelog + status + sheet row + plan archive)"
git push origin official-feedback-content-impact-tab-content-v1
```

- [ ] **Step 8: Lockstep check**

```
git status --short && git rev-parse HEAD && git rev-parse @{u}
```

Expected: clean tree, local SHA = remote SHA.

---

## Self-Review

**1. Spec coverage:**
- Title verbatim: ✅ Task 1 Step 2 (`<SectionCard title=...>`).
- Subtitle verbatim: ✅ Task 1 Step 2 (`<SectionCard description=...>`).
- Page (combine page title + hyperlinked URL): ✅ Task 1 Step 2 column 'pageTitle' renders `<a href={r.url}>{r.pageTitle}</a>`.
- Prompt Coverage (& Delta): ✅ Task 1 Step 2 column + Task 2 Step 2 computes value + delta + renderDelta('pp').
- Citation Share (& Delta): ✅ Task 1 column + Task 2 computes value + delta + renderDelta('pp').
- AI Referral Traffic (& Delta): ✅ Task 1 column + Task 2 computes value + delta + renderDelta('pct').
- Organic Sessions (& Delta): ✅ Task 1 column + Task 2 computes value + delta + renderDelta('pct').
- Engagement Rate (& Delta): ✅ Task 1 column + Task 2 computes value + delta + renderDelta('pp').

**2. Placeholder scan:** No TBD/TODO. Every code block is concrete. Task 2 Step 2 carries the full §F replacement block.

**3. Type consistency:** `FullsiteContentPerformanceRow` shape declared once in Task 1, consumed in Task 2 by the inline row construction. All field names match. The `renderDelta` helper's signature `(delta: number | null, mode: 'pp' | 'pct')` is identical to its current inline form in `PlannedContentPerformanceTable` — lifting it to module scope does not change call sites.

**Plan-side risk noted:** Task 1 Step 4 explicitly says tsc will fail mid-task because Task 2 hasn't run yet. The two commits ship together and the final Task 2 Step 4 tsc gate enforces correctness end-to-end. This is the same pattern FB-035 used when wiring multi-file changes.

**No spec gaps detected.**
