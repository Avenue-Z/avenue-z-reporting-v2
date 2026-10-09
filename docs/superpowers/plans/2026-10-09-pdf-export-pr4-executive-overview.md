# PDF Export PR 4: Executive Overview — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Executive Overview's Export PDF button uses the server export, with the same quality bar as Organic Social, AEO and Paid Media.

**Approach:**
- **Same mechanism as PRs 2 and 3.** Behaviour changes are gated on `useExportMode()`, plus inert `data-export-*` attributes that take effect only under `.export-theme`, the existing export theme, which is unchanged here.
- **Switch-on.** The last commit adds `executive-overview` to `SERVER_EXPORT_SECTIONS`, routes it through `resolveExportView` and `exportReportElement`, and stamps no reporting period, as the live button does.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Tailwind v4, Recharts 3, vitest + Testing Library, puppeteer-core / Chromium (acceptance).

**Spec:** `docs/superpowers/specs/2026-10-09-pdf-export-executive-overview-design.md`, as amended by §A below. Also read `docs/superpowers/specs/2026-10-08-pdf-export-all-reports-design.md` §5, §9 and §10.

**Branch:** `feat/pdf-export-executive-overview`, cut from `feat/pdf-export-paid-media` (`508d299`, PR #352). The PR targets `dev`, as the repo's CI requires, and notes its dependency on #348, #350 and #352.

## A. Spec amendments, made while planning (from reading the code)

1. **E4 is reversed: the export stamps no reporting period for the Executive Overview.**
   - The page mixes windows. Web Analytics is the last 30 days. The AEO journey stage and Contact Creation are year to date. Open pipeline is as of today, and Closed Won is year to date.
   - A header reading "Reporting period: last 30 days" would mislabel half the page.
   - The live button already stamps no period here, under the tested rule "stamp ⇔ picker" (`lib/export-period.pages.test.tsx`).
   - Each section keeps its own window label ("Last 30 days", "Year to date, by ISO week.", "Open pipeline is as of today…").
   - The export page's served range for `executive-overview` is `null`.
2. **Journey layout.** The export renders at a 979 px viewport, below Tailwind's `lg` (1024 px). So the Journey lays out as the page's own two-column `sm:grid-cols-2` grid, with no connector arrows (they are `lg`-only), exactly as a 979 px browser shows it.
   - This answers spec §8's "Journey width" risk: the cards print two per row.
   - The Journey card is one block, and each stage card is also a block, in case the Journey ever outgrows a page.
3. **Dark panels.** Brand colours (cyan `#60FDFF`, blue `#39A0FF`, green `#60FF80`) carry meaning in four places: the Journey card (source labels, sparklines, delta badges), the trend chart, New vs Returning (split bar) and Traffic by Channel (bars).
   - All four get `data-export-chart`, so they print on the dark panel like every other chart in the export.
   - The KPI cards and the CRM blocks stay on white paper.

The amended spec text is committed with this plan.

## Global Constraints

- **Live pages:** no behaviour change on live pages. Every behaviour branch checks `useExportMode()`, and the attributes are inert outside `.export-theme`.
- **Default view, except:** each tab prints its default view, except the Demand Journey cards, which print expanded (E2). The channel chart prints By Volume, sorted by sessions, without source/medium breakdowns (E3).
- **No controls:** no toggles, tabs, sort buttons, arrows or "?" hints print. Toggles print as labels or a static legend.
- **Animation:** Recharts animation is off in export mode, for every series (sparklines, trend).
- **Page breaks:** titles stay with what follows. Cards, charts and short blocks don't split.
- **Commentary and filters:** no commentary (the page has none), and no page filters (it has no picker).
- **No secrets in logs:** never log cookie values or URLs with tokens. Mint session cookies only against `localhost`.
- **Tests:** test-first. Every new test runs RED before its code. A test that renders a client component with function props must carry `'use client'`, or CI's `check:rsc` fails.
- **Merging:** do not merge anything.

## Review Focus

1. **A stale `?dateRange=` from another section.** The Export PDF button posts the URL's range. The PDF must still print no reporting period and serve the page's fixed windows. Pinned in Task 5 (page test, plus an acceptance run that posts a custom range).
2. **A stage that isn't connected.** Expanded mode must not reveal anything on a "Not connected" card. It prints only "Not connected" and the hint, with no stats or sparkline. Pinned in Task 1.
3. **No compare data.** Without a prior period, the trend prints no "Previous Period" legend, and channel rows print their default layout. Neither shows the hover layout's "Prior period —". Pinned in Tasks 2 and 3.
4. **A failed GA4 query or a missing CRM.** `LoadFailed` and `NeedsConnection` print as on the page, and the export completes. Pinned in Task 4 (index test in export mode).
5. **Hover-only text kept in the DOM at `opacity: 0`.** These would still be in the PDF's text layer, so copy/paste would surface them:
   - the Journey's hidden hover label;
   - the channel rows' "Prior period" layer;
   - the `ButtonTooltip` hints.

   In export, every one is either rendered visibly or not rendered at all. Pinned in Tasks 1–3 (text assertions), and by the acceptance controls regex in Task 5.

---

## File map

| File | Change |
|---|---|
| `components/report-sections/executive-overview/demand-journey.tsx` | Export: every connected card expanded, both labels, no hover handlers or hover styling, no animation, dark panel, blocks. |
| `components/report-sections/executive-overview/sessions-trend-chart.tsx` | Export: static legend, no "7d avg", "?" hidden, dark panel, block, no animation. |
| `components/report-sections/executive-overview/kpi-card.tsx` | The "?" hint wrapper gets `data-export-hide` (inert). |
| `components/report-sections/executive-overview/new-returning.tsx` | Export: no hover handlers, "?" hidden, dark panel, block. |
| `components/report-sections/executive-overview/channel-tabs-chart.tsx` | Export: "By Volume" label, plain headers, no hover layer, no breakdowns, "?" hidden, names wrap, dark panel, block. |
| `components/report-sections/executive-overview/index.tsx` | Section titles kept with what follows; KPI grid is a block. |
| `components/report-sections/executive-overview/contact-pacing.tsx` | The root is a block. |
| `components/report-sections/executive-overview/pipeline-performance.tsx` | KPI grid block; owners title kept with the list; owner names wrap. |
| `lib/export/sections.ts`, `lib/export/report-view.ts`, `components/export/report-element.tsx`, `app/export/[clientSlug]/[section]/page.tsx` | Switch-on, view, element, no period stamp. |
| Tests | New `*.export.test.tsx` beside each component, plus extensions of `report-views.pages.test.tsx` and `page.test.tsx`. |
| `e2e/export/acceptance.mts` | `EO_RUNS` (Renaissance, staff and client, with a stale custom range posted). |

`ExportModeProvider` and `useExportMode` come from `@/components/export/export-mode`.

---

### Task 1: Demand Journey prints every connected card expanded

**Files:**
- Modify: `components/report-sections/executive-overview/demand-journey.tsx`
- Test: `components/report-sections/executive-overview/demand-journey.export.test.tsx` (new)

**Interfaces:** Consumes `useExportMode(): boolean`. Produces no new exports. `DemandJourney({ stages })` is unchanged.

- [ ] **Step 1: Write the failing test**

```tsx
// components/report-sections/executive-overview/demand-journey.export.test.tsx
import { expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ExportModeProvider } from '@/components/export/export-mode'
import { DemandJourney, type DemandStage } from './demand-journey'

const live: DemandStage = {
  key: 'ga4', source: 'Web Analytics', label: 'Site Sessions', metric: '89,234', subMetric: '2.1% conv. rate', delta: 15.4,
  color: '#39A0FF', heroLabel: 'sessions in the last 30 days', stats: [{ label: 'Active Users', value: '62,108' }],
  spark: [{ date: '1', sessions: 1 }, { date: '2', sessions: 3 }],
}
const unconnected: DemandStage = { key: 'pipeline', source: 'Pipeline', label: 'Open Pipeline', color: '#8A8A8A', connected: false,
  heroLabel: 'open pipeline as of today', stats: [{ label: 'Open Deals', value: '12' }] }
const inExport = (stages: DemandStage[]) => render(<ExportModeProvider><DemandJourney stages={stages} /></ExportModeProvider>).container

// Spec 2026-10-09 E2: paper has no hover, and these numbers appear nowhere else on the page.
test('the export prints every connected card expanded: both labels and the stats list, visibly', () => {
  const container = inExport([live])
  for (const text of ['2.1% conv. rate', 'sessions in the last 30 days', 'Active Users', '62,108']) {
    const el = screen.getByText(text)
    // Visible, not merely present: nothing on the way up is collapsed or transparent.
    for (let n: HTMLElement | null = el; n && n !== container; n = n.parentElement) {
      const collapsed = (n.style.maxHeight !== '' && parseFloat(n.style.maxHeight) === 0) || n.style.opacity === '0'
      expect(collapsed).toBe(false)
    }
  }
})

test('a card that is not connected prints only its needs-connection copy, never stats', () => {
  inExport([unconnected])
  expect(screen.getByText('Not connected')).toBeTruthy()
  expect(screen.queryByText('Open Deals')).toBeNull()
  expect(screen.queryByText('open pipeline as of today')).toBeNull()
})

test('the Journey is one dark-panel block, each card a block, with no hover styling', () => {
  const container = inExport([live, unconnected])
  const root = container.firstElementChild as HTMLElement
  expect(root.hasAttribute('data-export-block') && root.hasAttribute('data-export-chart')).toBe(true)
  expect(container.querySelectorAll('[data-export-block]')).toHaveLength(1 + 2)
  expect(container.querySelector('.cursor-default')).toBeNull()
})

test('the live Journey still collapses until hovered', () => {
  render(<DemandJourney stages={[live]} />)
  expect(screen.getByText('Active Users').closest('[style*="max-height: 0"]')).not.toBeNull()
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run components/report-sections/executive-overview/demand-journey.export.test.tsx`
Expected: tests 1 and 3 FAIL, because the hidden wrappers have `maxHeight: 0` and no `data-export-*` attributes. Test 4 passes; it pins the live render.

- [ ] **Step 3: Implement**

In `demand-journey.tsx`, add the import `import { useExportMode } from '@/components/export/export-mode'`, then:

```tsx
export function DemandJourney({ stages }: DemandJourneyProps) {
  const [hovered, setHovered] = useState<string | null>(null)
  // PDF export (spec 2026-10-09 E2): every connected card prints expanded, both labels shown, with no hover styling.
  const exportMode = useExportMode()

  return (
    <div className="rounded-xl border border-white/[0.06] bg-bg-surface p-6" data-export-block="" data-export-chart="">
```

Inside the map, after `const up = …`:

```tsx
          const open     = exportMode ? stage.connected !== false : isHov
```

Then make these edits:
- **Node card:**
  - Add `data-export-block=""`.
  - Replace the `onMouseEnter` / `onMouseLeave` props with `onMouseEnter={exportMode ? undefined : () => { … }}` and `onMouseLeave={exportMode ? undefined : () => { … }}`, keeping the same bodies.
  - In `cn(...)`, replace `'relative flex flex-1 cursor-default flex-col …'` with `'relative flex flex-1 flex-col …'` plus `exportMode ? '' : 'cursor-default'`. Hover styling stays keyed on `isHov`, which is never true in export because there are no handlers.
- **Hero label wrapper:** use `style={{ maxHeight: open ? '40px' : '0', opacity: open ? 1 : 0 }}`.
- **Sub-metric wrapper:** use `style={{ maxHeight: exportMode || !isHov ? '32px' : '0', opacity: exportMode || !isHov ? 1 : 0 }}`.
- **Expanded section:** use `style={{ maxHeight: open ? (exportMode ? 'none' : '400px') : '0' }}`.
- **Sparkline `<Area>`:** add `isAnimationActive={!exportMode}`.

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run components/report-sections/executive-overview/demand-journey.export.test.tsx components/report-sections/executive-overview/demand-journey.test.tsx`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add components/report-sections/executive-overview/demand-journey.tsx components/report-sections/executive-overview/demand-journey.export.test.tsx
git commit -m "feat(export): the Demand Journey prints every connected card expanded"
```

---

### Task 2: Trend, KPI cards and New vs Returning print their default view without controls

**Files:**
- Modify: `components/report-sections/executive-overview/sessions-trend-chart.tsx`
- Modify: `components/report-sections/executive-overview/kpi-card.tsx`
- Modify: `components/report-sections/executive-overview/new-returning.tsx`
- Test: `components/report-sections/executive-overview/web-analytics.export.test.tsx` (new)

**Interfaces:** Consumes `useExportMode`. Produces nothing new.

- [ ] **Step 1: Write the failing test**

```tsx
// components/report-sections/executive-overview/web-analytics.export.test.tsx
import { expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ExportModeProvider } from '@/components/export/export-mode'
import { SessionsTrendChart, type TrendRow } from './sessions-trend-chart'
import { KpiCard } from './kpi-card'
import { NewReturning, type AudienceRow } from './new-returning'

const rows: TrendRow[] = [{ date: 'Aug 1', sessions: 100, users: 80, newUsers: 40 }, { date: 'Aug 2', sessions: 120, users: 90, newUsers: 50 }]
const inExport = (ui: React.ReactElement) => render(<ExportModeProvider>{ui}</ExportModeProvider>).container

test('the trend prints its default series as a static legend, with no buttons, smoothing or hints, on one dark block', () => {
  const container = inExport(<SessionsTrendChart data={rows} />)
  expect(container.querySelectorAll('button')).toHaveLength(0)
  expect(screen.queryByText('7d avg')).toBeNull()
  expect(container.textContent).not.toMatch(/rolling average/) // the smoothing hint
  for (const label of ['Sessions', 'Active Users', 'New Users']) expect(screen.getByText(label)).toBeTruthy()
  const root = container.firstElementChild as HTMLElement
  expect(root.hasAttribute('data-export-block') && root.hasAttribute('data-export-chart')).toBe(true)
  expect(container.querySelector('[data-export-hide]')?.textContent).toContain('?')
})

test('without compare data the trend prints no Previous Period legend', () => {
  inExport(<SessionsTrendChart data={rows} compareLabel="Jul 2 – Jul 31" />)
  expect(screen.queryByText(/Previous Period/)).toBeNull()
})

test('the live trend keeps its toggles', () => {
  const { container } = render(<SessionsTrendChart data={rows} />)
  expect(container.querySelectorAll('button').length).toBe(4)
})

test("a KPI card's ? hint is hidden in the export", () => {
  const container = inExport(<KpiCard title="Sessions" value="1" tooltip="Total sessions." />)
  expect(container.querySelector('[data-export-hide]')?.textContent).toContain('Total sessions.')
})

test('New vs Returning prints on one dark block, hint hidden', () => {
  const audience: AudienceRow[] = [{ type: 'new', sessions: 60, engagementRate: 0.5, avgDuration: 90 }, { type: 'returning', sessions: 40, engagementRate: 0.7, avgDuration: 150 }]
  const container = inExport(<NewReturning rows={audience} />)
  const root = container.firstElementChild as HTMLElement
  expect(root.hasAttribute('data-export-block') && root.hasAttribute('data-export-chart')).toBe(true)
  expect(container.querySelector('[data-export-hide]')?.textContent).toContain('Audience loyalty split')
})
```

`SERIES` labels in `sessions-trend-chart.tsx` are `Sessions`, `Active Users` and `New Users` (lines 38–46), confirmed.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run components/report-sections/executive-overview/web-analytics.export.test.tsx`
Expected: FAIL on buttons (4 found), on the missing attributes, and on the hint not being marked. The live-toggles test passes.

- [ ] **Step 3: Implement**

**`sessions-trend-chart.tsx`:**
- Import `useExportMode`, and call `const exportMode = useExportMode()` right after the `useState` calls (before the `data.length === 0` early return).
- Root: `<div className="rounded-lg border border-white/[0.06] bg-bg-surface p-6" data-export-block="" data-export-chart="">`.
- `InlineTooltip`'s wrapper: `<div className="group relative flex-shrink-0" data-export-hide="">`.
- Replace the right-hand controls block with:

```tsx
        {exportMode ? (
          // PDF export: the default view (every series on, unsmoothed), named as a static legend.
          <div className="flex flex-wrap items-center gap-3" data-export-toggle-label="">
            {SERIES.map((s) => (
              <span key={s.key} className="flex items-center gap-1.5 text-xs font-semibold text-white">
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: s.color }} />
                {s.label}
              </span>
            ))}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {/* …the existing 7d avg + series toggles, unchanged… */}
          </div>
        )}
