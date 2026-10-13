import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { render } from '@testing-library/react'
import type { ReactElement } from 'react'

const { getOutlineKpis, getClientBySlug, readYtdTab, readYtdNotes } = vi.hoisted(() => ({ getOutlineKpis: vi.fn(), getClientBySlug: vi.fn(), readYtdTab: vi.fn(), readYtdNotes: vi.fn() }))
vi.mock('@/lib/organic-social/outline-headlines', async () => ({
  ...(await vi.importActual<typeof import('@/lib/organic-social/outline-headlines')>('@/lib/organic-social/outline-headlines')),
  getOutlineKpis,
}))
vi.mock('@/lib/db/queries', () => ({ getClientBySlug }))
vi.mock('@/lib/organic-social/ytd-sheet', async () => ({
  ...(await vi.importActual<typeof import('@/lib/organic-social/ytd-sheet')>('@/lib/organic-social/ytd-sheet')),
  readYtdTab,
}))
vi.mock('./ytd-notes', async () => ({ ...(await vi.importActual<typeof import('./ytd-notes')>('./ytd-notes')), readYtdNotes }))

import { YtdLockedReviewSection, ytdReviewV4 } from './ytd-review-locked'
import { ytdReviewV1 } from './ytd-review'
import { ytdReviewV2 } from './ytd-review-sheet'
import { ytdReviewV3 } from './ytd-review-live'
import { ORGANIC_SOCIAL_PARTS } from './registry'
import { YtdSheetReadError } from '@/lib/organic-social/ytd-sheet'
import { FIXTURE_ORGANIC_SOCIAL_CTX } from './__fixtures__/organic-social-ctx'

// Made-up sheet id and numbers only. A client on locked months with firstMonth 2026-07.
const ID = 'TESTSHEETID_abcdefghij0123'
const SEPT = { dateRange: 'custom:2026-09-01,2026-09-30', compareRange: 'custom:2026-08-01,2026-08-31' }
const CTX = { ...FIXTURE_ORGANIC_SOCIAL_CTX, clientSlug: 'locked-co', channel: 'INSTAGRAM' as const, ...SEPT }
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const sheet = (col: string, f: (i: number) => string, v: (i: number) => string) => [
  ['CLIENT: Locked Co'], ['FOLLOWER GROWTH'], ['', col], ...MONTHS.map((m, i) => [m, f(i)]),
  [], ['VIEWS'], ['', col], ...MONTHS.map((m, i) => [m, v(i)]),
]
const kpis = (followers: number, views: number) => ({ noData: false, kpis: { followers: { key: 'followers', label: 'Total Followers', format: 'number', value: followers }, exposure: { key: 'exposure', label: 'Views', format: 'number', value: views } } }) as never
const RM = { firstMonth: '2026-07', clientMonths: 1 }
const client = (dsc: Record<string, unknown> = {}) => ({ id: 'c1', dashSocialConfig: { brandId: 1, reportingMonths: RM, ...dsc } })
const ENTRY = { ytdSheets: { 2026: { sheetId: ID, tab: 'Locked Co' } } }

type Chart = { name: string; data: Record<string, unknown>[] }
function charts(node: unknown, found: Chart[] = []): Chart[] {
  const el = node as ReactElement<Record<string, unknown>> | null
  if (!el || typeof el !== 'object') return found
  const type = (el as { type?: { name?: string } }).type
  if (typeof type === 'function' && (type.name === 'LineChart' || type.name === 'BarChart')) found.push({ name: type.name, ...(el.props as unknown as Omit<Chart, 'name'>) })
  const kids = (el.props as { children?: unknown } | undefined)?.children
  for (const k of Array.isArray(kids) ? kids : [kids]) charts(k, found)
  return found
}
const logs = () => [...vi.mocked(console.warn).mock.calls, ...vi.mocked(console.error).mock.calls].map((c) => c.join(' '))
const monthsAsked = () => getOutlineKpis.mock.calls.map((c) => [c[1], c[2], c[3]])

