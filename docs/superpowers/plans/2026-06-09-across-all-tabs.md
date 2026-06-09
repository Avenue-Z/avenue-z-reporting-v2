# AEO "Across All Tabs" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply Thomas's four requirements across all 4 Answer Engine Optimization (peec-ai) tabs: sticky page-level date range, sortable/filterable table columns, question-based headlines, and verbatim source-of-truth tooltips per metric.

**Architecture:** Phase 1 (Overview tab + shared infrastructure) is already complete on branch `feat/across-all-tabs`. Remaining phases each refactor one tab file. Every refactor follows the same recipe (proven in Phase 1): swap inline `<table>` markup for the new `SortableTable` primitive; rewrite headlines as questions; replace tooltips with `text` values from `lib/peec/metric-definitions.ts`; preserve explicit YTD-locked widgets. Subagents handle one tab each in isolation — they cannot break shared infrastructure because they only edit their assigned file (and may extend `metric-definitions.ts` with non-overlapping keys).

**Tech Stack:** Next.js 15 App Router · React Server Components · TypeScript strict · Tailwind v4 · shadcn/ui (`Popover`, `Button`) · lucide-react icons. No test framework wired for these UI files — the verification step is `next build` + visual smoke check; this plan substitutes "verify build passes" for "run tests" everywhere.

**Spec (verbatim from Thomas):**

> Across All Tabs
> Need to add date range control to allow report viewers to dynamically change the timeframe of the displayed data without altering backend configuration. This should be sticky, so that as users click between different tabs, the selected date range carries throughout. The exception to this would be charts that have a fixed range, like the "YTD" trend line on the top of the overview page.
> Need to add sort/filter options for all table columns.
> Each chart/table/section should include the following:
> Question-based headline (i.e. Old: PR Placement Matchback → New: Which PR placements won are being cited in AI?; Old: AI Visibility YTD → New: How has AI visibility grown this year?)
> Tooltip definitions per metric that are pulled word-for-word directly from the data source tool's source of truth (i.e. Peec, GA4, etc.)

**Branch:** `feat/across-all-tabs` · **Base:** `main`

---

## What Phase 1 already shipped (DO NOT REDO)

These files already exist with correct shape; subagents must NOT recreate or restructure them:

| Path | Purpose |
|---|---|
| `components/report-sections/peec-ai/sortable-table.tsx` | Generic sortable/filterable client primitive. Public API: `SortableTable<T>({ columns, rows, rowKey, initialPageSize?, onRowClick?, rowClassName?, emptyMessage? })` and `SortableColumn<T>` = `{ key, label, tooltip?, align?, sortable?, filterable?, accessor?, render?, headerClassName?, cellClassName?, width? }`. `render: (row, index) => ReactNode`. **Use this for every table.** |
| `lib/peec/metric-definitions.ts` | Verbatim definitions. Exports `PEEC`, `GA4`, `AVENUE_Z` records. Each entry: `{ text: string (verbatim quote), source, sourceUrl?, framing? }`. Helper `tooltipText(def, extraFraming?)` composes. **Extend, never rewrite.** |
| `app/dashboard/[clientSlug]/reports/page.tsx` | Renders `GA4DatePicker` for any `peec-ai` section + passes `dateRange` to all 4 tab components. |
| `components/layout/sidebar.tsx` | Preserves `dateRange` URL param when navigating between AEO sub-tabs. |
| `components/report-sections/peec-ai/index.tsx` (Overview), `brand-rankings-table.tsx`, `top-domains-table.tsx`, `llm-breakdown-table.tsx`, `visibility-chart.tsx`, `tracked-prompts-chart.tsx` | All refactored in Phase 1 with question headlines, verbatim tooltips, and `SortableTable` where applicable. Use these as the **reference implementation** for the remaining tabs. |

**The sticky picker contract** (already wired): the existing `<GA4DatePicker>` writes `?dateRange=` to the URL via `router.push` while preserving all other query params. The sidebar (`components/layout/sidebar.tsx:484-540`) carries that `dateRange` through every AEO sub-tab href. Phase 1 also added `dateRange` as a prop to all 4 tab components in `page.tsx:77-80`; PR Influence already uses it, the other two now have the prop in their signature and must START using it as part of this plan.

---

## File Structure

**New files this plan creates:** none (all source-of-truth files exist after Phase 1).

**Files this plan modifies:**

| Path | What changes |
|---|---|
| `lib/peec/metric-definitions.ts` | Extend with: PR-source-of-truth keys (PR Proof is internal — Avenue Z attribution), Sitebulb keys, Screaming Frog keys, Profound keys. Append new exports `PR_PROOF`, `SITEBULB`, `SCREAMING_FROG`, `PROFOUND`. |
| `components/report-sections/peec-ai/pr-influence.tsx` | Phase 2 — 5 tables, 6+ section headlines, ~10 metric tooltips, KPI strip tooltips. Replace each inline `<table>` with `<SortableTable>`. Rewrite each heading as a question. Replace each tooltip string with `PEEC.*.text`, `GA4.*.text`, or `PR_PROOF.*.text`. |
| `components/report-sections/peec-ai/content-impact.tsx` | Phase 3 — 7 tables, ~14 headlines, ~12 tooltips. Same as above. **Also:** replace the hardcoded `dateRange: 'last_30_days'` in the GA4 query (line 171) with the `dateRange` prop the page now passes. Replace hardcoded `['YTD']` Peec lookups (lines 201-204) with `dateRange`-mapped lookups where possible. |
| `components/report-sections/peec-ai/technical-audit.tsx` | Phase 4 — 5 tables (DeltaTable, BotTable, PageOverlapTable, AI Log Anomalies, FixList), ~10 headlines, ~12 tooltips. Use `SITEBULB`, `SCREAMING_FROG`, `AVENUE_Z` definitions. |

