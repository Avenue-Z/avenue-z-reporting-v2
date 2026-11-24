// kpi-check-in@2 (plan docs/superpowers/plans/2026-11-23-os-design-phase1.md, Task 9): the KPI Check-In with each platform
// in a kit card; the rings keep their look and colours (decision (d); the artifact has no rings). Proven against @1 with
// the parity helper for staff (who see the start line's notes and every month), a client and the PDF export, on a fixed
// tab and on month tabs, with the start line read from its tab (#507). The kit
// version awaits the real @1 section and only swaps each platform card's frame (kpi-kit.tsx), so the sheet reads, the
// rows, the start line and the released-month rule are @1's code; these tests pin that too.
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { render } from '@testing-library/react'
import { Suspense, type ReactElement, type ReactNode } from 'react'
const { getClientBySlug, readYtdTab, readSheetTabTitles, readMonthTab, readKpiStartTab, requestClock } = vi.hoisted(() => ({ getClientBySlug: vi.fn(), readYtdTab: vi.fn(), readSheetTabTitles: vi.fn(), readMonthTab: vi.fn(), readKpiStartTab: vi.fn(), requestClock: vi.fn() }))
vi.mock('@/lib/db/queries', () => ({ getClientBySlug }))
vi.mock('@/lib/organic-social/ytd-sheet', async () => ({ ...(await vi.importActual<typeof import('@/lib/organic-social/ytd-sheet')>('@/lib/organic-social/ytd-sheet')), readYtdTab, readSheetTabTitles, readMonthTab, readKpiStartTab }))
vi.mock('@/lib/organic-social/locked-range', async () => ({ ...(await vi.importActual<typeof import('@/lib/organic-social/locked-range')>('@/lib/organic-social/locked-range')), requestClock }))

import { ExportModeProvider } from '@/components/export/export-mode'
import { clockFor } from '@/lib/organic-social/reporting-months'
import { ORGANIC_SOCIAL_PARTS } from './registry'
import { kpiCheckInV1 } from './kpi-check-in'
import { kpiCheckInV2 } from './kpi-kit'
import { expectSameValues, visibleValues } from './version-parity'
import kit from '../design/kit.module.css'

// Made-up sheet id and numbers only, as kpi-check-in.test.tsx.
const ID = 'TESTSHEETID_abcdefghij0123'
const CTX = { clientSlug: 'c', dateRange: 'custom:2026-09-01,2026-09-30', compareRange: 'custom:2026-08-01,2026-08-31', channel: null, view: null }
const GRID = [
  ['Test Co 2026 KPI Tracker '], [], ['', '', 'Total Followers', 'Impressions', 'Engagements'],
  ['Instagram', 'End of September', '1,100', '20,000', '300'], ['', 'H2 2026 Target', '2,000', '50,500', '1,250'],
  ['LinkedIn', 'End of August', '9,000', '47,000', '6,300'], ['', 'H2 2026 Target', '9,400', '80,000', '10,000'],
]
// LinkedIn's row is ahead of the newest month a client may see: a client gets the note, staff get the rings and the note.
const GRID_AHEAD = [
  ['Test Co 2026 KPI Tracker '], [], ['', '', 'Total Followers', 'Impressions', 'Engagements'],
  ['Instagram', 'End of September', '1,100', '20,000', '300'], ['', 'H2 2026 Target', '2,000', '50,500', '1,250'],
  ['LinkedIn', 'End of October', '9,000', '47,000', '6,300'], ['', 'H2 2026 Target', '9,400', '80,000', '10,000'],
]
// The same platforms on September's month tab: every row says "End of September", as a month tab must.
const SEP_TAB = [
  ['Test Co 2026 KPI Tracker'], [], ['', '', 'Total Followers', 'Impressions', 'Engagements'],
  ['Instagram', 'End of September', '1,100', '20,000', '300'], ['', 'H2 2026 Target', '2,000', '50,500', '1,250'],
  ['LinkedIn', 'End of September', '9,000', '47,000', '6,300'], ['', 'H2 2026 Target', '9,400', '80,000', '10,000'],
]
// Where each platform ended 2025 (the start line, kpi-check-in.test.tsx's layout). A platform left out gets a staff note.
const START_TAB = 'Start Tab Title'
const IG_START = ['Instagram', '2025', '700', '150,000', '2,000']
const LI_START = ['LinkedIn', '2025', '8,500', '40,000', '5,000']
const startGrid = (rows = [IG_START, LI_START]) => [
  ['Test Co Annual Growth'], [], ['', '', 'Total Followers', 'Impressions', 'Engagements'], ...rows.flatMap((r) => [r, ['', '2026']]),
]
const FIXED = { sheetId: ID, tab: 'KPIs', startTab: START_TAB }
const BY_MONTH = { sheetId: ID, byMonth: true, startTab: START_TAB }
const client = (channels = ['instagram', 'linkedin'], sheet: object = FIXED) => ({
  id: 'c1', slug: 'c', dashSocialConfig: { brandId: 1, channels, kpiSheets: { 2026: sheet }, reportingMonths: { firstMonth: '2026-01' } },
})
const onMonthTabs = () => {
  getClientBySlug.mockResolvedValue(client(undefined, BY_MONTH))
  readSheetTabTitles.mockResolvedValue(['September 2026'])
  readMonthTab.mockImplementation(async (_id: string, title: string) => (title === 'September 2026' ? SEP_TAB : 'gone'))
}