beforeEach(() => {
  vi.restoreAllMocks()
  getOutlineKpis.mockReset(); getClientBySlug.mockReset(); readYtdTab.mockReset(); readYtdNotes.mockReset()
  readYtdNotes.mockResolvedValue(undefined)
  getClientBySlug.mockResolvedValue(client(ENTRY))
  getOutlineKpis.mockResolvedValue(kpis(1000, 100))
  vi.spyOn(console, 'warn').mockImplementation(() => {}); vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.useRealTimers())

test('ytd-review@4 is registered unpublished; 1, 2 and 3 are the same objects as before', () => {
  expect(ORGANIC_SOCIAL_PARTS['ytd-review'][4]).toBe(ytdReviewV4)
  expect(ytdReviewV4.published).toBe(false)
  expect(ORGANIC_SOCIAL_PARTS['ytd-review'][1]).toBe(ytdReviewV1)
  expect(ORGANIC_SOCIAL_PARTS['ytd-review'][2]).toBe(ytdReviewV2)
  expect(ORGANIC_SOCIAL_PARTS['ytd-review'][3]).toBe(ytdReviewV3)
})

test('January through the month on screen; the sheet wins; every blank month from January asks Dash as a whole month with no comparison', async () => {
  // Filled January to June except March; blank from July.
  readYtdTab.mockResolvedValue(sheet('Instagram', (i) => (i < 6 && i !== 2 ? String(100 + i) : ''), (i) => (i < 6 && i !== 2 ? String(10 + i) : '')))
  const el = await YtdLockedReviewSection({ ctx: CTX })
  expect(monthsAsked()).toEqual([
    ['custom:2026-03-01,2026-03-31', null, 'INSTAGRAM'],
    ['custom:2026-07-01,2026-07-31', null, 'INSTAGRAM'],
    ['custom:2026-08-01,2026-08-31', null, 'INSTAGRAM'],
    ['custom:2026-09-01,2026-09-30', null, 'INSTAGRAM'],
  ])
  const c = charts(el)
  expect(c[0].data.map((d) => d.month)).toEqual(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'])
  expect(c[0].data[0]).toEqual({ month: 'Jan', followers: 100 })
  expect(c[0].data[2]).toEqual({ month: 'Mar', followers: 1000 })
})

test("on the team's live month the graph ends at the newest finished month; no label says (live) and no range in progress is asked", async () => {
  readYtdTab.mockResolvedValue(sheet('Instagram', () => '', () => ''))
  const el = await YtdLockedReviewSection({ ctx: { ...CTX, dateRange: 'custom:2026-10-01,2026-10-12', compareRange: 'custom:2026-09-01,2026-09-12' } })
  expect(charts(el)[0].data.map((d) => d.month)).toEqual(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'])
  expect(getOutlineKpis.mock.calls.some((c) => String(c[1]).startsWith('custom:2026-10'))).toBe(false)
  expect(JSON.stringify(charts(el))).not.toContain('(live)')
})

test("the team's live January renders nothing and asks nothing", async () => {
  expect(await YtdLockedReviewSection({ ctx: { ...CTX, dateRange: 'custom:2027-01-01,2027-01-12', compareRange: 'custom:2026-12-01,2026-12-12' } })).toBeNull()
  expect(getOutlineKpis).not.toHaveBeenCalled()
  expect(readYtdTab).not.toHaveBeenCalled()
})

test('the X tab draws the block (X included)', async () => {
  readYtdTab.mockResolvedValue(sheet('X', (i) => (i < 9 ? String(500 + i) : ''), (i) => (i < 9 ? String(50 + i) : '')))
  const el = await YtdLockedReviewSection({ ctx: { ...CTX, channel: 'TWITTER' } })
  expect(charts(el)[0].data.map((d) => d.followers)).toEqual([500, 501, 502, 503, 504, 505, 506, 507, 508])
  expect(getOutlineKpis).not.toHaveBeenCalled()
})

test('Overview renders nothing and reads nothing', async () => {
  expect(await YtdLockedReviewSection({ ctx: { ...CTX, channel: null } })).toBeNull()
  expect(getClientBySlug).not.toHaveBeenCalled()
})

test('without reportingMonths (absent or malformed) it renders nothing, logs one line, and asks Dash and the sheet nothing', async () => {
  for (const dsc of [{ brandId: 1 }, { brandId: 1, reportingMonths: { firstMonth: 'bad' } }]) {
    getClientBySlug.mockResolvedValue({ id: 'c1', dashSocialConfig: dsc })
    expect(await YtdLockedReviewSection({ ctx: CTX })).toBeNull()
  }
  expect(logs()).toEqual([
    '[organic-social] ytd-review@4 skipped (no reportingMonths) slug=locked-co',
    '[organic-social] ytd-review@4 skipped (no reportingMonths) slug=locked-co',
  ])
  expect(getOutlineKpis).not.toHaveBeenCalled()
  expect(readYtdTab).not.toHaveBeenCalled()
})

test('no sheet, an invalid entry, or a year with no entry, each on X: every month from January asks Dash, and notes are still read', async () => {
  for (const ytdSheets of [undefined, { 2026: { sheetId: 'x' } }, { 2025: { sheetId: ID, tab: 'Locked Co' } }]) {
    getOutlineKpis.mockClear(); readYtdNotes.mockClear()
    getClientBySlug.mockResolvedValue(client(ytdSheets === undefined ? {} : { ytdSheets }))
    const el = await YtdLockedReviewSection({ ctx: { ...CTX, channel: 'TWITTER' } })
    expect(getOutlineKpis.mock.calls.map((c) => c[1])).toEqual(['01', '02', '03', '04', '05', '06', '07', '08', '09'].map((m) => `custom:2026-${m}-01,${m === '02' ? '2026-02-28' : ['04', '06', '09'].includes(m) ? `2026-${m}-30` : `2026-${m}-31`}`))
    expect(getOutlineKpis.mock.calls.every((c) => c[2] === null)).toBe(true)
    expect(charts(el)[0].data).toHaveLength(9)
    expect(readYtdNotes).toHaveBeenCalledTimes(1)
  }
  expect(readYtdTab).not.toHaveBeenCalled()
})

test('a sheet read failure is the error card, logged without the sheet id or tab', async () => {
  readYtdTab.mockRejectedValueOnce(new YtdSheetReadError('429'))
  const r = render(<>{await YtdLockedReviewSection({ ctx: CTX })}</>)
  expect(r.container.textContent).toContain("Couldn't load this section.")
  expect(logs()).toEqual(['[organic-social] ytd sheet read failed slug=locked-co status=429'])
  expect(getOutlineKpis).not.toHaveBeenCalled()
})

test('a slow Dash month shows the YTD timeout card and is logged as ytd-review@4', async () => {
  const { DashTimeoutError } = await import('@/lib/dash-social/client')
  getClientBySlug.mockResolvedValue(client())
  getOutlineKpis.mockRejectedValue(new DashTimeoutError())
  const text = render(<>{await YtdLockedReviewSection({ ctx: CTX })}</>).container.textContent
  expect(text).toBe('Taking longer than usual. Try again in a minute.')
  expect(logs().some((l) => l.startsWith('[organic-social] ytd-review@4 Dash request failed slug=locked-co channel=INSTAGRAM'))).toBe(true)
})

test('a missing client row logs one line, shows the error card, and asks Dash and the sheet nothing', async () => {
  getClientBySlug.mockResolvedValue(null)
  const r = render(<>{await YtdLockedReviewSection({ ctx: CTX })}</>)
  expect(r.container.textContent).toContain("Couldn't load this section.")
  expect(logs()).toEqual(['[organic-social] ytd-review@4 client row missing slug=locked-co'])
  expect(getOutlineKpis).not.toHaveBeenCalled()
})

test('between 00:00 and 04:00 UTC on the 1st the live month is still left off, though its range looks whole', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-01T01:00:00Z'))
  readYtdTab.mockResolvedValue(sheet('Instagram', () => '', () => ''))
  const el = await YtdLockedReviewSection({ ctx: { ...CTX, dateRange: 'custom:2026-09-01,2026-09-30', compareRange: 'custom:2026-08-01,2026-08-31' } })
  expect(charts(el)[0].data.map((d) => d.month).at(-1)).toBe('Aug')
  expect(getOutlineKpis.mock.calls.some((c) => String(c[1]).startsWith('custom:2026-09'))).toBe(false)
})
