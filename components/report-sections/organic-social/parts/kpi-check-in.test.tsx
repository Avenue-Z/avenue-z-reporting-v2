import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { render } from '@testing-library/react'
const { getClientBySlug, readYtdTab, readSheetTabTitles, readMonthTab, readKpiStartTab, requestClock } = vi.hoisted(() => ({ getClientBySlug: vi.fn(), readYtdTab: vi.fn(), readSheetTabTitles: vi.fn(), readMonthTab: vi.fn(), readKpiStartTab: vi.fn(), requestClock: vi.fn() }))
vi.mock('@/lib/db/queries', () => ({ getClientBySlug }))
vi.mock('@/lib/organic-social/ytd-sheet', async () => ({ ...(await vi.importActual<typeof import('@/lib/organic-social/ytd-sheet')>('@/lib/organic-social/ytd-sheet')), readYtdTab, readSheetTabTitles, readMonthTab, readKpiStartTab }))
vi.mock('@/lib/organic-social/locked-range', async () => ({ ...(await vi.importActual<typeof import('@/lib/organic-social/locked-range')>('@/lib/organic-social/locked-range')), requestClock }))

import { KpiCheckInSection, kpiCheckInV1 } from './kpi-check-in'
import { ORGANIC_SOCIAL_PARTS } from './registry'
import { YtdSheetReadError } from '@/lib/organic-social/ytd-sheet'
import { clockFor } from '@/lib/organic-social/reporting-months'
import { ExportModeProvider } from '@/components/export/export-mode'

// A made-up sheet id and numbers only.
const ID = 'TESTSHEETID_abcdefghij0123'
const CTX = { clientSlug: 'c', dateRange: 'custom:2026-09-01,2026-09-30', compareRange: 'custom:2026-08-01,2026-08-31', channel: null, view: null, role: 'CLIENT_VIEWER' }
const GRID = [
  ['Test Co 2026 KPI Tracker '], [], ['', '', 'Total Followers', 'Impressions', 'Engagements'],
  ['Instagram', 'End of September', '1,100', '20,000', '300'], ['', 'H2 2026 Target', '2,000', '50,500', '1,250'],
  ['LinkedIn', 'End of August', '9,000', '47,000', '6,300'], ['', 'H2 2026 Target', '9,400', '80,000', '10,000'],
]
const client = (kpiSheets?: unknown, channels = ['instagram', 'linkedin']) => ({ id: 'c1', slug: 'c', dashSocialConfig: { brandId: 1, channels, ...(kpiSheets === undefined ? {} : { kpiSheets }) } })
/** The same client on reporting months (firstMonth alone is a valid config: opens on the 12th, next Monday off a weekend). */
const onMonths = (kpiSheets: unknown) => { const c = client(kpiSheets); return { ...c, dashSocialConfig: { ...c.dashSocialConfig, reportingMonths: { firstMonth: '2026-01' } } } }
const GRID_OCT = [
  ['Test Co 2026 KPI Tracker '], [], ['', '', 'Total Followers', 'Impressions', 'Engagements'],
  ['Instagram', 'End of October', '1,100', '20,000', '300'], ['', 'H2 2026 Target', '2,000', '50,500', '1,250'],
  ['LinkedIn', 'End of September', '9,000', '47,000', '6,300'], ['', 'H2 2026 Target', '9,400', '80,000', '10,000'],
]

// 2026-11-03: October opens to clients on the 12th, so September is the newest month a client may see.
beforeEach(() => { getClientBySlug.mockReset(); readYtdTab.mockReset(); readSheetTabTitles.mockReset(); readMonthTab.mockReset(); readKpiStartTab.mockReset(); requestClock.mockReset(); requestClock.mockReturnValue(clockFor(new Date('2026-11-03T12:00:00Z'))) })

test('registered unpublished, renders only on Overview', () => {
  expect(ORGANIC_SOCIAL_PARTS['kpi-check-in'][1]).toBe(kpiCheckInV1)
  expect(kpiCheckInV1.published).toBe(false)
  const pin = { id: 'kpi-check-in', version: 1, label: 'x' }
  expect(kpiCheckInV1.render({ ...CTX, channel: 'INSTAGRAM' as const }, pin)).toBeNull()
  expect(kpiCheckInV1.render({ ...CTX, view: 'influencer' as const }, pin)).toBeNull()
  expect(kpiCheckInV1.render(CTX, pin)).not.toBeNull()
})

test('one row per client channel in channel order, three rings each, each row with its own period', async () => {
  getClientBySlug.mockResolvedValue(client({ 2026: { sheetId: ID, tab: 'KPIs' } }))
  readYtdTab.mockResolvedValue(GRID)
  const { getByText, getAllByRole } = render(await KpiCheckInSection({ ctx: CTX }))
  expect(readYtdTab).toHaveBeenCalledWith(ID, 'KPIs')
  expect(getByText('1/1/26 to 9/30/26')).toBeTruthy()
  expect(getByText('1/1/26 to 8/31/26')).toBeTruthy()
  const labels = getAllByRole('img').map((e) => e.getAttribute('aria-label'))
  expect(labels).toEqual([
    'Total Followers: 1,100 of 2,000', 'Impressions/Views: 20,000 of 50,500', 'Total Engagements: 300 of 1,250',
    'Total Followers: 9,000 of 9,400', 'Impressions: 47,000 of 80,000', 'Total Engagements: 6,300 of 10,000',
  ])
})

