# AEO Overview v2 — Slice 1 (Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the page-wide plumbing every later v2 slice builds on: a Compare to choice and a Show deltas switch that reach the data fetchers and the PDF export, a shared sortable Δ-column helper, and the five-section shell with its side menu. All of it is active only for clients whose resolved layout contains a v2 part, so every v1 page stays byte-identical.

**Architecture:** New code lives in `components/report-sections/peec-ai/v2/` (covered by the vitest glob `components/report-sections/**`). `PeecAIReport` resolves the section layout *before* fetching, decides `isV2Layout`, and only then lets the URL's `compareRange`/`deltas` affect the fetch window and the context. `ProviderSection` renders the v1 flat list unchanged, or, on v2, an `OverviewBody` that groups parts into numbered sections. Slice 1 ships no v2 parts, so the v2 path is proven by tests with a fake part map; later slices add entries to `V2_PART_SECTIONS`.

**Tech Stack:** Next.js 16 App Router (RSC + client components), TypeScript strict, Tailwind v4, vitest + @testing-library/react (jsdom).

**Spec:** `docs/superpowers/specs/2026-11-24-aeo-overview-v2-design.md` (sections 4, 5 and 8, slice 1). Executors read both.

**Where to work:** a fresh worktree on a new branch cut from `origin/dev`, outside `.claude/` (memory: `check:rsc` skips `/.claude/` paths; symlinked `node_modules` breaks `next build`):

```bash
git -C /Users/paulramirez/Documents/Projects/reporting-dashboard-renaissance fetch origin
git -C /Users/paulramirez/Documents/Projects/reporting-dashboard-renaissance worktree add -b feat/aeo-overview-v2-foundation /Users/paulramirez/Documents/Projects/.wt-aeo-v2-slice1 origin/dev
cd /Users/paulramirez/Documents/Projects/.wt-aeo-v2-slice1 && npm ci
```

## Global Constraints

- v1 output must not change: no `-u` on any existing golden/snapshot; `parity.golden.test.tsx` and every `parts/*.golden.test.tsx` stay green untouched.
- For a client not on v2, `getPeecOverview` / `getProfoundOverview` are called with exactly the same arguments as today (`(clientSlug, dateRange)`), so cache keys (`lib/cache.ts`, `JSON.stringify(args)`) and the cache warmer are unaffected.
- `compareRange` values: `previous_period` | `previous_year` | `none`. Missing or unrecognized means `previous_period` (spec 5.1, v2 Overview only).
- `deltas` URL param: only the value `off` means anything (deltas hidden). Missing means on.
- No-value delta text is the en dash `–` (U+2013), never `0`. A row new this period shows `New`.
- Delta colors: better `text-[#60FF80]`, worse `text-[#FF4444]`, no change `text-text-muted` (same hexes as `parts/kpi-cards.tsx`).
- `'use client'` only on files that need hooks/state; a client component never receives a function prop from a server component (`npm run check:rsc`).
- No `any`.

## Review Focus

1. **A v1 client loads the AEO Overview with `?compareRange=previous_year&deltas=off` in the URL** (e.g. a link copied from GA4). Expect today's page, deltas shown, fetchers called with two args. Test: Task 4 Step 1 (`v1 ignores compareRange and deltas`).
2. **Junk `compareRange` (`custom:2026-01-01,2026-01-31`, `banana`)** reaches the v2 Overview. Expect Previous period, no throw. Test: Task 1 Step 1 (`parseAeoCompare` cases).
3. **User sorts a table by a Δ column, then turns deltas off.** Expect rows back in the table's default order, no sort arrow on a missing column. Test: Task 2 Step 1 (`falls back to default sort when the sorted column disappears`).
4. **Export request with `deltas: "on"` or `deltas: true`.** Expect the request rejected (null), like every other bad field; `deltas: "off"` accepted and carried into the export page path. Test: Task 5 Step 1.
5. **A bespoke (unmapped) part sits between two parts of the same v2 section.** Expect one section header, not two, and the section listed once in the nav. Test: Task 3 Step 1 (`groupParts` split case).

---

### Task 1: Compare and delta helpers

**Files:**
- Create: `components/report-sections/peec-ai/v2/compare.ts`
- Create: `components/report-sections/peec-ai/v2/delta.ts`
- Test: `components/report-sections/peec-ai/v2/compare.test.ts`, `components/report-sections/peec-ai/v2/delta.test.ts`

