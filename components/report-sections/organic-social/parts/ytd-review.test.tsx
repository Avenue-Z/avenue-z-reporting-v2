import { beforeEach, expect, test, vi } from 'vitest'
import { render } from '@testing-library/react'
import type { ReactElement } from 'react'

const { getOutlineKpis, getClientBySlug } = vi.hoisted(() => ({ getOutlineKpis: vi.fn(), getClientBySlug: vi.fn() }))
vi.mock('@/lib/organic-social/outline-headlines', async () => ({
  ...(await vi.importActual<typeof import('@/lib/organic-social/outline-headlines')>('@/lib/organic-social/outline-headlines')),
  getOutlineKpis,
}))
vi.mock('@/lib/db/queries', () => ({ getClientBySlug }))

import { YtdReviewSection, ytdReviewV1 } from './ytd-review'
import { OutlineDataSection } from './outline-data'
import { ORGANIC_SOCIAL_PARTS } from './registry'
import { OUTLINE_DATA_ROWS } from '@/lib/organic-social/outline-layout'
import { FIXTURE_ORGANIC_SOCIAL_CTX } from './__fixtures__/organic-social-ctx'

// All numbers are made up.
const SEPT = { ...FIXTURE_ORGANIC_SOCIAL_CTX, clientSlug: 'c', channel: 'INSTAGRAM' as const, dateRange: 'custom:2026-09-01,2026-09-30', compareRange: 'custom:2026-08-01,2026-08-31' }
const LIVE = { ...SEPT, dateRange: 'custom:2026-10-01,2026-10-19', compareRange: 'custom:2026-09-01,2026-09-19' }
const AUG = { ...SEPT, dateRange: 'custom:2026-08-01,2026-08-31', compareRange: 'custom:2026-07-01,2026-07-31' }
const kpis = (followers: number, views: number, noData = false) => ({
  noData,
  kpis: {
    followers: { key: 'followers', label: 'Total Followers', format: 'number', value: followers },
    exposure: { key: 'exposure', label: 'Views', format: 'number', value: views },
  },
}) as never
const client = (reportingMonths?: unknown) => ({ id: 'c1', dashSocialConfig: { brandId: 1, ...(reportingMonths === undefined ? {} : { reportingMonths }) } })

/** Every chart element in the tree, with the props the assertions care about. */
type Chart = { name: string; data: { month: string }[]; xKey: string; yKeys: { key: string }[] }
function charts(node: unknown, found: Chart[] = []): Chart[] {
  const el = node as ReactElement<Record<string, unknown>> | null
  if (!el || typeof el !== 'object') return found
  const type = (el as { type?: { name?: string } }).type
  if (typeof type === 'function' && (type.name === 'LineChart' || type.name === 'BarChart')) {
    found.push({ name: type.name, ...(el.props as unknown as Omit<Chart, 'name'>) })
  }
  const kids = (el.props as { children?: unknown } | undefined)?.children
  for (const k of Array.isArray(kids) ? kids : [kids]) charts(k, found)
  return found
}

beforeEach(() => { getOutlineKpis.mockReset(); getClientBySlug.mockReset(); getClientBySlug.mockResolvedValue(client({ firstMonth: '2026-08' })) })

test('September on screen: one request per month, and both graphs plot August then September', async () => {
  getOutlineKpis.mockResolvedValueOnce(kpis(100, 10)).mockResolvedValueOnce(kpis(120, 30))
  const el = await YtdReviewSection({ ctx: SEPT })
  expect(getOutlineKpis.mock.calls).toEqual([
    ['c', 'custom:2026-08-01,2026-08-31', 'custom:2026-07-01,2026-07-31', 'INSTAGRAM'],
    ['c', 'custom:2026-09-01,2026-09-30', 'custom:2026-08-01,2026-08-31', 'INSTAGRAM'],
  ])
  const c = charts(el)
  expect(c.map((x) => [x.name, x.yKeys.map((k) => k.key)])).toEqual([['LineChart', ['followers']], ['LineChart', ['views']]])
  expect(c[0].data).toEqual([{ month: 'Aug', followers: 100, views: 10 }, { month: 'Sep', followers: 120, views: 30 }])
  const { container } = render(<>{el}</>)
  expect(container.textContent).toContain('YTD Review')
  expect(container.textContent).toContain('Follower Growth, Year to Date')
  expect(container.textContent).toContain('Views, Year to Date')
})