test('a client channel missing from the sheet is the error card, not a partial view', async () => {
  getClientBySlug.mockResolvedValue(client({ 2026: { sheetId: ID, tab: 'KPIs' } }, ['instagram', 'facebook']))
  readYtdTab.mockResolvedValue(GRID)
  const err = vi.spyOn(console, 'error').mockImplementation(() => {})
  const { getByText } = render(await KpiCheckInSection({ ctx: CTX }))
  expect(getByText("Couldn't load this section.")).toBeTruthy()
  expect(err.mock.calls.map((c) => c.join(' '))).toEqual(['[organic-social] kpi sheet layout not found slug=c year=2026 missing=Facebook'])
  expect(JSON.stringify(err.mock.calls)).not.toContain(ID)
  err.mockRestore()
})

// Paul, #334 review item 6: no sheet for the year (every January, until the new entry is added) blanked the Overview
// with nothing in the logs. It now warns, and staff see a note; clients still see nothing.
test('no sheet for the year: a warning, a staff-only note, nothing for a client; an invalid entry warns and renders nothing', async () => {
  getClientBySlug.mockResolvedValue(client())
  const warn0 = vi.spyOn(console, 'warn').mockImplementation(() => {})
  expect(await KpiCheckInSection({ ctx: CTX })).toBeNull()
  expect(warn0).toHaveBeenCalledWith('[organic-social] kpi sheet not configured slug=c year=2026')
  expect(render(await KpiCheckInSection({ ctx: { ...CTX, role: 'INTERNAL_ADMIN' } })).getByText('No KPI sheet configured for 2026.')).toBeTruthy()
  warn0.mockRestore()
  getClientBySlug.mockResolvedValue(client({ 2026: { sheetId: 'short', tab: 'x' } }))
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  expect(await KpiCheckInSection({ ctx: CTX })).toBeNull()
  expect(warn).toHaveBeenCalledWith('[organic-social] kpi sheet config invalid slug=c year=2026')
  warn.mockRestore()
})

test('a read failure is the error card with the status, never the id', async () => {
  getClientBySlug.mockResolvedValue(client({ 2026: { sheetId: ID, tab: 'KPIs' } }))
  readYtdTab.mockRejectedValue(new YtdSheetReadError('timeout'))
  const err = vi.spyOn(console, 'error').mockImplementation(() => {})
  const { getByText } = render(await KpiCheckInSection({ ctx: CTX }))
  expect(getByText("Couldn't load this section.")).toBeTruthy()
  expect(err).toHaveBeenCalledWith('[organic-social] kpi sheet read failed slug=c year=2026 status=timeout')
  err.mockRestore()
})

// Item 8: a channel whose tab is hidden is not a KPI row (and a sheet without it is not an error).
test('rows follow the tabs the client shows, not the raw allowlist', async () => {
  getClientBySlug.mockResolvedValue({ ...client({ 2026: { sheetId: ID, tab: 'KPIs' } }, ['instagram', 'linkedin', 'facebook']), hiddenReports: ['organic-facebook'] })
  readYtdTab.mockResolvedValue(GRID)
  const { getAllByRole, queryByText } = render(await KpiCheckInSection({ ctx: CTX }))
  expect(getAllByRole('img').length).toBe(6)
  expect(queryByText('Facebook')).toBeNull()
})

// Items 1 and 2 of Paul's round 2 (2026-10-07): the note anchors on the newest month clients may see (the opened
// months of the reporting-months config), never on the month on screen; the year comes from the range's last day.
test('a sheet row later than the newest released month: a note for clients, rings plus the note for staff; the month on screen does not matter', async () => {
  getClientBySlug.mockResolvedValue(onMonths({ 2026: { sheetId: ID, tab: 'KPIs' } }))
  readYtdTab.mockResolvedValue(GRID_OCT)
  const august = { ...CTX, dateRange: 'custom:2026-08-01,2026-08-31', compareRange: 'custom:2026-07-01,2026-07-31' }
  const c = render(await KpiCheckInSection({ ctx: august }))
  expect(c.getByText('KPI Check-In updates with the October report.')).toBeTruthy()
  expect(c.getAllByRole('img').map((e) => e.getAttribute('aria-label'))).toEqual([
    'Total Followers: 9,000 of 9,400', 'Impressions: 47,000 of 80,000', 'Total Engagements: 6,300 of 10,000',
  ])
  expect(c.queryByText('1/1/26 to 10/31/26')).toBeNull()
  c.unmount()
  const staff = render(await KpiCheckInSection({ ctx: { ...august, role: 'INTERNAL_ANALYST' } }))
  expect(staff.getByText('KPI Check-In updates with the October report.')).toBeTruthy()
  expect(staff.getAllByRole('img').length).toBe(6)
})

test('once that month has opened, every row shows rings and no note, whatever month is on screen', async () => {
  requestClock.mockReturnValue(clockFor(new Date('2026-11-13T12:00:00Z')))
  getClientBySlug.mockResolvedValue(onMonths({ 2026: { sheetId: ID, tab: 'KPIs' } }))
  readYtdTab.mockResolvedValue(GRID_OCT)
  const c = render(await KpiCheckInSection({ ctx: { ...CTX, dateRange: 'custom:2026-08-01,2026-08-31' } }))
  expect(c.getAllByRole('img').length).toBe(6)
  expect(c.queryByText(/updates with the/)).toBeNull()
})

test('a client not on reporting months is never gated', async () => {
  getClientBySlug.mockResolvedValue(client({ 2026: { sheetId: ID, tab: 'KPIs' } }))
  readYtdTab.mockResolvedValue(GRID_OCT)
  const c = render(await KpiCheckInSection({ ctx: CTX }))
  expect(c.getAllByRole('img').length).toBe(6)
  expect(c.queryByText(/updates with the/)).toBeNull()
})