**Interfaces:**
- Produces:
  - `type AeoCompare = 'previous_period' | 'previous_year' | 'none'`
  - `parseAeoCompare(raw: string | null | undefined): AeoCompare`
  - `fetchCompareMode(c: AeoCompare): 'previous_period' | 'previous_year'` (`none` → `previous_period`; the prior window is still fetched in slice 1, the UI hides it)
    (Deliberate deviation from spec 5.1 "skip the prior-period fetches": the overview types carry non-optional deltas, so
    skipping would need optional fields across both providers. Deferred as an optimization; the UI hides every delta.)
  - `parseShowDeltas(raw: string | null | undefined, c: AeoCompare): boolean`
  - `compareSuffix(c: AeoCompare): string` → `'vs previous period'` | `'vs same period last year'` | `''`
  - `type DeltaUnit = 'pts' | 'pct' | 'places'`
  - `formatDelta(value: number | null | undefined, unit: DeltaUnit, opts?: { isNew?: boolean }): string`
  - `deltaTone(value: number | null | undefined, betterWhen: 'higher' | 'lower'): 'good' | 'bad' | 'neutral'`
  - `pctChange(now: number, prior: number | null | undefined): number | null` (null when prior is null or 0)

- [ ] **Step 1: Write the failing tests**

```ts
// compare.test.ts
test.each([
  [undefined, 'previous_period'], [null, 'previous_period'], ['', 'previous_period'],
  ['previous_period', 'previous_period'], ['previous_year', 'previous_year'], ['none', 'none'],
  ['custom:2026-01-01,2026-01-31', 'previous_period'], ['banana', 'previous_period'],
])('parseAeoCompare(%j) = %s', (raw, want) => expect(parseAeoCompare(raw)).toBe(want))
test('fetchCompareMode maps none to previous_period', () => {
  expect(fetchCompareMode('none')).toBe('previous_period')
  expect(fetchCompareMode('previous_year')).toBe('previous_year')
})
test('parseShowDeltas', () => {
  expect(parseShowDeltas(undefined, 'previous_period')).toBe(true)
  expect(parseShowDeltas('off', 'previous_period')).toBe(false)
  expect(parseShowDeltas('on', 'previous_year')).toBe(true)
  expect(parseShowDeltas(undefined, 'none')).toBe(false)
})
test('compareSuffix', () => {
  expect(compareSuffix('previous_period')).toBe('vs previous period')
  expect(compareSuffix('previous_year')).toBe('vs same period last year')
  expect(compareSuffix('none')).toBe('')
})

// delta.test.ts
test.each([
  [1.23, 'pts', '+1.2 pts'], [-0.44, 'pts', '-0.4 pts'], [0, 'pts', '0.0 pts'],
  [114.6, 'pct', '+114.6%'], [-3, 'pct', '-3.0%'],
  [2, 'places', '↑ 2 places'], [-1, 'places', '↓ 1 place'], [0, 'places', '0 places'],
  [null, 'pts', '–'], [undefined, 'pct', '–'], [Number.NaN, 'places', '–'],
])('formatDelta(%j, %s) = %s', (v, unit, want) => expect(formatDelta(v as number, unit as DeltaUnit)).toBe(want))
test('formatDelta isNew wins over value', () => expect(formatDelta(3, 'places', { isNew: true })).toBe('New'))
test('deltaTone', () => {
  expect(deltaTone(1, 'higher')).toBe('good'); expect(deltaTone(-1, 'higher')).toBe('bad')
  expect(deltaTone(1, 'lower')).toBe('bad'); expect(deltaTone(0, 'higher')).toBe('neutral')
  expect(deltaTone(null, 'higher')).toBe('neutral')
})
test('pctChange', () => {
  expect(pctChange(221, 103)).toBeCloseTo(114.56, 1)
  expect(pctChange(5, 0)).toBeNull(); expect(pctChange(5, null)).toBeNull()
})
```

- [ ] **Step 2: Run** `npx vitest run components/report-sections/peec-ai/v2/` — Expected: FAIL (modules not found).
- [ ] **Step 3: Implement both files.** `formatDelta` rounds `pts`/`pct` to one decimal before choosing the sign (so `-0.04` prints `0.0 pts`, no sign); `places` uses whole numbers, `place` singular for 1.
- [ ] **Step 4: Run** the same command — Expected: PASS.
- [ ] **Step 5: Commit** `feat(aeo-v2): compare and delta helpers`

---

### Task 2: Δ columns for SortableTable

