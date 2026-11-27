// ytd-review@5 (plan docs/superpowers/plans/2026-11-23-os-design-phase1.md, Task 6): the YTD Review in kit cards, the line
// shaded and frameless, a one-month year in the kit's count columns. Proven against @2 for staff, a client and the PDF
// export, including @2's no-sheet fallback to @1. What the plan says to compare: each card's title, the values handed to
// each chart, the notes, and the column values as rendered labels. Axis ticks differ by design between Recharts' bars and
// the kit's columns, so on a column card those are left out; on a line card both sides are the same Recharts chart, so the
// whole card is compared.
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { render } from '@testing-library/react'
import { Suspense, type ReactElement, type ReactNode } from 'react'

vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts')
  const { cloneElement } = await import('react')
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactElement<{ width?: number; height?: number }> }) =>
      cloneElement(children, { width: 800, height: 300 }),
  }
})
const { getOutlineKpis, getClientBySlug, readYtdTab } = vi.hoisted(() => ({ getOutlineKpis: vi.fn(), getClientBySlug: vi.fn(), readYtdTab: vi.fn() }))
vi.mock('@/lib/organic-social/outline-headlines', async () => ({
  ...(await vi.importActual<typeof import('@/lib/organic-social/outline-headlines')>('@/lib/organic-social/outline-headlines')),
  getOutlineKpis,
}))
vi.mock('@/lib/db/queries', () => ({ getClientBySlug }))
vi.mock('@/lib/organic-social/ytd-sheet', async () => ({
  ...(await vi.importActual<typeof import('@/lib/organic-social/ytd-sheet')>('@/lib/organic-social/ytd-sheet')),
  readYtdTab,
}))
const { getChartNotes } = vi.hoisted(() => ({ getChartNotes: vi.fn(async (): Promise<unknown[]> => []) }))
vi.mock('@/lib/organic-social/chart-notes/select', () => ({ getChartNotes }))
// Staff see the notes panel's edit controls, which use the router; as ytd-notes-panel.test.tsx.
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/app/actions/chart-notes', () => ({}))

import { ExportModeProvider } from '@/components/export/export-mode'
import { ORGANIC_SOCIAL_PARTS } from './registry'
import { ytdReviewV2 } from './ytd-review-sheet'
import { ytdReviewV5 } from './ytd-kit'
import { CountColumns } from '../design/charts'
import { expectSameValues, visibleValues } from './version-parity'
import { FIXTURE_ORGANIC_SOCIAL_CTX } from './__fixtures__/organic-social-ctx'
import kit from '../design/kit.module.css'

// Made-up sheet id and numbers only, as ytd-review-sheet.test.tsx.
const ID = 'TESTSHEETID_abcdefghij0123'
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July ', 'August', 'September', 'October', 'November', 'December']
const sheet = (f: (i: number) => string, v: (i: number) => string) => [
  ['CLIENT: Test Co'], ['FOLLOWER GROWTH'], ['', 'Instagram'], ...MONTHS.map((m, i) => [m, f(i)]),
  [], ['VIEWS'], ['', 'Instagram'], ...MONTHS.map((m, i) => [m, v(i)]),
]
const kpis = (followers: number, views: number, noData = false) => ({ noData, kpis: { followers: { key: 'followers', label: 'Total Followers', format: 'number', value: followers }, exposure: { key: 'exposure', label: 'Views', format: 'number', value: views } } }) as never
const client = (ytdSheets?: unknown) => ({ id: 'c1', dashSocialConfig: { brandId: 1, reportingMonths: { firstMonth: '2026-08' }, ...(ytdSheets === undefined ? {} : { ytdSheets }) } })
const ENTRY = { 2026: { sheetId: ID, tab: 'Test Co' } }
const ytdNote = (over: Record<string, unknown>) => ({
  id: 'n1', clientId: 'c1', channel: 'INSTAGRAM', chart: 'ytd-followers', day: '2026-08-01', body: 'August note', postIds: [],
  status: 'approved', createdBy: 'a@avenuez.com', updatedBy: 'a@avenuez.com', approvedBy: 'b@avenuez.com',
  createdAt: new Date('2026-09-01T00:00:00Z'), updatedAt: new Date('2026-09-01T00:00:00Z'),
  approvedAt: new Date('2026-09-01T00:00:00Z'), deletedAt: null, deletedBy: null, ...over,
})
const SEPT = { ...FIXTURE_ORGANIC_SOCIAL_CTX, clientSlug: 'c', channel: 'INSTAGRAM' as const, dateRange: 'custom:2026-09-01,2026-09-30', compareRange: 'custom:2026-08-01,2026-08-31' }
const AUG = { ...SEPT, dateRange: 'custom:2026-08-01,2026-08-31', compareRange: 'custom:2026-07-01,2026-07-31' }

