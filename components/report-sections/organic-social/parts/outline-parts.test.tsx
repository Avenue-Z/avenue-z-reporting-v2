import { beforeEach, expect, test, vi } from 'vitest'
import { render } from '@testing-library/react'
import { Suspense, type ReactElement, type ReactNode } from 'react'

vi.mock('@/lib/organic-social/headlines', () => import('./__mocks__/headlines'))
vi.mock('@/lib/organic-social/trends', () => import('./__mocks__/trends'))
vi.mock('@/lib/organic-social/top-content', () => import('./__mocks__/top-content'))
const { getOutlineKpis } = vi.hoisted(() => ({ getOutlineKpis: vi.fn() }))
vi.mock('@/lib/organic-social/outline-headlines', async () => ({
  ...(await vi.importActual<typeof import('@/lib/organic-social/outline-headlines')>('@/lib/organic-social/outline-headlines')),
  getOutlineKpis,
}))
const { getOutlineMediaKpis } = vi.hoisted(() => ({ getOutlineMediaKpis: vi.fn() }))
vi.mock('@/lib/organic-social/outline-media', () => ({ getOutlineMediaKpis }))
const { loadTileSheets } = vi.hoisted(() => ({ loadTileSheets: vi.fn() }))
vi.mock('@/lib/organic-social/tile-sheets', () => ({ loadTileSheets }))

import { ORGANIC_SOCIAL_PARTS } from './registry'
import { HeadlinesSection, platformHeadlinesV1 } from './platform-headlines'
import { HeadlinesSkeleton } from '../skeletons'
import { OutlineDataSection } from './outline-data'
import { BreakdownSection } from './engagement-breakdown'
import { buildOutlineKpis, selectOutlineRows } from '@/lib/organic-social/outline-headlines'
import { PlatformHeadlines } from '../platform-headlines'
import type { PlatformHeadline } from '@/lib/organic-social/types'
import { OutlineTiles } from '../outline-tiles'
import { outlineSpecsFor, OUTLINE_DATA_ROWS, OUTLINE_BREAKDOWN_ROWS, NOT_IN_DASH, MEDIA_FAILED } from '@/lib/organic-social/outline-layout'
import { metricFor } from '@/lib/organic-social/metrics'
import { DashTimeoutError } from '@/lib/dash-social/client'
import { FIXTURE_ORGANIC_SOCIAL_CTX } from './__fixtures__/organic-social-ctx'

const IG = { ...FIXTURE_ORGANIC_SOCIAL_CTX, channel: 'INSTAGRAM' as const }
const built = (value: number | null) => buildOutlineKpis('INSTAGRAM',
  Object.fromEntries(outlineSpecsFor('INSTAGRAM').map((s) => [metricFor(s), { value, context: null, context_change: null }])),
  outlineSpecsFor('INSTAGRAM'))
const text = async (node: Promise<ReactNode>) => render(<>{await node}</>).container
const builtFor = (ch: 'FACEBOOK' | 'INSTAGRAM', value: number) => buildOutlineKpis(ch,
  Object.fromEntries(outlineSpecsFor(ch).map((s) => [metricFor(s), { value, context: null, context_change: null }])),
  outlineSpecsFor(ch))
/** Views on Reels, as the media request returns it. */
const REELS = { videoViews: { key: 'videoViews', label: 'Video Views', format: 'number' as const, value: 1234 } }
beforeEach(() => {
  getOutlineMediaKpis.mockReset(); getOutlineMediaKpis.mockResolvedValue(REELS)
  loadTileSheets.mockReset(); loadTileSheets.mockResolvedValue(null)
})
/** The KpiCard whose title is exactly `title`. */
const card = (c: HTMLElement, title: string) =>
  ([...c.querySelectorAll('p')].find((p) => p.textContent === title)?.closest('div.rounded-lg') ?? null) as HTMLElement | null

test('the registry adds three unpublished versions and leaves v1 as it was', () => {
  expect(Object.keys(ORGANIC_SOCIAL_PARTS['platform-headlines'])).toEqual(['1', '2', '3'])
  expect(ORGANIC_SOCIAL_PARTS['platform-headlines'][1]).toBe(platformHeadlinesV1)
  expect(ORGANIC_SOCIAL_PARTS['engagement-breakdown'][1].published).toBe(false)
  expect(ORGANIC_SOCIAL_PARTS['platform-headlines'][2].published).toBe(false)
  expect(ORGANIC_SOCIAL_PARTS['platform-headlines'][3].published).toBe(false)
})