```

- On the current-period `<Area>`, add `isAnimationActive={!exportMode}`.

**`kpi-card.tsx`:** add `data-export-hide=""` to the tooltip wrapper `<div className="group relative flex-shrink-0">`. This is the only change; the file stays hook-free.

**`new-returning.tsx`:**
- Import `useExportMode`, and call `const exportMode = useExportMode()` after `useState` (before the early return).
- Root: add `data-export-block="" data-export-chart=""`.
- The "?" wrapper: add `data-export-hide=""`.
- Stat card handlers: `onMouseEnter={exportMode ? undefined : () => setHovered(r.type)}` and `onMouseLeave={exportMode ? undefined : () => setHovered(null)}`.

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run components/report-sections/executive-overview/`
Expected: all PASS, including the existing trend, KPI and New vs Returning tests.

- [ ] **Step 5: Commit**

```bash
git add components/report-sections/executive-overview/{sessions-trend-chart,kpi-card,new-returning}.tsx components/report-sections/executive-overview/web-analytics.export.test.tsx
git commit -m "feat(export): the Executive Overview trend, KPI cards and New vs Returning print without controls"
```

---

### Task 3: Traffic by Channel prints By Volume as a label, rows in their default layout

**Files:**
- Modify: `components/report-sections/executive-overview/channel-tabs-chart.tsx`
- Test: `components/report-sections/executive-overview/channel-tabs-chart.export.test.tsx` (new)