type Found = { name: string; props: Record<string, unknown> }
/** Every chart element in a returned tree (not rendered), with its props, as ytd-review-sheet.test.tsx's charts(). */
function chartsIn(node: unknown, found: Found[] = []): Found[] {
  const el = node as ReactElement<Record<string, unknown>> | null
  if (!el || typeof el !== 'object') return found
  if (Array.isArray(el)) { for (const k of el) chartsIn(k, found); return found }
  const type = (el as { type?: { name?: string } }).type
  if (typeof type === 'function' && ['LineChart', 'BarChart', 'CountColumns'].includes(type.name ?? '')) found.push({ name: type.name!, props: el.props })
  const kids = (el.props as { children?: unknown } | undefined)?.children
  for (const k of Array.isArray(kids) ? kids : [kids]) chartsIn(k, found)
  return found
}
/** The section a part renders, resolved: async sections are awaited all the way down (the no-sheet path returns @1's). */
async function resolveSection(node: ReactNode): Promise<ReactNode> {
  let el = node as ReactElement<Record<string, unknown>> | null
  if (el && typeof el === 'object' && el.type === Suspense) el = (el.props as { children: ReactElement<Record<string, unknown>> }).children
  while (el && typeof el === 'object' && typeof el.type === 'function' && (el.type as { constructor: { name: string } }).constructor.name === 'AsyncFunction') {
    el = (await (el.type as (p: unknown) => Promise<ReactNode>)(el.props)) as ReactElement<Record<string, unknown>> | null
  }
  if (el && typeof el === 'object' && Array.isArray((el.props as { children?: unknown })?.children)) {
    // A kit wrapper around an async section (the @1 fallback in kit form): resolve the child too.
    const kids = (el.props as { children: unknown[] }).children
    const resolved = await Promise.all(kids.map((k) => resolveSection(k as ReactNode)))
    return { ...el, props: { ...el.props, children: resolved } } as ReactNode
  }
  return el
}
const r = { id: 'ytd-review', version: 0, label: 'x' }
const draw = (node: ReactNode, exporting: boolean) =>
  render(exporting ? <ExportModeProvider>{node}</ExportModeProvider> : <>{node}</>).container
/** Everything a viewer reads outside the charts: titles, the gap line, the notes panel. */
function outsideCharts(c: HTMLElement): string[] {
  const copy = c.cloneNode(true) as HTMLElement
  copy.querySelectorAll('svg, .recharts-wrapper, .recharts-legend-wrapper').forEach((e) => e.remove())
  return visibleValues(copy)
}
const dataOf = (f: Found) => (f.props.data as Record<string, unknown>[])
const keyOf = (f: Found) => (f.props.yKeys as { key: string }[])[0].key

const VIEWS = [
  ['staff', { role: 'INTERNAL_ADMIN', email: 'writer@avenuez.com' }, false],
  ['a client', { role: 'CLIENT_VIEWER' }, false],
  ['the PDF export', { role: 'CLIENT_VIEWER' }, true],
] as const

beforeEach(() => {
  vi.restoreAllMocks()
  getOutlineKpis.mockReset(); getClientBySlug.mockReset(); readYtdTab.mockReset(); getChartNotes.mockReset()
  getChartNotes.mockResolvedValue([])
  vi.spyOn(console, 'warn').mockImplementation(() => {}); vi.spyOn(console, 'error').mockImplementation(() => {})
})

