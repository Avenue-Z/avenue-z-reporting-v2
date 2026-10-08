# PDF Export — PR 2: AEO Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every AEO tab (Overview, PR Influence, Content Impact, Technical Audit) an export form that meets Organic Social's bar, then switch AEO's Export PDF button to the server export.

**Architecture:** AEO's tables all go through one component, `SortableTable`, and its cards follow three wrapper patterns: a heading over a table, a heading over a chart, and a grid of small cards. So most of the work is in a few shared places:
- **`SortableTable` export branch:** default sort, first page of rows, no controls, a "Showing N of M" line, and rows that never split.
- **Export CSS:** for the table and its scroll wrappers.
- **`InfoTooltip`:** hidden in the export.
- **Charts:** the three AEO charts lose their animation and toggles.

Then each wrapper gets inert page-break attributes: `data-export-keep-with-next` on titles, and `data-export-block` (plus `data-export-chart` for dark chart panels) on cards. The Overview's parts get an export-layout map held to the registry, like Organic Social's. The last task adds `peec-ai` to the allow-list.

**Tech Stack:** Next.js 16, React 19, TypeScript strict, vitest + Testing Library, Recharts 3, the export pipeline from PR 1.

**Spec:** `docs/superpowers/specs/2026-10-08-pdf-export-all-reports-design.md` §5, §6, §8, §10, §11.

## Deviations from the spec (decided while planning)

1. **Page-break attributes are unconditional.** `data-export-block`, `data-export-keep-with-next`, `data-export-chart` and `data-export-hide` only act under `.export-theme`, the export page's root. So they're added as plain attributes, as Organic Social's YTD parts do, including in server components, which can't read export mode. Only behaviour changes use `useExportMode()`: table controls, row counts, toggles, tooltips, provider tabs, animation. As a result, the AEO golden snapshots gain attributes. Task 8 re-baselines them only after proving every changed line adds a `data-export-*` attribute and nothing else.
2. **The sentiment theme lists print in full** (collapsed rows), without their 400 px scroll cap. A scroll area in a PDF cuts the row at its edge, which breaks "nothing cut off".
3. **Two-column layouts stack.** The export lays out at 979 px, below Tailwind's `lg` breakpoint (1024 px), so `lg:grid-cols-2` sections print one above the other, as on a narrow screen. Nothing is lost.
4. **`InfoTooltip` is hidden in every export,** including Organic Social's. Its "?" circle does nothing on paper. This changes Organic Social PDFs only by removing those circles.
5. **Row clicks are not links.** Brand-ranking and domain rows open a page on click in the live page; in the PDF they print as plain rows. Cells the live page already renders as links stay links.

## Global Constraints

