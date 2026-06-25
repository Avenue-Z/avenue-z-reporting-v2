# FB-041: Content Impact §H.2 Brand-Absent table — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse §H.2 (the "Where are competitors cited and we're absent?" table directly under the §H.1 Competitor Analysis ranking) from 9 columns to Tina's 4: Domain, Article (title text hyperlinked to URL), Citation Share with a percentage-point delta, Competitors Mentioned. Swap the sub-header to Tina's new copy. The SectionCard wrapper ("Competitor Analysis" title + subtitle from FB-040) and §H.1 are NOT modified.

**Architecture:** Zero new data fetches. Reuse `urlCitations` and `urlCitationsPrior` plus `citeByKeyPrior` + `totalCitationsCurrentRows` + `totalCitationsPriorRows`, which are already in scope at the top of the orchestrator. Citation Share for §H.2 mirrors the math used by §B Watched Pages at [content-impact.tsx:1138-1145](components/report-sections/peec-ai/content-impact.tsx:1138): `(citationCount / periodTotalCitations) * 100`, deltas gated on `compareIso !== null`. The Article column merges the prior `Article Title` + `URL` columns into a single hyperlinked cell using the exact `<a>` pattern from §B's Content Piece column at [content-impact-tables.tsx:146-156](components/report-sections/peec-ai/content-impact-tables.tsx:146).

**Tech Stack:** Next.js 15 App Router (RSC), TypeScript strict, Tailwind v4, `SortableTable` (internal), `renderDelta` (existing module-scope helper at [content-impact-tables.tsx:97](components/report-sections/peec-ai/content-impact-tables.tsx:97)).

## Global Constraints

- **Literal interpretation only.** Tina specified 4 columns; no extras. Tina specified one sub-header text; no rewording. Do not preserve a "Brand Mentioned" badge, "Opportunity Priority" pill, or "Suggested PR Angle" cell out of misplaced sympathy. They are dropped completely.
- **Compare-period gating.** Citation Share delta is `null` when `compareIso === null` OR when the prior-period total is 0 OR when this URL is absent from `citeByKeyPrior`. `renderDelta(null, 'pp')` already renders nothing, so no badge appears in any of those cases. No `0.0pp` ghost badges.
- **No em-dashes** in any added line of code, comment, copy, or commit message. Use commas, periods, or hyphens.
- **Truth-grounded.** When `citationsOk === false` (the `getUrlCitations` fetch rejected), Citation Share renders `--`, not `0%`. When `c.title` is null, the Article cell falls back to the URL as the link text — never `--`, because by definition every row in this table came from `urlCitations` and has a real URL.
- **No new fetches.** Reuse `urlCitations`, `urlCitationsPrior`, `citeByKeyPrior`, `totalCitationsCurrentRows`, `totalCitationsPriorRows`, `citationsOk`, all already in scope.
- **No demo fallbacks.** The previous §H.2 had `demoArticleTitles2` / `demoSlugs2` / `demoClusters2` / `demoCompetitorsAbsent` / `demoBrandMentioned` / `demoH2Rows` arrays gated on `calendarIsDemo`. All deleted. In demo mode `urlCitations` is `[]`, so the table will render the empty-message state — same pattern FB-040 applied to §H.1.
- **§H.1 untouched.** The IIFE at [content-impact.tsx:1354-1391](components/report-sections/peec-ai/content-impact.tsx:1354) (`Sub-view 1: Top Competitor Domains — AI Visibility / Citation Share / Prompt Coverage`) and the SectionCard title/description props at lines 1351-1352 must be byte-identical to BASE after this change. Do not touch them.
- **Tina's exact copy** (verbatim, no rewording):
  - Sub-header above the H.2 table: `Where are we absent when competitors are cited or mentioned?`
  - Column headers left to right: `Domain`, `Article`, `Citation Share`, `Competitors Mentioned`
- **Dead code deleted.** After the rewrite, the following must be removed completely (no `// removed` comments, no underscore-prefixed renames):
  - `TT.opportunityPriority` and `TT.suggestedPRAngle` entries from the TT block in `content-impact-tables.tsx`
  - The `editorialDomains` and `filteredEditorialDomains` derivations in `content-impact.tsx` (lines 449 and 496-502) — they were only used to seed the now-deleted §H.2 demo rows. Verify with grep that no other consumer references them before deleting.

## File Structure

Two files change. No new files.

- **`components/report-sections/peec-ai/content-impact-tables.tsx`** (~564 lines)
  - Redefine `CompetitorUrlsBrandAbsentRow` interface: 4 fields total — `domain: string`, `articleTitle: string | null` (display text — falls back to `url` when null), `url: string` (always present; row would not exist otherwise), `citationShare: number | null`, `citationShareDelta: number | null`, `competitorsMentioned: string | null`. Drop `promptCluster`, `citationCount`, `brandMentioned`, `opportunityPriority`, `suggestedPRAngle` fields.
  - Rewrite `CompetitorUrlsBrandAbsentTable` columns array: 4 columns. Article column uses the same `<a>` pattern as `PlannedContentPerformanceTable`'s Content Piece column. Citation Share appends `renderDelta(r.citationShareDelta, 'pp')`.
  - Rewrite the sub-header `<h4>` text to Tina's exact copy.
  - Delete `TT.opportunityPriority` and `TT.suggestedPRAngle` entries from the TT block.