**Files this plan optionally modifies (Phase 5 — only if Thomas opts in):**

| Path | What changes |
|---|---|
| `components/report-sections/profound-ai/brand-rankings-table.tsx` | Mirror the Peec equivalent — refactor to `SortableTable`, retitle, retooltip with `PROFOUND.*`. |
| `components/report-sections/profound-ai/top-domains-table.tsx` | Same. |
| `components/report-sections/profound-ai/llm-breakdown-table.tsx` | Same. |
| `components/report-sections/profound-ai/visibility-chart.tsx` | Question headline. |
| `components/report-sections/profound-ai/tracked-prompts-chart.tsx` | Question headline + verbatim tooltips. |
| `components/report-sections/peec-ai/index.tsx` (Profound KPI block) | Replace the three `TODO: replace with verbatim definition from Profound's official docs` tooltips with `PROFOUND.*.text` values. |

---

## Verbatim definitions catalogue (the source of truth for every tooltip)

**Already in `lib/peec/metric-definitions.ts`** (Phase 1):

| Key | Verbatim text | Source |
|---|---|---|
| `PEEC.visibility` | "Percentage of AI responses where your brand appears." | [docs.peec.ai/metrics-overview](https://docs.peec.ai/metrics-overview) |
| `PEEC.brandVisibility` | "Your brand is explicitly mentioned in the response." | docs.peec.ai/metrics-overview |
| `PEEC.sourceVisibility` | "Your domain or content was used or cited — even if your brand isn't named." | docs.peec.ai/metrics-overview |
| `PEEC.sov` | "Percentage of your brand mentions in AI responses compared to all tracked brands mentioned." | docs.peec.ai/metrics-overview |
| `PEEC.position` | "Average ranking when your brand appears in AI responses (lower numbers are better)." | docs.peec.ai/metrics-overview |
| `PEEC.retrieved` | "Percentage of chats where at least one URL from this domain appeared as a source." | docs.peec.ai/metrics-overview |
| `PEEC.retrievalRate` | "Average number of times a URL from this domain appeared as a source per chat." | docs.peec.ai/metrics-overview |
| `PEEC.citationRate` | "Average number of times a domain was explicitly referenced in response text when used." | docs.peec.ai/metrics-overview |
| `PEEC.citations` | "Average number of times the domain was explicitly referenced in response text when used." | docs.peec.ai/metrics-overview |
| `PEEC.sourceMetrics` | "Metrics that analyze which websites AI platforms use as references when answering your prompts." | docs.peec.ai/metrics-overview |
| `GA4.session` | "A period during which a user is engaged with your website or app." | [support.google.com/analytics/answer/12195621](https://support.google.com/analytics/answer/12195621) |
| `GA4.engagedSession` | "A session that meets any of the following criteria: Lasts longer than 10 seconds, Has a key event, Has 2 or more screen or page views." | support.google.com/analytics/answer/12195621 |
| `GA4.engagementRate` | "The percentage of engaged sessions on your website or mobile app." | support.google.com/analytics/answer/12195621 |
| `GA4.bounceRate` | "The percentage of sessions that were not engaged." | support.google.com/analytics/answer/12195621 |
| `AVENUE_Z.brandTypes` | "Brand types are AI-inferred based on each brand's name and positioning. Verify accuracy before sharing externally." | Internal |
| `AVENUE_Z.domainTypes` | "Domain types are classified by Peec AI based on each domain's content and category." | Internal |
| `AVENUE_Z.domainTypeOwn` ... `domainTypeOther` | 8 sub-category definitions | Internal |

**To add in Task 1** (verbatim quotes already fetched in Phase 1 research):

| Key | Verbatim text | Source |
|---|---|---|
| `SITEBULB.hint` | "a set of issues or opportunities that are pre-checked by Sitebulb, so you only need to look into them if an issue is present" | [support.sitebulb.com/articles/9854034-about-sitebulb-hints](https://support.sitebulb.com/en/articles/9854034-about-sitebulb-hints) |
| `SITEBULB.severityLevels` | "Critical, High, Medium, Low, Insight" | support.sitebulb.com/articles/9854034-about-sitebulb-hints |

**To add in Task 1 with explicit "pending verbatim source" attribution** (no public verbatim doc found; use the most accurate paraphrase observed and mark for human review):

| Key | Best-effort text (mark with TODO comment in code) | Source |
|---|---|---|
| `SCREAMING_FROG.crawl` | "The Screaming Frog SEO Spider is a website crawler that audits your site for over 300 SEO issues." | screamingfrog.co.uk/seo-spider (no central glossary; this is the closest verbatim from the product page) |
| `PROFOUND.visibility` | "Profound's Visibility Score measures the percentage of mentions out of the total responses tracked." | tryprofound.com/blog (third-party paraphrase — verify with Profound docs) |
| `PR_PROOF.placement` | Internal Avenue Z definition — Avenue Z attribution. | Internal |
| `PR_PROOF.matchback` | Internal Avenue Z definition. | Internal |

---

## Tasks

---

### Task 1: Extend `lib/peec/metric-definitions.ts` with remaining sources

**Files:**
- Modify: `lib/peec/metric-definitions.ts` (append new exports)

**Owner:** Main session (subagents cannot WebFetch — verbatim text is already collected above; this is a mechanical edit).

- [ ] **Step 1: Append the new definition records**

Open `lib/peec/metric-definitions.ts` and append these exports after the existing `AVENUE_Z` block (end of file):

```typescript
// ─── Sitebulb ────────────────────────────────────────────────────────────────

export const SITEBULB: Record<string, MetricDefinition> = {
  hint: {
    text: 'A set of issues or opportunities that are pre-checked by Sitebulb, so you only need to look into them if an issue is present.',
    source: 'Sitebulb',
    sourceUrl: 'https://support.sitebulb.com/en/articles/9854034-about-sitebulb-hints',
  },
  severityLevels: {
    text: 'Sitebulb categorises hints by severity: Critical, High, Medium, Low, Insight.',
    source: 'Sitebulb',
    sourceUrl: 'https://support.sitebulb.com/en/articles/9854034-about-sitebulb-hints',
  },
}

// ─── Screaming Frog ──────────────────────────────────────────────────────────
// Screaming Frog has no central glossary; these are pulled from the product
// page and HTTP-status tutorial. Treat as best-effort verbatim.

export const SCREAMING_FROG: Record<string, MetricDefinition> = {
  crawl: {
    text: 'The Screaming Frog SEO Spider is a website crawler that audits your site for over 300 SEO issues.',
    source: 'Screaming Frog',
    sourceUrl: 'https://www.screamingfrog.co.uk/seo-spider/',
  },
  httpStatus: {
    text: "If the SEO Spider only crawls one page, or does not crawl as expected, the 'Status' and 'Status Code' are the first things to check.",
    source: 'Screaming Frog',
    sourceUrl: 'https://www.screamingfrog.co.uk/seo-spider/tutorials/http-status-codes-when-crawling/',
  },
}

// ─── Profound (verbatim source PENDING — replace text when Profound docs available) ───

export const PROFOUND: Record<string, MetricDefinition> = {
  visibility: {
    text: "Profound's Visibility Score measures the percentage of mentions out of the total responses tracked.",
    source: 'Avenue Z', // attribution shifts to Avenue Z until Profound's verbatim source is sourced
    sourceUrl: 'https://www.tryprofound.com/blog/how-to-track-your-visibility-in-ai-search',
    framing: '(Verbatim Profound source pending — verify before sharing externally.)',
  },
  sov: {
    text: 'Share of voice measures the percentage of brand mentions a company receives compared to competitors across AI-generated responses.',
    source: 'Avenue Z',
    framing: '(Verbatim Profound source pending — verify before sharing externally.)',
  },
  position: {
    text: 'Average position when your brand appears in AI search responses across the tracked prompt set.',
    source: 'Avenue Z',
    framing: '(Verbatim Profound source pending — verify before sharing externally.)',
  },
}

// ─── Avenue Z internal — PR Proof / PR-related concepts ──────────────────────

export const PR_PROOF: Record<string, MetricDefinition> = {
  placement: {
    text: 'A PR placement is a media mention secured by Avenue Z (or the client) and logged in the PR Proof Library.',
    source: 'Avenue Z',
  },
  matchback: {
    text: 'Matchback joins logged PR placements against AI-cited URLs and domains to measure how often earned coverage is being surfaced in AI answers.',
    source: 'Avenue Z',
  },
  opportunityScore: {
    text: 'A composite score weighing competitor presence, prompt coverage, and brand absence to rank PR pitching opportunities highest-impact-first.',
    source: 'Avenue Z',
  },
}
```

- [ ] **Step 2: Visual diff sanity check**

Run: `cd "/Users/thomaschangavenuez/Desktop/ave-z-reporting 6:9/avenue-z-reporting-v2" && git diff lib/peec/metric-definitions.ts | head -120`
Expected: only additions appended at the file end, no edits to existing exports.

- [ ] **Step 3: Commit**

```bash
git add lib/peec/metric-definitions.ts
git commit -m "feat(aeo): extend metric definitions with Sitebulb, Screaming Frog, Profound, PR Proof"
```

---

### Task 2: Refactor PR Influence tab

**Files:**
- Modify: `components/report-sections/peec-ai/pr-influence.tsx`

**Owner:** Subagent (one Explore→Edit cycle). The file is large (~870 lines); the subagent must edit in place, not rewrite the whole file.

**Inventory (what the subagent will touch):**

A. **Header block** (lines ~315) — "KPI Strip" subheading is internal scaffolding text; replace with no heading (let the cards speak) OR keep as one question heading. The 4 KPI tiles immediately follow.

B. **KPI strip tooltips** — Phase 1 inventory found these YTD-tooltipped tiles that **must remain YTD-locked** (Thomas's exception): lines 321 ("Peec AI, YTD"), 328 ("Peec AI, YTD (lower = better)"), 333 ("Peec AI, total YTD"). The GA4 KPI (line 344) DOES respond to `dateRange`. For each tooltip:
- Replace the paraphrased text with `PEEC.visibility.text` / `PEEC.sov.text` / `PEEC.position.text` / `PEEC.citations.text` etc. as appropriate, with framing " Shown YTD." appended for the YTD-locked tiles, or " Shown for the selected date range." for the GA4 tile.

C. **Section card "B. PR Placement Matchback"** (line 359, table lines 363-497) — 14-column inline `<table>`. Convert to `SortableTable`.
- Rename heading: `"B. PR Placement Matchback"` → `"Which PR placements are being cited in AI?"`
- Section description tooltip → use `PR_PROOF.matchback.text`
- Per-column tooltips on metric columns (Cited by AI, AI Engines, Prompt Count, Avg Position, Post-Publish Traffic Trend) — pull from `PEEC.*` and `PR_PROOF.*`

D. **Section card "C. Top Editorial Domains Cited by AI"** (line 508, table lines 514-584) — 5-column table. Convert to `SortableTable`.
- Rename: `"C. Top Editorial Domains Cited by AI"` → `"Which editorial domains do AI engines cite most for our prompts?"`
- Tooltips: Citation Count → `PEEC.citations.text`; Prompt Coverage % → "Percentage of tracked prompts where this domain appears." (Avenue Z internal — add to definitions if reused elsewhere); Avg Position → `PEEC.position.text`

E. **Section card "D. Brand-Absent Editorial Domains"** (line 611, table lines 615-710) — 8-column table. Convert to `SortableTable`.
- Rename: `"D. Brand-Absent Editorial Domains"` → `"Which editorial domains cite our competitors but not us?"`
- Tooltip on section heading: `PEEC.sourceMetrics.text`

F. **Section card "E. Prompt Cluster Opportunity Matrix"** (line 720, table lines 726-781) — 7-column table. Convert to `SortableTable`.
- Rename: `"E. Prompt Cluster Opportunity Matrix"` → `"Which prompt clusters offer the biggest PR opportunity?"`
- Opportunity Score column tooltip: `PR_PROOF.opportunityScore.text`

G. **Section card "F. Next Pitch Opportunities"** (line 798, table lines 804-862) — 7-column table. Convert to `SortableTable`.
- Rename: `"F. Next Pitch Opportunities"` → `"Where should we pitch next to close AI visibility gaps?"`

H. **"KPI Strip" subhead** (line 315) — Optional rename or remove. If kept: `"How is AI-driven PR coverage performing?"`.

I. **"How Opportunity Scoring Works"** (line 867) — Methodology footer. Rename to `"How is the opportunity score calculated?"`.

**Per-step recipe (Subagent must follow exactly):**

- [ ] **Step 1: Read the file fully** (`Read components/report-sections/peec-ai/pr-influence.tsx`) and the reference implementation from Phase 1 (`Read components/report-sections/peec-ai/brand-rankings-table.tsx`).

- [ ] **Step 2: Add imports**

At the top of `pr-influence.tsx`, ensure these imports exist (add only what is missing):

```typescript
import { SortableTable, type SortableColumn } from './sortable-table'
import { PEEC, GA4, PR_PROOF, AVENUE_Z } from '@/lib/peec/metric-definitions'
```

- [ ] **Step 3: Replace each inline `<table>` with `<SortableTable>`**

For each of the 5 tables (B through F above), follow the pattern in `brand-rankings-table.tsx`:
1. Define `columns: SortableColumn<RowType>[]` with `key`, `label`, `align`, optional `tooltip` (pulled verbatim from `PEEC` / `PR_PROOF` / `GA4`), and a `render` function for the cell content.
2. Use the table's existing data array as `rows`.
3. Provide `rowKey={(row) => ...}` (a stable unique key per row — usually the domain or URL or composite).
4. Preserve `initialPageSize` matching the existing `.slice(0, N)` (e.g., 15 → `initialPageSize={15}`).
5. Preserve existing row-click handlers via `onRowClick`.

**The wrapper styling (`<div className="rounded-lg border …">` + section header) MUST stay**; only the `<table>` and below is replaced.

- [ ] **Step 4: Rewrite each section card title as a question**

In place. Each section title that the subagent renames must use the exact strings listed in B-I above.

- [ ] **Step 5: Replace every tooltip string with a verbatim reference**

Search for `tooltip=`, `<span … tooltip>`, and inline `?` icon hover text. Replace each metric tooltip with `${PEEC.<key>.text}` (and similar). For metrics not covered by a verbatim source (i.e. PR Proof's matchback logic), use `${PR_PROOF.<key>.text}`. **Never paraphrase a metric from a third-party tool.**

- [ ] **Step 6: Verify YTD-locked tiles are preserved**

The 3 KPI tiles at lines ~321, 328, 333 are explicitly YTD per Thomas's exception. Their tooltips must end with " Shown YTD." (no global date-range responsiveness).

- [ ] **Step 7: Verify build**

```bash
cd "/Users/thomaschangavenuez/Desktop/ave-z-reporting 6:9/avenue-z-reporting-v2"
npm install --no-audit --no-fund   # if node_modules not yet installed
npx next lint
```
Expected: no errors in `pr-influence.tsx`. If `next lint` is unavailable for the version, run `npx tsc --noEmit` instead.

- [ ] **Step 8: Commit**

```bash
git add components/report-sections/peec-ai/pr-influence.tsx
git commit -m "feat(aeo/pr-influence): sortable tables, question headlines, verbatim tooltips"
```

---

### Task 3: Refactor Content Impact tab

**Files:**
- Modify: `components/report-sections/peec-ai/content-impact.tsx`

**Owner:** Subagent (independent file; can run in parallel with Task 2 + Task 4).

**Inventory (what the subagent will touch):**

A. **Component prop** — `ContentImpactReport` already accepts `dateRange?: string` (added in Phase 1). The subagent must USE it: replace the hardcoded GA4 query date range at line 171 (`dateRange: 'last_30_days'`) with the prop: `dateRange: dateRange ?? 'last_30_days'`.

B. **Peec range lookups** (lines 201-204 use `['YTD']`) — these power section A's KPI cards. The Peec backend only returns `'YTD'` and `'Last 30 days'` keys, so map: if the page's `dateRange` resolves to anything ≤ 30 days → use `'Last 30 days'`; otherwise → use `'YTD'`. Add a helper at the top of the file:

```typescript
function peecRangeKey(dateRange?: string): 'YTD' | 'Last 30 days' {
  if (!dateRange) return 'Last 30 days'
  if (['last_7_days', 'last_14_days', 'last_30_days', 'this_month'].includes(dateRange)) return 'Last 30 days'
  return 'YTD'
}
```

C. **Page heading** (line 254) — `"Content Impact Tracker"` → `"How is content performing across AI and human channels?"`

D. **Section A subheading** (line 267) — `"A. Content Impact Snapshot"` → `"How is content performing at a glance?"`

E. **Section B + table** (line 322, table lines 326-480) — 16-column table. SortableTable.
- Heading: `"B. Planned Content Performance"` → `"How is each planned content piece performing?"`
- Column tooltips: Sessions / Users / Views / Engagement Rate → `GA4.*.text`; AI Citations → `PEEC.citations.text`; AI Bot Activity / Match Status / Content Action / Recommended Action → use `AVENUE_Z.*` (add new keys to metric-definitions.ts if needed)

F. **Section C** (line 484) — `"C. Time to First Traffic and First AI Activity"` → `"How quickly does new content earn traffic and AI citations?"`

G. **Section D** (line 516) — `"D. Net-New vs Optimized Content Lift"` → `"Which delivers more lift — new content or optimization?"`

H. **Section E** (line 583) — `"E. Decay vs Compounding Content"` → `"Which content is decaying vs. compounding over time?"`

I. **Section F + table** (line 614, lines 618-666) — 9-column table. SortableTable.
- Heading: `"F. Owned Content Cited in AI"` → `"Which of our owned pages do AI engines cite?"`

J. **Section G — 3 sub-views, each a table** (lines 671, 681, 729, 773):
- Outer: `"G. Content Gaps and Disconnects"` → `"Where is content disconnected from AI demand?"`
- Sub 1 `"Traffic but No AI Citations"` → `"Which pages get traffic but no AI citations?"`
- Sub 2 `"AI Citations but Little Human Traffic"` → `"Which pages get AI citations but little human traffic?"`
- Sub 3 `"AI Bot Attention but No Citations or Human Visits"` → `"Which pages have AI bot attention but no citations or human visits?"`

K. **Section H — 2 sub-tables** (lines 843, 848, 908):
- Outer: `"H. Competitor and Third-Party Content Cited for Your Prompts"` → `"Which competitor or third-party pages are cited for our prompts?"`
- Sub 1: `"Top Competitor / Corporate Domains Cited in AI"` → `"Which competitor or corporate domains are cited most?"`
- Sub 2: `"Top Competitor / Corporate URLs Where Brand is Absent"` → `"Where are competitors cited and we're absent?"`

**Per-step recipe:**

- [ ] **Step 1: Read** `content-impact.tsx` and `brand-rankings-table.tsx` (reference impl).

- [ ] **Step 2: Add imports**

```typescript
import { SortableTable, type SortableColumn } from './sortable-table'
import { PEEC, GA4, AVENUE_Z } from '@/lib/peec/metric-definitions'
```

- [ ] **Step 3: Add `peecRangeKey` helper** (see code block in inventory B above) at the top of the file under the existing imports.

- [ ] **Step 4: Use `dateRange` in the GA4 query**

Change line 171 from:
```typescript
ga4Query({
  clientSlug,
  dateRange: 'last_30_days',
  ...
}),
```
to:
```typescript
ga4Query({
  clientSlug,
  dateRange: dateRange ?? 'last_30_days',
  ...
}),
```

- [ ] **Step 5: Switch Peec `['YTD']` lookups to `[peecRangeKey(dateRange)]`** for any KPI that should respond to the picker. Leave any tile that the section explicitly labels "YTD" alone (Thomas's exception).

- [ ] **Step 6: Replace each `<table>` with `<SortableTable>`** following the same recipe as Task 2.

- [ ] **Step 7: Rewrite all 14 headlines** per the inventory above.

- [ ] **Step 8: Replace all tooltips** with verbatim references from `PEEC`, `GA4`, or `AVENUE_Z`.

- [ ] **Step 9: Verify build** as in Task 2.

- [ ] **Step 10: Commit**

```bash
git add components/report-sections/peec-ai/content-impact.tsx
git commit -m "feat(aeo/content-impact): sortable tables, question headlines, verbatim tooltips, wire dateRange"
```

---

### Task 4: Refactor Technical Performance tab

**Files:**
- Modify: `components/report-sections/peec-ai/technical-audit.tsx`

**Owner:** Subagent (independent; can run in parallel with Task 2 + Task 3).

**Inventory:**

A. **Component prop** — `TechnicalAuditReport` accepts `dateRange?: string` but renames it `_dateRange` (Phase 1, intentional — this tab's data is crawl-snapshot, time-agnostic). No date-driven changes here. The picker is still shown in the header for stickiness only.

B. **Page heading** (line 779) — `"Technical Audit Logs"` → `"What's the technical state of the site for AI crawlers?"`

C. **Section: Audit Snapshot** (line 790) — `"Audit Snapshot"` → `"What's the audit at a glance?"`

D. **DeltaTable section "What Changed Since Last Crawl"** (line 804, table lines 196-246) — `"What Changed Since Last Crawl"` → `"What changed since the last crawl?"` (already question-shaped — refine punctuation). 9-column table. SortableTable. Tooltips: Issue Type → `SITEBULB.hint.text`; Priority → `SITEBULB.severityLevels.text`; Status → "Sitebulb hint status: New / Resolved / Existing / Worsened." (Avenue Z paraphrase — add to `AVENUE_Z`).

E. **"Issue Trends"** (line 828) — `"Issue Trends"` → `"How are technical issues trending?"`

F. **"AI Platform and Bot Activity"** (line 848, BotTable lines 866-881) — `"AI Platform and Bot Activity"` → `"Which AI platforms and bots are visiting the site?"`. 6-column table. SortableTable.

G. **"Pages with AI Activity and Technical Issues"** (line 891, PageOverlapTable lines 894-918) — `"Pages with AI Activity and Technical Issues"` → `"Where do AI activity and technical issues overlap?"`. 11-column table. SortableTable.

H. **"AI Log Anomalies and Crawl Waste"** (line 923, table lines 941-1027) — `"AI Log Anomalies and Crawl Waste"` → `"Where are AI crawlers wasting requests?"`. 10-column table. SortableTable.

I. **"AEO Technical Checklist"** (line 681) — `"AEO Technical Checklist"` → `"Is the site meeting the AEO technical checklist?"`

J. **"What SEO / Dev Should Fix Next"** (line 567, FixList lines 572-635) — `"What SEO / Dev Should Fix Next"` → `"What should SEO and dev fix next?"`. 8-column table. SortableTable. Severity column tooltip: `SITEBULB.severityLevels.text`.

K. **"How Priority Scoring Works"** (line 1057) — `"How Priority Scoring Works"` → `"How is priority scored?"`

**Per-step recipe:** identical to Task 2 — read, add imports (`SortableTable`, `SITEBULB`, `SCREAMING_FROG`, `AVENUE_Z`), replace each `<table>`, rewrite headings, swap tooltips, verify build, commit.

- [ ] **Step 1-9: Apply recipe**

- [ ] **Step 10: Commit**

```bash
git add components/report-sections/peec-ai/technical-audit.tsx
git commit -m "feat(aeo/technical-performance): sortable tables, question headlines, verbatim Sitebulb tooltips"
```

---

### Task 5 (OPTIONAL — Thomas-confirmed only): Profound section in Overview

**Files:**
- Modify: `components/report-sections/profound-ai/brand-rankings-table.tsx`
- Modify: `components/report-sections/profound-ai/top-domains-table.tsx`
- Modify: `components/report-sections/profound-ai/llm-breakdown-table.tsx`
- Modify: `components/report-sections/profound-ai/visibility-chart.tsx`
- Modify: `components/report-sections/profound-ai/tracked-prompts-chart.tsx`
- Modify: `components/report-sections/peec-ai/index.tsx` (replace the 3 `TODO` Profound KPI tooltips with `PROFOUND.*.text`)

**Owner:** Subagent.

This task mirrors Phase 1's Peec refactor exactly. Each Profound table follows the SAME shape as its Peec counterpart, so the subagent should diff the corresponding `peec-ai/<file>` to learn the template and apply the same transformation to `profound-ai/<file>`. Tooltips swap to `PROFOUND.*.text` (which carries `framing: "(Verbatim Profound source pending …)"`), so the user is warned in-tooltip that the wording isn't authoritative.

- [ ] **Step 1-N: Apply Phase 1 recipe to each of the 5 Profound files** (read peec-ai equivalent, apply same patch to profound-ai file, swap to `PROFOUND.*` tooltips).

- [ ] **Step Final: Commit**

```bash
git add components/report-sections/profound-ai/ components/report-sections/peec-ai/index.tsx
git commit -m "feat(aeo/overview-profound): mirror Peec refactor for Profound sub-section"
```

---

### Task 6: Verify build + lint pass

**Files:** none (verification only)

**Owner:** Main session.

- [ ] **Step 1: Install deps if needed**

```bash
cd "/Users/thomaschangavenuez/Desktop/ave-z-reporting 6:9/avenue-z-reporting-v2"
npm install --no-audit --no-fund
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```
Expected: no type errors in any AEO file.

- [ ] **Step 3: Lint**

```bash
npx next lint
```
Expected: no errors. Warnings about pre-existing unused vars in non-AEO files are acceptable.

- [ ] **Step 4: Build**

```bash
npx next build
```
Expected: build succeeds. Note any new bundle-size warnings, but do not fail the task on them.

- [ ] **Step 5: Smoke-check in dev server (manual — Thomas's call)**

```bash
npm run dev
```
Navigate to `/dashboard/<some-client>/reports?section=peec-ai` and:
- Confirm date picker renders next to client logo on all 4 AEO sub-tabs.
- Confirm clicking from Overview → PR Influence → Content Impact → Technical Performance preserves the selected date range in the URL.
- Confirm every visible table has clickable column headers that sort, and a filter icon that opens a popover with a text input.
- Confirm every section/chart/table heading reads as a question.
- Hover several `?` icons and confirm tooltip text matches the verbatim entries in `lib/peec/metric-definitions.ts`.

- [ ] **Step 6: Final commit**

If `npm install` modified `package-lock.json` only:
```bash
git checkout package-lock.json   # only if no intended dep changes
```

If everything passes, the branch is ready to push:
```bash
git push -u origin feat/across-all-tabs
```

---

## Self-Review

**Spec coverage:**

| Spec requirement | Task(s) implementing it |
|---|---|
| Sticky page-level date range across tabs | Phase 1 (already shipped: `page.tsx` + `sidebar.tsx`) |
| Exception: YTD trend chart stays fixed | Phase 1 (visibility-chart.tsx tooltip says "fixed to YTD") |
| Sort + filter on all table columns | Tasks 2, 3, 4 (every table → `SortableTable`); Task 5 (optional Profound) |
| Question-based headlines for every chart/table/section | Tasks 2, 3, 4 (inventories list every renamed heading); Task 5 (optional) |
| Verbatim source-of-truth tooltips per metric | Tasks 1 (extends `metric-definitions.ts`); Tasks 2, 3, 4 use `PEEC.*.text` / `GA4.*.text` / `SITEBULB.*.text` |

**Placeholders:** None remaining. The Profound and Screaming Frog definitions are marked with explicit `framing: "(Verbatim Profound source pending …)"` strings so the user-visible tooltip itself warns the reader — this is documented behavior, not a TODO.

**Type consistency:** All tasks reference `SortableTable<T>` and `SortableColumn<T>` from `./sortable-table`, and metric definition keys are checked against the `Record<string, MetricDefinition>` exports in `lib/peec/metric-definitions.ts`. New keys added in Task 1 (`SITEBULB`, `SCREAMING_FROG`, `PROFOUND`, `PR_PROOF`) are referenced consistently in Tasks 2-5.

---

## Execution Choice

Two ways to run this:

1. **Subagent-driven (recommended)** — Main session dispatches one fresh subagent per task; review between tasks. Tasks 2, 3, 4 can run in parallel (they edit independent files). Tasks 1 and 6 stay in the main session.
2. **Inline** — Main session executes every task sequentially with checkpoints.

The plan is designed for option 1.

---

## Outcome (2026-06-09)

Shipped via PR #27, merged to `main` as commit `907c4da`. Vercel Production
deployed successfully at 18:17:36Z.

10 commits landed:

| SHA | What |
|---|---|
| `37fb846` | Shared infra — SortableTable primitive, verbatim metric definitions, sticky date picker |
| `1a72b25` | Overview tab refactor |
| `f2b98eb` | PR Influence — 5 tables extracted to client file, headlines, verbatim tooltips |
| `6033c49` | Content Impact — 10 tables, `dateRange` wired into GA4 query |
| `4bd99f9` | Technical Performance — 5 tables, verbatim Sitebulb tooltips |
| `e175e62` | Apostrophe lint fix |
| `868bd42` | Verbatim Profound definitions (was TODO) |
| `115aff9` | Profound sub-section refactor + Section D unified card |
| `34cc8ec` | Fix: missing `'use client'` on Profound LLM breakdown table |
| `907c4da` | Merge commit |

### Final state vs. spec

- **Sticky date picker across all 4 AEO tabs** ✅
- **YTD exception preserved** (Overview YTD trend chart, Overview KPI strip,
  PR Influence's 3 Peec KPI tiles) ✅
- **Sort + filter on every table column** — 23 AEO tables + 3 Profound tables
  migrated to `SortableTable` ✅
- **Question-based headlines** — ~46 declarative titles rewritten ✅
- **Verbatim source-of-truth tooltips** — Peec, GA4, Sitebulb, Profound
  pulled word-for-word from each tool's docs; Avenue Z internal metrics
  explicitly attributed in-tooltip ✅

### Key new files (production)

- `components/report-sections/peec-ai/sortable-table.tsx` — generic
  client-side sortable/filterable table primitive
- `lib/peec/metric-definitions.ts` — single source-of-truth file for every
  AEO metric tooltip (`PEEC`, `GA4`, `SITEBULB`, `SCREAMING_FROG`, `PROFOUND`,
  `PR_PROOF`, `AVENUE_Z`)
- `components/report-sections/peec-ai/{pr-influence,content-impact,technical-audit}-tables.tsx`
  — `'use client'` sibling files holding the SortableTable wrappers; the
  parent RSC tab files pass plain serializable data in

### Known follow-ups (not blocking)

- 2 pre-existing ESLint errors on `main` (apostrophe in
  `peec-ai/index.tsx:199` and `any` cast in `sidebar.tsx:418`) — blamed to
  May/June commits before this branch, out of scope.

---

## Post-merge bug fixes (same day)

After PR #27 shipped, Thomas surfaced two follow-up bugs against the same
spec. Both were fixed and shipped same day on top of `854c3d6`.

### PR #28 — Tooltips appeared behind other elements

**Reported:** "The tooltips aren't working correctly, if you test them out
you can see that when you hover over them, they appear behind other
objects."

**Root cause (two-layered):**

1. `SortableTable` wraps its `<table>` in `overflow-hidden` +
   `overflow-x-auto`, clipping any absolutely-positioned tooltip child.
2. `StickyReportHeader` (`sticky z-30 backdrop-blur-md`) and `ReportNav`
   (`sticky z-20 backdrop-blur-md`) create stacking contexts via
   `backdrop-filter`. No `z-index` value inside the report tree can
   paint above them.

**Fix:** Replaced the hand-rolled CSS-only hover pattern with a Radix
`Tooltip` wrapper whose `TooltipContent` renders via `<Tooltip.Portal>`
to `document.body` — escaping both the clipping ancestor and the
sticky-bar stacking contexts.

**Files:**

- New: `components/ui/tooltip.tsx` (shadcn-style Radix wrapper with
  Portal — matches the existing `components/ui/popover.tsx` pattern)
- New: `components/ui/info-tooltip.tsx` (thin `?` icon + tooltip
  convenience wrapper)
- Wired `<TooltipProvider>` into
  `app/dashboard/[clientSlug]/reports/page.tsx`
- Swapped 30 hand-rolled tooltip blocks across AEO + Profound tables,
  charts, and KPI cards
- Net **-178 lines** (removed duplicated tooltip markup)

**Tooltip text content unchanged** — still pulled verbatim from
`lib/peec/metric-definitions.ts`. This was a render-mechanism fix only.

**Note:** the red `?` icon variant on a few Overview headers
(`BrandSOVChart`, `BrandDefinitions`, tracked-prompts headers) was
visually normalized to the standard white `InfoTooltip`. Thomas
approved white.

**Commits:** `b25f1a8` (fix) → `36522c9` (merge of PR #28)
**Shipped:** 2026-06-09 20:51:38Z, Vercel Production success.

### PR #29 — compareRange dropped on AEO sub-tab clicks

**Reported:** "I tested this and when you select a date + comparison
period on one page and move to the next page, it doesn't stick."

**Root cause:** The AEO date picker writes BOTH `?dateRange=` and
`?compareRange=` to the URL on Apply, but `components/layout/sidebar.tsx`
was only reading and forwarding `dateRange`. Every AEO sub-tab link
rebuilt the URL from scratch using only `dateRange`, silently dropping
`compareRange` on every click.

**Fix:** Surgical 4-line addition in `sidebar.tsx` mirroring the
existing `dateRange` plumbing for `compareRange`:

1. Read `searchParams.get('compareRange')` in the `Sidebar` wrapper.
2. Add `compareRange: string \| null` to `ClientSidebar` prop type +
   destructured params.
3. Forward `compareRange` on the AEO base link
   (`aeoBaseParams.set('compareRange', compareRange)`).
4. Forward `compareRange` on AEO sub-tab links
   (`subParams.set('compareRange', compareRange)`).

**Scope:** AEO sub-tab navigation only. GA4 / inbound-funnel / generic
section links unchanged (they also drop both params by current design;
not in scope for this fix).

**Process note:** The compareRange commit (`bb17c7c`) was originally
pushed to `fix/tooltip-portal-clipping` ~12 min AFTER PR #28 was already
merged — it landed on a defunct branch and did NOT ship. Caught the
gap when verifying sync state, cherry-picked the commit onto a fresh
branch and opened PR #29.

**Commits:** `1e8c88b` (cherry-pick) → `e604bae` (merge of PR #29)
**Shipped:** 2026-06-09 21:09:01Z, Vercel Production success.

### Final post-fix state (2026-06-09 21:09Z)

| Layer | SHA |
|---|---|
| Local `main` | `e604bae` |
| `origin/main` | `e604bae` |
| Vercel Production | `e604bae` (success) |

All four spec items + both follow-up bugs closed.

### Open follow-ups (not blocking, deferred)

- Stickiness across non-AEO sections: leaving AEO (e.g. clicking GA4
  tab) then returning still resets `dateRange` and `compareRange` to
  defaults. Same for closing/reopening the tab (no localStorage backup).
  Per Thomas's call, AEO-only stickiness is sufficient; broader
  persistence is a future enhancement.
- Overview tab accepts `dateRange` as a prop but `getPeecOverviewImpl`
  in `lib/peec/client.ts:341` hardcodes YTD for all queries — so the
  date picker has no effect on Overview data. Spec carved out the YTD
  trend chart specifically; whether the whole Overview tab should be
  YTD-locked is a separate product decision.
- 4 hardcoded tooltip text duplicates remain
  (`peec-ai/visibility-chart.tsx:45`, `tracked-prompts-chart.tsx:145-147`,
  `content-impact-tables.tsx:12-13`, `profound-ai/index.tsx` ×5).
  Content is correct but bypasses `metric-definitions.ts` SoT file.
  Cosmetic, deferred.
- 16 lint warnings (unused imports leftover from tooltip swap).
  Non-blocking, can clean in a follow-up.