- **Branch:** `feat/pdf-export-aeo`, cut from `feat/pdf-export-shared-pipeline` (PR #348). Its PR targets `feat/pdf-export-shared-pipeline` until #348 merges, then retargets to `dev`. A review-record PR `docs/qa/pdf-export-aeo-code-review.md` goes with it. Never merge without Paul's go-ahead.
- **Live pages:** every AEO page looks exactly as before outside the export. Each component's non-export tests and golden snapshots pass unchanged, except for added `data-export-*` attributes (deviation 1).
- **Default view:** the export prints each table's first `initialPageSize` rows (all rows where a table sets none), in its default sort, plus each chart's default metric or granularity and the first provider tab.
- **Commentary:** prints wherever `SharedPartsHeader` shows it on the live tab (Overview, PR Influence, Content Impact), as the client's entry. No change is needed; the acceptance run checks it.
- **Before every commit:** `git checkout -q -- CLAUDE.md`.
- **Tests:** new vitest files must match a glob in `vitest.config.ts` `include`. `components/report-sections/**` and `components/export/**` already do.
- **Commits:** end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A table taller than a page.** PR placements prints up to 100 rows. Expect it to split only between rows, repeat the header on each page, and keep its title with the first rows. Pinned by the acceptance fixture in Task 1.
2. **One provider, or both.** A client with only Profound prints Profound's section with no tab row. A client with both prints the first (Peec) with a "Peec AI" label. Pinned in Task 4.
3. **A table with fewer rows than its page size.** No "Showing N of M" line. Pinned in Task 1.
4. **A staff export.** AEO commentary prints the client's entry, never a draft, and staff and client exports print the same. Pinned by the acceptance run in Task 9 (staff = client).
5. **A slow tab.** AEO Overview fetches Peec, Profound and GA4. The acceptance run records each tab's time to ready. Over 30 s is a finding, logged before switch-on, not hidden by a bigger budget. Pinned in Task 9.

---

### Task 1: Tables in the export

**Files:**
- Modify: `components/report-sections/peec-ai/sortable-table.tsx`
- Modify: `app/export/export-theme.css`
- Create: `components/report-sections/peec-ai/sortable-table.export.test.tsx`
- Modify: `app/export/export-theme.test.ts`
- Modify: `e2e/export/acceptance.mts` (long-table fixture)

**Interfaces:**
- Produces:
  - in export mode, `SortableTable` renders `<div data-export-table>`;
  - the header shows labels only (no sort or filter buttons);
  - the body shows the default-sorted first `initialPageSize` rows, each `<tr data-export-row>`;
  - when rows are cut, `<p data-export-table-more>Showing N of M</p>` follows the table;
  - CSS rules for `[data-export-table]` and `[data-export-row]`.

- [ ] **Step 1: Write the failing test** `components/report-sections/peec-ai/sortable-table.export.test.tsx`

```tsx
import { expect, test } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ExportModeProvider } from '@/components/export/export-mode'
import { SortableTable, type SortableColumn } from './sortable-table'

type Row = { name: string; n: number }
const ROWS: Row[] = Array.from({ length: 14 }, (_, i) => ({ name: `row-${i}`, n: (i * 7) % 11 }))
const COLUMNS: SortableColumn<Row>[] = [
  { key: 'name', label: 'Name', tooltip: 'What it is' },
  { key: 'n', label: 'Count', align: 'right' },
]
const table = (props: Partial<Parameters<typeof SortableTable<Row>>[0]> = {}, exportMode = true) => {
  const ui = <TooltipProvider><SortableTable columns={COLUMNS} rows={ROWS} rowKey={(r) => r.name} {...props} /></TooltipProvider>
  return render(exportMode ? <ExportModeProvider>{ui}</ExportModeProvider> : ui)
}
const names = (c: HTMLElement) => [...c.querySelectorAll('tbody tr')].map((tr) => tr.querySelector('td')?.textContent)

// Spec 2026-10-08-pdf-export-all-reports-design §5: the default view, no controls, and a line saying rows were cut.
test('the export prints the default sort and first page of rows, with no buttons, and says how many there are', () => {
  const { container } = table({ initialPageSize: 10, defaultSortKey: 'n', defaultSortDir: 'desc' })
  expect(screen.queryAllByRole('button')).toHaveLength(0)
  expect(container.querySelectorAll('tbody tr')).toHaveLength(10)
  const counts = [...container.querySelectorAll('tbody tr')].map((tr) => Number(tr.querySelectorAll('td')[1].textContent))
  expect(counts).toEqual([...counts].sort((a, b) => b - a))
  expect(screen.getByText('Showing 10 of 14')).toBeTruthy()
  expect(within(container.querySelector('thead')!).getByText('Name')).toBeTruthy()
})

test('every row is marked for the page-break rules, inside a marked table', () => {
  const { container } = table({ initialPageSize: 10 })
  expect(container.querySelector('[data-export-table]')).not.toBeNull()
  expect(container.querySelectorAll('tbody tr[data-export-row]')).toHaveLength(10)
})

test('a table with no more rows than its page size has no "Showing" line', () => {
  table({ initialPageSize: 20 })
  expect(screen.queryByText(/^Showing /)).toBeNull()
})

test('a table with no page size prints every row', () => {
  const { container } = table()
  expect(container.querySelectorAll('tbody tr')).toHaveLength(14)
})

test('outside the export the table is unchanged: sort buttons, the See all control, no export markers', () => {
  const { container } = table({ initialPageSize: 10 }, false)
  expect(screen.getByRole('button', { name: 'Sort by Name' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'See all 14 rows' })).toBeTruthy()
  expect(container.querySelector('[data-export-table], [data-export-row]')).toBeNull()
  expect(names(container)).toHaveLength(10)
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run components/report-sections/peec-ai/sortable-table.export.test.tsx`
Expected: FAIL. Buttons render in the export, there's no "Showing" line, and there are no markers.

- [ ] **Step 3: Add the export branch to `SortableTable`**

Add `import { useExportMode } from '@/components/export/export-mode'` and, after the existing `useState` lines:

```tsx
  // The PDF export prints the default view (spec 2026-10-08-pdf-export-all-reports-design §5): the default sort and the
  // first page of rows, no sort, filter or "See all" controls, and a line saying how many rows there are. Rows are the
  // only places a long table may break between pages (app/export/export-theme.css).
  const exportMode = useExportMode()
```

Then, before the existing `return (`, add an early return:

```tsx
  if (exportMode) {
    return (
      <div data-export-table="">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/[0.04]">
              {columns.map((col) => {
                const align = col.align ?? 'left'
                return (
                  <th
                    key={col.key}
                    style={col.width ? { width: col.width } : undefined}
                    className={cn(
                      'px-4 py-2.5 text-[10px] font-extrabold uppercase tracking-widest text-text-muted',
                      align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left',
                      col.headerClassName,
                    )}
                  >
                    {col.label}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr data-export-row="">
                <td colSpan={columns.length} className="px-4 py-8 text-center text-xs text-text-muted">{emptyMessage}</td>
              </tr>
            ) : visibleRows.map((row, idx) => (
              <tr key={rowKey(row, idx)} data-export-row="" className={cn('border-b border-white/[0.03]', rowClassName ? rowClassName(row) : '')}>
                {columns.map((col) => {
                  const align = col.align ?? 'left'
                  const cellContent = col.render
                    ? col.render(row, idx)
                    : col.accessor
                      ? String(col.accessor(row) ?? '')
                      : String((row as Record<string, unknown>)[col.key] ?? '')
                  return (
                    <td key={col.key} className={cn('px-4 py-3', align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left', col.cellClassName)}>
                      {cellContent}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {initialPageSize && totalAfterFilter > initialPageSize && (
          <p data-export-table-more="" className="px-5 py-3 text-xs text-text-muted">Showing {initialPageSize} of {totalAfterFilter}</p>
        )}
      </div>
    )
  }
```

The hooks run before the early return, so the hook order is the same in both modes. In the export, `filters` is always empty and `showAll` always false, so `visibleRows` is the default view.

- [ ] **Step 4: Run it and confirm it passes**

Run: `npx vitest run components/report-sections/peec-ai/sortable-table.export.test.tsx components/report-sections/peec-ai`
Expected: PASS, and every existing AEO test and golden passes unchanged (export mode is off there).

- [ ] **Step 5: Add the table rules to `app/export/export-theme.css`.** Put them after the `[data-export-keep-with-next]` rule:

```css
/* Tables (spec 2026-10-08-pdf-export-all-reports-design §5). A table splits between pages only between rows, and
   Chromium repeats the header row on each page it continues on. Cells wrap at the page width instead of the live
   page's horizontal scroll, which a PDF would cut. */
.export-theme [data-export-table] { overflow: visible; }
.export-theme [data-export-table] table { table-layout: auto; }
.export-theme [data-export-table] th,
.export-theme [data-export-table] td { white-space: normal; overflow-wrap: anywhere; }
.export-theme [data-export-row] { break-inside: avoid; }
.export-theme [data-export-table-more] { break-before: avoid; }
```

Pin them in `app/export/export-theme.test.ts`:

```ts
// PDF export PR 2 (AEO): long tables split only between rows; nothing scrolls sideways off the page.
test('table rows never split, cells wrap, and the "Showing" line stays with its table', () => {
  expect(css).toContain('.export-theme [data-export-row] { break-inside: avoid; }')
  expect(css).toContain('.export-theme [data-export-table] td { white-space: normal; overflow-wrap: anywhere; }')
  expect(css).toContain('.export-theme [data-export-table-more] { break-before: avoid; }')
})
```

The second assertion matches the two-selector rule's last line. If it doesn't match as a substring, assert `'.export-theme [data-export-table] th,'` and `'white-space: normal; overflow-wrap: anywhere;'` separately.

- [ ] **Step 6: Add the long-table fixture to the acceptance script.** In `e2e/export/acceptance.mts`, beside the keep-with-next fixture, add a `/table` page:
- a card with an `h3` title carrying `data-export-keep-with-next`, starting 600 px down the page;
- then `<div data-export-table><table>` with a `<thead>` of one row (`TABLEHEAD`) and 60 body rows `<tr data-export-row>` each 30 px tall, with text `ROW1`…`ROW60`.

Checks:

```ts
const tableFile = join(out, 'table.pdf'); writeFileSync(tableFile, await renderPdf({ url: `${origin}/table`, cookies: [] }))
const tbl = readPdf(tableFile)
const rowPages = Array.from({ length: 60 }, (_, i) => pagesOf(tbl, `ROW${i + 1}`))
check(rowPages.every((p) => p.length === 1), 'every table row prints whole, on one page')
check(pagesOf(tbl, 'TABLETITLE')[0] === rowPages[0][0], `a table's title stays with its first rows (${pagesOf(tbl, 'TABLETITLE')} / ${rowPages[0]})`)
const lastPage = rowPages[59][0]
check(lastPage > rowPages[0][0] && pagesOf(tbl, 'TABLEHEAD').length === lastPage - rowPages[0][0] + 1, 'the header row repeats on every page the table continues on')
```

Route `/table` in the fixture server's `html()` the same way `/keep` is routed.

- [ ] **Step 7: Run the theme test, then commit**

Run: `npx vitest run app/export/export-theme.test.ts`
Expected: PASS. The acceptance script runs in Task 9.

```bash
git checkout -q -- CLAUDE.md
git add components/report-sections/peec-ai/sortable-table.tsx components/report-sections/peec-ai/sortable-table.export.test.tsx app/export/export-theme.css app/export/export-theme.test.ts e2e/export/acceptance.mts
git commit -m "feat(export): AEO tables print their default view, split only between rows

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Hover hints are hidden in the export

**Files:**
- Modify: `components/ui/info-tooltip.tsx`
- Create: `components/export/info-tooltip.export.test.tsx`

**Interfaces:**
- Produces: `InfoTooltip` returns `null` in export mode.

- [ ] **Step 1: Write the failing test** `components/export/info-tooltip.export.test.tsx`

```tsx
import { expect, test } from 'vitest'
import { render } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { InfoTooltip } from '@/components/ui/info-tooltip'
import { ExportModeProvider } from './export-mode'

// A "?" that shows its text on hover does nothing on paper (spec 2026-10-08-pdf-export-all-reports-design §5).
test('a hover-only hint prints nothing in the export, and is unchanged on the live page', () => {
  const ui = <TooltipProvider><InfoTooltip text="What this means" /></TooltipProvider>
  expect(render(<ExportModeProvider>{ui}</ExportModeProvider>).container.textContent).toBe('')
  expect(render(ui).container.textContent).toBe('?')
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run components/export/info-tooltip.export.test.tsx`
Expected: FAIL. The export prints "?".

- [ ] **Step 3: Implement it.** In `components/ui/info-tooltip.tsx`, add `import { useExportMode } from "@/components/export/export-mode"` and make the first line of the function body:

```tsx
  // A hover-only hint does nothing in the PDF export (spec 2026-10-08-pdf-export-all-reports-design §5).
  if (useExportMode()) return null
```

- [ ] **Step 4: Run it and the export suites**

Run: `npx vitest run components/export components/report-sections/organic-social components/report-sections/peec-ai`
Expected: PASS. If an Organic Social export test asserted a "?", update it to its absence and note the change in the commit (deviation 4).

- [ ] **Step 5: Commit**

```bash
git checkout -q -- CLAUDE.md
git add components/ui/info-tooltip.tsx components/export/info-tooltip.export.test.tsx
git commit -m "feat(export): hover-only hints print nothing in the export

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: AEO charts print complete, at their default view

**Files:**
- Modify: `components/report-sections/peec-ai/visibility-chart.tsx`
- Modify: `components/report-sections/peec-ai/slope-chart.tsx`
- Modify: `components/report-sections/peec-ai/bot-vs-human-scatter.tsx`
- Modify: `components/report-sections/peec-ai/pr-influence-tables.tsx` (`PromptClusterOpportunityMatrix` only)
- Create: `components/report-sections/peec-ai/charts.export.test.tsx`

**Interfaces:**
- Consumes: `useExportMode`.
- Produces:
  - **Visibility chart:** the root card carries `data-export-block` and `data-export-chart`; the granularity buttons carry `data-export-hide` (its subtitle already names the granularity).
  - **Slope chart:** in export mode the metric toggle prints as `<p data-export-toggle-label>` naming the active metric; lines don't animate; the legend's overflow is visible.
  - **Scatter:** points don't animate.
  - **Prompt-cluster matrix:** its card carries `data-export-block` and `data-export-chart`, and its bars don't animate.

- [ ] **Step 1: Write the failing test** `components/report-sections/peec-ai/charts.export.test.tsx`

```tsx
import { expect, test, vi } from 'vitest'
import type { ReactElement } from 'react'
import { render, screen } from '@testing-library/react'

// Records each Line, Bar and Scatter's props, then renders the real one (recorders keep the real displayName so
// Recharts finds them by type), and gives ResponsiveContainer a size jsdom can't measure.
const { seen } = vi.hoisted(() => ({ seen: [] as { kind: string; props: Record<string, unknown> }[] }))
vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts')
  const { cloneElement } = await import('react')
  const rec = (kind: 'Line' | 'Bar' | 'Scatter') => Object.assign(
    (p: Record<string, unknown>) => { seen.push({ kind, props: p }); const C = actual[kind] as unknown as (q: Record<string, unknown>) => ReactElement; return <C {...p} /> },
    { displayName: actual[kind].displayName },
  )
  return {
    ...actual, Line: rec('Line'), Bar: rec('Bar'), Scatter: rec('Scatter'),
    ResponsiveContainer: ({ children }: { children: ReactElement<{ width?: number; height?: number }> }) => cloneElement(children, { width: 800, height: 400 }),
  }
})