const CASES = [
  ['the sheet, January to September, with a note and a gap', SEPT, () => {
    getClientBySlug.mockResolvedValue(client(ENTRY))
    readYtdTab.mockResolvedValue(sheet((i) => (i === 3 ? '' : i < 8 ? String(1000 + 37 * i) : ''), (i) => (i < 8 ? String(200 + 11 * i) : '')))
    getOutlineKpis.mockResolvedValue(kpis(1400, 410))
    getChartNotes.mockResolvedValue([ytdNote({})])
  }, 'LineChart'],
  ['no sheet for the year: @2 falls back to @1, lines', SEPT, () => {
    getClientBySlug.mockResolvedValue(client())
    getOutlineKpis.mockImplementation(async (_s: string, range: string) => (range.includes('-08-') ? kpis(1300, 380) : kpis(1400, 410)))
  }, 'LineChart'],
] as const
const COLUMN_CASES = [
  ['a one-month year from the sheet: columns', AUG, () => {
    getClientBySlug.mockResolvedValue(client(ENTRY))
    readYtdTab.mockResolvedValue(sheet((i) => (i === 7 ? '1234' : ''), (i) => (i === 7 ? '567' : '')))
    getOutlineKpis.mockResolvedValue(kpis(1234, 567))
  }],
  ['a one-month year with no sheet (@1 through @2): columns', AUG, () => {
    getClientBySlug.mockResolvedValue(client())
    getOutlineKpis.mockResolvedValue(kpis(1234, 567))
  }],
] as const

/** The one deliberate difference (the last look fixes, L3, #527): on the kit, Add annotation shows the artifact's "+ " before
 *  its name, in a span hidden from screen readers. A copy of the kit render with exactly those spans removed (only inside an
 *  Add annotation button) must still read like @2, value for value. */
function withoutAddPlus(el: HTMLElement): HTMLElement {
  const copy = el.cloneNode(true) as HTMLElement
  copy.querySelectorAll('button > span[aria-hidden="true"]').forEach((sp) => {
    if (sp.textContent === '+ ' && sp.parentElement?.textContent === '+ Add annotation') sp.remove()
  })
  return copy
}

describe.each(VIEWS)('ytd-review@5 reads exactly as @2, for %s', (_who, view, exporting) => {
  test.each(CASES)('%s', async (_name, ctx, arrange, kind) => {
    arrange()
    const old = await resolveSection(ytdReviewV2.render({ ...ctx, ...view }, r))
    arrange()
    const kitted = await resolveSection(ytdReviewV5.render({ ...ctx, ...view }, r))
    const oldCharts = chartsIn(old), kitCharts = chartsIn(kitted)
    expect(oldCharts.map((c) => c.name)).toEqual([kind, kind])
    // The same chart, handed the same data, series, notes and dots, plus the kit's two options.
    expect(kitCharts.map((c) => { const { shaded, frameless, ...rest } = c.props; return [c.name, rest, shaded, frameless] }))
      .toEqual(oldCharts.map((c) => [c.name, c.props, true, true]))
    expectSameValues(draw(old, exporting), withoutAddPlus(draw(kitted, exporting)))
  })
  test.each(COLUMN_CASES)('%s', async (_name, ctx, arrange) => {
    arrange()
    const old = await resolveSection(ytdReviewV2.render({ ...ctx, ...view }, r))
    arrange()
    const kitted = await resolveSection(ytdReviewV5.render({ ...ctx, ...view }, r))
    const oldCharts = chartsIn(old), kitCharts = chartsIn(kitted)
    expect(oldCharts.map((c) => c.name)).toEqual(['BarChart', 'BarChart'])
    expect(kitCharts.map((c) => c.name)).toEqual(['CountColumns', 'CountColumns'])
    // Each column card is handed the bar chart's own months and values.
    expect(kitCharts.map((c) => c.props.points)).toEqual(oldCharts.map((c) => dataOf(c).map((d) => ({ label: d.month, value: d[keyOf(c)] }))))
    // Every value and month is a label a viewer reads on the kit's columns.
    const k = withoutAddPlus(draw(kitted, exporting))
    for (const c of oldCharts) for (const d of dataOf(c)) {
      expect(visibleValues(k)).toContain(Number(d[keyOf(c)]).toLocaleString('en-US'))
      expect(visibleValues(k)).toContain(String(d.month))
    }
    // Everything outside the charts (the titles, the gap line, the notes) reads the same.
    expect(outsideCharts(k)).toEqual(outsideCharts(draw(old, exporting)))
  })
})