- **`components/report-sections/peec-ai/content-impact.tsx`** (~1491 lines)
  - Rewrite the §H.2 IIFE at lines 1396-1496: delete all six demo arrays + `demoH2Rows` builder, delete the `calendarIsDemo ? demoH2Rows : ...` conditional, rebuild `h2Rows` directly from `competitorCitedUrls.map(...)` with the new row shape.
  - Delete `editorialDomains` (line 449) and `filteredEditorialDomains` (lines 496-502) after grep confirms they have no other consumer.

---

### Task 1: Redefine `CompetitorUrlsBrandAbsentRow` and rebuild `CompetitorUrlsBrandAbsentTable`

**Files:**
- Modify: `components/report-sections/peec-ai/content-impact-tables.tsx`

**Interfaces:**
- Consumes: existing `SortableTable`, `SortableColumn`, `renderDelta(delta, 'pp')`, `TT.aiCitations` (for Citation Share tooltip). No new TT entry needed; Competitors Mentioned column does not get a tooltip per the prior implementation.
- Produces: updated `CompetitorUrlsBrandAbsentRow` interface (6 fields total: `domain`, `articleTitle`, `url`, `citationShare`, `citationShareDelta`, `competitorsMentioned`) and `CompetitorUrlsBrandAbsentTable` component with 4 columns, consumed by `content-impact.tsx` in Task 2.

- [ ] **Step 1: Grep to confirm `TT.opportunityPriority`, `TT.suggestedPRAngle`, and the dropped row fields have no other consumer**

Run:
```
grep -rn "TT\.opportunityPriority\|TT\.suggestedPRAngle\|opportunityPriority\|suggestedPRAngle\|promptCluster\|brandMentioned" components/ lib/ 2>/dev/null
```
Expected: matches only inside `content-impact-tables.tsx` (the TT entries + column blocks in `CompetitorUrlsBrandAbsentTable`) and `content-impact.tsx` (the demo arrays + row builder + dropped fields inside the §H.2 IIFE, which Task 2 will delete). No other file should match. If a match appears outside these two files, stop and ask the controller — do not delete.

Note: `TT.themeCoverage` was already deleted in FB-040 — confirm by inspection it's not in the TT block before you start.

- [ ] **Step 2: Delete `TT.opportunityPriority` and `TT.suggestedPRAngle` entries**

In `components/report-sections/peec-ai/content-impact-tables.tsx`, locate lines 8-28 (the TT block — current state after FB-040):

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

Note: pre-existing em-dashes inside `aiBotActivity` and `recommendedAction` are NOT in your diff — leave them alone. Two changes only:
1. Delete the `opportunityPriority` line entirely.
2. Delete the `suggestedPRAngle` line entirely.

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
  calendarField:      'From the content calendar sheet. (Avenue Z internal.)',
}
```

- [ ] **Step 3: Redefine the `CompetitorUrlsBrandAbsentRow` interface and rebuild `CompetitorUrlsBrandAbsentTable`**

In `components/report-sections/peec-ai/content-impact-tables.tsx`, locate the §H.2 block at lines 472-573 (current state after FB-040 — line numbers may have shifted slightly; locate by the `// 7. Top Competitor / Corporate URLs` comment):