test('the Data part shows the outline rows, Video Views from Views on Reels, and none of the breakdown', async () => {
  getOutlineKpis.mockResolvedValueOnce(built(10))
  const c = await text(OutlineDataSection({ ctx: IG, channel: 'INSTAGRAM', rows: OUTLINE_DATA_ROWS.standard.INSTAGRAM! }))
  // Jasmine's outlines name this block "Data"; the shared tiles, which Renaissance renders, keep the platform name.
  expect([...c.querySelectorAll('h3')].map((h) => h.textContent)).toEqual(['Data'])
  expect(c.textContent).toContain('Total Engagements')
  expect(c.textContent).toContain('Profile Views')
  expect(card(c, 'Video Views')!.textContent).toContain('1,234')
  expect(getOutlineMediaKpis).toHaveBeenCalledWith(IG.clientSlug, IG.dateRange, IG.compareRange, 'INSTAGRAM')
  // Tiles by title, not substrings: the engagements definition text legitimately contains "Likes".
  for (const gone of ['Likes', 'Saves', 'Reposts']) expect(card(c, gone)).toBeFalsy()
})

test('a failed Views on Reels request flags only its row, and says so once in the log', async () => {
  const err = vi.spyOn(console, 'error').mockImplementation(() => {})
  for (const [failure, kind] of [[new Error('boom'), 'error'], [new DashTimeoutError(), 'timeout']] as const) {
    err.mockClear()
    getOutlineKpis.mockResolvedValueOnce(built(10))
    getOutlineMediaKpis.mockRejectedValueOnce(failure)
    const c = await text(OutlineDataSection({ ctx: IG, channel: 'INSTAGRAM', rows: OUTLINE_DATA_ROWS.standard.INSTAGRAM! }))
    expect([...card(c, 'Video Views')!.querySelectorAll('p')].map((p) => p.textContent)).toEqual(['Video Views', '\u00A0', MEDIA_FAILED])
    expect(card(c, 'Total Engagements')!.textContent).toContain('10')
    expect(err).toHaveBeenCalledTimes(1)
    expect(err).toHaveBeenCalledWith(`[organic-social] Views on Reels failed slug=${IG.clientSlug} channel=INSTAGRAM kind=${kind}`)
  }
  expect(MEDIA_FAILED).toBe('Could not load from Dash')
  err.mockRestore()
})

test('the breakdown shows its rows in order with no heading', async () => {
  getOutlineKpis.mockResolvedValueOnce(built(10))
  const c = await text(BreakdownSection({ ctx: IG, channel: 'INSTAGRAM', rows: OUTLINE_BREAKDOWN_ROWS.INSTAGRAM! }))
  expect(c.querySelectorAll('h3')).toHaveLength(0)
  const t = c.textContent ?? ''
  const at = ['Likes', 'Comments', 'Shares', 'Saves', 'Reposts'].map((l) => t.indexOf(l))
  expect(at.every((i) => i >= 0)).toBe(true)
  expect([...at].sort((a, b) => a - b)).toEqual(at)
})

test('with no data the breakdown renders nothing; the Data block above says so once', async () => {
  getOutlineKpis.mockResolvedValueOnce(built(null))
  const c = await text(BreakdownSection({ ctx: IG, channel: 'INSTAGRAM', rows: OUTLINE_BREAKDOWN_ROWS.INSTAGRAM! }))
  expect(c.innerHTML).toBe('')
})

test('a Dash failure shows the same fallback card as the v1 tiles', async () => {
  getOutlineKpis.mockRejectedValueOnce(new Error('boom'))
  const c = await text(OutlineDataSection({ ctx: IG, channel: 'INSTAGRAM', rows: OUTLINE_DATA_ROWS.standard.INSTAGRAM! }))
  expect(c.textContent).toContain("Couldn't load this section.")
  getOutlineKpis.mockRejectedValueOnce(new DashTimeoutError())
  const d = await text(BreakdownSection({ ctx: IG, channel: 'INSTAGRAM', rows: OUTLINE_BREAKDOWN_ROWS.INSTAGRAM! }))
  // The default timeout copy, exactly: only the YTD blocks pass their own.
  expect(d.textContent).toBe('Taking longer than usual — try a shorter date range.')
})