test("the year is the served range's last day, so a range across New Year reads the later year's sheet", async () => {
  getClientBySlug.mockResolvedValue(client({ 2025: { sheetId: 'OTHERSHEETID_abcdefghij0123', tab: 'KPIs' }, 2026: { sheetId: ID, tab: 'KPIs' } }))
  readYtdTab.mockResolvedValue(GRID)
  render(await KpiCheckInSection({ ctx: { ...CTX, dateRange: 'custom:2025-12-01,2026-01-31', compareRange: 'previous_period' } }))
  expect(readYtdTab).toHaveBeenCalledWith(ID, 'KPIs')
})

test('a preset range takes the year from the clock and shows every row', async () => {
  getClientBySlug.mockResolvedValue(client({ 2026: { sheetId: ID, tab: 'KPIs' } }))
  readYtdTab.mockResolvedValue(GRID)
  const c = render(await KpiCheckInSection({ ctx: { ...CTX, dateRange: 'last_30_days', compareRange: 'previous_period' } }))
  expect(readYtdTab).toHaveBeenCalledWith(ID, 'KPIs')
  expect(c.getAllByRole('img').length).toBe(6)
})

// K1: three across is decided by the card's own width (a container query), so the team menu narrowing the page can no
// longer squeeze three rings into a card that fits one.
test('the rings go three across by the width of the card, not of the window', async () => {
  getClientBySlug.mockResolvedValue(client({ 2026: { sheetId: ID, tab: 'KPIs' } }))
  readYtdTab.mockResolvedValue(GRID)
  const { container } = render(await KpiCheckInSection({ ctx: CTX }))
  const grid = container.querySelector('svg')!.closest('.grid')!
  expect(grid.className).toMatch(/@lg:grid-cols-3/)
  expect(grid.className).not.toMatch(/(^|\s)sm:grid-cols-3/)
  expect(grid.parentElement!.className).toMatch(/@container/)
})

// My call, 2026-10-08: one brand colour per metric (S6b gives each ring its own colour), the same on every platform, so
// a colour always means the same KPI. Colours are the brand tokens in app/globals.css.
test('each metric keeps its own brand colour on every platform: followers green, impressions cyan, engagements blue', async () => {
  getClientBySlug.mockResolvedValue(client({ 2026: { sheetId: ID, tab: 'KPIs' } }))
  readYtdTab.mockResolvedValue(GRID)
  const { container } = render(await KpiCheckInSection({ ctx: CTX }))
  const strokes = [...container.querySelectorAll('[data-ratio]')].map((c) => c.getAttribute('stroke'))
  const row = ['var(--color-brand-green)', 'var(--color-brand-cyan)', 'var(--color-brand-blue)']
  expect(strokes).toEqual([...row, ...row])
})

// #334 (#332's paging rule): KPI Check-In lays out its own blocks in the PDF. Each platform card is one unbreakable
// block, and the section heading rides in the first so it never ends a page alone.
const inPdf = async (ctx: typeof CTX) => render(<ExportModeProvider>{await KpiCheckInSection({ ctx })}</ExportModeProvider>)

test('in the PDF each platform card is one block, the heading inside the first', async () => {
  getClientBySlug.mockResolvedValue(client({ 2026: { sheetId: ID, tab: 'KPIs' } }))
  readYtdTab.mockResolvedValue(GRID)
  const { container } = await inPdf(CTX)
  const blocks = [...container.querySelectorAll('[data-export-block]')]
  expect(blocks.map((b) => b.querySelector('h3')?.textContent)).toEqual(['Instagram', 'LinkedIn'])
  expect(blocks[0].querySelector('h2')?.textContent).toBe('KPI Check-In')
  expect(container.querySelectorAll('h2')).toHaveLength(1)
})

// #332's rule: a PDF prints what a client sees, whoever exports it.
test('a staff PDF prints the client view: a row ahead of the released month is the note alone, and no sheet prints nothing', async () => {
  getClientBySlug.mockResolvedValue(onMonths({ 2026: { sheetId: ID, tab: 'KPIs' } }))
  readYtdTab.mockResolvedValue(GRID_OCT)
  const august = { ...CTX, dateRange: 'custom:2026-08-01,2026-08-31', compareRange: 'custom:2026-07-01,2026-07-31', role: 'INTERNAL_ADMIN' }
  const pdf = await inPdf(august)
  expect(pdf.getByText('KPI Check-In updates with the October report.')).toBeTruthy()
  expect(pdf.getAllByRole('img')).toHaveLength(3)
  expect(pdf.queryByText('1/1/26 to 10/31/26')).toBeNull()
  pdf.unmount()
  expect(render(await KpiCheckInSection({ ctx: august })).getAllByRole('img')).toHaveLength(6) // the live page keeps the staff view
  getClientBySlug.mockResolvedValue(client())
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  expect((await inPdf({ ...CTX, role: 'INTERNAL_ADMIN' })).container.textContent).toBe('')
  warn.mockRestore()
})

// Paul, #334 round 4 blocker: on the white-paper PDF the brand ring colours read at 1.1 to 2.5:1, so each platform card was
// marked a dark chart panel. Spec 2026-10-13: the whole PDF prints dark like the live page now, so no card needs the mark.
test('no platform card carries a dark-panel mark, in the rings view and the note-only view, for any viewer', async () => {
  const cards = (c: HTMLElement) => [...c.querySelectorAll('h3')].map((h) => h.closest('.rounded-lg'))
  getClientBySlug.mockResolvedValue(onMonths({ 2026: { sheetId: ID, tab: 'KPIs' } }))
  readYtdTab.mockResolvedValue(GRID_OCT) // Instagram's row is ahead of release (note only), LinkedIn's has rings
  for (const role of ['CLIENT_VIEWER', 'INTERNAL_ADMIN']) {
    const ctx = { ...CTX, role }
    for (const ui of [render(await KpiCheckInSection({ ctx })), await inPdf(ctx)]) {
      const found = cards(ui.container)
      expect(found).toHaveLength(2)
      expect(found.map((c) => c?.hasAttribute('data-export-chart'))).toEqual([false, false])
      ui.unmount()
    }
  }
})

