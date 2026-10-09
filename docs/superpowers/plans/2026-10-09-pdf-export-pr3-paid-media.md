# PDF Export — PR 3: Paid Media Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every Paid Media tab (Overview, Paid Search, Meta, LinkedIn) an export form that meets Organic Social's bar, then switch Paid Media's Export PDF button to the server export.

**Architecture:** Paid Media's tables come in two shapes:
- **`DataTable`:** the shared chart table, used by the campaign and keyword tables. It gets an export branch like PR 2's `SortableTable`.
- **Bespoke tables:** the Meta and LinkedIn creative trees, and the geo Region → DMA table. Each gets the same markers (`data-export-table`, `data-export-row`) and drops its controls in export mode.

The charts already draw complete (PR 1 for `BarChart` and `ComboChart`, `LineChart` from #332):
- **Toggles:** the two metric toggles (Overview trend, Paid Search hero) print as labels.
- **Panels:** the green-on-white charts get dark panels.

Everything else is inert page-break attributes on cards, grids and titles, which PR 2's export theme already acts on. The last task adds `paid-media` to the allow-list.

**Tech Stack:** Next.js 16, React 19, TypeScript strict, vitest + Testing Library, Recharts 3, the export pipeline and theme from PRs 1 and 2.

**Spec:** `docs/superpowers/specs/2026-10-08-pdf-export-all-reports-design.md` §5, §7, §8, §10, §11.

## Deviations from the spec (decided while planning)

1. **Page-break attributes are unconditional** (inert outside `.export-theme`), as in PR 2. Behaviour changes use `useExportMode()`. Paid Media has no golden snapshots, so no re-baseline is needed. The existing component tests must pass unchanged.
2. **The Paid Search hero prints on a dark panel.** Live, it sits on the page background with no card. On white paper its green bars and cyan line would be faint, so in export mode it gets the chart panel's surface and `data-export-chart`.
3. **Sort arrows and expand chevrons don't print.** A table's default sort is stated in no label (the spec's "default sort" is the live default). Chevrons (`▸`) imply rows that can't open on paper. Meta and LinkedIn trees print their top level only, as on first load.

## Global Constraints

- **Branch:** `feat/pdf-export-paid-media`, cut from `feat/pdf-export-aeo` (PR #350). It builds on PR 2's theme rules, so it can't merge before #350.
  - **The PR targets `dev`:** CI's `guard-base-branch` rejects stacked PRs. The body says it builds on #348 and #350 and names its own commit range.
  - **Review record:** a separate PR adding `docs/qa/pdf-export-paid-media-code-review.md`.
  - Never merge without Paul's go-ahead.
- **Live pages:** every Paid Media page looks exactly as before outside the export, and every existing Paid Media test passes unchanged.
- **Default view:**
  - **Rows:** campaigns and keywords as their tables first load (DataTable has no pages; keywords are the server's top 10 in the "≥10 clicks" view). Creative trees print their top level; geo prints its top 10 regions, collapsed.
  - **Charts:** the trend prints Spend with every channel; the hero prints Cost.
- **Commentary:** prints on Paid Search, Meta and LinkedIn where `SharedPartsHeader` shows it. Overview has none.
- **Before every commit:** `git checkout -q -- CLAUDE.md`.
- **Local checks:** `npm run check:rsc` runs with the local checks, since it scans test files too. A test that passes function props to a client component must be `'use client'`.
- **Tests:** new vitest files under `components/report-sections/**` or `components/export/**` are already included. A new `components/charts/*.test.tsx` must be pinned in `vitest.config.ts`.
- **Commits:** end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A creative tree with many campaigns.** A Meta account with 30+ campaigns prints a table taller than a page. Expect it to split only between rows and repeat its header, with the total row at the end. Pinned in Task 4 (markers) and Task 6 (the live page check).
2. **No data.** The trend with no points, keywords with no row at 10+ clicks, and geo with no regions each print their empty message, with no control and no stranded title. Pinned in Tasks 2 and 3.
3. **A failed section.** A fetch that times out renders the page's `Fallback` card. The PDF prints it and the export still completes; it's not "still loading". Pinned in Task 6 (readiness has no pending marker for it).
4. **A staff export.** Paid Search, Meta and LinkedIn commentary prints the client's entry, and staff and client exports print the same. Pinned in Task 6.
5. **A wide table.** The creative trees have 13 columns. They must fit the page width with no cell cut at the right edge, wrapping between words. Pinned in Task 6 (acceptance `outsideBox` and the page check).

---

### Task 1: `DataTable` in the export

**Files:**
- Modify: `components/charts/data-table.tsx`
- Create: `components/charts/data-table.export.test.tsx`
- Modify: `vitest.config.ts` (pin the new test beside `components/charts/export-charts.test.tsx`)

**Interfaces:**
- Produces: in export mode `DataTable` renders a `data-export-table` root (also `data-export-block` when it prints 15 rows or fewer, totals row included), and each body row, totals included, is a `data-export-row`. Headers show plain labels: no sort click, no arrow, no `EditableText`. Cells print the value: `EditableText` cells print `row[key]` as text.

- [ ] **Step 1: Write the failing test** `components/charts/data-table.export.test.tsx`

```tsx
'use client'
// Renders DataTable directly, as client code (scripts/check-rsc-props.ts reads a file without this directive as a Server
// Component).
import { expect, test, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

// EditableText pulls in a server action (next-auth), which jsdom can't load; record that it was used.
vi.mock('@/components/dashboard/editable-text', () => ({ EditableText: ({ value }: { value: string }) => <span data-testid="editable">{value}</span> }))

import { DataTable } from './data-table'
import { ExportModeProvider } from '@/components/export/export-mode'

const COLUMNS = [
  { key: 'name', label: 'Campaign', align: 'left' as const, sortable: true, sortType: 'string' as const },
  { key: 'cost', label: 'Cost', align: 'right' as const, sortable: true, sortKey: '_cost', sortType: 'number' as const },
]
const ROWS = Array.from({ length: 12 }, (_, i) => ({ name: `C${i}`, cost: `$${i}`, _cost: (i * 7) % 12 }))
const TOTALS = { name: 'Total', cost: '$66' }
const inExport = (ui: React.ReactElement) => render(<ExportModeProvider>{ui}</ExportModeProvider>)

// Spec 2026-10-08 §5 and §7: the default sort, no sort controls or arrows, rows that never split, totals kept.
test('the export prints the default sort with plain headers, every row and the totals marked for page breaks', () => {
  const { container } = inExport(<DataTable columns={COLUMNS} rows={ROWS} defaultSort={{ key: 'cost', dir: 'desc' }} totalsRow={TOTALS} />)
  const headers = [...container.querySelectorAll('th')].map((th) => th.textContent)
  expect(headers).toEqual(['Campaign', 'Cost'])
  expect(container.querySelector('th[class*="cursor-pointer"]')).toBeNull()
  expect(container.querySelectorAll('tbody tr[data-export-row]')).toHaveLength(13)
  expect([...container.querySelectorAll('tbody tr')].slice(0, 3).map((tr) => tr.querySelector('td')!.textContent)).toEqual(['C5', 'C10', 'C3'])
  expect(container.querySelector('tbody tr:last-child td')?.textContent).toBe('Total')
})

test('a table of up to 15 printed rows is one block; a longer one splits between rows', () => {
  expect(inExport(<DataTable columns={COLUMNS} rows={ROWS} totalsRow={TOTALS} />).container.querySelector('[data-export-table]')?.hasAttribute('data-export-block')).toBe(true)
  const long = Array.from({ length: 20 }, (_, i) => ({ name: `L${i}`, cost: '$1', _cost: 1 }))
  expect(inExport(<DataTable columns={COLUMNS} rows={long} />).container.querySelector('[data-export-table]')?.hasAttribute('data-export-block')).toBe(false)
})

test('an editable label prints as plain text in the export', () => {
  const cols = [{ key: 'name', label: 'Region', editable: true, dimKey: 'region' }]
  inExport(<DataTable columns={cols} rows={[{ name: 'East', name__raw: 'east' }]} slug="dash" canEdit />)
  expect(screen.queryByTestId('editable')).toBeNull()
  expect(screen.getByText('East')).toBeTruthy()
})

test('outside the export the table is unchanged: sortable headers with an arrow, no export markers', () => {
  const { container } = render(<DataTable columns={COLUMNS} rows={ROWS} defaultSort={{ key: 'cost', dir: 'desc' }} />)
  expect(container.querySelector('th[class*="cursor-pointer"]')).not.toBeNull()
  expect(screen.getByText('Cost ↓')).toBeTruthy()
  expect(container.querySelector('[data-export-table], [data-export-row]')).toBeNull()
})
```

The expected first three rows follow `sortRows` on `_cost = (i*7)%12` descending: C5 (11), C10 (10), C3 (9). If the descending tie order differs (`reverse()` on equal keys), adjust the third value to what `sortRows` returns and note it in the test comment.

Pin the file: add `'components/charts/data-table.export.test.tsx',` to `vitest.config.ts` after `'components/charts/export-charts.test.tsx',`.

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run components/charts/data-table.export.test.tsx`
Expected: FAIL. The headers are clickable with an arrow, there are no markers, and `EditableText` renders.

- [ ] **Step 3: Add the export branch to `DataTable`**

Add `import { useExportMode } from '@/components/export/export-mode'`. In `DataTable`, after the `display` line:

```tsx
  // The PDF export prints the default view (spec 2026-10-08-pdf-export-all-reports-design §5, §7): plain headers, no sort
  // control or arrow, plain-text labels, and rows (totals included) that split between pages only between rows. A table of
  // up to 15 printed rows is one unbreakable block.
  const exportMode = useExportMode()
  if (exportMode) {
    const printed = display.length + (totalsRow ? 1 : 0)
    return (
      <div data-export-table="" {...(printed <= 15 ? { 'data-export-block': '' } : {})} className={bare ? '' : 'rounded-lg border border-white/[0.06] bg-bg-surface'}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/[0.06]">
              {columns.map((c) => (
                <th key={c.key} className={`px-5 py-3 text-[11px] font-extrabold uppercase tracking-widest text-text-muted ${c.align === 'right' ? 'text-right' : 'text-left'}`}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {display.map((row, i) => (
              <tr key={i} data-export-row="" className="border-b border-white/[0.04]">
                {columns.map((c) => (
                  <td key={c.key} className={`px-5 py-3 text-white ${c.align === 'right' ? 'text-right' : 'text-left'}`}>{row[c.key]}</td>
                ))}
              </tr>
            ))}
            {totalsRow && (
              <tr data-export-row="" className="border-t border-white/[0.12] font-semibold">
                {columns.map((c) => (
                  <td key={c.key} className={`px-5 py-3 text-white ${c.align === 'right' ? 'text-right' : 'text-left'}`}>{totalsRow[c.key]}</td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    )
  }
```

The `useState` call stays first, so the hook order is the same in both modes.

- [ ] **Step 4: Run it, the users of `DataTable`, and `check:rsc`**

Run: `npx vitest run components/charts/data-table.export.test.tsx components/report-sections/paid-search components/report-sections/organic-social && npm run check:rsc`
Expected: PASS. Organic Social's v1 Top Content renders `DataTable` too; its export tests still pass.

- [ ] **Step 5: Commit**

```bash
git checkout -q -- CLAUDE.md
git add components/charts/data-table.tsx components/charts/data-table.export.test.tsx vitest.config.ts
git commit -m "feat(export): DataTable prints its default view, split only between rows

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The Paid Media Overview

**Files:**
- Modify: `components/report-sections/paid-media/overview/trend.tsx`, `components/report-sections/paid-media/overview/index.tsx`
- Modify: `components/report-sections/paid-media/overview/trend.test.tsx`, `index.test.tsx` (add cases)

**Interfaces:**
- **Trend chart, in export mode:**
  - the metric buttons are replaced by `<p data-export-toggle-label>Spend</p>`;
  - the channel buttons become a static legend of `<span>`s, every channel on;
  - the whole trend `<div>` is a `data-export-block`, and its "Trend" label row is `data-export-keep-with-next`.
- **Overview:** the top KPI grid and each per-channel `<section>` carry `data-export-block`, and the "By Channel" label carries `data-export-keep-with-next`.

- [ ] **Step 1: Write the failing tests.** Append to `trend.test.tsx` and add `import { ExportModeProvider } from '@/components/export/export-mode'`:

```tsx
// PDF export (spec 2026-10-08 §7): the default metric and every channel, as labels, in one block.
test('in the export the trend prints Spend and every channel as labels, no buttons, as one block', () => {
  const { container } = render(<ExportModeProvider><PaidMediaTrendChart trend={trend} /></ExportModeProvider>)
  expect(screen.queryAllByRole('button')).toHaveLength(0)
  expect(screen.getByText('Spend')).toBeTruthy()
  expect(lastProps.yKeys?.map((k) => k.key)).toEqual(['Paid Search', 'Meta'])
  expect(lastProps.valueFormat).toBe('currency-cents')
  expect(container.firstElementChild?.hasAttribute('data-export-block')).toBe(true)
  expect(container.querySelector('[data-export-keep-with-next]')?.textContent).toContain('Trend')
})

test('with no points the trend prints its empty message, no controls', () => {
  render(<ExportModeProvider><PaidMediaTrendChart trend={{ channels: ['meta'], points: [] }} /></ExportModeProvider>)
  expect(screen.getByText('No trend data for this period.')).toBeTruthy()
  expect(screen.queryAllByRole('button')).toHaveLength(0)
})
```

Append to `index.test.tsx`, reusing its `mock` setup:

```tsx
test('the KPI grid and each channel row are page-break blocks; "By Channel" stays with the first row', async () => {
  mock.mockResolvedValue({
    channels: [
      { key: 'paid-search', label: 'Paid Search', configured: true, spend: 1000, clicks: 200, leads: 12, ok: true, spendDelta: 25, clicksDelta: 10, leadsDelta: 5 },
      { key: 'meta', label: 'Meta Advertising', configured: true, spend: 500, clicks: 80, leads: null, ok: true, spendDelta: -8, clicksDelta: 4 },
    ],
    blendedSpend: 1500, blendedClicks: 280, blendedSpendDelta: 12, blendedClicksDelta: 8,
  })
  const { container } = render(await PaidMediaOverviewReport({ clientSlug: 'c' }))
  expect(container.querySelector('.grid.grid-cols-2[data-export-block]')).not.toBeNull()
  expect(container.querySelectorAll('section[data-export-block]').length).toBeGreaterThanOrEqual(2)
  expect(screen.getByText('By Channel').hasAttribute('data-export-keep-with-next')).toBe(true)
})
```


- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run components/report-sections/paid-media`
Expected: FAIL.

- [ ] **Step 3: Implement it**

`trend.tsx`: import `useExportMode`. After the two `useState` lines, add:

```tsx
  // The PDF export prints the default view, Spend with every channel on, named as labels (spec 2026-10-08 §7).
  const exportMode = useExportMode()
```

The empty-state `return` stays as it is. Then:

- Change the root `<div className="space-y-3">` to `<div className="space-y-3" data-export-block="">`.
- Change the label row `<div className="flex items-center justify-between">` to add `data-export-keep-with-next=""`.
- Replace the metric button group `<div className="flex gap-1">…</div>` with `{exportMode ? <p data-export-toggle-label="" className="text-xs font-semibold text-white">{metric === 'spend' ? 'Spend' : 'Clicks'}</p> : (<div className="flex gap-1">…the existing buttons…</div>)}`.
- In the channel map, when `exportMode`, render a `<span>` with the same classes and inner dot instead of the `<button>`. `on` is always true in export, since `active` starts with every channel and nothing toggles it.

`index.tsx`:
- add `data-export-block=""` on `<div className="grid grid-cols-2 gap-3">`;
- add `data-export-keep-with-next=""` on the "By Channel" `<p>`;
- add `data-export-block=""` on each `<section key={c.key} className="space-y-3">`.

- [ ] **Step 4: Run them and confirm they pass**

Run: `npx vitest run components/report-sections/paid-media && npm run check:rsc`
Expected: PASS. The existing tests are unchanged.

- [ ] **Step 5: Commit**

```bash
git checkout -q -- CLAUDE.md
git add components/report-sections/paid-media
git commit -m "feat(export): the Paid Media Overview prints its default trend and keeps each row whole

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Paid Search

**Files:**
- Modify: `components/report-sections/paid-search/{hero,kpi-grid,leads-section,geo-section,keywords-table-client}.tsx`
- Create: `components/report-sections/paid-search/paid-search.export.test.tsx`

**Interfaces:**
- **Hero, in export mode:**
  - a `<section>` with `data-export-block`, `data-export-chart` and the chart panel's surface (`rounded-lg border border-white/[0.06] bg-bg-surface p-5`);
  - the four metric buttons are replaced by `<p data-export-toggle-label>Cost</p>`.
- **`KpiGrid` root:** `data-export-block`.
- **`LeadsSection`:**
  - the "Leads Over Time" card is `data-export-block` and `data-export-chart`;
  - in the "Leads by Action" card, the `h3` is `data-export-keep-with-next` and each category `<div key={category}>` is `data-export-block`.
- **`GeoSection`:**
  - the KPI grid is `data-export-block`;
  - the chart label is `data-export-keep-with-next`;
  - the DMA table's label is `data-export-keep-with-next`;
  - its wrapper is `data-export-table` (and `data-export-block`, at most 11 rows);
  - each region row is `data-export-row`, and the `ChevronRightIcon` is `data-export-hide`.
- **`KeywordsTableClient`, in export mode:** the toggle button is replaced by `<p data-export-toggle-label>Showing keywords with ≥10 clicks</p>`.

- [ ] **Step 1: Write the failing test** `paid-search.export.test.tsx`

```tsx
'use client'
// Renders client components directly (scripts/check-rsc-props.ts reads a file without this directive as a Server Component).
import { expect, test, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@/components/charts/combo-chart', () => ({ ComboChart: (p: { bar: { label: string } }) => <div data-testid="combo">{p.bar.label}</div> }))
vi.mock('@/components/charts/bar-chart', () => ({ BarChart: () => <div data-testid="bar" /> }))
vi.mock('@/components/dashboard/editable-text', () => ({ EditableText: ({ value }: { value: string }) => <span>{value}</span> }))

import { ExportModeProvider } from '@/components/export/export-mode'
import { Hero } from './hero'
import { LeadsSection } from './leads-section'
import { GeoSection } from './geo-section'
import { KeywordsTableClient } from './keywords-table-client'
import type { GeoRegion, LeadBreakdown, HeroPoint } from '@/lib/paid-search/types'
import type { KeywordsData } from '@/lib/paid-search/keywords'

const inExport = (ui: React.ReactElement) => render(<ExportModeProvider>{ui}</ExportModeProvider>)

test('the hero prints Cost as a label on a dark panel, one block, no buttons', () => {
  const { container } = inExport(<Hero points={[{ week: '2026-09-01', cost: 10, clicks: 2, impressions: 50, leads: 1 } as HeroPoint]} />)
  expect(screen.queryAllByRole('button')).toHaveLength(0)
  expect(screen.getByTestId('combo').textContent).toBe('Cost')
  const section = container.querySelector('section')!
  expect(section.hasAttribute('data-export-block') && section.hasAttribute('data-export-chart')).toBe(true)
  expect(section.className).toContain('bg-bg-surface')
})

test('leads: the chart card is a dark block; each category stays whole; the action list title stays with it', () => {
  const data: LeadBreakdown = {
    byAction: [{ name: 'Employer Form', category: 'employer', count: 9 }, { name: 'Broker Form', category: 'broker', count: 3 }],
    categoryTotals: { employer: 9, broker: 3, contact: 0 }, totalLeads: 12, trend: [],
  } as LeadBreakdown
  const { container } = inExport(<LeadsSection data={data} />)
  expect(container.querySelector('[data-export-block][data-export-chart] [data-testid="combo"]')).not.toBeNull()
  expect(screen.getByText('Leads by Action').hasAttribute('data-export-keep-with-next')).toBe(true)
  expect(container.querySelectorAll('[data-export-block]').length).toBe(1 + 3)
})

test('geo: KPI grid and table are blocks, region rows are marked, chevrons hidden, labels kept with what follows', () => {
  const rows: GeoRegion[] = Array.from({ length: 12 }, (_, i) => ({ region: `R${i}`, clicks: i, cost: i, leads: 12 - i, dmas: [] }))
  const { container } = inExport(<GeoSection rows={rows} />)
  expect(container.querySelector('.grid[data-export-block]')).not.toBeNull()
  expect(container.querySelectorAll('tbody tr[data-export-row]')).toHaveLength(10)
  expect(container.querySelector('[data-export-table]')?.hasAttribute('data-export-block')).toBe(true)
  expect(screen.getByText('Top Regions by Leads').hasAttribute('data-export-keep-with-next')).toBe(true)
  expect(screen.getByText('Region → DMA Breakdown').hasAttribute('data-export-keep-with-next')).toBe(true)
  expect([...container.querySelectorAll('svg')].every((svg) => svg.closest('[data-export-hide]'))).toBe(true)
})

test('keywords print the default ≥10-clicks view as a label, not a button', () => {
  const view = { top: [], total: { clicks: 0, impressions: 0, ctr: 0, cost: 0, leads: 0 }, count: 0 }
  inExport(<KeywordsTableClient data={{ filtered: view, all: view } as unknown as KeywordsData} />)
  expect(screen.queryAllByRole('button')).toHaveLength(0)
  expect(screen.getByText('Showing keywords with ≥10 clicks')).toBeTruthy()
  expect(screen.getByText('No keywords reached 10 clicks in this period.')).toBeTruthy()
})
```

Read `HeroPoint`, `LeadBreakdown` and `KeywordsData` in `lib/paid-search/types.ts` and `keywords.ts`, and name their fields in the fixtures as the types do. Remove each `as` cast once the fixture matches its type, and check with `tsc` in Step 4.

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run components/report-sections/paid-search/paid-search.export.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement it**
- **`hero.tsx`:** import `useExportMode`, and add `const exportMode = useExportMode()` after `useState`.
  - The `<section>` becomes `<section className={exportMode ? 'space-y-3 rounded-lg border border-white/[0.06] bg-bg-surface p-5' : 'space-y-3'} {...(exportMode ? { 'data-export-block': '', 'data-export-chart': '' } : {})}>`.
  - The button row becomes `{exportMode ? <p data-export-toggle-label="" className="text-xs font-semibold text-white">{METRICS.find((m) => m.key === metric)!.label}</p> : <div className="flex gap-2">…existing…</div>}`.
- **`kpi-grid.tsx`:** add `data-export-block=""` on the root grid.
- **`leads-section.tsx`:**
  - add `data-export-block="" data-export-chart=""` on the "Leads Over Time" card;
  - add `data-export-keep-with-next=""` on the "Leads by Action" `h3`;
  - add `data-export-block=""` on each `<div key={category}>`.
- **`geo-section.tsx`:**
  - add `data-export-block=""` on the KPI grid;
  - add `data-export-keep-with-next=""` on both label `<p>`s;
  - on the table wrapper `<div className="overflow-hidden rounded-lg border border-white/[0.06]">`, add `data-export-table="" data-export-block=""`. It holds at most 10 rows plus the total;
  - in `FragmentRow`, add `data-export-row=""` on the region `<tr>` and `data-export-hide=""` on `ChevronRightIcon`;
  - DMA rows only show when expanded, which never happens in the export.
- **`keywords-table-client.tsx`:** import `useExportMode`, and add `const exportMode = useExportMode()` after `useState`. Then the button becomes `{exportMode ? <p data-export-toggle-label="" className="text-xs text-text-muted">Showing keywords with ≥10 clicks</p> : <button …existing…>}`.

- [ ] **Step 4: Run it, the Paid Search suite, `tsc` and `check:rsc`**

Run: `npx vitest run components/report-sections/paid-search && npx tsc --noEmit -p . && npm run check:rsc`
Expected: PASS. The existing tests are unchanged.

- [ ] **Step 5: Commit**

```bash
git checkout -q -- CLAUDE.md
git add components/report-sections/paid-search
git commit -m "feat(export): Paid Search prints its default views, on dark chart panels, whole where it fits

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Meta and LinkedIn

**Files:**
- Modify: `components/report-sections/meta-ads/{creative-table-client,geo-section}.tsx`, `components/report-sections/linkedin-ads/{creative-table-client,geo-section}.tsx`
- Create: `components/report-sections/meta-ads/creative-table.export.test.tsx`, `components/report-sections/linkedin-ads/creative-table.export.test.tsx`

**Interfaces:**
- **Creative tables, in export mode:**
  - the root carries `data-export-table` (block only when 15 rows or fewer print);
  - headers have no click handler, sort arrow or "?" hint;
  - top-level rows (Meta campaigns, LinkedIn campaign groups) and the total row carry `data-export-row`;
  - the chevron prints nothing.
- **Geo sections:** the KPI grid is `data-export-block`. The chart label `<p>` is `data-export-keep-with-next`. `BarChart` already prints as its own dark block (PR 1).

- [ ] **Step 1: Write the failing tests**

`meta-ads/creative-table.export.test.tsx`:

```tsx
import { expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ExportModeProvider } from '@/components/export/export-mode'
import { CreativeTable } from './creative-table'
import type { CampaignNode } from '@/lib/meta/types'

const metrics = { spend: 45, impressions: 6000, reach: 4500, frequency: 1.3, linkClicks: 130, ctr: 2.2, cpc: 0.35, lpv: 200, costPerLpv: 0.3, engagements: 180, shareOfSpend: 50 }
const campaigns: CampaignNode[] = ['Traffic', 'Leads'].map((name) => ({
  name, ...metrics,
  adSets: [{ name: `${name} set`, ...metrics, ads: [{ ...metrics, ad: `${name} ad`, campaign: name, adSet: `${name} set`, status: 'ACTIVE' }] }],
}))

// PDF export (spec 2026-10-08 §7, PR 3 plan deviation 3): campaigns collapsed as on first load; no sort or hint controls.
test('the export prints top-level campaigns and the total, marked, with no arrows, chevrons or hints', () => {
  const { container } = render(<ExportModeProvider><CreativeTable campaigns={campaigns} /></ExportModeProvider>)
  expect(container.querySelector('[data-export-table]')).not.toBeNull()
  expect(container.querySelectorAll('tbody tr[data-export-row]')).toHaveLength(3)
  expect(container.textContent).not.toMatch(/[▸▾↓↑?]/)
  expect(screen.queryByText('Traffic set')).toBeNull()
  expect(container.querySelector('th[class*="cursor-pointer"]')).toBeNull()
})
```

`linkedin-ads/creative-table.export.test.tsx`:

```tsx
import { expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ExportModeProvider } from '@/components/export/export-mode'
import { LinkedInCreativeTable } from './creative-table'
import type { LinkedInCampaignGroupNode, LinkedInCreativeMetrics } from '@/lib/linkedin/types'

const m: LinkedInCreativeMetrics = { spend: 500, impressions: 4000, clicks: 40, ctr: 1, cpc: 12.5, leads: 0, costPerLead: 0, leadFormOpens: 0, leadFormCompletionRate: 0, landingPageClicks: 30, shareOfSpend: 50 }
const groups: LinkedInCampaignGroupNode[] = ['Prospecting', 'Retargeting'].map((name) => ({
  name, ...m,
  campaigns: [{ name: `${name} campaign`, ...m, ads: [{ ...m, ad: `${name} ad`, campaign: `${name} campaign`, campaignGroup: name, status: 'ACTIVE' }] }],
}))

// PDF export (spec 2026-10-08 §7, PR 3 plan deviation 3): campaign groups collapsed as on first load; no sort controls.
test('the export prints top-level campaign groups and the total, marked, with no arrows or chevrons', () => {
  const { container } = render(<ExportModeProvider><LinkedInCreativeTable groups={groups} /></ExportModeProvider>)
  expect(container.querySelector('[data-export-table]')).not.toBeNull()
  expect(container.querySelectorAll('tbody tr[data-export-row]')).toHaveLength(3)
  expect(container.textContent).not.toMatch(/[▸▾↓↑]/)
  expect(screen.queryByText('Prospecting campaign')).toBeNull()
  expect(container.querySelector('th[class*="cursor-pointer"]')).toBeNull()
})
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run components/report-sections/meta-ads components/report-sections/linkedin-ads`
Expected: FAIL.

- [ ] **Step 3: Implement it, in each `creative-table-client.tsx`:**
- Import `useExportMode`, and add `const exportMode = useExportMode()` after the `useState` lines.
- **Root `<div className="overflow-x-auto rounded-lg …">`:** add `data-export-table=""`, plus `{...(exportMode && sortedCampaigns.length + 1 <= 15 ? { 'data-export-block': '' } : {})}`. For LinkedIn, the variable is `sortedGroups` (`sortedCampaigns` is Meta's).
- **Name `<th>`:** `onClick={exportMode ? undefined : () => onSort('name')}`. The class becomes `exportMode ? '…the same classes without cursor-pointer and hover:text-white' : '…as is'`. The arrow expression is wrapped `{!exportMode && (sort.key === 'name' ? …)}`.
- **Metric `<th>`s:** the same treatment, and the tooltip span is wrapped `{!exportMode && c.tooltip && (…)}` (Meta only).
- **Rows:** pass `exportMode` into `CampaignRows` / `GroupRows`. On the top-level `<tr>`, add `data-export-row=""` and drop `onClick` and `cursor-pointer` in export. `<Chevron open={…} />` renders nothing in export: give `Chevron` an `exportMode` prop and `return null` when set.
- **Total `<tr>`:** add `data-export-row=""`.

In each `geo-section.tsx` (server components; attributes only):
- add `data-export-block=""` on the KPI grid;
- add `data-export-keep-with-next=""` on the "Top Regions by Spend" `<p>`.

- [ ] **Step 4: Run them and confirm they pass**

Run: `npx vitest run components/report-sections/meta-ads components/report-sections/linkedin-ads && npx tsc --noEmit -p . && npm run check:rsc`
Expected: PASS. The existing creative-table tests are unchanged.

- [ ] **Step 5: Commit**

```bash
git checkout -q -- CLAUDE.md
git add components/report-sections/meta-ads components/report-sections/linkedin-ads
git commit -m "feat(export): Meta and LinkedIn creative tables print their top level, without controls

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Switch Paid Media on

**Files:**
- Modify: `lib/export/sections.ts`, `lib/export/request.test.ts`, `app/api/export/pdf/route.test.ts`, `app/export/[clientSlug]/[section]/page.test.tsx`, `components/export/report-views.pages.test.tsx`

**Interfaces:**
- Produces: `SERVER_EXPORT_SECTIONS = ['organic-social', 'peec-ai', 'paid-media']`. Every planned section is on, so the "not switched on" tests now use a section outside the union (`'ga4'`).

- [ ] **Step 1: Update the tests (they fail first)**
- **`lib/export/request.test.ts`:**
  - the "not switched on" `test.each` becomes `['ga4', 'inbound-funnel', '../dashboard', 3]`;
  - add `test('Paid Media is switched on', () => expect(parseExportRequest({ ...ok, section: 'paid-media' })?.section).toBe('paid-media'))`.
- **`app/api/export/pdf/route.test.ts`:** in "a section not switched on…", use `'ga4'` (and `enabledReports: ['organic-social', 'ga4']`). It's now a 400 from the parser, as before.
- **`app/export/[clientSlug]/[section]/page.test.tsx`:** in the "not switched on" test, use `'ga4'`.
- **`components/export/report-views.pages.test.tsx`:** remove the "keeps the browser print" `test.each(['paid-media'])`, and add:

```tsx
  test(`${routeName}: Paid Media's button exports on the server, with the resolved tab and no model filter`, async () => {
    const { button } = await onPage(Route, CLIENT, 'paid-media', 'meta')
    expect(button.props.serverExport).toEqual({ clientSlug: 'c', section: 'paid-media', subsection: 'meta',
      dateRange: Q.dateRange, compareRange: Q.compareRange, models: null })
  })
```

Run: `npx vitest run lib/export app/api/export app/export components/export`
Expected: FAIL on the Paid Media cases.

- [ ] **Step 2: Switch it on.** In `lib/export/sections.ts`:

```ts
export const SERVER_EXPORT_SECTIONS: readonly ServerExportSection[] = ['organic-social', 'peec-ai', 'paid-media']
```

Update the file's header comment: every planned section is on. A new section adds itself to the union and the list when its components have export forms.

Run: `npx vitest run lib/export app/api/export app/export components/export && npm run check:rsc`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git checkout -q -- CLAUDE.md
git add lib/export/sections.ts lib/export/request.test.ts app/api/export/pdf/route.test.ts "app/export/[clientSlug]/[section]/page.test.tsx" components/export/report-views.pages.test.tsx
git commit -m "feat(export): Paid Media exports on the server

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Prove it on live data

**Files:**
- Modify: `e2e/export/acceptance.mts`

- [ ] **Step 1: Find the clients and tabs.** With a `CACHE_DISABLE=1 npx tsx --env-file=.env.local` one-off, as PR 2's Task 9 did, list the clients that have `paid-media` enabled. For each, list:
- which Paid Media tabs it hides (`hiddenReports` ∩ `paid-search`, `meta`, `linkedin`);
- which channels it runs: `paidSearchConfig`, `metaConfig` / `linkedinConfig` present, and the matching `smApiKeyEnvVar` set locally.

Pick the client with the most tabs that have data. Write the choice in the ledger.

- [ ] **Step 2: Add the Paid Media runs.** After the AEO loop, add a loop shaped like it. `PM_RUNS` lists `[client, tabs]` from Step 1 (env override `PM_CLIENT`), with `section: 'paid-media'`, each tab exported as staff and as a client. Check:
- the controls regex `/Spend Clicks Paid Search|Cost Clicks Impressions Leads|Show all|Filter ≥10 clicks|[▸▾]/` finds nothing;
- staff = client (`body(...)`, the glyph comparison).

`exportAs` already checks the content box (Review Focus 5), Letter landscape, no system fonts and under 4 MB.

- [ ] **Step 3: Full verification**

```bash
npx vitest run && npx tsc --noEmit -p . && npm run check:rsc
git diff --name-only --diff-filter=AM origin/dev...HEAD | grep -E '\.(ts|tsx|mts)$' | xargs npx eslint
npm run build && git checkout -q -- CLAUDE.md
```

Then start the app and run `npm run e2e:export` as in PR 2's Task 9.
Expected: all checks pass. Record each Paid Media tab's time to ready, cold and warm. **Over 30 s is a finding.**

- [ ] **Step 4: Check the pages** as PR 2 did: contact sheets of every `pm-*-client.pdf`, plus close crops. Look for:
- titles alone at a page foot;
- cut cards or charts;
- anything past the right edge, especially the 13-column creative trees;
- a header row that doesn't repeat on a continued table;
- pale colours on white;
- printed chevrons, arrows or "?";
- commentary present on Paid Search, Meta and LinkedIn where approved;
- a failed section's `Fallback` card printed rather than blocking the export (Review Focus 3).

Write the check, page by page, into the ledger. Fix each problem test-first, rebuild and re-check.

- [ ] **Step 5: Commit**

```bash
git checkout -q -- CLAUDE.md
git add e2e/export/acceptance.mts
git commit -m "test(export): acceptance exports every Paid Media tab as staff and as a client

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Put each tab's time to ready in the commit body.

---

### Task 7: PR and review record (after the final whole-branch review)

- [ ] **Step 1: Push and open the PR against `dev`**

```bash
git push -u origin feat/pdf-export-paid-media
gh pr create --base dev --title "feat(export): Paid Media exports on the server (PDF export PR 3 of 3)" --body-file pr3-body.md
```

The body covers:
- what each tab prints;
- the deviations above;
- times to ready;
- the page check;
- "builds on #348 and #350, which merge first; this PR's own commits are `<ef1195b>..HEAD`".

End it with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

- [ ] **Step 2: Open the review-record PR.** Branch `docs/pdf-export-paid-media-review` from `origin/dev`, with `docs/qa/pdf-export-paid-media-code-review.md` in the CLAUDE.md skeleton:
- **Header:** the exact diff range.
- **§1 How it works:** per tab, what prints and where each value comes from.
- **§2 Verification:** tests, acceptance with timings, and the page check.
- **§3 Findings.**
- **§4 Detail.**
- **§5 Follow-ups.**

Don't merge either PR.