import { TooltipProvider } from '@/components/ui/tooltip'
import { ExportModeProvider } from '@/components/export/export-mode'
import { VisibilityChart } from './visibility-chart'
import SlopeChart from './slope-chart'
import BotVsHumanScatter from './bot-vs-human-scatter'
import { PromptClusterOpportunityMatrix } from './pr-influence-tables'

const inExport = (ui: ReactElement) => render(<TooltipProvider><ExportModeProvider>{ui}</ExportModeProvider></TooltipProvider>)
const DAYS = Array.from({ length: 21 }, (_, i) => ({ date: `2026-09-${String(i + 1).padStart(2, '0')}`, visibility: 10 + i }))
const SLOPE = {
  aiReferralByPath: new Map<string, [number, number]>([['/a', [10, 30]], ['/b', [40, 12]]]),
  organicByPath: new Map<string, [number, number]>(),
  citationShareByUrlKey: new Map<string, { prior: number; current: number; url: string }>(),
}
const SCATTER = { points: [{ path: '/a', bots: 5, humans: 9, quadrant: 'high-bot-high-human' as const }, { path: '/b', bots: 1, humans: 2, quadrant: 'low-bot-low-human' as const }], medianBot: 3, medianHuman: 5 }

test('the visibility chart is one dark block at its default granularity, with no toggle buttons', () => {
  const { container } = inExport(<VisibilityChart data={DAYS} competitorData={[]} brandName="Brand" />)
  const card = container.firstElementChild!
  expect(card.hasAttribute('data-export-block') && card.hasAttribute('data-export-chart')).toBe(true)
  expect(container.querySelector('[data-export-hide]')?.querySelectorAll('button')).toHaveLength(4)
  expect(container.textContent).toContain('Brand · weekly')
})

test('the slope chart prints its default metric as a label, not buttons, and its lines draw complete', () => {
  seen.length = 0
  inExport(<SlopeChart input={SLOPE} compareActive />)
  expect(screen.queryAllByRole('button')).toHaveLength(0)
  expect(screen.getByText('AI Referral Traffic')).toBeTruthy()
  const lines = seen.filter((s) => s.kind === 'Line')
  expect(lines.length).toBeGreaterThan(0)
  expect(lines.every((s) => s.props.isAnimationActive === false)).toBe(true)
})

test('the scatter and the prompt-cluster bars draw complete; the cluster card is one dark block', () => {
  seen.length = 0
  inExport(<BotVsHumanScatter data={SCATTER} clientDomain="example.com" />)
  const { container } = inExport(<PromptClusterOpportunityMatrix rows={[{ cluster: 'Pricing', editorialCitationDensity: 12.5, brandMentionRate: 0, competitorPresence: 0, opportunityScore: 1 }] as never} />)
  expect(seen.filter((s) => s.kind === 'Scatter' || s.kind === 'Bar').every((s) => s.props.isAnimationActive === false)).toBe(true)
  expect(seen.some((s) => s.kind === 'Scatter') && seen.some((s) => s.kind === 'Bar')).toBe(true)
  const card = container.firstElementChild!
  expect(card.hasAttribute('data-export-block') && card.hasAttribute('data-export-chart')).toBe(true)
})