**Interfaces:** Consumes `useExportMode`. Produces nothing new.

- [ ] **Step 1: Write the failing test**

```tsx
// components/report-sections/executive-overview/channel-tabs-chart.export.test.tsx
import { expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ExportModeProvider } from '@/components/export/export-mode'
import { ChannelTabsChart, type ChannelVolumeRow, type ChannelConvRow } from './channel-tabs-chart'

const volumeData: ChannelVolumeRow[] = [
  { name: 'Organic Search', sessions: 750, pct: 75, convRate: 0.04, color: '#39A0FF' },
  { name: 'Direct', sessions: 250, pct: 25, convRate: 0.02, color: '#60FF80' },
]
const convData: ChannelConvRow[] = [{ name: 'Organic Search', sessions: 750, convRate: 0.04, color: '#39A0FF' }]
const sourceMediumMap = { 'Organic Search': [{ name: 'google / organic', sessions: 700 }] }
const inExport = () => render(<ExportModeProvider>
  <ChannelTabsChart volumeData={volumeData} convData={convData} compareMap={{ 'Organic Search': 500 }} sourceMediumMap={sourceMediumMap} />
</ExportModeProvider>).container

// Spec 2026-10-09 E3: By Volume, sorted by sessions, no breakdowns, no controls.
test('the export names its view as a label and prints no tabs, sort buttons, arrows or hint', () => {
  const container = inExport()
  expect(container.querySelectorAll('button')).toHaveLength(0)
  expect(screen.getByText('By Volume', { selector: '[data-export-toggle-label]' })).toBeTruthy()
  expect(screen.queryByText('By Conversion')).toBeNull()
  expect(container.textContent).not.toMatch(/[↓↑]/)
  expect(container.querySelector('[data-export-hide]')?.textContent).toContain('?')
})

test('rows print their default layout only: no hover layer, no Prior period, no source/medium', () => {
  const container = inExport()
  expect(screen.queryByText('Prior period')).toBeNull()
  expect(screen.queryByText('google / organic')).toBeNull()
  expect(screen.getByText('75%')).toBeTruthy()
  expect(container.querySelector('[class*="cursor"]')).toBeNull()
})

test('the chart is one dark-panel block and channel names wrap', () => {
  const container = inExport()
  const root = container.firstElementChild as HTMLElement
  expect(root.hasAttribute('data-export-block') && root.hasAttribute('data-export-chart') && root.hasAttribute('data-export-wrap')).toBe(true)
})

test('the live chart keeps its tabs and sort buttons', () => {
  const { container } = render(<ChannelTabsChart volumeData={volumeData} convData={convData} />)
  expect(container.querySelectorAll('button').length).toBe(4)
})
```