// 2026-11-03: October opens to clients on the 12th, so September is the newest month a client may see.
beforeEach(() => {
  for (const f of [getClientBySlug, readYtdTab, readSheetTabTitles, readMonthTab, readKpiStartTab, requestClock]) f.mockReset()
  requestClock.mockReturnValue(clockFor(new Date('2026-11-03T12:00:00Z')))
  getClientBySlug.mockResolvedValue(client())
  readKpiStartTab.mockResolvedValue(startGrid())
})

/** A part's rendered element, its Suspense opened and its async section awaited, as the page would serve it. */
async function serve(node: ReactNode): Promise<ReactNode> {
  let el = node as ReactElement<Record<string, unknown>> | null
  if (el && typeof el === 'object' && el.type === Suspense) el = (el.props as { children: ReactElement<Record<string, unknown>> }).children
  while (el && typeof el === 'object' && typeof el.type === 'function' && (el.type as { constructor: { name: string } }).constructor.name === 'AsyncFunction') {
    el = (await (el.type as (p: unknown) => Promise<ReactNode>)(el.props)) as ReactElement<Record<string, unknown>> | null
  }
  return el
}
const draw = (node: ReactNode, exporting: boolean) =>
  render(exporting ? <ExportModeProvider>{node}</ExportModeProvider> : <>{node}</>).container
const r = (version: number) => ({ id: 'kpi-check-in', version, label: 'x' })
/** The old KPI card (kpi-check-in.tsx): its frame classes. */
const OLD_CARD = 'div.rounded-lg.border.bg-bg-surface.px-6.py-5'

const VIEWS = [
  ['staff', { role: 'INTERNAL_ADMIN' }, false],
  ['a client', { role: 'CLIENT_VIEWER' }, false],
  ['the PDF export (a staff export prints the client view)', { role: 'INTERNAL_ADMIN' }, true],
] as const
// Each case: how the sheet answers, the start line text every viewer reads, and the notes only staff read on the page.
const CASES = [
  ['two platforms from the sheet, with the start line', () => readYtdTab.mockResolvedValue(GRID), ['End of 2025: 700', '2025 total: 40,000'], []],
  ['a platform ahead of the released month', () => readYtdTab.mockResolvedValue(GRID_AHEAD), ['End of 2025: 700'], []],
  ['a platform the start tab lacks: a staff note on its card', () => { readYtdTab.mockResolvedValue(GRID); readKpiStartTab.mockResolvedValue(startGrid([IG_START])) },
    ['End of 2025: 700'], ['No end of 2025 figures for LinkedIn.']],
  ['the start tab gone: a staff note on the block', () => { readYtdTab.mockResolvedValue(GRID); readKpiStartTab.mockResolvedValue('gone') },
    [], ['No start tab named in the setting was found.']],
  ['month tabs: the tab named for the month on screen, with the start line', onMonthTabs, ['End of 2025: 700', '2025 total: 40,000'], []],
] as const

describe.each(VIEWS)('kpi-check-in@2 reads exactly as @1, for %s', (_who, view, exporting) => {
  test.each(CASES)('%s', async (_name, arrange, everyone, staffOnly) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    arrange()
    const old = draw(await serve(kpiCheckInV1.render({ ...CTX, ...view }, r(1))), exporting)
    const kitted = draw(await serve(kpiCheckInV2.render({ ...CTX, ...view }, r(2))), exporting)
    warn.mockRestore()
    expect(visibleValues(old).length).toBeGreaterThan(5)
    expectSameValues(old, kitted)
    // The case really drew what it is about, on both sides: the start line for every viewer, the notes for staff on the
    // page only (a staff export prints the client view).
    const staffPage = view.role === 'INTERNAL_ADMIN' && !exporting
    for (const c of [old, kitted]) {
      for (const t of everyone) expect(c.textContent, t).toContain(t)
      for (const t of staffOnly) expect(c.textContent?.includes(t), t).toBe(staffPage)
    }
    expect(readKpiStartTab).toHaveBeenCalledWith(ID, START_TAB)
    // The kit really drew: its colours on the block, a kit card for every old card, none of the old frame left, and the
    // rings themselves untouched (the same svgs, the same labels).
    expect(kitted.firstElementChild?.classList.contains(kit.root)).toBe(true)
    expect(kitted.querySelectorAll(`.${kit.card}`).length).toBe(old.querySelectorAll(OLD_CARD).length)
    expect(kitted.querySelectorAll(`.${kit.card}`).length).toBeGreaterThan(0)
    expect(kitted.querySelector(OLD_CARD)).toBeNull()
    const rings = (c: HTMLElement) => [...c.querySelectorAll('svg[role=img]')].map((s) => s.outerHTML)
    expect(rings(kitted)).toEqual(rings(old))
  })
})