test('outside the export the slope chart keeps its toggle buttons and animates', () => {
  seen.length = 0
  render(<TooltipProvider><SlopeChart input={SLOPE} compareActive /></TooltipProvider>)
  expect(screen.getAllByRole('button')).toHaveLength(3)
  expect(seen.filter((s) => s.kind === 'Line').every((s) => !('isAnimationActive' in s.props))).toBe(true)
})
```

If `PromptClusterOpportunityRow` has required fields other than those in the fixture, add them with zero values, reading the interface in `pr-influence-tables.tsx`. The `as never` keeps a missing optional field from failing the type-check without hiding a real one. Check `tsc` in Step 4.

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run components/report-sections/peec-ai/charts.export.test.tsx`
Expected: FAIL. There are no markers, the toggle buttons render, and the charts animate.

- [ ] **Step 3: Implement it.**
- **`visibility-chart.tsx`:**
  - On the root `<div className="rounded-lg border border-white/[0.06] bg-bg-surface p-5">`, add `data-export-block="" data-export-chart=""`.
  - On the granularity button group `<div className="flex gap-1 rounded-lg bg-white/[0.04] p-0.5">`, add `data-export-hide=""`.
  - No hook is needed.
- **`slope-chart.tsx`:**
  - Import `useExportMode`.
  - In `SlopeChart`, after its `useState` lines, add `const exportMode = useExportMode()`.
  - Replace both `<ToggleRow active={metric} onChange={setMetric} />` with `{exportMode ? <p data-export-toggle-label="" className="text-xs font-semibold text-white">{TOGGLES.find((t) => t.value === metric)!.label}</p> : <ToggleRow active={metric} onChange={setMetric} />}`.
  - On `<Line …>`, add `{...(exportMode ? { isAnimationActive: false } : {})}`.
  - On the legend `<ul className="flex w-56 shrink-0 flex-col gap-1 overflow-y-auto pr-1">`, change the class to `cn('flex w-56 shrink-0 flex-col gap-1 pr-1', exportMode ? 'overflow-visible' : 'overflow-y-auto')`.
- **`bot-vs-human-scatter.tsx`:**
  - Import `useExportMode`.
  - Add `const exportMode = useExportMode()` as the first line of `BotVsHumanScatter`, before the early `return` for empty states, so hooks keep their order.
  - On `<Scatter …>`, add `{...(exportMode ? { isAnimationActive: false } : {})}`.
- **`pr-influence-tables.tsx`, `PromptClusterOpportunityMatrix`:**
  - Import `useExportMode`.
  - Add `const exportMode = useExportMode()` as its first line.
  - On its root card `<div className="rounded-lg border border-white/[0.08] bg-bg-surface p-6">`, add `data-export-block="" data-export-chart=""`.
  - On `<Bar dataKey="value" …>`, add `{...(exportMode ? { isAnimationActive: false } : {})}`.

- [ ] **Step 4: Run it, the AEO suite and `tsc`**

Run: `npx vitest run components/report-sections/peec-ai && npx tsc --noEmit -p .`
Expected: the new test passes. Goldens that render the visibility chart (`parts/visibility-chart`, `parity`) fail **only** by the added attributes; leave them failing until Task 8. No other failures.

- [ ] **Step 5: Commit**

```bash
git checkout -q -- CLAUDE.md
git add components/report-sections/peec-ai/{visibility-chart,slope-chart,bot-vs-human-scatter,pr-influence-tables}.tsx components/report-sections/peec-ai/charts.export.test.tsx
git commit -m "feat(export): AEO charts print complete at their default view, as dark blocks

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The Overview: one provider, and how each part pages

**Files:**
- Modify: `components/report-sections/peec-ai/provider-tabs.tsx`
- Create: `components/report-sections/peec-ai/parts/export-layout.ts`
- Modify: `components/report-sections/peec-ai/index.tsx` (`ProviderSection`'s part wrapper)
- Modify: `components/report-sections/peec-ai/{llm-breakdown-table,brand-rankings-table,top-domains-table,winners-losers-cards}.tsx`, `parts/{kpi-cards,domains-row}.tsx`
- Create: `components/report-sections/peec-ai/overview.export.test.tsx`, `components/report-sections/peec-ai/parts/export-layout.test.ts`

**Interfaces:**
- Produces:
  - **`ProviderTabs`:** in export mode it renders `<p data-export-provider>{LABELS[first]}</p>` (only when there are two or more providers), then `sections[availableProviders[0]]`, with no buttons.
  - **`PEEC_EXPORT_LAYOUT`:** `Record<'<id>@<version>', 'own' | 'block'>` and `peecWrapsAsBlock(id, version): boolean`.
  - **Markers:**
    - `data-export-keep-with-next` on each table card's header row;
    - `data-export-block` on each winners/losers card, the KPI grid, and the domain-types chart, which also gets `data-export-chart`.

- [ ] **Step 1: Write the failing tests**

`components/report-sections/peec-ai/parts/export-layout.test.ts`:

```ts
import { expect, test } from 'vitest'
import { PEEC_PARTS } from './registry'
import { BESPOKE_PARTS } from './bespoke/registry'
import { mergeRegistries } from '@/lib/report-sections/registry'
import { PEEC_EXPORT_LAYOUT, peecWrapsAsBlock } from './export-layout'

// Every AEO Overview part says how it pages in the PDF export, as Organic Social's do: it lays out its own blocks
// (it can be taller than a page), or the Overview wraps it whole. A part registered without a decision fails here.
const registered = Object.entries(mergeRegistries(PEEC_PARTS, BESPOKE_PARTS)).flatMap(([id, v]) => Object.keys(v).map((n) => `${id}@${n}`)).sort()

test('every registered part has an export layout, and nothing else does', () => {
  expect(Object.keys(PEEC_EXPORT_LAYOUT).sort()).toEqual(registered)
})

test('tables lay out their own rows; short parts are wrapped whole; an unknown part is wrapped', () => {
  expect(['brand-rankings', 'domains-row', 'llm-breakdown'].map((id) => peecWrapsAsBlock(id, 1))).toEqual([false, false, false])
  expect(['kpi-cards', 'footer', 'overview-synopsis'].map((id) => peecWrapsAsBlock(id, 1))).toEqual([true, true, true])
  expect(peecWrapsAsBlock('not-a-part', 1)).toBe(true)
})
```

`components/report-sections/peec-ai/overview.export.test.tsx`:

```tsx
import { expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ExportModeProvider } from '@/components/export/export-mode'
import { ProviderTabs } from './provider-tabs'
import { PEEC_PARTS } from './parts/registry'
import { FIXTURE_PEEC_CTX } from './parts/__fixtures__/peec-ctx'

const inExport = (ui: React.ReactElement) => render(<TooltipProvider><ExportModeProvider>{ui}</ExportModeProvider></TooltipProvider>)
const part = (id: keyof typeof PEEC_PARTS) => PEEC_PARTS[id][1].render(FIXTURE_PEEC_CTX, { id, version: 1, label: PEEC_PARTS[id][1].defaultLabel })