// ===== Month tabs (spec docs/superpowers/specs/2026-11-11-kpi-tab-by-month-design.md) =====
const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
/** A filled month tab: every row says "End of <month>". */
const monthGrid = (m: number, rows: Record<string, unknown[]> = {}) => [
  ['Test Co 2026 KPI Tracker'], [], ['', '', 'Total Followers', 'Impressions', 'Engagements'],
  rows.instagram ?? ['Instagram', `End of ${MONTH[m]}`, '1,100', '20,000', '300'], ['', 'H2 2026 Target', '2,000', '50,500', '1,250'],
  rows.linkedin ?? ['LinkedIn', `End of ${MONTH[m]}`, '9,000', '47,000', '6,300'], ['', 'H2 2026 Target', '9,400', '80,000', '10,000'],
]
const BY_MONTH = { 2026: { sheetId: ID, byMonth: true } }
/** Tabs answer by title through the month-tab reader; a title not in the map answers "gone" (Google's 400). */
const tabs = (byTitle: Record<string, unknown[][]>) => {
  readSheetTabTitles.mockResolvedValue(Object.keys(byTitle))
  readMonthTab.mockImplementation(async (_id: string, title: string) => (title in byTitle ? byTitle[title] : 'gone'))
}
const SEP = { ...CTX, dateRange: 'custom:2026-09-01,2026-09-30' }
const OCT = { ...CTX, dateRange: 'custom:2026-10-01,2026-10-31' }
const staffOf = <T extends object>(c: T) => ({ ...c, role: 'INTERNAL_ADMIN' })
const logs = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.map((c) => c.join(' '))

test('month tabs: the picked month reads its own tab, so past months stay viewable', async () => {
  getClientBySlug.mockResolvedValue(onMonths(BY_MONTH))
  tabs({ 'September 2026': monthGrid(8), 'October 2026': monthGrid(9) })
  const sep = render(await KpiCheckInSection({ ctx: SEP }))
  expect(readMonthTab).toHaveBeenLastCalledWith(ID, 'September 2026')
  expect(readYtdTab).not.toHaveBeenCalled() // month tabs never go through the hourly YTD reader
  expect(sep.getAllByText('1/1/26 to 9/30/26')).toHaveLength(2)
  sep.unmount()
  requestClock.mockReturnValue(clockFor(new Date('2026-11-13T12:00:00Z'))) // October has opened
  const oct = render(await KpiCheckInSection({ ctx: OCT }))
  expect(readMonthTab).toHaveBeenLastCalledWith(ID, 'October 2026')
  expect(oct.getAllByText('1/1/26 to 10/31/26')).toHaveLength(2)
  expect(oct.getAllByRole('img')).toHaveLength(6)
})

test('month tabs: the raw title is what is read (spaces and case kept)', async () => {
  getClientBySlug.mockResolvedValue(onMonths(BY_MONTH))
  tabs({ ' september 2026 ': monthGrid(8) })
  render(await KpiCheckInSection({ ctx: SEP }))
  expect(readMonthTab).toHaveBeenCalledWith(ID, ' september 2026 ')
})

test('a fixed { sheetId, tab } entry never reads the tab titles', async () => {
  getClientBySlug.mockResolvedValue(onMonths({ 2026: { sheetId: ID, tab: 'KPIs' } }))
  readYtdTab.mockResolvedValue(GRID)
  render(await KpiCheckInSection({ ctx: SEP }))
  expect(readSheetTabTitles).not.toHaveBeenCalled()
  expect(readMonthTab).not.toHaveBeenCalled()
  expect(readYtdTab).toHaveBeenCalledWith(ID, 'KPIs')
})

test('month tabs: no tab for the month is a staff note, nothing for a client, one warning without the id or a title', async () => {
  getClientBySlug.mockResolvedValue(onMonths(BY_MONTH))
  tabs({ 'August 2026': monthGrid(7) })
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  expect(await KpiCheckInSection({ ctx: SEP })).toBeNull()
  expect(render(await KpiCheckInSection({ ctx: staffOf(SEP) })).getByText('No KPI tab for September 2026 yet.')).toBeTruthy()
  expect(logs(warn)).toContain('[organic-social] kpi month tab missing slug=c year=2026 month=2026-09')
  expect(JSON.stringify(warn.mock.calls)).not.toContain(ID)
  expect(JSON.stringify(warn.mock.calls)).not.toContain('August 2026')
  warn.mockRestore()
})

test('month tabs: a tab copied from last month and not relabelled is "not ready", never the error card', async () => {
  getClientBySlug.mockResolvedValue(onMonths(BY_MONTH))
  tabs({ 'September 2026': monthGrid(7) }) // still says "End of August"
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const err = vi.spyOn(console, 'error').mockImplementation(() => {})
  expect(await KpiCheckInSection({ ctx: SEP })).toBeNull()
  const staff = render(await KpiCheckInSection({ ctx: staffOf(SEP) }))
  expect(staff.getByText("The September 2026 KPI tab isn't ready yet.")).toBeTruthy()
  expect(staff.queryByText("Couldn't load this section.")).toBeNull()
  expect(logs(warn)).toContain('[organic-social] kpi month tab not ready slug=c year=2026 month=2026-09 missing=Instagram month mismatch')
  expect(err).not.toHaveBeenCalled()
  warn.mockRestore(); err.mockRestore()
})