`SourceMediumEntry` is `{ name: string; sessions: number }` (`channel-tabs-chart.tsx:24`), confirmed.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run components/report-sections/executive-overview/channel-tabs-chart.export.test.tsx`
Expected: FAIL (4 buttons, "Prior period" present in the DOM, no attributes). The live test passes.

- [ ] **Step 3: Implement**

- Import `useExportMode`, and call `const exportMode = useExportMode()` after the `useState` calls (before the `volumeData.length === 0` early return).
- **Root:** `<div className="rounded-lg border border-white/[0.06] bg-bg-surface px-6 py-5" data-export-block="" data-export-chart="" data-export-wrap="">`.
- **`Tooltip`'s wrapper:** `<div className="group relative flex-shrink-0" data-export-hide="">`.
- **Tab row:**

```tsx
        {exportMode ? (
          <p className="text-xs font-semibold text-white" data-export-toggle-label="">By Volume</p>
        ) : (
          <div className="flex gap-1 rounded-lg bg-white/[0.04] p-1">{/* …existing TABS buttons… */}</div>
        )}
```

- **Column headers:** in export, render each header as `<span>` (same classes, minus `hover:` and `transition` classes), without arrows:

```tsx
          {exportMode ? (
            <>
              <span className="w-14 text-right text-[10px] font-bold uppercase tracking-wider text-white sm:w-20">Sessions</span>
              <span className="hidden w-16 text-right text-[10px] font-bold uppercase tracking-wider text-text-muted sm:block">CVR</span>
            </>
          ) : (
            <>{/* …existing two sort buttons… */}</>
          )}
