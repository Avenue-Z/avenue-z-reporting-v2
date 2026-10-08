import { beforeEach, expect, test, vi } from 'vitest'
import { render } from '@testing-library/react'
const { getClientBySlug, readYtdTab, requestClock } = vi.hoisted(() => ({ getClientBySlug: vi.fn(), readYtdTab: vi.fn(), requestClock: vi.fn() }))
vi.mock('@/lib/db/queries', () => ({ getClientBySlug }))
vi.mock('@/lib/organic-social/ytd-sheet', async () => ({ ...(await vi.importActual<typeof import('@/lib/organic-social/ytd-sheet')>('@/lib/organic-social/ytd-sheet')), readYtdTab }))
vi.mock('@/lib/organic-social/locked-range', async () => ({ ...(await vi.importActual<typeof import('@/lib/organic-social/locked-range')>('@/lib/organic-social/locked-range')), requestClock }))

import { KpiCheckInSection, kpiCheckInV1 } from './kpi-check-in'
import { ORGANIC_SOCIAL_PARTS } from './registry'
import { YtdSheetReadError } from '@/lib/organic-social/ytd-sheet'
import { clockFor } from '@/lib/organic-social/reporting-months'

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
beforeEach(() => { getClientBySlug.mockReset(); readYtdTab.mockReset(); requestClock.mockReset(); requestClock.mockReturnValue(clockFor(new Date('2026-11-03T12:00:00Z'))) })

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