```ts
// ═════════════════════════════════════════════════════════════════════════════
// 7. Top Competitor / Corporate URLs Where Brand is Absent (Section H.2)
// ═════════════════════════════════════════════════════════════════════════════
export interface CompetitorUrlsBrandAbsentRow {
  domain: string
  articleTitle: string | null
  url: string | null
  promptCluster: string | null
  citationCount: number
  competitorsMentioned: string | null
  brandMentioned: string | null  // 'Yes' | 'No' | null
  opportunityPriority: string    // 'High' | 'Medium' | 'Low' | 'Review'
  suggestedPRAngle: string
}

export function CompetitorUrlsBrandAbsentTable({
  rows,
  emptyMessage,
}: {
  rows: CompetitorUrlsBrandAbsentRow[]
  emptyMessage: string
}) {
  const columns: SortableColumn<CompetitorUrlsBrandAbsentRow>[] = [
    {
      key: 'domain', label: 'Domain',
      accessor: (r) => r.domain,
      render: (r) => <span className="font-medium text-white">{r.domain}</span>,
    },
    {
      key: 'articleTitle', label: 'Article Title',
      accessor: (r) => r.articleTitle ?? '',
      render: (r) => r.articleTitle
        ? <span className="block max-w-[180px] truncate text-white/70" title={r.articleTitle}>{r.articleTitle}</span>
        : <span className="text-white/20">--</span>,
    },
    {
      key: 'url', label: 'URL',
      accessor: (r) => r.url ?? '',
      render: (r) => r.url
        ? <span className="block max-w-[180px] truncate font-mono text-[10px] text-white/50" title={r.url}>{r.url}</span>
        : <span className="text-white/20">--</span>,
    },
    {
      key: 'promptCluster', label: 'Prompt Cluster',
      accessor: (r) => r.promptCluster ?? '',
      render: (r) => r.promptCluster
        ? <span className="text-white/60">{r.promptCluster}</span>
        : <span className="text-white/40">--</span>,
    },
    {
      key: 'citationCount', label: 'Citation Count', align: 'right',
      tooltip: TT.aiCitations,
      accessor: (r) => r.citationCount,
      render: (r) => <span className="tabular-nums text-white">{r.citationCount.toFixed(1)}%</span>,
    },
    {
      key: 'competitorsMentioned', label: 'Competitors Mentioned',
      accessor: (r) => r.competitorsMentioned ?? '',
      render: (r) => r.competitorsMentioned
        ? <span className="text-white/70">{r.competitorsMentioned}</span>
        : <span className="text-white/20">--</span>,
    },
    {
      key: 'brandMentioned', label: 'Brand Mentioned',
      accessor: (r) => r.brandMentioned ?? '',
      render: (r) => r.brandMentioned
        ? <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', r.brandMentioned === 'No' ? 'bg-[#FF4444]/10 text-[#FF4444]' : 'bg-[#60FF80]/10 text-[#60FF80]')}>{r.brandMentioned}</span>
        : <span className="text-white/40">--</span>,
    },
    {
      key: 'opportunityPriority', label: 'Opportunity Priority',
      tooltip: TT.opportunityPriority,
      accessor: (r) => r.opportunityPriority,
      render: (r) => (
        <span className="rounded-full bg-[#FFFC60]/10 px-2 py-0.5 text-[10px] font-semibold text-[#FFFC60]">
          {r.opportunityPriority}
        </span>
      ),
    },
    {
      key: 'suggestedPRAngle', label: 'Suggested PR Angle',
      tooltip: TT.suggestedPRAngle,
      accessor: (r) => r.suggestedPRAngle,
      render: (r) => <span className="block max-w-[200px] text-[11px] text-white/50">{r.suggestedPRAngle}</span>,
    },
  ]

  return (
    <div className="flex flex-col gap-3">
      <h4 className="text-xs font-bold text-white/60">Where are competitors cited and we&apos;re absent?</h4>
      <SortableTable
        columns={columns}
        rows={rows}
        rowKey={(r, i) => `${r.domain}-${i}`}
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
// 7. Top Competitor / Corporate URLs Where Brand is Absent (Section H.2)
// ═════════════════════════════════════════════════════════════════════════════
export interface CompetitorUrlsBrandAbsentRow {
  domain: string
  articleTitle: string | null  // display text for the Article cell; falls back to url when null
  url: string                  // always present, always hyperlinked
  citationShare: number | null
  citationShareDelta: number | null
  competitorsMentioned: string | null
}

export function CompetitorUrlsBrandAbsentTable({
  rows,
  emptyMessage,
}: {
  rows: CompetitorUrlsBrandAbsentRow[]
  emptyMessage: string
}) {
  const columns: SortableColumn<CompetitorUrlsBrandAbsentRow>[] = [
    {
      key: 'domain', label: 'Domain',
      accessor: (r) => r.domain,
      render: (r) => <span className="font-medium text-white">{r.domain}</span>,
    },
    {
      key: 'article', label: 'Article',
      accessor: (r) => r.articleTitle ?? r.url,
      render: (r) => {
        const text = r.articleTitle ?? r.url
        return (
          <a
            href={r.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block max-w-[220px] truncate text-white/80 underline-offset-2 hover:underline"
            title={`${text} → ${r.url}`}
          >
            {text}
          </a>
        )
      },
    },
    {
      key: 'citationShare', label: 'Citation Share', align: 'right',
      tooltip: TT.aiCitations,
      accessor: (r) => r.citationShare ?? -1,
      render: (r) => (
        <span className="tabular-nums text-white">
          {r.citationShare !== null ? `${r.citationShare.toFixed(1)}%` : '--'}
          {renderDelta(r.citationShareDelta, 'pp')}
        </span>
      ),
    },
    {
      key: 'competitorsMentioned', label: 'Competitors Mentioned',
      accessor: (r) => r.competitorsMentioned ?? '',
      render: (r) => r.competitorsMentioned
        ? <span className="text-white/70">{r.competitorsMentioned}</span>
        : <span className="text-white/20">--</span>,
    },
  ]

  return (
    <div className="flex flex-col gap-3">
      <h4 className="text-xs font-bold text-white/60">Where are we absent when competitors are cited or mentioned?</h4>
      <SortableTable
        columns={columns}
        rows={rows}
        rowKey={(r, i) => `${r.domain}-${i}`}
        initialPageSize={10}
        emptyMessage={emptyMessage}
      />
    </div>
  )
}
```

Key changes (line-by-line):
- Interface: drop `promptCluster`, `citationCount`, `brandMentioned`, `opportunityPriority`, `suggestedPRAngle`. Add `citationShare: number | null`, `citationShareDelta: number | null`. `url` becomes non-nullable (every row in this table has a URL by definition — it came from `urlCitations`). `articleTitle` stays `string | null` because Peec's `c.title` can be null.
- Columns: 4 total, in order — Domain, Article, Citation Share, Competitors Mentioned.
- Article column: combines the old Article Title + URL columns into one. Renders a real `<a>` tag with the exact pattern from `PlannedContentPerformanceTable`'s Content Piece column at lines 146-156 (`target="_blank"`, `rel="noopener noreferrer"`, `block max-w-[220px] truncate`, `underline-offset-2 hover:underline`, title attribute showing both display text + URL). Display text = `articleTitle ?? url` so a missing title gracefully falls back to the URL itself.
- Citation Share column: renders `${value.toFixed(1)}%` when non-null, `--` when null (covers `citationsOk === false` and any future null path), followed by `renderDelta(citationShareDelta, 'pp')` which renders nothing when delta is null. Accessor returns `-1` for null so null rows sort to the bottom on ascending Citation Share, matching the §H.1 pattern from FB-040.
- Competitors Mentioned column: unchanged from before (display text-white/70 when present, `--` when null).
- Sub-header text replaced verbatim with Tina's copy.
- `rowKey={(r, i) => \`${r.domain}-${i}\`}` preserved — a single domain can have multiple rows (one per URL), so we need the index to keep keys unique.
- `initialPageSize={10}` preserved.