```

- **By Volume rows:**
  - `onMouseEnter={exportMode ? undefined : () => setHovered(row.name)}`, and the same for `onMouseLeave`.
  - Wrap the hover layer `<div>` ("Prior period" / Delta) in `{!exportMode && ( … )}`.
  - Keep the default layer as is.
  - The source/medium block is already gated on `isHovered`, which never becomes true in export because there are no handlers. Leave it.
- **By Conversion rows:** unchanged; in export the tab is always `volume`.

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run components/report-sections/executive-overview/`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add components/report-sections/executive-overview/channel-tabs-chart.tsx components/report-sections/executive-overview/channel-tabs-chart.export.test.tsx
git commit -m "feat(export): Traffic by Channel prints By Volume as a label, rows in their default layout"
```

---

### Task 4: Page structure and the CRM blocks keep their titles and stay whole

**Files:**
- Modify: `components/report-sections/executive-overview/index.tsx`
- Modify: `components/report-sections/executive-overview/contact-pacing.tsx`
- Modify: `components/report-sections/executive-overview/pipeline-performance.tsx`
- Test: `components/report-sections/executive-overview/structure.export.test.tsx` (new)

**Interfaces:** Consumes the components from Tasks 1–3. Produces nothing new. All three files are server components (no hooks); they take attributes only.

- [ ] **Step 1: Write the failing test**

Reuse `index.test.tsx`'s mocks. GA4 returns empty rows, so the charts take their `NoData` state, and Peec and the CRM return `null`.

```tsx
// components/report-sections/executive-overview/structure.export.test.tsx
import { expect, test, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@/lib/ga4/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ga4/client')>()),
  ga4Query: vi.fn(async () => ({ rows: [] })),
}))
vi.mock('@/lib/peec/client', () => ({ getPeecOverview: vi.fn(async () => null) }))
vi.mock('@/lib/db/queries', () => ({ getClientBySlug: vi.fn(async () => ({ slug: 'renaissance' })) }))
vi.mock('@/lib/salesforce/pipeline', () => ({ getSalesforcePipeline: vi.fn(async () => null) }))
vi.mock('@/lib/salesforce/contacts', () => ({ getSalesforceWeeklyContacts: vi.fn(async () => null) }))
vi.mock('@/lib/salesforce/leads', () => ({ getSalesforceWeeklyLeads: vi.fn(async () => null) }))