test('with two providers the export prints the first, labelled, with no tab buttons', () => {
  inExport(<ProviderTabs availableProviders={['peec', 'profound']} clientSlug="c" sections={{ peec: <p>PEEC SECTION</p>, profound: <p>PROFOUND SECTION</p> }} />)
  expect(screen.queryAllByRole('button')).toHaveLength(0)
  expect(screen.getByText('Peec AI')).toBeTruthy()
  expect(screen.getByText('PEEC SECTION')).toBeTruthy()
  expect(screen.queryByText('PROFOUND SECTION')).toBeNull()
})

test('with one provider the export prints it with no label', () => {
  inExport(<ProviderTabs availableProviders={['profound']} clientSlug="c" sections={{ profound: <p>PROFOUND SECTION</p> }} />)
  expect(screen.getByText('PROFOUND SECTION')).toBeTruthy()
  expect(screen.queryByText('Profound')).toBeNull()
})

test("each table card's header is kept with its first rows; the KPI grid and the winners/losers cards are blocks", () => {
  for (const id of ['llm-breakdown', 'brand-rankings', 'domains-row'] as const) {
    const { container, unmount } = inExport(<>{part(id)}</>)
    const head = container.querySelector('[data-export-table]')?.closest('div.rounded-lg')?.querySelector('[data-export-keep-with-next]')
    expect(head, id).toBeTruthy()
    unmount()
  }
  expect(inExport(<>{part('kpi-cards')}</>).container.querySelector('.grid[data-export-block]')).not.toBeNull()
  expect(inExport(<>{part('winners-losers')}</>).container.querySelectorAll('[data-export-block]')).toHaveLength(2)
  const domains = inExport(<>{part('domains-row')}</>).container
  expect(domains.querySelector('[data-export-block][data-export-chart]')?.textContent).toContain('What kinds of sources do AI models cite?')
})
```

If `FIXTURE_PEEC_CTX` renders an empty winners or losers list, the card is still rendered (with its empty message), so the count of 2 holds.

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run components/report-sections/peec-ai/overview.export.test.tsx components/report-sections/peec-ai/parts/export-layout.test.ts`
Expected: FAIL. `./export-layout` doesn't exist, the tab buttons render, and there are no markers.

- [ ] **Step 3: Implement it**

`parts/export-layout.ts`:

```ts
// How each AEO Overview part pages in the PDF export (spec 2026-10-08-pdf-export-all-reports-design §6), as Organic
// Social's parts/export-layout.ts. 'own': the part marks its own blocks (a table that can run past a page splits between
// rows). 'block': the Overview wraps it whole. export-layout.test.ts holds this map to the registry.
export const PEEC_EXPORT_LAYOUT: Record<string, 'own' | 'block'> = {
  'overview-synopsis@1': 'block',
  'kpi-cards@1': 'block',
  'visibility-chart@1': 'own',   // the chart card is its own block (visibility-chart.tsx)
  'llm-breakdown@1': 'own',      // a table
  'winners-losers@1': 'own',     // each card a block (winners-losers-cards.tsx)
  'brand-rankings@1': 'own',     // a table
  'domains-row@1': 'own',        // a table, then the domain-types chart block
  'footer@1': 'block',
}

/** Whether the Overview wraps this part as one unbreakable block in the export. An unknown part is wrapped (fail safe). */
export function peecWrapsAsBlock(id: string, version: number): boolean {
  return PEEC_EXPORT_LAYOUT[`${id}@${version}`] !== 'own'
}
```

In `index.tsx`'s `ProviderSection`, import `peecWrapsAsBlock` from `./parts/export-layout` and change the wrapper to:

```tsx
        return impl ? <div key={`${r.id}@${r.version}`} {...(peecWrapsAsBlock(r.id, r.version) ? { 'data-export-block': '' } : {})}>{impl.render(ctx, r)}</div> : null
```

`provider-tabs.tsx`: import `useExportMode`. After `const [selected, setSelected] = useState…`, add:

```tsx
  // The PDF export prints the live page's default, the first provider (spec 2026-10-08-pdf-export-all-reports-design §6):
  // the export's browser has no saved choice. With two providers its name stands in for the tab row.
  const exportMode = useExportMode()
```

Then, before `if (availableProviders.length < 2)`:

```tsx
  if (exportMode) {
    const first = availableProviders[0]
    return (
      <div className="space-y-8">
        {availableProviders.length > 1 && <p data-export-provider="" className="text-sm font-bold text-white">{LABELS[first]}</p>}
        {sections[first]}
      </div>
    )
  }
```

The `useEffect` that restores the saved choice still runs, but `exportMode` returns before `selected` is read, so it has no effect.

**Markers** (unconditional, deviation 1):
- **`llm-breakdown-table.tsx`, `brand-rankings-table.tsx`, `top-domains-table.tsx`:** on the header row `<div className="flex items-center … border-b border-white/[0.06] px-5 py-4">`, the card's first child, add `data-export-keep-with-next=""`.
- **`winners-losers-cards.tsx`:** on `PromptDeltaCard`'s root `<div className="flex flex-col rounded-lg … p-5 h-full">`, add `data-export-block=""`.
- **`parts/kpi-cards.tsx`:** on `<div className="grid grid-cols-1 gap-5 sm:grid-cols-3">`, add `data-export-block=""`.
- **`parts/domains-row.tsx`:** on `DomainTypesChart`'s root `<div className="rounded-lg border border-white/[0.06] bg-bg-surface p-5">`, add `data-export-block="" data-export-chart=""`.

- [ ] **Step 4: Run them and confirm they pass**

Run: `npx vitest run components/report-sections/peec-ai/overview.export.test.tsx components/report-sections/peec-ai/parts/export-layout.test.ts`
Expected: PASS. The goldens fail only by the added attributes (Task 8).

- [ ] **Step 5: Commit**

```bash
git checkout -q -- CLAUDE.md
git add components/report-sections/peec-ai
git commit -m "feat(export): the AEO Overview prints one provider and pages each part

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: PR Influence

**Files:**
- Modify: `components/report-sections/peec-ai/pr-influence-tables.tsx` (`SectionHeading`)
- Modify: `components/report-sections/peec-ai/sentiment-insights.tsx`, `sentiment-insights-section.tsx`, `synopsis-skeleton.tsx`
- Modify: `components/report-sections/peec-ai/pr-influence-tables.test.tsx` (add cases)
- Create: `components/report-sections/peec-ai/sentiment.export.test.tsx`

**Interfaces:**
- Produces:
  - **`SectionHeading`:** its wrapper carries `data-export-keep-with-next`.
  - **Skeletons:** `SentimentSkeleton` and `SynopsisSkeleton` roots carry `data-export-pending` (inert outside the export; the readiness check waits on them).
  - **`SentimentInsights`:** its `header` carries `data-export-keep-with-next`, and each `ThemeColumn` is a `data-export-block`. In export mode a column's theme list has no `max-h-[400px]` or `overflow-y-auto`.

- [ ] **Step 1: Write the failing tests**

Append to `pr-influence-tables.test.tsx`, which already has `ROWS: PRPlacementMatchbackRow[]` and imports `TooltipProvider`. Add `import { ExportModeProvider } from '@/components/export/export-mode'`.

```tsx
// PDF export (spec 2026-10-08 §6): each card's heading stays with the first rows of its table.
test("in the export a table card's heading is kept with its table", () => {
  const { container } = render(<TooltipProvider><ExportModeProvider><PRPlacementMatchbackTable rows={ROWS} /></ExportModeProvider></TooltipProvider>)
  expect(container.querySelector('[data-export-keep-with-next] h3')).not.toBeNull()
  expect(container.querySelector('[data-export-table]')).not.toBeNull()
})
```

If `PRPlacementMatchbackTable` takes more props than `rows` (it's called with `dataUnavailable` in `pr-influence.tsx`), pass them as this file's existing `renderTable` does.

`sentiment.export.test.tsx`:

```tsx
import { expect, test } from 'vitest'
import { render } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ExportModeProvider } from '@/components/export/export-mode'
import { SentimentInsights } from './sentiment-insights'
import { SentimentSkeleton } from './sentiment-insights-section'
import { SynopsisSkeleton } from './synopsis-skeleton'

