import { beforeEach, expect, test, vi } from 'vitest'
import { render } from '@testing-library/react'
import type { ReactElement } from 'react'

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

import { YtdSheetReviewSection } from './ytd-review-sheet'
import { YtdReviewSection } from './ytd-review'
import { YtdSheetReadError } from '@/lib/organic-social/ytd-sheet'
import { FIXTURE_ORGANIC_SOCIAL_CTX } from './__fixtures__/organic-social-ctx'

// Made-up sheet id and numbers only.
const ID = 'TESTSHEETID_abcdefghij0123'
const SEPT = { ...FIXTURE_ORGANIC_SOCIAL_CTX, clientSlug: 'c', channel: 'INSTAGRAM' as const, dateRange: 'custom:2026-09-01,2026-09-30', compareRange: 'custom:2026-08-01,2026-08-31' }
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July ', 'August', 'September', 'October', 'November', 'December']
const sheet = (f: (i: number) => string, v: (i: number) => string) => [
  ['CLIENT: Test Co'], ['FOLLOWER GROWTH'], ['', 'Instagram'], ...MONTHS.map((m, i) => [m, f(i)]),
  [], ['VIEWS'], ['', 'Instagram'], ...MONTHS.map((m, i) => [m, v(i)]),
]
const kpis = (followers: number, views: number, noData = false) => ({ noData, kpis: { followers: { key: 'followers', label: 'Total Followers', format: 'number', value: followers }, exposure: { key: 'exposure', label: 'Views', format: 'number', value: views } } }) as never
const client = (ytdSheets?: unknown) => ({ id: 'c1', dashSocialConfig: { brandId: 1, reportingMonths: { firstMonth: '2026-08' }, ...(ytdSheets === undefined ? {} : { ytdSheets }) } })
const ENTRY = { 2026: { sheetId: ID, tab: 'Test Co' } }

type Chart = { name: string; data: Record<string, unknown>[]; yKeys: { key: string }[] }
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

beforeEach(() => {
  vi.restoreAllMocks()
  getOutlineKpis.mockReset(); getClientBySlug.mockReset(); readYtdTab.mockReset()
  getClientBySlug.mockResolvedValue(client(ENTRY))
  vi.spyOn(console, 'warn').mockImplementation(() => {}); vi.spyOn(console, 'error').mockImplementation(() => {})
})