**Files:**
- Create: `components/report-sections/peec-ai/v2/delta-columns.tsx` (no `'use client'`; it returns column objects used inside client components)
- Modify: `components/report-sections/peec-ai/sortable-table.tsx` (sort key fallback)
- Test: `components/report-sections/peec-ai/v2/delta-columns.test.tsx`

**Interfaces:**
- Consumes: `formatDelta`, `deltaTone`, `DeltaUnit` (Task 1); `SortableColumn<T>` from `../sortable-table`.
- Produces: `deltaColumn<T>(opts: { key: string; accessor: (row: T) => number | null | undefined; unit: DeltaUnit; betterWhen: 'higher' | 'lower'; isNew?: (row: T) => boolean; label?: string; tooltip?: string }): SortableColumn<T>` — label defaults to `'Δ'`, `align: 'right'`, `sortable: true`; its sort accessor returns `null` for `isNew` rows so they sink to the bottom in both directions (existing null-sink in `SortableTable`); render is a `<span>` with the tone color class and `formatDelta` text.
- SortableTable behavior change: when the current `sortKey` names no column in `columns`, sort by `defaultSortKey`/`defaultSortDir` if that column exists, otherwise leave rows unsorted; the header arrow follows the effective key.

- [ ] **Step 1: Write the failing tests** (render `SortableTable` with 3 rows `{name, vis, d}`: `A 10 +2`, `B 30 -1`, `C 20 null`)
  - `deltaColumn renders unit and tone`: cell for A shows `+2.0 pts` with class `text-[#60FF80]`; B shows `-1.0 pts` with `text-[#FF4444]`; C shows `–`.
  - `null and New sink in both directions`: click the Δ header once (asc) then again (desc); C is last both times. A row with `isNew` → `New`, also last.
  - `falls back to default sort when the sorted column disappears`: `defaultSortKey="vis" defaultSortDir="desc"`; click Δ header; `rerender` with columns minus the Δ column; row order is `B, C, A`; no element has the sort-active arrow on a missing header.
- [ ] **Step 2: Run** `npx vitest run components/report-sections/peec-ai/v2/delta-columns.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement** `deltaColumn` and the fallback (compute `effectiveSortKey`/`effectiveSortDir` inside the `useMemo` and for the header arrow; do not mutate state).
- [ ] **Step 4: Run** the test, then `npx vitest run components/report-sections/peec-ai` (existing table goldens must stay green without `-u`). Expected: PASS.
- [ ] **Step 5: Commit** `feat(aeo-v2): sortable delta columns`

---

### Task 3: Section map, grouping, shell, nav and Show deltas switch

**Files:**
- Create: `components/report-sections/peec-ai/v2/sections.ts`
- Create: `components/report-sections/peec-ai/v2/overview-body.tsx` (server component)
- Create: `components/report-sections/peec-ai/v2/section-nav.tsx` (`'use client'`)
- Create: `components/report-sections/peec-ai/v2/deltas-switch.tsx` (`'use client'`)
- Test: `components/report-sections/peec-ai/v2/sections.test.ts`, `components/report-sections/peec-ai/v2/overview-body.test.tsx`, `components/report-sections/peec-ai/v2/deltas-switch.test.tsx`

**Interfaces:**
- Consumes: `ResolvedPart` (`@/lib/report-sections/types`), `useExportMode` (`@/components/export/export-mode`).
- Produces:
  - `type OverviewSectionId = '01' | '02' | '03' | '04' | '05'`
  - `OVERVIEW_SECTIONS: Record<OverviewSectionId, { label: string; headline: string; description: string }>` with exactly this copy (Claude's call; Tina can edit later):
    - `01`: `SNAPSHOT KPIS` / `How visible is the brand across AI answer engines?` / `Up to five headline KPIs, chosen per client by the AEO strategist.`
    - `02`: `VISIBILITY VS COMPETITORS` / `How has AI visibility grown this year?` / `Turn competitors on or off to compare trajectories, then see how every tracked brand ranks.`
    - `03`: `PERFORMANCE BY AI MODEL` / `How does brand performance vary across AI models?` / `One gauge per AI model, with the competitor average marked.`
    - `04`: `TOPICS & PROMPTS` / `Where is the brand winning and losing?` / `Visibility by topic, then every tracked prompt with its rank and change.`
    - `05`: `CITED SOURCES` / `Which pages do AI engines cite most?` / `The URLs AI answers use as sources: yours, competitors' and third parties'.`
  - `V2_PART_SECTIONS: Readonly<Record<string, OverviewSectionId>> = {}` keyed `` `${id}@${version}` `` (slices 2–6 add entries)
  - `isV2Layout(resolved: ResolvedPart[], map?: Readonly<Record<string, OverviewSectionId>>): boolean`
  - `type PartGroup = { section: OverviewSectionId | null; showHeader: boolean; parts: ResolvedPart[] }`
  - `groupParts(resolved: ResolvedPart[], map?): PartGroup[]` — consecutive runs; `showHeader` true only on the first group of each section id; unmapped parts form `section: null` groups.
  - `sectionsPresent(groups: PartGroup[]): OverviewSectionId[]` — unique, in page order.
  - `OverviewBody({ groups, renderPart }: { groups: PartGroup[]; renderPart: (r: ResolvedPart) => React.ReactNode })` — renders each group; a mapped group with `showHeader` gets `<section id={`aeo-section-${id}`}>` with eyebrow `` `${id} · ${label}` `` (monospace, uppercase), an `h2` headline, a `p` description, and a top divider except before the first section.
  - `OverviewSectionNav({ sections }: { sections: OverviewSectionId[] })` — links `#aeo-section-${id}` showing `` `${id} ${label}` ``; `hidden lg:block sticky`; returns `null` in export mode.
  - `DeltasSwitch({ showDeltas, disabled }: { showDeltas: boolean; disabled: boolean })` — a `button role="switch" aria-checked={showDeltas}` labelled `Show deltas`; when `disabled`, `aria-disabled` and helper text `No comparison selected`; clicking sets `deltas=off` (turning off) or deletes `deltas` (turning on) via `router.replace(`${pathname}?${params}`, { scroll: false })`, keeping every other param; returns `null` in export mode.

