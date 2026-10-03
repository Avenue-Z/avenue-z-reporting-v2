import { afterEach, beforeEach, expect, test, vi } from 'vitest'
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

import { YtdLiveReviewSection, ytdReviewV3 } from './ytd-review-live'
import { ytdReviewV1 } from './ytd-review'
import { ytdReviewV2 } from './ytd-review-sheet'
import { ORGANIC_SOCIAL_PARTS } from './registry'
import { YtdSheetReadError } from '@/lib/organic-social/ytd-sheet'
import { FIXTURE_ORGANIC_SOCIAL_CTX } from './__fixtures__/organic-social-ctx'

// Made-up sheet id and numbers only. A Renaissance-shaped client: no reportingMonths, no channel allowlist.
const ID = 'TESTSHEETID_abcdefghij0123'
const CTX = { ...FIXTURE_ORGANIC_SOCIAL_CTX, clientSlug: 'live-co', channel: 'INSTAGRAM' as const, dateRange: 'last_30_days', compareRange: 'previous_period' }
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const sheet = (f: (i: number) => string, v: (i: number) => string) => [
  ['CLIENT: Live Co'], ['FOLLOWER GROWTH'], ['', 'Instagram'], ...MONTHS.map((m, i) => [m, f(i)]),
  [], ['VIEWS'], ['', 'Instagram'], ...MONTHS.map((m, i) => [m, v(i)]),
]
const kpis = (followers: number, views: number, noData = false) => ({ noData, kpis: { followers: { key: 'followers', label: 'Total Followers', format: 'number', value: followers }, exposure: { key: 'exposure', label: 'Views', format: 'number', value: views } } }) as never
const client = (dsc: Record<string, unknown> = {}) => ({ id: 'c1', dashSocialConfig: { brandId: 1, ...dsc } })
const ENTRY = { ytdSheets: { 2026: { sheetId: ID, tab: 'Live Co' } } }

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
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-15T12:00:00Z'))
  getClientBySlug.mockResolvedValue(client(ENTRY))
  vi.spyOn(console, 'warn').mockImplementation(() => {}); vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.useRealTimers())

test('ytd-review@3 is registered unpublished; 1 and 2 are the same objects as before', () => {
  expect(ORGANIC_SOCIAL_PARTS['ytd-review'][3]).toBe(ytdReviewV3)
  expect(ytdReviewV3.published).toBe(false)
  expect(ORGANIC_SOCIAL_PARTS['ytd-review'][1]).toBe(ytdReviewV1)
  expect(ORGANIC_SOCIAL_PARTS['ytd-review'][2]).toBe(ytdReviewV2)
})