test('on Overview or an uncovered channel the Data part is the v1 tiles with whole-number changes, and the breakdown is nothing (O4)', () => {
  const v2 = ORGANIC_SOCIAL_PARTS['platform-headlines'][2]
  const brk = ORGANIC_SOCIAL_PARTS['engagement-breakdown'][1]
  const r = { id: 'platform-headlines', version: 2, label: 'x' }
  for (const ctx of [FIXTURE_ORGANIC_SOCIAL_CTX, { ...FIXTURE_ORGANIC_SOCIAL_CTX, channel: 'TWITTER' as const }]) {
    expect(v2.render(ctx, r)).toEqual(<Suspense fallback={<HeadlinesSkeleton />}><HeadlinesSection {...ctx} outline /></Suspense>)
    // The v1 part, which Renaissance renders, never passes the flag.
    const v1 = platformHeadlinesV1.render(ctx, { ...r, version: 1 }) as ReactElement<{ children: ReactElement<Record<string, unknown>> }>
    expect(v1.props.children.props).not.toHaveProperty('outline')
    expect(brk.render(ctx, { id: 'engagement-breakdown', version: 1, label: 'x' })).toBeNull()
  }
})

test('HeadlinesSection passes the flag on to the tiles, so the fallback really shows whole numbers (O4)', async () => {
  const { getPlatformHeadlines } = await import('@/lib/organic-social/headlines')
  const h: PlatformHeadline[] = [{ channel: 'TWITTER', label: 'X', noData: false,
    kpis: [{ key: 'followers', label: 'Total Followers', value: 100, format: 'number', delta: 5.2 }] }]
  vi.mocked(getPlatformHeadlines).mockResolvedValueOnce(h as never)
  expect((await text(HeadlinesSection({ ...FIXTURE_ORGANIC_SOCIAL_CTX, outline: true }))).textContent).toContain('↑ 5% vs prior period')
  vi.mocked(getPlatformHeadlines).mockResolvedValueOnce(h as never)
  expect((await text(HeadlinesSection({ ...FIXTURE_ORGANIC_SOCIAL_CTX }))).textContent).toContain('↑ 5.2% vs prior period')
})

// Paul's review of #285: an outline client's fallback tabs measure the change against the size of the prior, as
// its outline tiles do, so a rise from a negative prior shows a rise. The v1 part, which Renaissance renders,
// still asks for exactly the four arguments it always has (the signed change): Renaissance is unchanged.
test('the outline fallback asks for the size-based change; the v1 part (Renaissance) asks exactly as before', async () => {
  const { getPlatformHeadlines } = await import('@/lib/organic-social/headlines')
  const g = vi.mocked(getPlatformHeadlines)
  const { clientSlug, dateRange, compareRange, channel } = FIXTURE_ORGANIC_SOCIAL_CTX
  g.mockClear(); g.mockResolvedValueOnce([])
  await HeadlinesSection({ ...FIXTURE_ORGANIC_SOCIAL_CTX, outline: true })
  expect(g.mock.calls[0]).toEqual([clientSlug, dateRange, compareRange, channel, 'size'])
  g.mockClear(); g.mockResolvedValueOnce([])
  await HeadlinesSection({ ...FIXTURE_ORGANIC_SOCIAL_CTX })
  expect(g.mock.calls[0]).toEqual([clientSlug, dateRange, compareRange, channel])
})

test("Piper's X tab, -2 to +4 Net New Followers: an outline client sees a green rise; the v1 path (Renaissance) still shows the old arrow", async () => {
  const { getPlatformHeadlines } = await import('@/lib/organic-social/headlines')
  const { buildPlatformHeadline } = await import('@/lib/organic-social/headline-build')
  const { metricForKey } = await import('@/lib/organic-social/metrics')
  const metrics = { [metricForKey('TWITTER', 'netNewFollowers')]: { value: 4, context: -2, context_change: null } }
  // The real builder, with whatever change the caller asks for.
  const viaBuilder = async (...a: unknown[]) => [buildPlatformHeadline('TWITTER', metrics as never, ['netNewFollowers'], true, a[4] as never)]
  const X = { ...FIXTURE_ORGANIC_SOCIAL_CTX, channel: 'TWITTER' as const }
  vi.mocked(getPlatformHeadlines).mockImplementationOnce(viaBuilder as never)
  const outline = await text(HeadlinesSection({ ...X, outline: true }))
  const rise = [...outline.querySelectorAll('p')].find((p) => p.textContent?.includes('vs prior period'))!
  expect(rise.textContent).toBe('↑ 300% vs prior period')
  expect(rise.className).toContain('text-brand-green')
  vi.mocked(getPlatformHeadlines).mockImplementationOnce(viaBuilder as never)
  expect((await text(HeadlinesSection(X))).textContent).toContain('↓ 300.0% vs prior period')
})