- [ ] **Step 1: Write the failing tests**
  - `sections.test.ts` with `map = { 'a@2': '01', 'b@2': '02', 'c@2': '02' }`:
    - `isV2Layout([{id:'a',version:1,...}], map)` false; with `{id:'a',version:2}` true; with the default (empty) map always false.
    - `groupParts([syn(null), a@2, b@2, bespoke(null), c@2, footer(null)], map)` → sections `[null,'01','02',null,'02',null]`, `showHeader` `[false,true,true,false,false,false]`.
    - `sectionsPresent` of that → `['01','02']`.
  - `overview-body.test.tsx`: render `OverviewBody` for the groups above with `renderPart = r => <p>{r.id}</p>`; exactly one `#aeo-section-02`; text `02 · VISIBILITY VS COMPETITORS` present once; parts render in input order.
  - `deltas-switch.test.tsx` (mock `next/navigation`: `useRouter` → `{ replace }`, `usePathname` → `/dashboard/renaissance/reports`, `useSearchParams` → `new URLSearchParams('section=peec-ai&compareRange=previous_year')`):
    - click when `showDeltas` true → `replace` called with `/dashboard/renaissance/reports?section=peec-ai&compareRange=previous_year&deltas=off`, `{ scroll: false }`.
    - with `deltas=off` in params and `showDeltas` false → click → URL without `deltas`.
    - `disabled` → click does nothing; `No comparison selected` shown.
- [ ] **Step 2: Run** `npx vitest run components/report-sections/peec-ai/v2/` — Expected: new tests FAIL.
- [ ] **Step 3: Implement** the four files.
- [ ] **Step 4: Run** the same command, then `npm run check:rsc` — Expected: PASS, no RSC boundary errors.
- [ ] **Step 5: Commit** `feat(aeo-v2): section shell, nav and deltas switch`

---

### Task 4: Wire compare and deltas through the AEO Overview

**Files:**
- Modify: `lib/peec/client.ts` (`getPeecOverviewImpl` signature, line ~401 `deriveCompareRange(range, 'previous_period')`)
- Modify: `lib/profound/client.ts` (`getProfoundOverviewImpl` signature, line ~423)
- Modify: `components/report-sections/peec-ai/ctx.ts` (`PeecCtx`, `buildPeecCtx`)
- Modify: `components/report-sections/peec-ai/parts/__fixtures__/peec-ctx.ts` (add the two new fields)
- Modify: `components/report-sections/peec-ai/index.tsx` (`PeecAIReport`, `ProviderSection`)
- Test: `components/report-sections/peec-ai/v2/report-compare.test.tsx`