test('picker range is ignored: January to October (live); the sheet wins; blank months come from live Dash with no comparison', async () => {
  readYtdTab.mockResolvedValue(sheet((i) => (i < 8 ? String(100 + i) : ''), (i) => (i < 8 ? String(10 + i) : '')))
  getOutlineKpis.mockImplementation(async (_s: string, range: string) => (range.startsWith('custom:2026-09') ? kpis(900, 90) : kpis(1000, 100)))
  const el = await YtdLiveReviewSection({ ctx: CTX })
  expect(readYtdTab).toHaveBeenCalledWith(ID, 'Live Co')
  expect(getOutlineKpis.mock.calls).toEqual([
    ['live-co', 'custom:2026-09-01,2026-09-30', null, 'INSTAGRAM'],
    ['live-co', 'custom:2026-10-01,2026-10-14', null, 'INSTAGRAM'],
  ])
  const c = charts(el)
  expect(c[0].data.map((d) => d.month)).toEqual(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct (live)'])
  expect(c[0].data.slice(-2)).toEqual([{ month: 'Sep', followers: 900 }, { month: 'Oct (live)', followers: 1000 }])
  expect(c[1].data[0]).toEqual({ month: 'Jan', views: 10 })
  const { container } = render(<>{el}</>)
  expect(container.textContent).toContain('YTD Review')
})

test('no sheet for the year: every month from live Dash, and no column warnings', async () => {
  getClientBySlug.mockResolvedValue(client())
  getOutlineKpis.mockResolvedValue(kpis(5, 6))
  const el = await YtdLiveReviewSection({ ctx: CTX })
  expect(readYtdTab).not.toHaveBeenCalled()
  expect(getOutlineKpis).toHaveBeenCalledTimes(10)
  expect(charts(el)[0].data).toHaveLength(10)
  expect(logs()).toEqual([])
})

test('an invalid entry: one warning, then every month from live Dash', async () => {
  getClientBySlug.mockResolvedValue(client({ ytdSheets: { 2026: { sheetId: 'bad', tab: 'x' } } }))
  getOutlineKpis.mockResolvedValue(kpis(5, 6))
  await YtdLiveReviewSection({ ctx: CTX })
  expect(getOutlineKpis).toHaveBeenCalledTimes(10)
  expect(logs()).toEqual(['[organic-social] ytd sheet config invalid slug=live-co year=2026; using live Dash'])
})

test('a sheet read failure or a layout error is the error card, logged without the sheet id or tab', async () => {
  readYtdTab.mockRejectedValueOnce(new YtdSheetReadError('429'))
  let r = render(<>{await YtdLiveReviewSection({ ctx: CTX })}</>)
  expect(r.container.textContent).toContain("Couldn't load this section.")
  r.unmount()
  readYtdTab.mockResolvedValueOnce(sheet((i) => String(i), (i) => String(i)).map((row) => (row[0] === 'September' ? ['Sept', '1'] : row)))
  r = render(<>{await YtdLiveReviewSection({ ctx: CTX })}</>)
  expect(r.container.textContent).toContain("Couldn't load this section.")
  expect(logs()).toEqual([
    '[organic-social] ytd sheet read failed slug=live-co status=429',
    '[organic-social] ytd sheet layout not found slug=live-co missing=followers september',
  ])
  expect(getOutlineKpis).not.toHaveBeenCalled()
})

test('a Dash failure for a needed month is the fallback card', async () => {
  readYtdTab.mockResolvedValue(sheet((i) => (i < 8 ? '1' : ''), (i) => (i < 8 ? '1' : '')))
  getOutlineKpis.mockRejectedValue(new Error('dash down'))
  const r = render(<>{await YtdLiveReviewSection({ ctx: CTX })}</>)
  expect(r.container.textContent).toContain("Couldn't load this section.")
})

test('the X tab and Overview render nothing and read nothing', async () => {
  expect(await YtdLiveReviewSection({ ctx: { ...CTX, channel: 'TWITTER' as const } })).toBeNull()
  expect(await YtdLiveReviewSection({ ctx: { ...CTX, channel: null } })).toBeNull()
  expect(getClientBySlug).not.toHaveBeenCalled()
  expect(readYtdTab).not.toHaveBeenCalled()
})

test('a client on locked months renders nothing, logs one line, and asks Dash nothing', async () => {
  getClientBySlug.mockResolvedValue(client({ reportingMonths: { firstMonth: '2026-08' }, ...ENTRY }))
  expect(await YtdLiveReviewSection({ ctx: CTX })).toBeNull()
  expect(getOutlineKpis).not.toHaveBeenCalled()
  expect(readYtdTab).not.toHaveBeenCalled()
  expect(logs()).toEqual(['[organic-social] ytd-review@3 skipped (client has reportingMonths) slug=live-co'])
})

test('leading N/A months are not listed; a later gap is (S7)', async () => {
  readYtdTab.mockResolvedValue(sheet((i) => (i < 2 ? 'N/A' : i === 4 ? 'N/A' : i < 8 ? String(i) : ''), (i) => (i < 8 ? String(i) : '')))
  getOutlineKpis.mockResolvedValue(kpis(9, 9))
  const { container } = render(<>{await YtdLiveReviewSection({ ctx: CTX })}</>)
  expect(container.textContent).toContain('No follower data for May')
  expect(container.textContent).not.toContain('No follower data for Jan')
})

test('on January 1 the block shows last year from last year\'s entry', async () => {
  vi.setSystemTime(new Date('2027-01-01T12:00:00Z'))
  readYtdTab.mockResolvedValue(sheet((i) => String(i + 1), (i) => String(i + 1)))
  const el = await YtdLiveReviewSection({ ctx: CTX })
  expect(readYtdTab).toHaveBeenCalledWith(ID, 'Live Co')
  expect(getOutlineKpis).not.toHaveBeenCalled()
  expect(charts(el)[0].data.map((d) => d.month)).toEqual(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'])
})

test('at most 3 Dash requests in flight', async () => {
  getClientBySlug.mockResolvedValue(client())
  let inFlight = 0, peak = 0
  getOutlineKpis.mockImplementation(async () => { inFlight++; peak = Math.max(peak, inFlight); await Promise.resolve(); await Promise.resolve(); inFlight--; return kpis(1, 1) })
  await YtdLiveReviewSection({ ctx: CTX })
  expect(peak).toBeLessThanOrEqual(3)
})

test('a client with a malformed reportingMonths (null or broken) is still skipped: no Dash call, no lock rows', async () => {
  for (const reportingMonths of [null, 'broken']) {
    vi.mocked(console.warn).mockClear()
    getClientBySlug.mockResolvedValue(client({ reportingMonths, ...ENTRY }))
    expect(await YtdLiveReviewSection({ ctx: CTX })).toBeNull()
    expect(logs()).toEqual(['[organic-social] ytd-review@3 skipped (client has reportingMonths) slug=live-co'])
  }
  expect(getOutlineKpis).not.toHaveBeenCalled()
  expect(readYtdTab).not.toHaveBeenCalled()
})

test('Facebook and LinkedIn tabs draw the block too', async () => {
  readYtdTab.mockResolvedValue([['CLIENT: Live Co'], ['FOLLOWER GROWTH'], ['', 'Facebook', 'LinkedIn'], ...MONTHS.map((m, i) => [m, String(i + 1), String(i + 2)]),
    [], ['VIEWS'], ['', 'Facebook', 'LinkedIn'], ...MONTHS.map((m, i) => [m, String(i + 3), String(i + 4)])])
  for (const channel of ['FACEBOOK', 'LINKEDIN'] as const) {
    const el = await YtdLiveReviewSection({ ctx: { ...CTX, channel } })
    expect(charts(el)[0].data.map((d) => d.month)).toHaveLength(10)
  }
  expect(getOutlineKpis).not.toHaveBeenCalled() // every month Jan to Oct filled in both columns
})

test('three Dash requests really run at once with no sheet (ten months)', async () => {
  getClientBySlug.mockResolvedValue(client())
  let inFlight = 0, peak = 0
  getOutlineKpis.mockImplementation(async () => { inFlight++; peak = Math.max(peak, inFlight); await Promise.resolve(); await Promise.resolve(); inFlight--; return kpis(1, 1) })
  await YtdLiveReviewSection({ ctx: CTX })
  expect(peak).toBe(3)
})

test('a Dash failure is logged with slug, channel, month, kind and status, never the request URL', async () => {
  const { DashApiError, DashTimeoutError } = await import('@/lib/dash-social/client')
  getClientBySlug.mockResolvedValue(client())
  getOutlineKpis.mockImplementation(async (_s: string, range: string) => {
    if (range.startsWith('custom:2026-09')) throw new DashApiError('500 persistent at https://api.example/brands/123456/reports')
    if (range.startsWith('custom:2026-10')) throw new DashTimeoutError()
    return kpis(1, 1)
  })
  const r = render(<>{await YtdLiveReviewSection({ ctx: CTX })}</>)
  expect(r.container.textContent).toContain("Couldn't load this section.")
  const l = logs().filter((x) => x.includes('ytd-review@3 Dash request failed'))
  expect(l).toContain('[organic-social] ytd-review@3 Dash request failed slug=live-co channel=INSTAGRAM month=2026-09 kind=api status=500')
  expect(l).toContain('[organic-social] ytd-review@3 Dash request failed slug=live-co channel=INSTAGRAM month=2026-10 kind=timeout status=none')
  expect(logs().join('\n')).not.toContain('123456')
  expect(logs().join('\n')).not.toContain('https://')
})