test('month tabs: a part-filled tab (a blank cell) is "not ready"', async () => {
  getClientBySlug.mockResolvedValue(onMonths(BY_MONTH))
  tabs({ 'September 2026': monthGrid(8, { instagram: ['Instagram', 'End of September', '', '20,000', '300'] }) })
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  expect(render(await KpiCheckInSection({ ctx: staffOf(SEP) })).getByText("The September 2026 KPI tab isn't ready yet.")).toBeTruthy()
  expect(logs(warn)).toContain('[organic-social] kpi month tab not ready slug=c year=2026 month=2026-09 missing=Instagram followers')
  warn.mockRestore()
})

test('month tabs: a shown channel missing from the month tab is "not ready"', async () => {
  getClientBySlug.mockResolvedValue({ ...onMonths(BY_MONTH), dashSocialConfig: { ...onMonths(BY_MONTH).dashSocialConfig, channels: ['instagram', 'linkedin', 'facebook'] } })
  tabs({ 'September 2026': monthGrid(8) })
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  expect(render(await KpiCheckInSection({ ctx: staffOf(SEP) })).getByText("The September 2026 KPI tab isn't ready yet.")).toBeTruthy()
  expect(logs(warn)).toContain('[organic-social] kpi month tab not ready slug=c year=2026 month=2026-09 missing=Facebook')
  warn.mockRestore()
})

test('month tabs: a tab that vanished after the titles were cached (the read answers "gone", Google\'s 400) is the missing note', async () => {
  getClientBySlug.mockResolvedValue(onMonths(BY_MONTH))
  readSheetTabTitles.mockResolvedValue(['September 2026'])
  readMonthTab.mockResolvedValue('gone')
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  expect(render(await KpiCheckInSection({ ctx: staffOf(SEP) })).getByText('No KPI tab for September 2026 yet.')).toBeTruthy()
  warn.mockRestore()
})

test('month tabs: a failed titles read or a failed tab read (not 400) is the error card with the status', async () => {
  getClientBySlug.mockResolvedValue(onMonths(BY_MONTH))
  readSheetTabTitles.mockRejectedValue(new YtdSheetReadError('timeout'))
  const err = vi.spyOn(console, 'error').mockImplementation(() => {})
  const first = render(await KpiCheckInSection({ ctx: SEP }))
  expect(first.getByText("Couldn't load this section.")).toBeTruthy()
  first.unmount()
  expect(logs(err)).toContain('[organic-social] kpi sheet read failed slug=c year=2026 status=timeout')
  readSheetTabTitles.mockResolvedValue(['September 2026'])
  readMonthTab.mockRejectedValue(new YtdSheetReadError('403'))
  expect(render(await KpiCheckInSection({ ctx: SEP })).getByText("Couldn't load this section.")).toBeTruthy()
  expect(logs(err)).toContain('[organic-social] kpi sheet read failed slug=c year=2026 status=403')
  expect(JSON.stringify(err.mock.calls)).not.toContain(ID)
  err.mockRestore()
})

test('month tabs: two tabs matching the month is a staff note, never a guess', async () => {
  getClientBySlug.mockResolvedValue(onMonths(BY_MONTH))
  tabs({ 'September 2026': monthGrid(8), 'september 2026': monthGrid(8) })
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  expect(await KpiCheckInSection({ ctx: SEP })).toBeNull()
  expect(render(await KpiCheckInSection({ ctx: staffOf(SEP) })).getByText("The September 2026 KPI tab isn't ready yet.")).toBeTruthy()
  expect(logs(warn)).toContain('[organic-social] kpi month tab not ready slug=c year=2026 month=2026-09 missing=month tab ambiguous')
  expect(readMonthTab).not.toHaveBeenCalled()
  warn.mockRestore()
})

test('month tabs: a month not yet open to clients shows staff the rings and a note naming that month', async () => {
  getClientBySlug.mockResolvedValue(onMonths(BY_MONTH))
  tabs({ 'October 2026': monthGrid(9) }) // clock 2026-11-03: October opens on the 12th
  const staff = render(await KpiCheckInSection({ ctx: staffOf(OCT) }))
  expect(staff.getAllByText('KPI Check-In updates with the October report.')).toHaveLength(2) // one per platform card
  expect(staff.getAllByRole('img')).toHaveLength(6)
})

test('month tabs: the team\'s in-progress month with no tab yet is the missing note', async () => {
  getClientBySlug.mockResolvedValue(onMonths(BY_MONTH))
  tabs({ 'October 2026': monthGrid(9) })
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const live = staffOf({ ...CTX, dateRange: 'custom:2026-11-01,2026-11-02' })
  expect(render(await KpiCheckInSection({ ctx: live })).getByText('No KPI tab for November 2026 yet.')).toBeTruthy()
  warn.mockRestore()
})

test('month tabs: January reads the same tracker when last year\'s entry is byMonth, and says so when the tab is missing', async () => {
  requestClock.mockReturnValue(clockFor(new Date('2027-02-20T12:00:00Z')))
  getClientBySlug.mockResolvedValue({ ...onMonths(BY_MONTH), dashSocialConfig: { ...onMonths(BY_MONTH).dashSocialConfig, reportingMonths: { firstMonth: '2026-01' } } })
  const jan = { ...CTX, dateRange: 'custom:2027-01-01,2027-01-31' }
  const grid = monthGrid(0).map((r) => r.map((c) => (c === 'H2 2026 Target' ? 'H1 2027 Target' : c)))
  tabs({ 'January 2027': grid })
  render(await KpiCheckInSection({ ctx: jan }))
  expect(readMonthTab).toHaveBeenCalledWith(ID, 'January 2027')
  tabs({ 'December 2026': monthGrid(11) })
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  expect(render(await KpiCheckInSection({ ctx: staffOf(jan) })).getByText('No KPI tab for January 2027 yet (using the 2026 tracker).')).toBeTruthy()
  expect(logs(warn)).toContain('[organic-social] kpi month tab missing slug=c year=2027 month=2027-01 carried=2026')
  warn.mockRestore()
})