describe('ytd-review@5', () => {
  // Round 3 (plan docs/superpowers/plans/2026-11-24-os-design-round3.md, Task 4): the notes panel's controls take the kit's
  // look under @5 only; @2 hands it none, so every client not on the kit keeps today's panel. @1 (the no-sheet fallback)
  // draws no notes panel, so the sheet case is the one with panels.
  test('hands every notes panel the kit look, and @2 none', async () => {
    const [, ctx, arrange] = CASES[0]
    const panels = (node: unknown, found: Record<string, unknown>[] = []): Record<string, unknown>[] => {
      const el = node as ReactElement<Record<string, unknown>> | null
      if (!el || typeof el !== 'object') return found
      if (Array.isArray(el)) { for (const k of el) panels(k, found); return found }
      if ((el.type as { name?: string } | undefined)?.name === 'YtdNotesPanel') found.push(el.props)
      const kids = (el.props as { children?: unknown } | undefined)?.children
      for (const k of Array.isArray(kids) ? kids : [kids]) panels(k, found)
      return found
    }
    const staff = { ...ctx, role: 'INTERNAL_ADMIN', email: 'writer@avenuez.com' }
    arrange()
    const old = panels(await resolveSection(ytdReviewV2.render(staff, r)))
    arrange()
    const kitted = panels(await resolveSection(ytdReviewV5.render(staff, r)))
    expect(old.length).toBeGreaterThan(0)
    expect(kitted.length).toBe(old.length)
    for (const p of old) expect(p).not.toHaveProperty('look')
    expect(kitted).toEqual(old.map((p) => ({ ...p, look: 'kit' })))
  })
  test('draws the kit: the block inside the kit colours, each card a kit card, never the old chart card', async () => {
    CASES[0][2]()
    const c = draw(await resolveSection(ytdReviewV5.render(SEPT, r)), false)
    expect(c.firstElementChild?.classList.contains(kit.root)).toBe(true)
    // Round 3, Task 6: line height normal, as the artifact (the class only Organic Social's kit wrappers carry).
    expect(c.firstElementChild?.classList.contains(kit.tight)).toBe(true)
    expect(c.querySelectorAll(`.${kit.card}`)).toHaveLength(2)
    expect(c.querySelector('div.rounded-lg.px-6.py-5')).toBeNull()
  })
  test('keeps each card one unbreakable PDF block and the heading kept with it, as @2', async () => {
    CASES[0][2]()
    const old = draw(await resolveSection(ytdReviewV2.render(SEPT, r)), true)
    CASES[0][2]()
    const kitted = draw(await resolveSection(ytdReviewV5.render(SEPT, r)), true)
    expect(kitted.querySelectorAll('[data-export-keep-with-next]')).toHaveLength(old.querySelectorAll('[data-export-keep-with-next]').length)
    expect(kitted.querySelectorAll('[data-export-block]').length).toBeGreaterThanOrEqual(old.querySelectorAll('[data-export-block]').length)
  })
  test('asks exactly what @2 asks: the client, the sheet, the same Dash months, the notes', async () => {
    const calls = () => [getClientBySlug.mock.calls, readYtdTab.mock.calls, getOutlineKpis.mock.calls, getChartNotes.mock.calls]
    for (const [, ctx, arrange] of [...CASES, ...COLUMN_CASES]) {
      getClientBySlug.mockClear(); readYtdTab.mockClear(); getOutlineKpis.mockClear(); getChartNotes.mockClear()
      arrange(); await resolveSection(ytdReviewV2.render(ctx, r))
      const was = JSON.stringify(calls())
      getClientBySlug.mockClear(); readYtdTab.mockClear(); getOutlineKpis.mockClear(); getChartNotes.mockClear()
      arrange(); await resolveSection(ytdReviewV5.render(ctx, r))
      expect(JSON.stringify(calls())).toBe(was)
    }
  })
  test('a failed sheet read, a timeout and an empty year show exactly what @2 shows, logged the same way', async () => {
    const arrangeFail = () => { getClientBySlug.mockResolvedValue(client(ENTRY)); readYtdTab.mockRejectedValue(new Error('boom')) }
    arrangeFail()
    const old = draw(await resolveSection(ytdReviewV2.render(SEPT, r)), false).innerHTML
    const oldLogs = [...vi.mocked(console.error).mock.calls]
    vi.mocked(console.error).mockClear()
    arrangeFail()
    expect(draw(await resolveSection(ytdReviewV5.render(SEPT, r)), false).innerHTML).toBe(old)
    expect(vi.mocked(console.error).mock.calls).toEqual(oldLogs)
    getClientBySlug.mockResolvedValue(client(ENTRY))
    readYtdTab.mockResolvedValue(sheet(() => '', () => ''))
    getOutlineKpis.mockResolvedValue(kpis(0, 0, true))
    const emptyOld = draw(await resolveSection(ytdReviewV2.render(SEPT, r)), false).innerHTML
    expect(draw(await resolveSection(ytdReviewV5.render(SEPT, r)), false).innerHTML).toBe(emptyOld)
  })
  test('renders nothing on Overview, as @2, and keeps @2\'s Suspense and skeleton', async () => {
    expect(await resolveSection(ytdReviewV5.render({ ...SEPT, channel: null }, r))).toBeNull()
    const was = ytdReviewV2.render(SEPT, r) as ReactElement<{ fallback: ReactNode }>
    const now = ytdReviewV5.render(SEPT, r) as ReactElement<{ fallback: ReactNode }>
    expect(now.type).toBe(Suspense)
    expect(now.props.fallback).toEqual(was.props.fallback)
  })
  test('is registered unpublished as version 5, beside the versions that were there', () => {
    expect(ORGANIC_SOCIAL_PARTS['ytd-review'][5]).toBe(ytdReviewV5)
    expect(ytdReviewV5).toMatchObject({ id: 'ytd-review', version: 5, published: false, defaultLabel: ytdReviewV2.defaultLabel })
  })
})