describe('kpi-check-in@2', () => {
  test('each platform is still one unbreakable PDF block, with the heading in the first', async () => {
    readYtdTab.mockResolvedValue(GRID)
    const old = draw(await serve(kpiCheckInV1.render({ ...CTX, role: 'CLIENT_VIEWER' }, r(1))), true)
    const kitted = draw(await serve(kpiCheckInV2.render({ ...CTX, role: 'CLIENT_VIEWER' }, r(2))), true)
    const blocks = (c: HTMLElement) => [...c.querySelectorAll('[data-export-block]')].map((b) => b.querySelector('h3')?.textContent)
    expect(blocks(kitted)).toEqual(blocks(old))
    expect(blocks(kitted)).toEqual(['Instagram', 'LinkedIn'])
  })
  test.each([
    ['a fixed tab', () => readYtdTab.mockResolvedValue(GRID), [readYtdTab]],
    ['month tabs', onMonthTabs, [readSheetTabTitles, readMonthTab]],
  ] as const)('asks exactly what @1 asks, on %s: the client, the sheet reads, the start tab, the clock', async (_name, arrange, tabReads) => {
    arrange()
    const reads = [getClientBySlug, readYtdTab, readSheetTabTitles, readMonthTab, readKpiStartTab, requestClock]
    const calls = () => JSON.stringify(reads.map((f) => f.mock.calls))
    await serve(kpiCheckInV1.render({ ...CTX, role: 'INTERNAL_ADMIN' }, r(1)))
    const was = calls()
    // Nothing compared is an empty list that proves nothing (#507): the client, this setting's tab reads, the start tab
    // and the clock were all really asked.
    for (const f of [getClientBySlug, ...tabReads, readKpiStartTab, requestClock]) expect(f.mock.calls.length).toBeGreaterThan(0)
    for (const f of reads) f.mockClear()
    await serve(kpiCheckInV2.render({ ...CTX, role: 'INTERNAL_ADMIN' }, r(2)))
    expect(calls()).toBe(was)
  })
  test('a sheet read failure, a missing platform and no sheet for the year show exactly what @1 shows', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // [arrange, whether staff get a note (the no-sheet note) rather than the error card or nothing]
    const arrangements = [
      [() => { readYtdTab.mockRejectedValue(new Error('boom')) }, false],
      [() => { getClientBySlug.mockResolvedValue(client(['instagram', 'facebook'])); readYtdTab.mockResolvedValue(GRID) }, false],
      [() => { getClientBySlug.mockResolvedValue({ ...client(), dashSocialConfig: { brandId: 1, channels: ['instagram'] } }) }, true],
    ] as const
    for (const [arrange, staffNote] of arrangements) {
      for (const role of ['INTERNAL_ADMIN', 'CLIENT_VIEWER']) {
        arrange()
        const old = draw(await serve(kpiCheckInV1.render({ ...CTX, role }, r(1))), false).innerHTML
        arrange()
        const kitted = draw(await serve(kpiCheckInV2.render({ ...CTX, role }, r(2))), false)
        // A staff note is wrapped in the kit's colours like any answer, and nothing else changes; the error card and a
        // client's empty answer are exactly @1's (#507: the staff-note markup was not checked before).
        const withNote = staffNote && role === 'INTERNAL_ADMIN'
        expect(old.includes('<p'), `${role} note`).toBe(withNote)
        // The wrapper is checked by its tag, its kit class and its exact contents, so another kit class on it (round 3's
        // line height) does not read as a change to @1's note.
        if (withNote) {
          expect(kitted.children).toHaveLength(1)
          const wrap = kitted.firstElementChild!
          expect([wrap.tagName, wrap.classList.contains(kit.root), wrap.innerHTML]).toEqual(['DIV', true, old])
        } else expect(kitted.innerHTML).toBe(old)
      }
    }
    err.mockRestore(); warn.mockRestore()
  })
  test('renders only on Overview, as @1, and keeps @1\'s Suspense and skeleton', () => {
    expect(kpiCheckInV2.render({ ...CTX, channel: 'INSTAGRAM' as const, role: 'INTERNAL_ADMIN' }, r(2))).toBeNull()
    expect(kpiCheckInV2.render({ ...CTX, view: 'influencer' as const, role: 'INTERNAL_ADMIN' }, r(2))).toBeNull()
    const was = kpiCheckInV1.render({ ...CTX, role: 'INTERNAL_ADMIN' }, r(1)) as ReactElement<{ fallback: ReactNode }>
    const now = kpiCheckInV2.render({ ...CTX, role: 'INTERNAL_ADMIN' }, r(2)) as ReactElement<{ fallback: ReactNode }>
    expect(now.type).toBe(Suspense)
    expect(now.props.fallback).toEqual(was.props.fallback)
  })
  test('is registered unpublished as version 2, with @1\'s label', () => {
    expect(ORGANIC_SOCIAL_PARTS['kpi-check-in'][2]).toBe(kpiCheckInV2)
    expect(kpiCheckInV2).toMatchObject({ id: 'kpi-check-in', version: 2, published: false, defaultLabel: kpiCheckInV1.defaultLabel })
  })
})