- [ ] **Step 4: Run tsc to check the file**

Run:
```
npx tsc --noEmit
```
Expected: errors confined to `content-impact.tsx` (which Task 2 fixes). Specifically, the `Promise.allSettled` destructure assignment shape is unchanged, but the §H.2 IIFE still references the old row shape (`promptCluster`, `citationCount`, etc.). That is expected. If any error originates inside `content-impact-tables.tsx`, that is a bug in your edit — fix it.

- [ ] **Step 5: Do not commit yet**

Hold off on `git commit`. Task 2 modifies the orchestrator and commits both files together so the branch never lands a type-broken intermediate state.

---

### Task 2: Rewrite the §H.2 IIFE in `content-impact.tsx` and delete now-dead `editorialDomains` / `filteredEditorialDomains`

**Files:**
- Modify: `components/report-sections/peec-ai/content-impact.tsx`

**Interfaces:**
- Consumes: updated `CompetitorUrlsBrandAbsentRow` from Task 1 (fields: `domain`, `articleTitle`, `url`, `citationShare`, `citationShareDelta`, `competitorsMentioned`).
- Consumes: existing in-scope variables (verified):
  - `urlCitations: UrlCitation[]` at [line 369](components/report-sections/peec-ai/content-impact.tsx:369)
  - `citeByKeyPrior: Map<string, UrlCitation>` at [line 864](components/report-sections/peec-ai/content-impact.tsx:864)
  - `totalCitationsCurrentRows: number` at [line 862](components/report-sections/peec-ai/content-impact.tsx:862)
  - `totalCitationsPriorRows: number` at [line 863](components/report-sections/peec-ai/content-impact.tsx:863)
  - `citationsOk: boolean` at [line 373](components/report-sections/peec-ai/content-impact.tsx:373)
  - `compareIso: string | null` (already in scope; FB-035 wired)
- `UrlCitation` shape (from `lib/peec/url-citations.ts`): `{ url: string; urlKey: string; domain: string; title: string | null; citationCount: number; competitorBrandNames: string[]; mentionsYourBrand: boolean; ...other fields }`. Reuse `c.url`, `c.urlKey`, `c.domain`, `c.title`, `c.citationCount`, `c.competitorBrandNames`, `c.mentionsYourBrand`.
- Produces: no new exports. Single commit landing both Task 1 + Task 2 file changes.

- [ ] **Step 1: Grep to confirm `editorialDomains` and `filteredEditorialDomains` have no other consumer**

Run:
```
grep -n "editorialDomains\|filteredEditorialDomains" components/report-sections/peec-ai/content-impact.tsx
```
Expected output:
- Line ~449: `const editorialDomains = (peecData?.topDomains ?? []).filter(d => d.type === 'Editorial')`
- Line ~496: `const filteredEditorialDomains: TopDomain[] = peecData?.domainCitationsByModel`
- Line ~498: `editorialDomains.map(d => ({ ...d, citationCount: d.citationRate })),`
- Line ~502: `: editorialDomains`
- Line ~1447 (or wherever the §H.2 demo block currently lives): `const demoH2Rows: CompetitorUrlsBrandAbsentRow[] = filteredEditorialDomains.slice(0, 10).map((d, i) => {`

These five matches are all related to the §H.2 demo path. After this task deletes both the demo path AND `editorialDomains` / `filteredEditorialDomains`, the count should drop to 0. If any other file or any other location in `content-impact.tsx` references either symbol, do NOT delete — flag back to the controller.

Then run:
```
grep -rn "editorialDomains\|filteredEditorialDomains" components/ lib/ 2>/dev/null | grep -v "content-impact.tsx"
```
Expected: no matches. If any match exists outside `content-impact.tsx`, stop and ask.

- [ ] **Step 2: Delete `editorialDomains` and `filteredEditorialDomains`**

In `components/report-sections/peec-ai/content-impact.tsx`, locate line 449:

```ts
  const ownDomains        = (peecData?.topDomains ?? []).filter(d => d.type === 'Own')
  const competitorDomains = (peecData?.topDomains ?? []).filter(d => d.type === 'Competitor')
  const editorialDomains  = (peecData?.topDomains ?? []).filter(d => d.type === 'Editorial')
```

Replace with:

```ts
  const ownDomains        = (peecData?.topDomains ?? []).filter(d => d.type === 'Own')
  const competitorDomains = (peecData?.topDomains ?? []).filter(d => d.type === 'Competitor')
```

(Delete the `editorialDomains` line only. The `ownDomains` and `competitorDomains` lines stay unchanged.)

Then locate lines 496-502 (or wherever the `filteredEditorialDomains` block lives — line numbers may have shifted; locate by the variable name):