test('both graphs from the sheet, January to September; Dash asked only for September, with version 1 request', async () => {
  readYtdTab.mockResolvedValue(sheet((i) => (i < 8 ? String(100 + i) : ''), (i) => (i < 8 ? String(10 + i) : '')))
  getOutlineKpis.mockResolvedValue(kpis(900, 90))
  const el = await YtdSheetReviewSection({ ctx: SEPT })
  expect(readYtdTab).toHaveBeenCalledWith(ID, 'Test Co')
  expect(getOutlineKpis.mock.calls).toEqual([['c', 'custom:2026-09-01,2026-09-30', 'custom:2026-08-01,2026-08-31', 'INSTAGRAM']])
  const c = charts(el)
  expect(c.map((x) => [x.name, x.yKeys[0].key])).toEqual([['LineChart', 'followers'], ['LineChart', 'views']])
  expect(c[0].data.map((d) => d.month)).toEqual(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'])
  expect(c[0].data.at(-1)).toEqual({ month: 'Sep', followers: 900 })
  expect(c[1].data[0]).toEqual({ month: 'Jan', views: 10 })
  const { container } = render(<>{el}</>)
  expect(container.textContent).toContain('Follower Growth, Year to Date')
  expect(container.textContent).toContain('Views, Year to Date')
})

test('a later gap is named under its graph; the months before the first point are not; a blank before firstMonth never calls Dash', async () => {
  readYtdTab.mockResolvedValue(sheet((i) => (i === 0 ? 'N/A' : i < 5 ? '' : String(i)), (i) => (i === 2 ? '12k' : String(i))))
  const el = await YtdSheetReviewSection({ ctx: SEPT })
  expect(getOutlineKpis).not.toHaveBeenCalled()
  const { container } = render(<>{el}</>)
  // Jan (N/A) and Feb to May (blank before firstMonth) come before the first point (Jun): not listed (S7).
  expect(container.textContent).not.toContain('No follower data')
  expect(container.textContent).toContain('No views data for Mar')
  expect(logs().some((l) => l.includes('ytd sheet cell invalid slug=c channel=INSTAGRAM month=2026-03 graph=views'))).toBe(true)
})

test('one empty graph shows NoData in its card; one point is bars while the other graph draws a line', async () => {
  readYtdTab.mockResolvedValue(sheet((i) => (i === 8 ? '5' : 'N/A'), (i) => (i < 9 ? String(i) : '')))
  let el = await YtdSheetReviewSection({ ctx: SEPT })
  expect(charts(el).map((x) => [x.name, x.yKeys[0].key])).toEqual([['BarChart', 'followers'], ['LineChart', 'views']])
  readYtdTab.mockResolvedValue(sheet(() => 'N/A', (i) => (i < 9 ? String(i) : '')))
  el = await YtdSheetReviewSection({ ctx: SEPT })
  const { container } = render(<>{el}</>)
  expect(charts(el).map((x) => x.yKeys[0].key)).toEqual(['views'])
  expect(container.textContent).toContain('No data for this period.')
})

test('both graphs empty: NoData alone', async () => {
  readYtdTab.mockResolvedValue(sheet(() => 'N/A', () => 'N/A'))
  const { container } = render(<>{await YtdSheetReviewSection({ ctx: SEPT })}</>)
  expect(container.textContent).toBe('No data for this period.')
})

test('a read failure or a layout error shows the error card and logs without the sheet id', async () => {
  readYtdTab.mockRejectedValue(new YtdSheetReadError('429'))
  let r = render(<>{await YtdSheetReviewSection({ ctx: SEPT })}</>)
  expect(r.container.textContent).toContain("Couldn't load this section.")
  r.unmount()
  readYtdTab.mockResolvedValue(sheet((i) => String(i), (i) => String(i)).map((row) => (row[0] === 'September' ? ['Sept', '1'] : row)))
  r = render(<>{await YtdSheetReviewSection({ ctx: SEPT })}</>)
  expect(r.container.textContent).toContain("Couldn't load this section.")
  const l = logs()
  expect(l.some((x) => x.includes('ytd sheet read failed slug=c status=429'))).toBe(true)
  expect(l.some((x) => x.includes('ytd sheet layout not found slug=c missing=followers september'))).toBe(true)
  expect(l.join('\n')).not.toContain(ID)
  expect(l.join('\n')).not.toContain('Test Co')
})

test('no entry, an invalid entry, or no entry for the year on screen: exactly version 1 (one warning when invalid)', async () => {
  for (const cfg of [undefined, { 2025: { sheetId: ID, tab: 'T' } }, { 2026: { sheetId: 'bad', tab: 'T' } }, 'x']) {
    getClientBySlug.mockResolvedValue(client(cfg))
    getOutlineKpis.mockResolvedValue(kpis(1, 2))
    const el = await YtdSheetReviewSection({ ctx: SEPT })
    expect(el).toEqual(<YtdReviewSection ctx={SEPT} />)
  }
  expect(readYtdTab).not.toHaveBeenCalled()
  expect(logs().filter((l) => l.includes('ytd sheet config invalid slug=c year=2026'))).toHaveLength(2)
})

test('a multi-month range or a channel without outline rows draws nothing', async () => {
  expect(await YtdSheetReviewSection({ ctx: { ...SEPT, dateRange: 'custom:2026-08-01,2026-09-30' } })).toBeNull()
  expect(await YtdSheetReviewSection({ ctx: { ...SEPT, channel: 'TWITTER' as const } })).toBeNull()
  expect(readYtdTab).not.toHaveBeenCalled()
})

test('a missing column warns and uses our value from firstMonth; at most 3 Dash requests in flight', async () => {
  readYtdTab.mockResolvedValue([['FOLLOWER GROWTH'], ['', 'Facebook'], ...MONTHS.map((m) => [m, '1']), ['VIEWS'], ['', 'Facebook'], ...MONTHS.map((m) => [m, '1'])])
  let live = 0, peak = 0
  getOutlineKpis.mockImplementation(async () => { live++; peak = Math.max(peak, live); await new Promise((r) => setTimeout(r, 5)); live--; return kpis(3, 4) })
  const el = await YtdSheetReviewSection({ ctx: { ...SEPT, dateRange: 'custom:2026-12-01,2026-12-31', compareRange: 'custom:2026-11-01,2026-11-30' } })
  expect(getOutlineKpis).toHaveBeenCalledTimes(5) // Aug to Dec
  expect(peak).toBeLessThanOrEqual(3)
  expect(charts(el)[0].data.map((d) => d.month)).toEqual(['Aug', 'Sep', 'Oct', 'Nov', 'Dec'])
  expect(logs().filter((l) => l.includes('ytd sheet column missing slug=c channel=INSTAGRAM'))).toHaveLength(2)
})

// Fix list X1: @2 says which month failed and why (never the message), and logs a failed client read.
test('a failed month logs one line naming the month and the missing metrics; a failed client read logs one line', async () => {
  readYtdTab.mockResolvedValue(sheet((i) => (i < 8 ? '1' : ''), (i) => (i < 8 ? '1' : '')))
  getOutlineKpis.mockRejectedValue(new Error('INSTAGRAM: Dash omitted requested metric(s): PROFILE_CLICKS'))
  const r = render(<>{await YtdSheetReviewSection({ ctx: SEPT })}</>)
  expect(r.container.textContent).toContain("Couldn't load this section.")
  getClientBySlug.mockRejectedValueOnce(new Error('db down'))
  await YtdSheetReviewSection({ ctx: SEPT })
  expect(logs()).toEqual([
    '[organic-social] ytd-review@2 Dash request failed slug=c channel=INSTAGRAM month=2026-09 kind=other status=none missing=PROFILE_CLICKS',
    '[organic-social] ytd-review@2 client read failed slug=c',
  ])
})