test('the shared tiles round only when told to (O4)', () => {
  const h: PlatformHeadline[] = [{ channel: 'TWITTER', label: 'X', noData: false,
    kpis: [{ key: 'followers', label: 'Total Followers', value: 100, format: 'number', delta: 5.2 }] }]
  expect(render(<PlatformHeadlines headlines={h} wholeDelta />).container.textContent).toContain('↑ 5% vs prior period')
  expect(render(<PlatformHeadlines headlines={h} />).container.textContent).toContain('↑ 5.2% vs prior period')
})

test('v3 is v2 with Profile Clicks on Instagram, and never asks for Views on Reels', async () => {
  getOutlineKpis.mockResolvedValueOnce(built(10))
  const c = await text(OutlineDataSection({ ctx: IG, channel: 'INSTAGRAM', rows: OUTLINE_DATA_ROWS.profileClicks.INSTAGRAM! }))
  expect(c.textContent).toContain('Profile Clicks')
  expect(c.textContent).not.toContain('Video Views')
  expect(getOutlineMediaKpis).not.toHaveBeenCalled()
})

test("Facebook has no Profile Views tile: Jasmine removed the row, so the block goes straight to Video Views", async () => {
  getOutlineKpis.mockResolvedValueOnce(builtFor('FACEBOOK', 10))
  const c = await text(OutlineDataSection({ ctx: { ...IG, channel: 'FACEBOOK' }, channel: 'FACEBOOK', rows: OUTLINE_DATA_ROWS.standard.FACEBOOK! }))
  expect(card(c, 'Profile Views')).toBeNull()
  expect(c.textContent).not.toContain(NOT_IN_DASH)
  const t = c.textContent ?? ''
  expect(t.indexOf('Engagement Rate')).toBeLessThan(t.indexOf('Video Views'))
})

test("the Data block draws a tab with no flagged row exactly as the shared tiles do, under the heading \"Data\"", async () => {
  getOutlineKpis.mockResolvedValueOnce(builtFor('INSTAGRAM', 10))
  const outline = await text(OutlineDataSection({ ctx: IG, channel: 'INSTAGRAM', rows: OUTLINE_DATA_ROWS.standard.INSTAGRAM! }))
  const b = builtFor('INSTAGRAM', 10)
  const h = selectOutlineRows('INSTAGRAM', { ...b, kpis: { ...b.kpis, ...REELS } }, OUTLINE_DATA_ROWS.standard.INSTAGRAM!)
  expect(h.kpis.every((k) => !k.unavailable)).toBe(true)
  // Identical markup except the heading text: the shared tiles drawn under the outline's heading.
  const shared = render(<PlatformHeadlines headlines={[{ ...h, label: 'Data' } as PlatformHeadline]} />).container
  expect(outline.innerHTML).toBe(shared.innerHTML)
})

test('with no data, a tab with a flagged row shows only the no-data card, as the shared tiles do, under "Data"', async () => {
  const empty = buildOutlineKpis('FACEBOOK',
    Object.fromEntries(outlineSpecsFor('FACEBOOK').map((s) => [metricFor(s), { value: null, context: null, context_change: null }])),
    outlineSpecsFor('FACEBOOK'))
  getOutlineKpis.mockResolvedValueOnce(empty)
  const c = await text(OutlineDataSection({ ctx: { ...IG, channel: 'FACEBOOK' }, channel: 'FACEBOOK', rows: OUTLINE_DATA_ROWS.standard.FACEBOOK! }))
  expect(card(c, 'Profile Views')).toBeNull()
  expect(c.textContent).not.toContain(NOT_IN_DASH)
  const shared = render(<PlatformHeadlines headlines={[{ channel: 'FACEBOOK', label: 'Data', kpis: [], noData: true }]} />).container
  expect(c.innerHTML).toBe(shared.innerHTML)
})