const THEMES = Array.from({ length: 12 }, (_, i) => ({ title: `Theme ${i + 1}`, count: 12 - i, urls: [] as string[] }))
const DATA = { occurrences: 40, positivePct: 70, positiveThemes: THEMES, negativeThemes: THEMES.slice(0, 3) }

test('sentiment prints every collapsed theme with no scroll cap, each column a block, the header kept with them', () => {
  const { container } = render(<TooltipProvider><ExportModeProvider><SentimentInsights data={DATA as never} /></ExportModeProvider></TooltipProvider>)
  expect(container.querySelector('header[data-export-keep-with-next]')).not.toBeNull()
  expect(container.querySelectorAll('[data-export-block]').length).toBeGreaterThanOrEqual(2)
  expect(container.querySelector('.max-h-\\[400px\\]')).toBeNull()
  expect(container.textContent).toContain('Theme 12')
})

test('the sentiment and synopsis skeletons say "still loading" to the export', () => {
  expect(render(<SentimentSkeleton />).container.querySelector('[data-export-pending]')).not.toBeNull()
  expect(render(<SynopsisSkeleton />).container.querySelector('[data-export-pending]')).not.toBeNull()
})

test('outside the export the theme list keeps its scroll cap', () => {
  const { container } = render(<TooltipProvider><SentimentInsights data={DATA as never} /></TooltipProvider>)
  expect(container.querySelector('.max-h-\\[400px\\]')).not.toBeNull()
})
```

Before running, read the `ProfoundSentiment` type (imported in `sentiment-insights.tsx`) and name its fields as the type does in `DATA`. The `as never` covers fields the component doesn't read.

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run components/report-sections/peec-ai/pr-influence-tables.test.tsx components/report-sections/peec-ai/sentiment.export.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement it.**
- **`pr-influence-tables.tsx`, `SectionHeading`:** on its root `<div className="mb-5">`, add `data-export-keep-with-next=""`.
- **`sentiment-insights-section.tsx`, `SentimentSkeleton`:** on its root `<section …>`, add `data-export-pending=""`.
- **`synopsis-skeleton.tsx`:** on its root `<section …>`, add `data-export-pending=""`.
- **`sentiment-insights.tsx`:**
  - Import `useExportMode` and `cn`.
  - On `<header className="mb-4 flex flex-wrap items-center gap-3">`, add `data-export-keep-with-next=""`.
  - In `ThemeColumn`, add `const exportMode = useExportMode()` after its `useState`.
  - On its root `<div className="flex flex-col rounded-lg …">`, add `data-export-block=""`.
  - Change the list's class to `cn('flex-1 space-y-2 pr-1', !exportMode && 'overflow-y-auto max-h-[400px]')`.

- [ ] **Step 4: Run them and confirm they pass**

Run: `npx vitest run components/report-sections/peec-ai`
Expected: the new tests pass, and the goldens fail only by attributes (Task 8).

- [ ] **Step 5: Commit**

```bash
git checkout -q -- CLAUDE.md
git add components/report-sections/peec-ai
git commit -m "feat(export): PR Influence headings stay with their tables; sentiment prints in full

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Content Impact

**Files:**
- Modify: `components/report-sections/peec-ai/content-impact.tsx` (`SectionCard`, KPI strip, Section C grid, synopsis fallback, the scatter and slope cards)
- Modify: `components/report-sections/peec-ai/content-impact-tables.tsx` (`SectionWrapper`, `SubSectionWrapper`)
- Modify: `components/report-sections/peec-ai/content-impact-tables.test.tsx` (add a case)

**Interfaces:**
- Produces:
  - **`SectionCard`:** gains an optional `chart?: boolean` prop. Its title block carries `data-export-keep-with-next`. With `chart`, the card itself carries `data-export-block` and `data-export-chart`.
  - **`SectionWrapper`, `SubSectionWrapper`:** their title blocks carry `data-export-keep-with-next`.
  - **Section C:** the KPI strip's grid and Section C's grid carry `data-export-block`, and the KPI strip's `h3` carries `data-export-keep-with-next`.
  - **Synopsis fallback:** the inline synopsis fallback carries `data-export-pending`.

- [ ] **Step 1: Write the failing test.** Append to `content-impact-tables.test.tsx`, which already has `ROWS: CompetitorUrlsBrandAbsentRow[]` and imports `TooltipProvider`. Add `import { ExportModeProvider } from '@/components/export/export-mode'`.

```tsx
// PDF export (spec 2026-10-08 §6): a section's title stays with the first rows of its table.
test("in the export a section's title is kept with its table", () => {
  const { container } = render(<TooltipProvider><ExportModeProvider><CompetitorUrlsBrandAbsentTable rows={ROWS} emptyMessage="none" /></ExportModeProvider></TooltipProvider>)
  expect(container.querySelector('[data-export-keep-with-next]')).not.toBeNull()
  expect(container.querySelector('[data-export-table]')).not.toBeNull()
})
```

`CompetitorUrlsBrandAbsentTable` renders inside `SectionWrapper` or `SubSectionWrapper`. Whichever it uses, that wrapper's title block gets the attribute in Step 3.

`content-impact.tsx` is a server component that fetches its own data, so its `SectionCard`, grids and fallback are verified in Task 9. The live AEO exports there are rasterized and every Content Impact page is checked for a title alone at a page's foot. The edits below are attribute-only.

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run components/report-sections/peec-ai/content-impact-tables.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement it.**
- **`content-impact-tables.tsx`:**
  - In `SectionWrapper`, on the title `<div>` that wraps the `h3` and description, add `data-export-keep-with-next=""`.
  - In `SubSectionWrapper`, on `<div className="flex items-center gap-2">` (badge and title), add `data-export-keep-with-next=""`. If its description `<p>` follows it, move the attribute to a wrapper around both. Otherwise `break-after: avoid` keeps only the badge line with the description, not with the table.
  - The simplest correct change: wrap the badge row and the description in `<div data-export-keep-with-next="">…</div>`.
- **`content-impact.tsx`:**
  - `SectionCard` gains `chart?: boolean` in its props. Its root becomes `<div className="flex flex-col gap-4 rounded-xl border border-white/[0.06] bg-bg-surface p-6" {...(chart ? { 'data-export-block': '', 'data-export-chart': '' } : {})}>`. Its title `<div>` gets `data-export-keep-with-next=""`.
  - Pass `chart` on the two chart cards, "AI Bot Traffic vs. Human Traffic" and "Which pages are gaining momentum and which are losing it?".
  - **KPI strip (Section A):** add `data-export-keep-with-next=""` on its `h3` and `data-export-block=""` on its `<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">`.
  - **Section C:** add `data-export-block=""` on its `<div className="grid grid-cols-2 gap-4 sm:grid-cols-4">`.
  - **Synopsis fallback:** add `data-export-pending=""` on the inline `<section …>` fallback of the synopsis `Suspense`.