import { ExportModeProvider } from '@/components/export/export-mode'
import { ExecutiveOverviewReport } from './index'
import { PipelinePerformance } from './pipeline-performance'

test('every section title is kept with what follows, and the KPI grid is one block', async () => {
  render(<ExportModeProvider>{await ExecutiveOverviewReport({ clientSlug: 'renaissance' })}</ExportModeProvider>)
  for (const title of ['Web Analytics', 'Last 30 days', 'Contact Creation', 'Pipeline Performance']) {
    expect(screen.getByText(title).hasAttribute('data-export-keep-with-next')).toBe(true)
  }
  expect(screen.getByText('Sessions').closest('.grid')?.hasAttribute('data-export-block')).toBe(true)
})

test('a client with no CRM prints its Not connected cards and the export still renders', async () => {
  render(<ExportModeProvider>{await ExecutiveOverviewReport({ clientSlug: 'renaissance' })}</ExportModeProvider>)
  expect(screen.getAllByText(/CRM/).length).toBeGreaterThan(0)
  expect(document.querySelector('[data-export-pending]')).toBeNull()
})
```

Then add a pipeline case. Copy `pipeline-performance.test.tsx`'s `data()` helper verbatim into this file as `const PIPELINE = data()`; its base `byOwner` already lists owners.

```tsx
test('pipeline: tiles are one block, the owners title stays with the list, owner names wrap', () => {
  // PIPELINE: pipeline-performance.test.tsx's `data()` helper (lines 16 onward) copied verbatim, called with no overrides.
  const { container } = render(<PipelinePerformance data={PIPELINE} />)
  expect(container.querySelector('.grid')?.hasAttribute('data-export-block')).toBe(true)
  expect(screen.getByText('Open Deals by Owner').hasAttribute('data-export-keep-with-next')).toBe(true)
  expect(screen.getAllByTestId('owner-row')[0].parentElement?.hasAttribute('data-export-wrap')).toBe(true)
})
```

`NeedsConnection` renders "CRM not connected" and "Connect your CRM to see this data in the report." (`needs-connection.tsx:21-23`), so `/CRM/` matches at least twice.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run components/report-sections/executive-overview/structure.export.test.tsx`
Expected: FAIL (no attributes).

- [ ] **Step 3: Implement**

**`index.tsx`** (attributes only):
- `<h2 … data-export-keep-with-next="">Web Analytics</h2>`
- `<p … data-export-keep-with-next="">Last 30 days</p>`
- KPI grid: `<div className="grid grid-cols-2 gap-5 lg:grid-cols-4" data-export-block="">`
- CRM `h2`: add `data-export-keep-with-next=""`.
- The "Scoped to agency-sourced campaigns." `p`: add `data-export-keep-with-next=""`.
- Pipeline `h2`: add `data-export-keep-with-next=""`.

**`contact-pacing.tsx`:** add `data-export-block=""` to the main return's root `<div className="space-y-6">`. That is the pacing block, about 350 px: KPI row, bars and labels.

**`pipeline-performance.tsx`:**
- KPI grid `<div className="grid grid-cols-2 gap-5 lg:grid-cols-4">`: add `data-export-block=""`.
- `h3` "Open Deals by Owner": add `data-export-keep-with-next=""`.
- The owners list `<div className="space-y-2">`: add `data-export-wrap=""`.

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run components/report-sections/executive-overview/`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add components/report-sections/executive-overview/{index,contact-pacing,pipeline-performance}.tsx components/report-sections/executive-overview/structure.export.test.tsx
git commit -m "feat(export): Executive Overview titles stay with their content; KPI and CRM blocks stay whole"
```

---

### Task 5: Switch the Executive Overview onto the server export

**Files:**
- Modify: `lib/export/sections.ts`
- Modify: `lib/export/report-view.ts`
- Modify: `components/export/report-element.tsx`
- Modify: `app/export/[clientSlug]/[section]/page.tsx`
- Modify: `components/export/report-views.pages.test.tsx`
- Modify: `app/export/[clientSlug]/[section]/page.test.tsx`
- Modify: `e2e/export/acceptance.mts`
- Possibly modify: `lib/organic-social/__snapshots__/locked-months-parity.test.tsx.snap`, only after the probe in Step 6.