**Interfaces:**
- Consumes: Tasks 1 and 3.
- Produces:
  - `getPeecOverview(clientSlug?, dateRange?, compareMode?: 'previous_period' | 'previous_year')` and the same third parameter on `getProfoundOverview`; default `'previous_period'`; used in `deriveCompareRange(range, compareMode)`. No cache `version` bump (old keys still mean previous period).
  - `PeecCtx` gains `compare: AeoCompare` and `showDeltas: boolean`; `buildPeecCtx` args gain optional `compare` (default `'previous_period'`) and `showDeltas` (default `true`). v1 parts ignore both.
  - `PeecAIReport` props gain `compareRange?: string | null` and `deltas?: string | null`.
  - Exported pure helper in `index.tsx` or `v2/compare.ts`: `overviewCompare(isV2: boolean, compareRange, deltas): { compare: AeoCompare; showDeltas: boolean; fetchMode: 'previous_period' | 'previous_year' }` — not v2 → `{ 'previous_period', true, 'previous_period' }`.

- [ ] **Step 1: Write the failing test** `report-compare.test.tsx`. Mock `@/lib/db/queries` (`getClientBySlug` → `{ peecCustomerProjectId: 'p', profoundCategoryId: null, ga4PropertyId: 'g', reportSectionConfig: <per test> }`, `getSectionTemplate` → `null`), `@/lib/peec/client` (`getPeecOverview` → `FIXTURE_PEEC_CTX.data` from `parts/__fixtures__/peec-ctx.ts`), `@/lib/ga4/client` (keep `parseDateRange`/`deriveCompareRange` real via `importOriginal`, stub `ga4Query` → `{ rows: [] }`), and `./v2/sections` so `V2_PART_SECTIONS` = `{ 'footer@1': '05' }` only in the v2 tests (use `vi.doMock` + dynamic import per test).
  - `v1 ignores compareRange and deltas`: `await PeecAIReport({ audience:'internal', clientSlug:'renaissance', dateRange:'last_30_days', compareRange:'previous_year', deltas:'off' })`; `getPeecOverview` called with exactly `['renaissance','last_30_days']`; `ga4Query`'s second call uses the previous-period window from `deriveCompareRange('last_30_days','previous_period')`.
  - `v2 previous_year reaches the fetchers`: with the v2 map, same call → `getPeecOverview` called with `['renaissance','last_30_days','previous_year']`; ga4 prior window = `deriveCompareRange(...,'previous_year')`.
  - `v2 none fetches previous period and hides deltas`: `compareRange:'none'` → called with two args; `overviewCompare(true,'none',undefined)` → `{ compare:'none', showDeltas:false, fetchMode:'previous_period' }`.
  - `overviewCompare(false,'previous_year','off')` → `{ 'previous_period', true, 'previous_period' }`.