```ts
  const filteredEditorialDomains: TopDomain[] = peecData?.domainCitationsByModel
    ? filterRowsByModels(
        editorialDomains.map(d => ({ ...d, citationCount: d.citationRate })),
        peecData.domainCitationsByModel,
        selectedModels,
      ).map(d => ({ ...d, citationRate: d.citationCount }))
    : editorialDomains
```

Delete this entire block. (The blank line above/below is fine to preserve; just remove the const declaration cleanly.)

- [ ] **Step 3: Rewrite the §H.2 IIFE — delete the demo block, rebuild `h2Rows` directly from real data**

Locate the §H.2 IIFE — it currently spans roughly lines 1396-1496 (in your local copy, locate by the comment `Sub-view 2: Brand-Absent Editorial URLs`). The current block (everything from the `{(() => {` opening through the matching `})()}` closing) is:

```tsx
        {/* Sub-view 2: Brand-Absent Editorial URLs */}
        {(() => {
          const demoArticleTitles2 = [
            'How AI is rewriting brand discovery',
            'The 2026 PR-to-LLM playbook',
            'Why brand authority matters more than backlinks',
            'Inside the AEO arms race',
            'Earned media in the age of generative AI',
            'How Fortune 500s rank inside ChatGPT',
            'The new rules of editorial citation',
            'Building defensible brand share-of-voice',
            'AI-first brand strategy for 2026',
            'Decoding citation patterns across LLMs',
          ]
          const demoSlugs2 = [
            '/insights/ai-brand-discovery',
            '/guides/pr-llm-playbook-2026',
            '/analysis/brand-authority-vs-links',
            '/features/aeo-arms-race',
            '/columns/earned-media-genai',
            '/data/fortune-500-chatgpt-rankings',
            '/op-ed/new-editorial-citation-rules',
            '/research/defensible-share-of-voice',
            '/strategy/ai-first-brand-2026',
            '/data/citation-patterns-llms',
          ]
          const demoClusters2 = [
            'Brand authority',
            'Buying-stage research',
            'Reputation / trust',
            'Brand authority',
            'Industry expertise',
            'Competitive comparison',
            'Reputation / trust',
            'Buying-stage research',
            'Brand authority',
            'Industry expertise',
          ]
          const demoCompetitorsAbsent = [
            ['Ogilvy', 'Edelman'],
            ['Weber Shandwick'],
            ['BCW', 'FleishmanHillard'],
            ['Edelman', 'Ogilvy', 'Weber Shandwick'],
            ['MSL'],
            ['Edelman'],
            ['Ogilvy', 'BCW'],
            ['Weber Shandwick', 'MSL'],
            ['Edelman', 'Ogilvy'],
            ['FleishmanHillard'],
          ]
          const demoBrandMentioned = ['No', 'No', 'No', 'No', 'No', 'No', 'No', 'No', 'No', 'No']
          const demoH2Rows: CompetitorUrlsBrandAbsentRow[] = filteredEditorialDomains.slice(0, 10).map((d, i) => {
            const title   = demoArticleTitles2[i % demoArticleTitles2.length]
            const slug    = demoSlugs2[i % demoSlugs2.length]
            const url     = `https://${d.domain}${slug}`
            const cluster = demoClusters2[i % demoClusters2.length]
            const comps   = demoCompetitorsAbsent[i % demoCompetitorsAbsent.length]
            const brand   = demoBrandMentioned[i % demoBrandMentioned.length]
            return {
              domain: d.domain,
              articleTitle: title,
              url,
              promptCluster: cluster,
              citationCount: d.citationRate,
              competitorsMentioned: comps.join(', '),
              brandMentioned: brand,
              opportunityPriority: 'Review',
              suggestedPRAngle: `Secure coverage on ${d.domain} to displace competitor citations`,
            }
          })

          const competitorCitedUrls = urlCitations
            .filter((c) => !c.mentionsYourBrand && c.competitorBrandNames.length > 0)
            .sort((a, b) => b.citationCount - a.citationCount)
            .slice(0, 10)

          const h2Rows: CompetitorUrlsBrandAbsentRow[] = calendarIsDemo
            ? demoH2Rows
            : competitorCitedUrls.map((c) => ({
                domain: c.domain,
                articleTitle: c.title,
                url: c.url,
                // Themes (tags) this competitor domain is cited under, joined.
                // "None" when coverage loaded but no theme; -- only when unavailable.
                promptCluster: coverageAvailable ? (domainTagNames(coverage, c.domain).join(', ') || 'None') : null,
                citationCount: c.citationCount,
                competitorsMentioned: c.competitorBrandNames.join(', ') || null,
                brandMentioned: 'No',
                opportunityPriority: 'Review',
                suggestedPRAngle: `Secure coverage on ${c.domain} to displace competitor citations`,
              }))

          return (
            <div className="flex flex-col gap-3">
              <CompetitorUrlsBrandAbsentTable
                rows={h2Rows}
                emptyMessage="No editorial domain data from Peec AI"
              />
            </div>
          )
        })()}