**Interfaces:** `ServerExportSection` gains `'executive-overview'`. `resolveExportView(client, 'executive-overview', any)` returns `{ section: 'executive-overview', subsectionId: null, channel: null, view: null, pageTitle: 'Executive Overview' }`.

- [ ] **Step 1: Write the failing tests**

In `components/export/report-views.pages.test.tsx`:
- Add the mock `vi.mock('@/components/report-sections/executive-overview', () => stub('ExecutiveOverviewReport'))`.
- Add `'ExecutiveOverviewReport'` to `REPORTS`.
- Add `'executive-overview'` to `CLIENT.enabledReports`.
- Add the case below, inside the `for (const [routeName, Route] …)` loop. It isn't added to `CASES`, because the period assertion there doesn't apply.

```tsx
  test(`${routeName}: the Executive Overview exports the report the page renders, titled as the page, with no period`, async () => {
    const { report, button } = await onPage(Route, CLIENT, 'executive-overview')
    const view = resolveExportView(CLIENT as ExportViewClient, 'executive-overview', null)
    expect(view).toEqual({ section: 'executive-overview', subsectionId: null, channel: null, view: null, pageTitle: 'Executive Overview' })
    const element = exportReportElement(view, params)
    expect(nameOf(element.type)).toBe(nameOf(report.type))
    expect(element.props).toEqual(report.props)
    expect(view.pageTitle).toBe(button.props.pageTitle)
    expect(button.props.periodLabel).toBeNull()
    expect(button.props.serverExport).toMatchObject({ clientSlug: 'c', section: 'executive-overview', subsection: null, models: null })
  })
```

In `app/export/[clientSlug]/[section]/page.test.tsx`, add a mock `vi.mock('@/components/report-sections/executive-overview', () => ({ ExecutiveOverviewReport: function ExecutiveOverviewReport() { return null } }))` and:

```tsx
// Spec 2026-10-09 §A1: the page mixes windows (30 days, year to date, as of today) and has no picker, so the export stamps
// no reporting period, as the live button does; a stale ?dateRange= carried from another section must not stamp one.
test('the Executive Overview stamps the export time and no reporting period, whatever range the request carries', async () => {
  getClientBySlug.mockResolvedValue({ ...CLIENT, enabledReports: ['executive-overview'] })
  const r = await open({ dateRange: 'custom:2026-08-01,2026-08-31', tz: 'America/New_York' }, 'executive-overview')
  if ('redirect' in r) throw new Error('unexpected redirect')
  const [header] = findElements(r.element, (e) => e.type === 'header')
  const text = textOf(header)
  expect(text).toContain('Executive Overview')
  expect(text).toContain('Exported Oct 6, 2026, 10:17 AM EDT')
  expect(text).not.toContain('Reporting period')
  const [report] = findElements(r.element, (e) => nameOf(e.type) === 'ExecutiveOverviewReport')
  expect(report.props).toEqual({ clientSlug: 'renaissance' })
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run components/export/report-views.pages.test.tsx "app/export/[clientSlug]/[section]/page.test.tsx"`
Expected: FAIL. `resolveExportView` doesn't know the section, the button has no `serverExport`, and the export page 404s.

- [ ] **Step 3: Implement**

`lib/export/sections.ts`:

```ts
export type ServerExportSection = 'organic-social' | 'peec-ai' | 'paid-media' | 'executive-overview'

export const SERVER_EXPORT_SECTIONS: readonly ServerExportSection[] = ['organic-social', 'peec-ai', 'paid-media', 'executive-overview']
```

Update the header comment to cite spec `2026-10-09-pdf-export-executive-overview-design`.

In `lib/export/report-view.ts`, before the Paid Media fallthrough:

```ts
  // One page, no tabs (spec 2026-10-09 §4).
  if (section === 'executive-overview') {
    return { section, subsectionId: null, channel: null, view: null, pageTitle: REPORT_NAMES['executive-overview'] ?? 'Executive Overview' }
  }
```

In `components/export/report-element.tsx`, import `ExecutiveOverviewReport` from `@/components/report-sections/executive-overview` and add:

```tsx
    case 'executive-overview':
      // It resolves its own windows (last 30 days, year to date, as of today); the page passes it only the slug.
      return <ExecutiveOverviewReport clientSlug={clientSlug} />
```

In `app/export/[clientSlug]/[section]/page.tsx`, replace the `served` line with:

```tsx
  // The Executive Overview mixes windows and has no picker, so it stamps no period, as its live button (spec 2026-10-09 §A1).
  const served = section === 'executive-overview' ? null : locked ? (locked.month?.dateRange ?? null) : dateRange
```

Update the comment above it to match.

- [ ] **Step 4: Run them and watch them pass, then run the full suite**

Run: `npx vitest run`
Expected: all PASS, except possibly `lib/organic-social/locked-months-parity.test.tsx`. Its client has `executive-overview` enabled, so a case rendering that section would now show `serverExport` on the button. If it fails, go to Step 6 before anything else.