test('a flagged row under the graph is a blank tile with the flag too', () => {
  const c = render(<OutlineTiles channel="INSTAGRAM" kpis={[
    { key: 'likes', label: 'Likes', format: 'number', value: 7 },
    { key: 'reposts', label: 'Reposts', format: 'number', value: null, unavailable: NOT_IN_DASH },
  ]} />).container
  expect([...card(c, 'Reposts')!.querySelectorAll('p')].map((p) => p.textContent)).toEqual(['Reposts', '\u00A0', NOT_IN_DASH])
  expect(card(c, 'Likes')!.textContent).toContain('7')
})

test('outline tiles show percent changes as whole numbers, the arrow following the rounded value', () => {
  const c = render(<OutlineTiles channel="INSTAGRAM" kpis={[
    { key: 'views', label: 'Views', format: 'number', value: 100, delta: 6.34 },
    { key: 'likes', label: 'Likes', format: 'number', value: 100, delta: 0.04 },
  ]} />).container
  expect(card(c, 'Views')!.textContent).toContain('↑ 6% vs prior period')
  expect(card(c, 'Views')!.textContent).not.toContain('6.3%')
  expect(card(c, 'Likes')!.textContent).not.toContain('↑')
})

const cells = (m: Record<number, number>) => Array.from({ length: 12 }, (_, i) => (m[i + 1] === undefined ? { kind: 'blank' as const } : { kind: 'number' as const, value: m[i + 1] }))
const SEPT_IG = { ...IG, dateRange: 'custom:2026-09-01,2026-09-30', compareRange: 'custom:2026-08-01,2026-08-31' }

test('a finished month the sheet has: Total Followers and Views show the sheet with sheet arrows; the Dash request is exactly today\'s', async () => {
  getOutlineKpis.mockReset(); getOutlineKpis.mockResolvedValueOnce(built(10))
  loadTileSheets.mockResolvedValueOnce({ key: '2026-09', compareKey: '2026-08', sheets: {
    current: { followers: { INSTAGRAM: cells({ 8: 1000, 9: 1100 }) }, views: { INSTAGRAM: cells({ 8: 200, 9: 300 }) } }, prior: null,
  } })
  const c = await text(OutlineDataSection({ ctx: SEPT_IG, channel: 'INSTAGRAM', rows: OUTLINE_DATA_ROWS.standard.INSTAGRAM! }))
  expect(getOutlineKpis.mock.calls).toEqual([[SEPT_IG.clientSlug, 'custom:2026-09-01,2026-09-30', 'custom:2026-08-01,2026-08-31', 'INSTAGRAM']])
  expect(loadTileSheets.mock.calls).toEqual([[SEPT_IG.clientSlug, 'custom:2026-09-01,2026-09-30']])
  expect(card(c, 'Total Followers')!.textContent).toContain('1,100')
  expect(card(c, 'Total Followers')!.textContent).toContain('↑ 10% vs prior period')
  expect(card(c, 'Views')!.textContent).toContain('300')
  expect(card(c, 'Views')!.textContent).toContain('↑ 50% vs prior period')
  expect(card(c, 'Net New Followers')!.textContent).toContain('10') // Dash, unchanged
  expect(card(c, 'Net New Followers')!.textContent).not.toContain('1,100')
  expect(card(c, 'Video Views')!.textContent).toContain('1,234') // Views on Reels: the sheet never touches media rows
})

test('with no sheet plan the tiles are exactly Dash\'s', async () => {
  getOutlineKpis.mockReset(); getOutlineKpis.mockResolvedValueOnce(built(10))
  const c = await text(OutlineDataSection({ ctx: SEPT_IG, channel: 'INSTAGRAM', rows: OUTLINE_DATA_ROWS.standard.INSTAGRAM! }))
  expect(card(c, 'Total Followers')!.textContent).toContain('10')
  expect(card(c, 'Total Followers')!.textContent).not.toContain('1,100')
})

test('a sheet loader that rejects (an Error or anything else) still renders Dash\'s tiles', async () => {
  for (const reason of [new Error('boom'), 'not an error']) {
    getOutlineKpis.mockReset(); getOutlineKpis.mockResolvedValueOnce(built(10))
    loadTileSheets.mockRejectedValueOnce(reason)
    const c = await text(OutlineDataSection({ ctx: SEPT_IG, channel: 'INSTAGRAM', rows: OUTLINE_DATA_ROWS.standard.INSTAGRAM! }))
    expect(card(c, 'Total Followers')!.textContent).toContain('10')
    expect(card(c, 'Views')!.textContent).toContain('10')
  }
})