```

Replace the entire block above with the following:

```tsx
        {/* Sub-view 2: Brand-Absent Competitor URLs */}
        {(() => {
          // Live source only. `urlCitations` is [] in demo mode (see line ~426),
          // so demo renders the empty state. Citation Share math mirrors §B
          // Watched Pages: (urlCitationCount / periodTotalCitations) * 100,
          // delta = current pp - prior pp, gated on compareIso !== null AND
          // the row appearing in citeByKeyPrior with a non-zero prior total.
          const competitorCitedUrls = urlCitations
            .filter((c) => !c.mentionsYourBrand && c.competitorBrandNames.length > 0)
            .sort((a, b) => b.citationCount - a.citationCount)
            .slice(0, 10)

          const h2Rows: CompetitorUrlsBrandAbsentRow[] = competitorCitedUrls.map((c) => {
            const cite = c.citationCount
            const citePrior = citeByKeyPrior.get(c.urlKey)?.citationCount ?? null
            const citationShare = (citationsOk && totalCitationsCurrentRows > 0)
              ? (cite / totalCitationsCurrentRows) * 100
              : null
            const citationSharePrior = (compareIso && citePrior !== null && totalCitationsPriorRows > 0)
              ? (citePrior / totalCitationsPriorRows) * 100
              : null
            const citationShareDelta = (citationShare !== null && citationSharePrior !== null)
              ? citationShare - citationSharePrior
              : null
            return {
              domain: c.domain,
              articleTitle: c.title,
              url: c.url,
              citationShare,
              citationShareDelta,
              competitorsMentioned: c.competitorBrandNames.join(', ') || null,
            }
          })

          return (
            <div className="flex flex-col gap-3">
              <CompetitorUrlsBrandAbsentTable
                rows={h2Rows}
                emptyMessage="No competitor citation data available from Peec AI"
              />
            </div>
          )
        })()}
```

Key changes:
- Six demo arrays deleted (`demoArticleTitles2`, `demoSlugs2`, `demoClusters2`, `demoCompetitorsAbsent`, `demoBrandMentioned`, `demoH2Rows`).
- `calendarIsDemo ? demoH2Rows : ...` conditional removed — single code path against real `urlCitations`.
- Row builder produces the new 6-field shape (`domain`, `articleTitle`, `url`, `citationShare`, `citationShareDelta`, `competitorsMentioned`). The dropped fields (`promptCluster`, `citationCount`, `brandMentioned`, `opportunityPriority`, `suggestedPRAngle`) are gone.
- Citation Share math is the §B pattern: numerator = `c.citationCount`, denominator = `totalCitationsCurrentRows`. Result × 100 to render as a percent. Null when `citationsOk === false` or denominator is 0.
- Delta math: prior share computed the same way against `citeByKeyPrior` + `totalCitationsPriorRows`, gated on `compareIso !== null`. Delta is `null` when either side is null, which `renderDelta` renders as nothing.
- Empty-message text changed from `"No editorial domain data from Peec AI"` to `"No competitor citation data available from Peec AI"` — accurate given the live filter (`!mentionsYourBrand && competitorBrandNames.length > 0`) is competitor-cited URLs, not editorial domains.
- Comment block on the IIFE updated to describe the live-only pattern.

- [ ] **Step 4: Run tsc to verify both files type-check together**

Run:
```
npx tsc --noEmit
```
Expected: zero output. If errors remain, fix before continuing. Common pitfalls:
- A leftover reference to `editorialDomains`, `filteredEditorialDomains`, `demoH2Rows`, etc. (the grep in Step 1 should have caught these — if surfaces now, re-grep with a wider scope and finish removal).
- A leftover reference to dropped row fields (`promptCluster`, `brandMentioned`, etc.) elsewhere in the file. Grep `grep -n "promptCluster\|brandMentioned\|opportunityPriority\|suggestedPRAngle" components/report-sections/peec-ai/content-impact.tsx` to confirm zero matches.

- [ ] **Step 5: Sanity-check no em-dashes were introduced in the combined Task 1+2 diff**

Run:
```
git diff -U0 components/report-sections/peec-ai/content-impact.tsx components/report-sections/peec-ai/content-impact-tables.tsx | grep -E '^\+' | grep -- '—' || echo "OK: no new em-dashes"
```
Expected: `OK: no new em-dashes`. The pre-existing em-dashes in `TT.aiBotActivity` / `TT.recommendedAction` are not in the added-line set and do not register.

- [ ] **Step 6: Sanity-check that §H.1 is byte-identical to BASE**

Run:
```
git diff f944668..HEAD -- components/report-sections/peec-ai/content-impact.tsx | grep -A2 "Sub-view 1\|Competitor Analysis\|SectionCard"
```

(Adjust `f944668` to the actual BASE of FB-041 if you have it from the controller — the BASE for this task is the HEAD of FB-040, which is the SHA of the docs commit + plan archive on the branch immediately before your work starts.)

This is a smoke check, not a hard gate — what matters is that the §H.1 IIFE block (the `Sub-view 1` IIFE and the SectionCard `title=` / `description=` props) does not appear in your Task 2 diff. If it does, you accidentally edited it. Revert that specific edit and re-run tsc.

- [ ] **Step 7: Commit Tasks 1 + 2 together**

```
git add components/report-sections/peec-ai/content-impact.tsx components/report-sections/peec-ai/content-impact-tables.tsx
git commit -m "FB-041: §H.2 Brand-Absent table collapsed to 4 cols: Domain, Article (hyperlinked), Citation Share + Δ, Competitors Mentioned. Sub-header swap. Dead code dropped."
```

Do NOT push. Task 3 ships docs + push.

---

### Task 3: Docs (feedback-log + changelog + status.md) + verify sweep + push + Sheet Column F text

**Files:**
- Modify: `docs/official-feedback/feedback-log.md`
- Modify: `docs/official-feedback/changelog.md`
- Modify: `docs/official-feedback/status.md`

**Interfaces:**
- Consumes: existing entries in these files. Append FB-041 entry to feedback-log, prepend FB-041 entry to changelog, bump commits-ahead + next-FB-ID in status.
- Produces: paste-ready Sheet Column F text in the implementer's report, forwarded by the controller to Thomas at FB close.

- [ ] **Step 1: Read each doc to learn the current format**

Run:
```
tail -50 docs/official-feedback/feedback-log.md
head -40 docs/official-feedback/changelog.md
cat docs/official-feedback/status.md
```
Expected: feedback-log has FB-040 entry at the bottom (`## FB-040 — Content Impact §H Competitor Analysis sub-view 1`), changelog has FB-040 entry at the top, status.md says commits-ahead = 46 (or whatever the current count is after FB-040) and next-FB-ID = FB-041. Match existing format exactly.