- [ ] **Step 4: Run it and confirm it passes**

Run: `npx vitest run components/report-sections/peec-ai && npx tsc --noEmit -p .`
Expected: the new test passes, `tsc` is clean, and the goldens fail only by attributes.

- [ ] **Step 5: Commit**

```bash
git checkout -q -- CLAUDE.md
git add components/report-sections/peec-ai
git commit -m "feat(export): Content Impact titles stay with their content; its charts are dark blocks

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Technical Audit and the shared section header

**Files:**
- Modify: `components/report-sections/peec-ai/technical-audit.tsx`, `technical-audit-tables.tsx`, `section-header.tsx`
- Create: `components/report-sections/peec-ai/technical-audit-tables.export.test.tsx`

**Interfaces:**
- Produces:
  - **Titles:** both `SectionCard` title blocks, `SectionHeader`'s root, the "at a glance" and checklist `h3`s, and `FixListTable`'s header row carry `data-export-keep-with-next`.
  - **Blocks:** the KPI grid, `TrendSection`'s grid, the `LogAnomaliesTable` stat grid, each checklist category card, and the scoring card carry `data-export-block`.

- [ ] **Step 1: Write the failing test** `technical-audit-tables.export.test.tsx`

```tsx
import { expect, test } from 'vitest'
import { render } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ExportModeProvider } from '@/components/export/export-mode'
import { FixListTable } from './technical-audit-tables'

test("in the export the fix list's title is kept with its table", () => {
  const { container } = render(<TooltipProvider><ExportModeProvider><FixListTable rows={[]} hasDelta={false} errorPageHits={null} /></ExportModeProvider></TooltipProvider>)
  const head = container.querySelector('[data-export-keep-with-next]')
  expect(head?.textContent).toContain('What should SEO and dev fix next?')
  expect(container.querySelector('[data-export-table]')).not.toBeNull()
})
```

`technical-audit.tsx` (server) and `section-header.tsx` get attribute-only edits, verified in Task 9 (rasterized pages) and in Task 8 (`spike.golden` re-baseline, attribute-only).

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run components/report-sections/peec-ai/technical-audit-tables.export.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement it** (all attribute-only).
- **`technical-audit-tables.tsx`:**
  - **`SectionCard`:** on the title `<div>` (the `h3` row plus description), add `data-export-keep-with-next=""`.
  - **`FixListTable`:** on the header `<div className="mb-4 flex items-center gap-2">`, add `data-export-keep-with-next=""`.
  - **`LogAnomaliesTable`:** on the stat grid wrapping the four `{ label, value, color }` cards, add `data-export-block=""`.
- **`technical-audit.tsx`:**
  - **`SectionCard`:** on its title `<div>`, add `data-export-keep-with-next=""`.
  - **Section A:** on its `h3`, add `data-export-keep-with-next=""`; on `<div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">`, add `data-export-block=""`.
  - **`TrendSection`:** on `<div className="grid grid-cols-3 gap-3">`, add `data-export-block=""`.
  - **`AEOChecklistSection`:** on its `h3`, add `data-export-keep-with-next=""`; on each category card `<div key={cat.title} className="flex flex-col gap-3 rounded-xl …">`, add `data-export-block=""`.
  - **Scoring methodology card** (`<div className="flex flex-col gap-4 rounded-xl border border-white/[0.06] bg-bg-surface p-6">` holding "How is priority scored?"): add `data-export-block=""`.
- **`section-header.tsx`:** on the root `<div className="flex items-start gap-4">`, add `data-export-keep-with-next=""`.

- [ ] **Step 4: Run it and confirm it passes**

Run: `npx vitest run components/report-sections/peec-ai && npx tsc --noEmit -p .`
Expected: the new test passes, and the goldens fail only by attributes.

- [ ] **Step 5: Commit**