test('month tabs: a staff PDF prints nothing where the tab is missing', async () => {
  getClientBySlug.mockResolvedValue(onMonths(BY_MONTH))
  tabs({})
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  expect((await inPdf(staffOf(SEP))).container.textContent).toBe('')
  warn.mockRestore()
})

// My decision 2026-11-11: a client without reporting months shows the newest READY month tab up to the range's last day.
describe('month tabs, a client without reporting months', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-13T12:00:00Z')) })
  afterEach(() => { vi.useRealTimers() })
  const notReadyNov = monthGrid(9) // the November tab started as a copy of October, not relabelled yet

  test.each([['last_30_days'], ['this_month'], ['custom:2026-10-15,2026-11-12']])('%s skips a November tab that is not ready and shows October', async (dateRange) => {
    getClientBySlug.mockResolvedValue(client(BY_MONTH))
    tabs({ 'September 2026': monthGrid(8), 'October 2026': monthGrid(9), 'November 2026': notReadyNov })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const c = render(await KpiCheckInSection({ ctx: { ...CTX, dateRange, compareRange: 'previous_period' } }))
    expect(c.getAllByText('1/1/26 to 10/31/26')).toHaveLength(2)
    expect(c.getAllByRole('img')).toHaveLength(6)
    warn.mockRestore()
  })

  // Paul, #445 review (#446): a skipped month is logged with its reason, and a tab that exists is never called missing.
  test('a skipped month that is not ready is logged with its reason, even when an earlier month is shown', async () => {
    getClientBySlug.mockResolvedValue(client(BY_MONTH))
    tabs({ 'October 2026': monthGrid(9), 'November 2026': notReadyNov })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const c = render(await KpiCheckInSection({ ctx: { ...CTX, dateRange: 'last_30_days' } }))
    expect(c.getAllByText('1/1/26 to 10/31/26')).toHaveLength(2)
    expect(logs(warn)).toEqual(['[organic-social] kpi month tab not ready slug=c year=2026 month=2026-11 missing=Instagram month mismatch'])
    warn.mockRestore()
  })

  test('an ambiguous month in the search is logged and skipped, never guessed', async () => {
    getClientBySlug.mockResolvedValue(client(BY_MONTH))
    tabs({ 'October 2026': monthGrid(9), 'November 2026': monthGrid(10), ' november 2026': monthGrid(10) })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const c = render(await KpiCheckInSection({ ctx: { ...CTX, dateRange: 'last_30_days' } }))
    expect(c.getAllByText('1/1/26 to 10/31/26')).toHaveLength(2)
    expect(logs(warn)).toEqual(['[organic-social] kpi month tab not ready slug=c year=2026 month=2026-11 missing=month tab ambiguous'])
    warn.mockRestore()
  })

  test('nothing ready and the end month\'s tab exists: the "isn\'t ready" note, not "No KPI tab"; nothing for a client', async () => {
    getClientBySlug.mockResolvedValue(client(BY_MONTH))
    tabs({ 'November 2026': notReadyNov })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await KpiCheckInSection({ ctx: { ...CTX, dateRange: 'last_30_days' } })).toBeNull()
    const staff = render(await KpiCheckInSection({ ctx: staffOf({ ...CTX, dateRange: 'last_30_days' }) }))
    expect(staff.getByText("The November 2026 KPI tab isn't ready yet.")).toBeTruthy()
    expect(staff.queryByText(/No KPI tab/)).toBeNull()
    expect(logs(warn)).toContain('[organic-social] kpi month tab not ready slug=c year=2026 month=2026-11 missing=Instagram month mismatch')
    expect(logs(warn).some((l) => l.includes('kpi month tab missing'))).toBe(false)
    warn.mockRestore()
  })

  test('nothing ready and the end month has no tab: the "No KPI tab" note for the end month', async () => {
    getClientBySlug.mockResolvedValue(client(BY_MONTH))
    tabs({ 'October 2026': monthGrid(8) }) // October still says "End of September": not ready
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(render(await KpiCheckInSection({ ctx: staffOf({ ...CTX, dateRange: 'last_30_days' }) })).getByText('No KPI tab for November 2026 yet.')).toBeTruthy()
    expect(logs(warn)).toEqual([
      '[organic-social] kpi month tab not ready slug=c year=2026 month=2026-10 missing=Instagram month mismatch',
      '[organic-social] kpi month tab missing slug=c year=2026 month=2026-11',
    ])
    warn.mockRestore()
  })

  test('last_month across New Year reads December from last year\'s byMonth tracker', async () => {
    vi.setSystemTime(new Date('2027-01-15T12:00:00Z'))
    requestClock.mockReturnValue(clockFor(new Date('2027-01-15T12:00:00Z')))
    getClientBySlug.mockResolvedValue(client(BY_MONTH))
    tabs({ 'December 2026': monthGrid(11) })
    const c = render(await KpiCheckInSection({ ctx: { ...CTX, dateRange: 'last_month' } }))
    expect(readMonthTab).toHaveBeenCalledWith(ID, 'December 2026')
    expect(c.getAllByText('1/1/26 to 12/31/26')).toHaveLength(2)
  })
})