test("the team's live month is the last point, labelled live, and keeps the range on screen", async () => {
  getOutlineKpis.mockResolvedValue(kpis(1, 2))
  const el = await YtdReviewSection({ ctx: LIVE })
  expect(charts(el)[0].data.map((d) => d.month)).toEqual(['Aug', 'Sep', 'Oct (live)'])
  expect(getOutlineKpis.mock.calls.at(-1)).toEqual(['c', 'custom:2026-10-01,2026-10-19', 'custom:2026-09-01,2026-09-19', 'INSTAGRAM'])
})

test('one month on screen is drawn as bars, because a line has no dot for a single point', async () => {
  getOutlineKpis.mockResolvedValueOnce(kpis(100, 10))
  expect(charts(await YtdReviewSection({ ctx: AUG })).map((c) => c.name)).toEqual(['BarChart', 'BarChart'])
})

test('renders nothing on Overview, on a channel no outline covers, or on a range that is not one month', async () => {
  for (const ctx of [{ ...SEPT, channel: null }, { ...SEPT, channel: 'TWITTER' as const }, { ...SEPT, dateRange: 'last_30_days' }]) {
    expect(await YtdReviewSection({ ctx })).toBeNull()
  }
  expect(getOutlineKpis).not.toHaveBeenCalled()
})

test('a client pinned to the block without the setting renders nothing and says so once, by slug', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  getClientBySlug.mockResolvedValue(client(undefined))
  expect(await YtdReviewSection({ ctx: SEPT })).toBeNull()
  expect(warn).toHaveBeenCalledTimes(1)
  expect(warn).toHaveBeenCalledWith('[organic-social] ytd-review pinned without reportingMonths slug=c')
  expect(getOutlineKpis).not.toHaveBeenCalled()
  warn.mockRestore()
})

test('a failed month request, or a failed client read, shows the block fallback and no chart', async () => {
  getOutlineKpis.mockResolvedValueOnce(kpis(1, 1)).mockRejectedValueOnce(new Error('dash down'))
  const failed = await YtdReviewSection({ ctx: SEPT })
  expect(charts(failed)).toEqual([])
  expect(render(<>{failed}</>).container.textContent).toContain("Couldn't load this section.")
  getClientBySlug.mockRejectedValueOnce(new Error('db down'))
  expect(render(<>{await YtdReviewSection({ ctx: SEPT })}</>).container.textContent).toContain("Couldn't load this section.")
})

test('a month with no data is left off the graphs and named under them; every month empty shows the no-data card', async () => {
  getOutlineKpis.mockResolvedValueOnce(kpis(0, 0, true)).mockResolvedValueOnce(kpis(120, 30))
  const el = await YtdReviewSection({ ctx: SEPT })
  expect(charts(el)[0].data).toEqual([{ month: 'Sep', followers: 120, views: 30 }])
  expect(render(<>{el}</>).container.textContent).toContain('No data for Aug')
  getOutlineKpis.mockReset()
  getOutlineKpis.mockResolvedValue(kpis(0, 0, true))
  const empty = await YtdReviewSection({ ctx: SEPT })
  expect(charts(empty)).toEqual([])
  expect(render(<>{empty}</>).container.textContent).toMatch(/no data/i)
})

test("the YTD point for the month on screen is the Data block's own request, argument for argument", async () => {
  getOutlineKpis.mockResolvedValue(kpis(100, 10))
  await YtdReviewSection({ ctx: SEPT })
  const ytdLast = getOutlineKpis.mock.calls.at(-1)
  getOutlineKpis.mockClear()
  await OutlineDataSection({ ctx: SEPT, channel: 'INSTAGRAM', rows: OUTLINE_DATA_ROWS.standard.INSTAGRAM! })
  expect(getOutlineKpis.mock.calls[0]).toEqual(ytdLast)
})

test('ytd-review is registered at version 1 and unpublished', () => {
  expect(ORGANIC_SOCIAL_PARTS['ytd-review'][1]).toBe(ytdReviewV1)
  expect(ytdReviewV1.published).toBe(false)
})