describe('CountColumns, the kit\'s count columns', () => {
  const points = [{ label: 'Jun', value: 1200 }, { label: 'Jul', value: null }, { label: 'Aug', value: 98765 }]
  test('labels every value and every month; a month with no data is a gap, never a 0', () => {
    const c = render(<CountColumns points={points} aria="Followers by month" />).container
    expect(c.querySelectorAll('rect')).toHaveLength(2)
    expect(visibleValues(c)).toEqual(['aria-label=Followers by month', '1,200', 'Jun', 'Jul', '98,765', 'Aug'])
  })
  test('scales columns to the largest value', () => {
    const c = render(<CountColumns points={points} aria="x" />).container
    const [a, b] = [...c.querySelectorAll('rect')].map((e) => Number(e.getAttribute('height')))
    expect(b).toBeGreaterThan(a)
    expect(a / b).toBeCloseTo(1200 / 98765, 2)
  })
  test('draws one column for a one-month year, and nothing but month labels when every value is missing', () => {
    expect(render(<CountColumns points={[{ label: 'Aug', value: 5 }]} aria="x" />).container.querySelectorAll('rect')).toHaveLength(1)
    const empty = render(<CountColumns points={[{ label: 'Aug', value: null }]} aria="x" />).container
    expect(empty.querySelectorAll('rect')).toHaveLength(0)
    expect(visibleValues(empty)).toEqual(['aria-label=x', 'Aug'])
  })
})