```bash
git checkout -q -- CLAUDE.md
git add components/report-sections/peec-ai
git commit -m "feat(export): Technical Audit and AEO section titles stay with their content

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Re-baseline the AEO goldens, after proving the diff is attributes only

**Files:**
- Modify: `components/report-sections/peec-ai/__snapshots__/*.snap`, `components/report-sections/peec-ai/parts/__snapshots__/*.snap`

- [ ] **Step 1: Prove the failing goldens differ only by `data-export-*` attributes**

```bash
npx vitest run components/report-sections/peec-ai -u > /tmp/aeo-goldens.log 2>&1
git diff -U0 -- components/report-sections/peec-ai/__snapshots__ components/report-sections/peec-ai/parts/__snapshots__ | grep -E '^[-+] ' > /tmp/aeo-golden-lines.txt
python3 - <<'EOF'
import re
lines = open('/tmp/aeo-golden-lines.txt').read().splitlines()
minus = [l[1:] for l in lines if l.startswith('-')]
plus  = [l[1:] for l in lines if l.startswith('+')]
strip = lambda s: re.sub(r'\s*data-export-[a-z-]+=""', '', s)
# Each removed line must reappear among the added lines once its data-export attributes are stripped, and an added line
# that is not a changed line must be a lone data-export attribute line (snapshots print one attribute per line).
added_attr_only = [p for p in plus if re.fullmatch(r'\s*data-export-[a-z-]+=""', p)]
changed_plus = [p for p in plus if p not in added_attr_only]
assert sorted(strip(m) for m in minus) == sorted(strip(p) for p in changed_plus), 'a golden changed by more than data-export attributes'
print(f'ok: {len(added_attr_only)} attribute lines added, {len(minus)} lines changed only by attributes')
EOF
```

Expected: `ok: …`. If the script asserts, a live-page change slipped in. Find it with `git diff` on the snapshot files, fix the component, and run the step again. Don't commit snapshots that fail this check.

- [ ] **Step 2: Run the AEO suite and commit**

Run: `npx vitest run components/report-sections/peec-ai`
Expected: PASS.

```bash
git checkout -q -- CLAUDE.md
git add components/report-sections/peec-ai
git commit -m "test(export): AEO goldens gain only data-export attributes (checked line by line)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Put the script's `ok:` line in the commit body.

---

### Task 9: Switch AEO on, and prove it on live data

**Files:**
- Modify: `lib/export/sections.ts`
- Modify: `lib/export/request.test.ts`, `app/api/export/pdf/route.test.ts`, `app/export/[clientSlug]/[section]/page.test.tsx`, `components/export/report-views.pages.test.tsx`
- Modify: `e2e/export/acceptance.mts`

**Interfaces:**
- Produces: `SERVER_EXPORT_SECTIONS = ['organic-social', 'peec-ai']`.

- [ ] **Step 1: Update the tests for the switch-on (they fail first)**
- **`lib/export/request.test.ts`:** remove `'peec-ai'` from the "not switched on" `test.each`. Add `test('AEO is switched on', () => expect(parseExportRequest({ ...ok, section: 'peec-ai' })?.section).toBe('peec-ai'))`.
- **`app/api/export/pdf/route.test.ts`:** in "a section not switched on…", use `'paid-media'` instead of `'peec-ai'` (the client's `enabledReports` gains `'paid-media'`).
- **`app/export/[clientSlug]/[section]/page.test.tsx`:** in the "not switched on" test, use `'paid-media'`.
- **`components/export/report-views.pages.test.tsx`:**
  - The "keeps the browser print" `test.each` becomes `['paid-media']`.
  - Add AEO's button case:

    ```tsx
    test(`${routeName}: AEO's button exports on the server, with the resolved tab and the model filter`, async () => {
      const { button } = await onPage(Route, CLIENT, 'peec-ai', 'pr-influence')
      expect(button.props.serverExport).toEqual({ clientSlug: 'c', section: 'peec-ai', subsection: 'pr-influence',
        dateRange: Q.dateRange, compareRange: Q.compareRange, models: 'ChatGPT,Claude' })
    })
    ```

  - Name the AEO unknown-tab stamp (PR 1 review record #3). Replace `if (subsection !== 'not-a-tab') expect(button.props.periodLabel).not.toBeNull()` with:

    ```tsx
      // Named drift (PR 1 review record #3): on AEO an unknown tab shows no period on the page (its date-picker rule), while
      // the export resolves it to Overview and stamps the period the Overview uses. Every other resolved tab stamps a period.
      if (section === 'peec-ai' && subsection === 'not-a-tab') expect(button.props.periodLabel).toBeNull()
      else if (subsection !== 'not-a-tab') expect(button.props.periodLabel).not.toBeNull()
    ```

Run: `npx vitest run lib/export app/api/export app/export components/export`
Expected: FAIL on the AEO cases (`peec-ai` is still refused).

- [ ] **Step 2: Switch it on.** In `lib/export/sections.ts`:

```ts
export const SERVER_EXPORT_SECTIONS: readonly ServerExportSection[] = ['organic-social', 'peec-ai']
```

Run: `npx vitest run lib/export app/api/export app/export components/export`
Expected: PASS.

- [ ] **Step 3: Add the AEO tabs to the live acceptance run.** In `e2e/export/acceptance.mts`, after the A Place for Mom block, export each AEO tab of `process.env.AEO_CLIENT ?? 'renaissance'` as staff and as a client: Overview `null`, `pr-influence`, `content-impact`, `technical-audit`, skipping any tab that client hides. Then:

```ts
  for (const tab of [null, 'pr-influence', 'content-impact', 'technical-audit']) {
    const body = { clientSlug: AEO_CLIENT, section: 'peec-ai', subsection: tab, dateRange: 'last_30_days' }
    const name = `aeo-${tab ?? 'overview'}`
    const s = await exportAs({ role: 'INTERNAL_ADMIN', email: 'acceptance@avenuez.com', clientSlug: null }, body, `${name}-staff`)
    const c = await exportAs({ role: 'CLIENT_VIEWER', email: 'acceptance@localhost', clientSlug: AEO_CLIENT }, body, `${name}-client`)
    for (const [who, r] of [['staff', s], ['client', c]] as const) {
      if (!r) continue
      const text = r.pdf.words.map((w) => w.text).join(' ')
      const controls = text.match(/\b(See all \d+ rows|Show less|Clear all filters|Sort by|Daily Weekly Monthly Quarterly)\b/g) ?? []
      check(controls.length === 0, `${name}-${who}: no table or chart controls (${[...new Set(controls)].join(', ') || 'none'})`)
    }
    if (s && c) check(body2(s.pdf) === body2(c.pdf), `${name}: the staff export prints exactly what the client export does`)
  }
```

- `body2` is the glyphs-plus-page-starts comparison the A Place for Mom block defines as `body`; reuse it by name.
- `exportAs` already checks the content box, Letter landscape, under 4 MB and no system fonts, and it logs `route answers 200 (status, ms)`. Read every AEO tab's ms from that line.

Add `const AEO_CLIENT = process.env.AEO_CLIENT ?? 'renaissance'` near the A Place for Mom constant. Before running, confirm the client has `peec-ai` enabled and which AEO tabs it hides, with the same `tsx` lookup Task 7 of PR 1 used for A Place for Mom. Drop hidden tabs from the list.

- [ ] **Step 4: Run the full verification**

```bash
npx vitest run && npx tsc --noEmit -p .
git diff --name-only origin/dev...HEAD | grep -E '\.(ts|tsx|mts)$' | xargs npx eslint
npm run build && git checkout -q -- CLAUDE.md
```

Then start the app the way PR 1's Task 7 does:

```bash
APP_URL=http://localhost:3457 AUTH_TRUST_HOST=true CHROME_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" npx next start -p 3457
```

In a second shell:

```bash
CHROME_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" BASE=http://localhost:3457 npm run e2e:export
```

Expected: all checks pass, including the Task 1 table fixture. Record each AEO tab's ms. **Any tab over 30 s is a finding:** write it in the ledger and the review record, and say so before the PR asks for review.

- [ ] **Step 5: Check the pages.** Rasterize every page of each `aeo-*-client.pdf` (`pdftoppm -r 60 -png`) and look at each one:
- no heading or card title sits alone at the foot of a page;
- no card or chart is cut across pages;
- nothing is cut at the right edge;
- tables show "Showing N of M" where rows are cut;
- the commentary block prints on Overview, PR Influence and Content Impact where the client has an approved entry.

Write what you checked, page by page, into the ledger. Fix any title left alone by adding the missing `data-export-keep-with-next` with a test, then run Step 4 again.

- [ ] **Step 6: Commit**

```bash
git checkout -q -- CLAUDE.md
git add lib/export/sections.ts lib/export/request.test.ts app/api/export/pdf/route.test.ts "app/export/[clientSlug]/[section]/page.test.tsx" components/export/report-views.pages.test.tsx e2e/export/acceptance.mts
git commit -m "feat(export): AEO exports on the server

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Put each AEO tab's time to ready in the commit body.

---

### Task 10: PR and review record (after the final whole-branch review)

- [ ] **Step 1: Push and open the PR**

```bash
git push -u origin feat/pdf-export-aeo
gh pr create --base feat/pdf-export-shared-pipeline --title "feat(export): AEO exports on the server (PDF export PR 2 of 3)" --body-file pr2-body.md
```

Write `pr2-body.md` in the scratchpad. It covers:
- what changes per tab;
- the deviations above;
- the golden proof line;
- each AEO tab's time to ready;
- the page-by-page check;
- "stacked on #348: retarget to `dev` after #348 merges".

End it with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

- [ ] **Step 2: Open the review-record PR.** Branch `docs/pdf-export-aeo-review` from `origin/dev`, with `docs/qa/pdf-export-aeo-code-review.md` in the CLAUDE.md skeleton:
- **Header:** the exact diff range.
- **§1 How it works:** per tab, where each printed element comes from and what the default view is.
- **§2 Verification:** the tests, the golden proof, acceptance with timings, and the page-by-page check.
- **§3 Findings:** including PR 1's #3 (now named in the test) and any slow tab.
- **§4 Detail.**
- **§5 Follow-ups.**

Don't merge either PR.