- [ ] **Step 2: Append FB-041 entry to `docs/official-feedback/feedback-log.md`**

Append at the bottom (after the FB-040 block):

```markdown
## FB-041 — Content Impact §H Competitor Analysis sub-view 2

**Tab:** Content Impact
**Section:** §H Competitor Analysis (sub-view 2: brand-absent competitor URLs)
**Tina's ask:**
- New chart sub-header: `Where are we absent when competitors are cited or mentioned?`
- New columns (4 total): Domain, Article (combine Title + hyperlink URL), Citation Share (& Delta), Competitors Mentioned

**Shipped:**
- §H.2 `CompetitorUrlsBrandAbsentTable` collapsed from 9 columns to 4. Domain unchanged. Article column merges the old `Article Title` + `URL` columns into a single hyperlinked cell (title text falls back to URL when null, opens in a new tab, mirrors the `<a>` pattern from §B Watched Pages Content Piece column). Citation Share is computed live as `(c.citationCount / totalCitationsCurrentRows) * 100` with a percentage-point delta against the prior period via `citeByKeyPrior`. Competitors Mentioned unchanged.
- Dropped columns: Article Title (merged), URL (merged), Prompt Cluster, Citation Count (replaced by Citation Share), Brand Mentioned, Opportunity Priority, Suggested PR Angle.
- Citation Share math also fixes a pre-existing display bug: the prior `Citation Count` column rendered raw Peec `citation_count` with a `%` suffix (e.g. "3445.0%" for a single URL). Citation Share is the correct share-of-period denominator and now displays sensible percentages.
- Delta gates on `compareIso !== null` (FB-034 hotfix #2 pattern). When compare is off, no badge renders.
- Dead code dropped: `TT.opportunityPriority`, `TT.suggestedPRAngle`, `editorialDomains` derivation, `filteredEditorialDomains` derivation, six §H.2 demo arrays (`demoArticleTitles2`, `demoSlugs2`, `demoClusters2`, `demoCompetitorsAbsent`, `demoBrandMentioned`, `demoH2Rows`).
- §H.1 (Competitor Analysis ranking, shipped in FB-040) and the SectionCard wrapper title/subtitle are byte-identical to BASE.
- Zero new Peec or GA4 fetches.

**Files:** `components/report-sections/peec-ai/content-impact.tsx`, `components/report-sections/peec-ai/content-impact-tables.tsx`
```

- [ ] **Step 3: Prepend FB-041 to `docs/official-feedback/changelog.md`**

Prepend immediately under the top-of-file header (above the FB-040 entry):

```markdown
## FB-041 — §H.2 Brand-Absent table (Content Impact)
- Collapsed §H.2 from 9 cols to 4: Domain, Article (title hyperlinked to URL), Citation Share (+Δ), Competitors Mentioned.
- Article column merges the old Article Title + URL cols using the §B Content Piece anchor pattern.
- Citation Share replaces Citation Count: `(c.citationCount / totalCitationsCurrentRows) * 100` with a pp delta, gated on compare period. Fixes a prior display bug that rendered raw counts with a `%` suffix.
- Sub-header swapped to Tina's verbatim copy. Dropped Prompt Cluster, Brand Mentioned, Opportunity Priority, Suggested PR Angle.
- Dead code dropped: `TT.opportunityPriority`, `TT.suggestedPRAngle`, `editorialDomains`, `filteredEditorialDomains`, six §H.2 demo arrays.
- §H.1 and the SectionCard wrapper untouched.
```

- [ ] **Step 4: Bump `docs/official-feedback/status.md`**

Open `docs/official-feedback/status.md`. Two edits:
1. Bump the commits-ahead count by 2 (one for the code commit at end of Task 2, one for the docs commit at end of Task 3). FB-040 closed at 46 commits ahead (note: status.md was already off by one then due to the plan-archive commit — match whatever the file currently says +2). If you also archive this plan in Task 3, bump by 3 instead.
2. Bump the next-FB ID from `FB-041` to `FB-042`.

Show the implementer's diff in the report so the controller can verify before push.

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
Expected: tsc empty; every test prints `all assertions passed` (the content-impact-synopsis test prints two lines — `Task 1 regression assertion passed.` and `all Task 2 validator assertions passed.`). If any test fails, stop and report — do not push.

- [ ] **Step 6: Commit docs**