// ===== Starting point (spec docs/superpowers/specs/2026-11-19-kpi-starting-point-design.md) =====
describe('starting point: where each platform ended last year', () => {
  const START_TAB = 'Start Tab Title'
  const startGrid = (year = '2025', rows: Record<string, unknown[]> = {}) => [
    ['Test Co Annual Growth'], [], ['', '', 'Total Followers', 'Impressions', 'Engagements'],
    rows.instagram ?? ['Instagram', year, '700', '150,000', '2,000'], ['', String(Number(year) + 1)],
    rows.linkedin ?? ['LinkedIn', year, '8,500', '40,000', '5,000'], ['', String(Number(year) + 1)],
  ]
  const WITH_START = { 2026: { sheetId: ID, byMonth: true, startTab: START_TAB } }
  // Paul, #469 review (issue 470): followers are a count, so "End of 2025"; impressions and engagements are totals over the
  // year, so "2025 total" and a client never reads 10 months against 12 as a drop.
  const LINE = /^(End of 2025|2025 total): /
  const octOpen = () => requestClock.mockReturnValue(clockFor(new Date('2026-11-13T12:00:00Z')))
  const spyAll = () => ({ warn: vi.spyOn(console, 'warn').mockImplementation(() => {}), error: vi.spyOn(console, 'error').mockImplementation(() => {}) })
  /** Every log line, which must never carry the sheet id or the tab title. */
  const clean = (s: ReturnType<typeof spyAll>) => {
    const all = [...logs(s.warn), ...logs(s.error)]
    for (const l of all) { expect(l).not.toContain(ID); expect(l).not.toContain(START_TAB) }
    return all
  }
  afterEach(() => vi.restoreAllMocks())

  test('no startTab: no start read, the rings exactly as today', async () => {
    getClientBySlug.mockResolvedValue(onMonths(BY_MONTH)); octOpen()
    tabs({ 'October 2026': monthGrid(9) })
    const c = render(await KpiCheckInSection({ ctx: staffOf(OCT) }))
    expect(readKpiStartTab).not.toHaveBeenCalled()
    expect(c.queryByText(LINE)).toBeNull()
  })

  test('edge 1: each ring shows where that platform ended 2025, for clients and staff, after the month read', async () => {
    getClientBySlug.mockResolvedValue(onMonths(WITH_START)); octOpen()
    tabs({ 'October 2026': monthGrid(9) })
    readKpiStartTab.mockResolvedValue(startGrid())
    for (const ctx of [OCT, staffOf(OCT)]) {
      const c = render(await KpiCheckInSection({ ctx }))
      expect(c.getAllByText(LINE).map((e) => e.textContent)).toEqual([
        'End of 2025: 700', '2025 total: 150,000', '2025 total: 2,000', 'End of 2025: 8,500', '2025 total: 40,000', '2025 total: 5,000',
      ])
      expect(c.getAllByRole('img').slice(0, 3).map((e) => e.getAttribute('aria-label'))).toEqual([
        'Total Followers: 1,100 of 2,000, end of 2025: 700', 'Impressions/Views: 20,000 of 50,500, 2025 total: 150,000', 'Total Engagements: 300 of 1,250, 2025 total: 2,000',
      ])
      c.unmount()
    }
    expect(readKpiStartTab).toHaveBeenCalledWith(ID, START_TAB)
    expect(readMonthTab.mock.invocationCallOrder[0]).toBeLessThan(readKpiStartTab.mock.invocationCallOrder[0])
  })

  test('edge 1, PDF: a staff export prints the start lines and no staff notes', async () => {
    getClientBySlug.mockResolvedValue(onMonths(WITH_START)); octOpen()
    tabs({ 'October 2026': monthGrid(9) })
    readKpiStartTab.mockResolvedValue(startGrid('2025', { linkedin: ['LinkedIn', '2025', 'N/A', '1', '1'] }))
    const s = spyAll()
    const pdf = await inPdf(staffOf(OCT))
    expect(pdf.getAllByText(LINE)).toHaveLength(3)
    expect(pdf.queryByText(/No end of 2025 figures/)).toBeNull()
    clean(s)
  })

  test.each([
    ['read failed', () => readKpiStartTab.mockRejectedValue(new YtdSheetReadError('403')), "Couldn't read the start figures.", 'error', '[organic-social] kpi start read failed slug=c year=2026 status=403'],
    ['gone', () => readKpiStartTab.mockResolvedValue('gone'), 'No start tab named in the setting was found.', 'warn', '[organic-social] kpi start tab missing slug=c year=2026'],
    ['layout', () => readKpiStartTab.mockResolvedValue([['x'], [], ['', '', 'Followers', 'Impressions', 'Engagements']]), "The start tab's layout isn't recognised.", 'warn', '[organic-social] kpi start layout not found slug=c year=2026 missing=header'],
  ] as const)('%s: rings without a start; staff get one note under the heading; clients get nothing extra; one log line', async (_n, arrange, note, level, line) => {
    getClientBySlug.mockResolvedValue(onMonths(WITH_START)); octOpen()
    tabs({ 'October 2026': monthGrid(9) })
    arrange()
    const s = spyAll()
    const staff = render(await KpiCheckInSection({ ctx: staffOf(OCT) }))
    expect(staff.getAllByRole('img')).toHaveLength(6)
    expect(staff.queryByText(LINE)).toBeNull()
    const n = staff.getByText(note)
    expect(n.closest('[data-export-block]')?.querySelector('h2')?.textContent).toBe('KPI Check-In') // under the heading, in the first block
    expect(n.closest('.rounded-lg')).toBeNull() // above the first card, not inside it
    staff.unmount()
    const client = render(await KpiCheckInSection({ ctx: OCT }))
    expect(client.getAllByRole('img')).toHaveLength(6)
    expect(client.queryByText(note)).toBeNull()
    const all = clean(s)
    expect(all.filter((l) => l === line)).toHaveLength(2) // once per render
    expect(logs(level === 'error' ? s.error : s.warn)).toContain(line)
  })

  test('a shown platform with no start row: its card says so for staff only; the other card keeps its start', async () => {
    getClientBySlug.mockResolvedValue(onMonths(WITH_START)); octOpen()
    tabs({ 'October 2026': monthGrid(9) })
    readKpiStartTab.mockResolvedValue(startGrid('2025', { linkedin: ['LinkedIn', '2025', '8,500', '', '5,000'] }))
    const s = spyAll()
    const staff = render(await KpiCheckInSection({ ctx: staffOf(OCT) }))
    const note = staff.getByText('No end of 2025 figures for LinkedIn.')
    expect(note.closest('.rounded-lg')?.querySelector('h3')?.textContent).toBe('LinkedIn')
    expect(staff.getAllByText(LINE)).toHaveLength(3)
    staff.unmount()
    const client = render(await KpiCheckInSection({ ctx: OCT }))
    expect(client.queryByText(/No end of 2025 figures/)).toBeNull()
    expect(client.getAllByText(LINE)).toHaveLength(3)
    expect(clean(s)).toContain('[organic-social] kpi start row missing slug=c year=2026 platform=LINKEDIN')
  })

  test('an invalid startTab: no read; staff get the note, clients the rings; logged with the slug and year', async () => {
    getClientBySlug.mockResolvedValue(onMonths({ 2026: { sheetId: ID, byMonth: true, startTab: '   ' } })); octOpen()
    tabs({ 'October 2026': monthGrid(9) })
    const s = spyAll()
    const staff = render(await KpiCheckInSection({ ctx: staffOf(OCT) }))
    expect(staff.getByText("The start tab setting isn't valid.")).toBeTruthy()
    expect(staff.getAllByRole('img')).toHaveLength(6)
    staff.unmount()
    expect(render(await KpiCheckInSection({ ctx: OCT })).queryByText("The start tab setting isn't valid.")).toBeNull()
    expect(readKpiStartTab).not.toHaveBeenCalled()
    expect(clean(s).filter((l) => l === '[organic-social] kpi start tab setting invalid slug=c year=2026')).toHaveLength(2)
  })

  test('edge 3 and every early return: no start read and no start log line', async () => {
    getClientBySlug.mockResolvedValue(onMonths(WITH_START)); octOpen()
    tabs({}) // no October tab: the month note
    const s = spyAll()
    const c = render(await KpiCheckInSection({ ctx: staffOf(OCT) }))
    expect(c.getByText('No KPI tab for October 2026 yet.')).toBeTruthy()
    readSheetTabTitles.mockRejectedValue(new YtdSheetReadError('500')) // the error card
    render(await KpiCheckInSection({ ctx: staffOf(OCT) }))
    getClientBySlug.mockResolvedValue(onMonths({ 2026: { sheetId: 'short', byMonth: true, startTab: '  ' } })) // invalid entry
    render(await KpiCheckInSection({ ctx: staffOf(OCT) }))
    expect(readKpiStartTab).not.toHaveBeenCalled()
    expect(clean(s).some((l) => l.includes('kpi start'))).toBe(false)
  })

  test('a card a client sees only as the "updates with" note shows no start; staff see rings with the start', async () => {
    getClientBySlug.mockResolvedValue(onMonths(WITH_START)) // 2026-11-03: October not open to clients
    tabs({ 'October 2026': monthGrid(9) })
    readKpiStartTab.mockResolvedValue(startGrid())
    const client = render(await KpiCheckInSection({ ctx: OCT }))
    expect(client.getAllByText('KPI Check-In updates with the October report.')).toHaveLength(2)
    expect(client.queryByText(LINE)).toBeNull()
    client.unmount()
    expect(render(await KpiCheckInSection({ ctx: staffOf(OCT) })).getAllByText(LINE)).toHaveLength(6)
  })

  test('edge 4: a fixed { sheetId, tab, startTab } entry shows the start the same way', async () => {
    getClientBySlug.mockResolvedValue(client({ 2026: { sheetId: ID, tab: 'KPIs', startTab: START_TAB } }))
    readYtdTab.mockResolvedValue(GRID)
    readKpiStartTab.mockResolvedValue(startGrid())
    const c = render(await KpiCheckInSection({ ctx: CTX }))
    expect(c.getAllByText(LINE)).toHaveLength(6)
  })

  test('edge 5: a platform on the start tab that the client does not show is ignored', async () => {
    getClientBySlug.mockResolvedValue(onMonths(WITH_START)); octOpen()
    tabs({ 'October 2026': monthGrid(9) })
    readKpiStartTab.mockResolvedValue([...startGrid(), ['TikTok', '2025', '1', '2', '3']])
    const s = spyAll()
    const c = render(await KpiCheckInSection({ ctx: staffOf(OCT) }))
    expect(c.getAllByText(LINE)).toHaveLength(6)
    expect(c.queryByText(/TikTok/)).toBeNull()
    expect(clean(s).some((l) => l.includes('kpi start'))).toBe(false)
  })

  test('edge 2: January 2027 on the carried 2026 entry reads the 2026 rows; blank, so staff get per-card notes', async () => {
    getClientBySlug.mockResolvedValue(client(WITH_START))
    requestClock.mockReturnValue(clockFor(new Date('2027-01-20T12:00:00Z')))
    tabs({ 'January 2027': monthGrid(0).map((r) => r.map((c) => (typeof c === 'string' ? c.replace('H2 2026', 'H1 2027') : c))) })
    readKpiStartTab.mockResolvedValue(startGrid('2025'))
    const s = spyAll()
    const c = render(await KpiCheckInSection({ ctx: staffOf({ ...CTX, dateRange: 'custom:2027-01-01,2027-01-31' }) }))
    expect(c.getByText('No end of 2026 figures for Instagram.')).toBeTruthy()
    expect(c.getByText('No end of 2026 figures for LinkedIn.')).toBeTruthy()
    expect(c.queryByText(/^(End of 2026|2026 total): /)).toBeNull()
    clean(s)
  })
})