- [ ] **Step 5: Type-check and the boundary check**

Run: `npx tsc --noEmit -p . && npm run -s check:rsc`
Expected: clean.

- [ ] **Step 6: Probe the parity snapshot (only if it failed in Step 4)**

- Use the PR 3 probe (`$S/mkprobe.py` in the scratchpad): hash every locked-months-parity case with `ExportPdfButton` removed, on this branch and on `origin/dev`, using a temporary worktree.
- If every hash matches, re-baseline with `npx vitest run lib/organic-social/locked-months-parity.test.tsx -u`, and record the ruling in the ledger with the diff line count.
- If any hash differs, stop. That is a live-page change; find it before going on.

- [ ] **Step 7: Acceptance**

In `e2e/export/acceptance.mts`, after the `PM_RUNS` block:

```ts
  // Executive Overview (PDF export PR 4): exported as a staff editor and as a client, posting a stale custom range the page
  // ignores (spec 2026-10-09 §A1). No toggle, tab, sort or hover-only text prints; no reporting period is stamped; the two
  // exports print the same; exportAs logs the time to ready.
  {
    const eoClient = process.env.EO_CLIENT ?? 'renaissance'
    const eoBody = { clientSlug: eoClient, section: 'executive-overview', subsection: null, dateRange: 'custom:2026-08-01,2026-08-31' }
    const s = await exportAs({ role: 'INTERNAL_ADMIN', email: 'acceptance@avenuez.com', clientSlug: null }, eoBody, `eo-${eoClient}-staff`)
    const c = await exportAs({ role: 'CLIENT_VIEWER', email: 'acceptance@localhost', clientSlug: eoClient }, eoBody, `eo-${eoClient}-client`)
    for (const [who, r] of [['staff', s], ['client', c]] as const) {
      if (!r) continue
      const text = r.pdf.words.map((w) => w.text).join(' ')
      const controls = text.match(/By Conversion|7d avg|Prior period|rolling average|[↓↑] (Sessions|CVR)/g) ?? []
      check(controls.length === 0, `eo-${eoClient}-${who}: no toggle, tab, sort or hover-only text (${[...new Set(controls)].join(', ') || 'none'})`)
      check(!text.includes('Reporting period'), `eo-${eoClient}-${who}: no reporting period stamped`)
      check(text.includes('Last 30 days'), `eo-${eoClient}-${who}: each section keeps its own window label`)
    }
    if (s && c) check(body(s.pdf) === body(c.pdf), `eo-${eoClient}: the staff export prints exactly what the client export does`)
  }
```

Build and run against a local production server:

```bash
npm run build && git checkout -q -- CLAUDE.md
APP_URL=http://localhost:3457 AUTH_TRUST_HOST=true CHROME_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" npx next start -p 3457   # background
CHROME_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" BASE=http://localhost:3457 npm run -s e2e:export
```

Expected: `all export acceptance checks passed`. The new `eo-renaissance-*` lines are green, and the earlier sections stay green.

- [ ] **Step 8: Page check**

- Rasterize `eo-renaissance-client.pdf` (`pdftoppm -r 40` contact sheet, plus 110–200 dpi crops of the Journey and the channel chart).
- Check:
  - the Journey cards are two per row, expanded and readable on the dark panel;
  - no title is stranded at a page foot;
  - nothing is cut at the right edge;
  - the KPI grid, trend, New vs Returning, channel chart and CRM blocks are whole.
- Any defect gets a test first (RED), then the fix, before this step is ticked. Stop the server with `lsof -ti tcp:3457 | xargs kill`.

- [ ] **Step 9: Commit**

```bash
git add lib/export/sections.ts lib/export/report-view.ts components/export/report-element.tsx "app/export/[clientSlug]/[section]/page.tsx" components/export/report-views.pages.test.tsx "app/export/[clientSlug]/[section]/page.test.tsx" e2e/export/acceptance.mts
git commit -m "feat(export): the Executive Overview exports on the server"
```

Add the snapshot to this commit too, if Step 6 re-baselined it.

---

### Task 6: Final review, PR and review record

- [ ] Run the final whole-branch review: a fresh reviewer, most capable model, on `508d299..HEAD`, with this plan, the spec and its amendments, and the Review Focus above. Re-grade the findings. Fix Critical and Important ones test-first in one pass. Defer Minors to the record.
- [ ] Push `feat/pdf-export-executive-overview`. Open the PR to `dev`, titled `feat(export): the Executive Overview exports on the server (PDF export PR 4)`. In the body, note that it builds on #348, #350 and #352 (merge first), its own range `508d299..HEAD`, the §A amendments, timings, the page check, and `check:rsc`.
- [ ] Open the review-record PR: branch `docs/pdf-export-executive-overview-review` from `origin/dev`, file `docs/qa/pdf-export-executive-overview-code-review.md`, in the CLAUDE.md skeleton.
- [ ] Do not merge either PR.