Stage docs files, then add the plan archive in the same commit (matches the FB-040 + FB-039 pattern of shipping the plan alongside the FB):

```
git add docs/official-feedback/feedback-log.md docs/official-feedback/changelog.md docs/official-feedback/status.md docs/superpowers/plans/2026-06-25-content-impact-competitor-analysis-h2.md
git commit -m "FB-041 docs: feedback-log + changelog + status.md bump + plan archive"
```

- [ ] **Step 7: Push to origin**

```
git push origin official-feedback-content-impact-tab-content-v1
```
Expected: push succeeds, two new commits on remote (`FB-041:` code commit and `FB-041 docs:` docs+plan commit).

- [ ] **Step 8: Verify final lockstep**

Run:
```
git rev-parse HEAD && git rev-parse @{u} && git status --short
```
Expected: local SHA == remote SHA, clean working tree.

- [ ] **Step 9: Produce the Sheet Column F text for Tina**

Surface this paste-ready text in the Task 3 implementer report so the controller forwards it to Thomas:

| Column | Value |
|---|---|
| Tab | Content Impact |
| Your ask | §H.2 (the table under Competitor Analysis): 4 columns only — Domain, Article (title + hyperlink combined), Citation Share with change, Competitors Mentioned. Sub-header reads "Where are we absent when competitors are cited or mentioned?". |
| What shipped | Done. The table now shows four columns: Domain, Article (the article title is the link itself, opens in a new tab), Citation Share (with a percentage-point change when a comparison period is on), and Competitors Mentioned. Removed Prompt Cluster, Brand Mentioned, Opportunity Priority, and Suggested PR Angle. Citation Share now shows the correct share-of-period percentage. The Competitor Analysis ranking table directly above was not touched. |

---

## Self-Review

**1. Spec coverage**

| Tina's ask | Task / Step |
|---|---|
| New chart sub-header `Where are we absent when competitors are cited or mentioned?` | Task 1 Step 3 (`<h4>` text in `CompetitorUrlsBrandAbsentTable`) |
| New column `Domain` | Task 1 Step 3 (column definition) + Task 2 Step 3 (row builder) |
| New column `Article` (combine Title + hyperlink URL) | Task 1 Step 3 (Article column with `<a>` tag mirroring §B Content Piece pattern, display text = `articleTitle ?? url`) + Task 2 Step 3 (`articleTitle: c.title`, `url: c.url`) |
| New column `Citation Share` with delta | Task 1 Step 3 (column appends `renderDelta(r.citationShareDelta, 'pp')`) + Task 2 Step 3 (Citation Share + delta math mirroring §B at line 1138) |
| New column `Competitors Mentioned` | Task 1 Step 3 (column unchanged from prior implementation) + Task 2 Step 3 (`competitorBrandNames.join(', ')` unchanged from prior) |
| (Implicit) drop Article Title col | Merged into Article column (Task 1 Step 3) |
| (Implicit) drop URL col | Merged into Article column (Task 1 Step 3) |
| (Implicit) drop Prompt Cluster col | Task 1 Step 3 (column dropped from columns array) |
| (Implicit) drop Brand Mentioned col | Task 1 Step 3 (column dropped) |
| (Implicit) drop Opportunity Priority col | Task 1 Step 3 (column dropped) + Task 1 Step 2 (`TT.opportunityPriority` deleted) |
| (Implicit) drop Suggested PR Angle col | Task 1 Step 3 (column dropped) + Task 1 Step 2 (`TT.suggestedPRAngle` deleted) |
| §H.1 + SectionCard wrapper untouched | Explicit constraint; Task 2 Step 6 includes a smoke check confirming the §H.1 IIFE does not appear in the diff |

All Tina items covered. The "(implicit)" drops are the natural consequence of moving from the prior 9-column table to Tina's 4-column spec — Tina's column list defines what stays; everything else goes.

**2. Placeholder scan**

Searched the plan for TBD / TODO / "fill in" / "implement later" / "similar to Task N" / "appropriate handling" / type-name drift. Every code block is complete and inline. The only "locate by string" instructions (the `// 7. Top Competitor` comment, the `Sub-view 2` comment) are deliberate — line numbers have shifted across this branch (FB-040 inserted/deleted lines in both files), so anchoring to a unique string is more robust than hardcoded line ranges.

**3. Type consistency**

| Field | Task 1 | Task 2 |
|---|---|---|
| `domain: string` | declared in row interface | populated from `c.domain` |
| `articleTitle: string \| null` | declared; falls back to `url` when null in Article column render | populated from `c.title` (which is `string \| null` per `UrlCitation`) |
| `url: string` | declared non-nullable (every row has a URL) | populated from `c.url` (always present on `UrlCitation` rows) |
| `citationShare: number \| null` | declared; renders `--` when null | computed `(cite / totalCitationsCurrentRows) * 100` or `null` |
| `citationShareDelta: number \| null` | declared; passes through `renderDelta` | computed `citationShare - citationSharePrior` or `null` |
| `competitorsMentioned: string \| null` | declared; renders `--` when null | populated from `c.competitorBrandNames.join(', ') || null` |

All names line up exactly between Task 1 and Task 2.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-25-content-impact-competitor-analysis-h2.md`. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, task review after each, fast iteration. Required for this branch's working rules.
2. **Inline Execution** — execute tasks in this session with checkpoints.

Which approach?