- [ ] **Step 2: Run** `npx vitest run components/report-sections/peec-ai/v2/report-compare.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Fetchers: add the parameter; nothing else in them changes.
  - `PeecAIReport`: move `getSectionTemplate` + `override` lookup above the fetches; `const v2 = isV2Layout(resolveSection(template, override))`; `const { compare, showDeltas, fetchMode } = overviewCompare(v2, compareRange, deltas)`; call each fetcher with a third arg **only** when `fetchMode === 'previous_year'`; use `fetchMode` in the GA4 `deriveCompareRange`; pass `compare`/`showDeltas` into `ProviderSection` → `buildPeecCtx`.
  - `ProviderSection`: when `isV2Layout(resolved)` is false, render exactly today's markup. When true: no top `SectionHeader`; a row with `<DeltasSwitch showDeltas={showDeltas} disabled={compare === 'none'} />`; a `lg:grid lg:grid-cols-[180px_1fr] lg:gap-8` wrapper with `<OverviewSectionNav sections={sectionsPresent(groups)} />` and `<OverviewBody groups={groups} renderPart={r => <existing per-part div with data-export-block>} />`. `renderPart` is a server-to-server prop (OverviewBody has no `'use client'`).
- [ ] **Step 4: Run** `npx vitest run components/report-sections/peec-ai` and `npx vitest run lib/profound` — Expected: PASS, including `parity.golden.test.tsx` and every `parts/*.golden.test.tsx` with no snapshot updates.
- [ ] **Step 5: Commit** `feat(aeo-v2): compare range and deltas reach the overview fetchers (v2 only)`

---

### Task 5: Page, picker and PDF export plumbing; staging recipe

**Files:**
- Modify: `components/report-sections/ga4/date-picker.tsx` (`explicitNone` prop, `getCompareLabel('none')`)
- Modify: `app/dashboard/[clientSlug]/reports/page.tsx` (parse `deltas`; pass `compareRange` + `deltas` to `PeecAIReport`; AEO picker props; `serverExport.deltas`)
- Modify: `app/portal/[clientSlug]/reports/page.tsx` (same, minus export button differences it doesn't have)
- Modify: `components/export-pdf-button.tsx` (`ServerExport.deltas?: 'off'`)
- Modify: `lib/export/request.ts` (`ExportRequest.deltas?: 'off'`, validation, `exportPagePath`)
- Modify: `app/export/[clientSlug]/[section]/page.tsx` (read `deltas`)
- Modify: `components/export/report-element.tsx` (`ExportViewParams.deltas?: string | null`; pass `compareRange` and `deltas` to `PeecAIReport`)
- Modify: `components/report-sections/peec-ai/MAINTAINING.md` (v2 layout recipe)
- Test: `components/report-sections/ga4/date-picker.test.tsx` (new), `lib/export/request.test.ts` (extend)

**Interfaces:**
- Consumes: `PeecAIReport` props from Task 4.
- Produces:
  - `GA4DatePicker({ dateRange, compareRange, explicitNone? })`: with `explicitNone`, the No Comparison preset writes `compareRange=none` instead of deleting the param; `getCompareLabel('none')` returns `'No Comparison'` regardless of the prop.
  - The AEO picker (dashboard and portal): `explicitNone` always; `compareRange` shown as `compareRange ?? 'previous_period'` on the Overview (no subsection), unchanged on subsections. Every other section's picker is untouched.
  - `ExportRequest.deltas?: 'off'` — any other non-null value makes `parseExportRequest` return `null`; `exportPagePath` adds `deltas=off` when set. The page's `serverExport` body includes `deltas: 'off'` only when `activeSection === 'peec-ai'`, no subsection, and the URL has `deltas=off` (every other body unchanged). Bulk export doesn't carry `deltas` (decided: bulk PDFs show deltas).

- [ ] **Step 1: Write the failing tests**
  - `request.test.ts`: base valid body + `deltas:'off'` → parsed `deltas === 'off'` and `exportPagePath(r)` contains `deltas=off`; `deltas:'on'` → `null`; `deltas:true` → `null`; no `deltas` → parsed has no `deltas` key and the path has no `deltas`; `compareRange:'none'` → accepted.
  - `date-picker.test.tsx` (mock `next/navigation` as in Task 3): open the popover, choose `No Comparison`, apply:
    - with `explicitNone` and `compareRange="previous_period"` → `push` URL contains `compareRange=none`.
    - without the prop → `push` URL has no `compareRange`.
    - trigger label with `compareRange="none"` shows `vs` and `No Comparison`.
- [ ] **Step 2: Run** `npx vitest run lib/export/request.test.ts components/report-sections/ga4/date-picker.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement** the plumbing listed above. In both pages add `deltas?: string` to the `searchParams` type and a trailing `deltas: string | null = null` parameter to `getReportComponent`, passed only into `PeecAIReport`.
- [ ] **Step 4: Write the staging recipe** in `MAINTAINING.md` under a new `## Overview v2 layout (staging)` heading: v2 parts reach a client through its `report_section_config['peec-ai']` (`extraParts` for new ids, `versions` for new versions, `hidden` for removed parts, `order`), applied to **staging Neon only** until the account lead approves; the production flip is slice 7 (spec section 4). Include the JSON shape with the four removals (`domains-row`, `competitor-visibility`, `competitor-gaps`, plus the v1 parts each slice replaces) and note slice 1 adds no parts yet.
- [ ] **Step 5: Run** the Step 2 tests, then the full gate: `npm run typecheck && npm run lint && npm test && npm run check:rsc` — Expected: all PASS, no snapshot updates.
- [ ] **Step 6: Commit** `feat(aeo-v2): compare and deltas through pages, picker and PDF export`

---

## After the tasks

- Whole-branch review, then push `feat/aeo-overview-v2-foundation` and open a PR into `dev` (base must be `dev`, memory: stacked PRs are rejected).
- Write the review record `docs/qa/aeo-overview-v2-foundation-code-review.md` on its own `docs/` branch off `dev`, citing the feature diff range (CLAUDE.md Stage 1).
- Nothing changes in any Neon branch in slice 1: there are no v2 parts to pin yet.
