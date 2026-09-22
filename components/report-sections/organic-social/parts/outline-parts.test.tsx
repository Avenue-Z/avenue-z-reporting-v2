import { beforeEach, expect, test, vi } from 'vitest'
import { render } from '@testing-library/react'
import type { ReactNode } from 'react'

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

import { ORGANIC_SOCIAL_PARTS } from './registry'
import { platformHeadlinesV1 } from './platform-headlines'
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
beforeEach(() => { getOutlineMediaKpis.mockReset(); getOutlineMediaKpis.mockResolvedValue(REELS) })
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
  expect([...c.querySelectorAll('h3')].map((h) => h.textContent)).toEqual(['Instagram'])
  expect(c.textContent).toContain('Total Engagements')
  expect(c.textContent).toContain('Profile Views')
  expect(card(c, 'Video Views')!.textContent).toContain('1,234')
  expect(getOutlineMediaKpis).toHaveBeenCalledWith(IG.clientSlug, IG.dateRange, IG.compareRange, 'INSTAGRAM')
  for (const gone of ['Likes', 'Saves', 'Reposts']) expect(c.textContent).not.toContain(gone)
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
  expect(d.textContent).toContain('Taking longer than usual')
})

test('on Overview or an uncovered channel the Data part is v1, and the breakdown is nothing', () => {
  const v2 = ORGANIC_SOCIAL_PARTS['platform-headlines'][2]
  const brk = ORGANIC_SOCIAL_PARTS['engagement-breakdown'][1]
  const r = { id: 'platform-headlines', version: 2, label: 'x' }
  for (const ctx of [FIXTURE_ORGANIC_SOCIAL_CTX, { ...FIXTURE_ORGANIC_SOCIAL_CTX, channel: 'TWITTER' as const }]) {
    expect(v2.render(ctx, r)).toEqual(platformHeadlinesV1.render(ctx, r))
    expect(brk.render(ctx, { id: 'engagement-breakdown', version: 1, label: 'x' })).toBeNull()
  }
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

test("the Data block draws a tab with no flagged row exactly as the shared tiles do", async () => {
  getOutlineKpis.mockResolvedValueOnce(builtFor('INSTAGRAM', 10))
  const outline = await text(OutlineDataSection({ ctx: IG, channel: 'INSTAGRAM', rows: OUTLINE_DATA_ROWS.standard.INSTAGRAM! }))
  const b = builtFor('INSTAGRAM', 10)
  const h = selectOutlineRows('INSTAGRAM', { ...b, kpis: { ...b.kpis, ...REELS } }, OUTLINE_DATA_ROWS.standard.INSTAGRAM!)
  expect(h.kpis.every((k) => !k.unavailable)).toBe(true)
  const shared = render(<PlatformHeadlines headlines={[h as PlatformHeadline]} />).container
  expect(outline.innerHTML).toBe(shared.innerHTML)
})

test('with no data, a tab with a flagged row shows only the no-data card, as the shared tiles do', async () => {
  const empty = buildOutlineKpis('FACEBOOK',
    Object.fromEntries(outlineSpecsFor('FACEBOOK').map((s) => [metricFor(s), { value: null, context: null, context_change: null }])),
    outlineSpecsFor('FACEBOOK'))
  getOutlineKpis.mockResolvedValueOnce(empty)
  const c = await text(OutlineDataSection({ ctx: { ...IG, channel: 'FACEBOOK' }, channel: 'FACEBOOK', rows: OUTLINE_DATA_ROWS.standard.FACEBOOK! }))
  expect(card(c, 'Profile Views')).toBeNull()
  expect(c.textContent).not.toContain(NOT_IN_DASH)
  const shared = render(<PlatformHeadlines headlines={[{ channel: 'FACEBOOK', label: 'Facebook', kpis: [], noData: true }]} />).container
  expect(c.innerHTML).toBe(shared.innerHTML)
})

test('a flagged row under the graph is a blank tile with the flag too', () => {
  const c = render(<OutlineTiles kpis={[
    { key: 'likes', label: 'Likes', format: 'number', value: 7 },
    { key: 'reposts', label: 'Reposts', format: 'number', value: null, unavailable: NOT_IN_DASH },
  ]} />).container
  expect([...card(c, 'Reposts')!.querySelectorAll('p')].map((p) => p.textContent)).toEqual(['Reposts', '\u00A0', NOT_IN_DASH])
  expect(card(c, 'Likes')!.textContent).toContain('7')
})
