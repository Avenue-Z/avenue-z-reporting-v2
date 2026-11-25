// follower-graph@3, engagement-trend@3 and @4 (plan docs/superpowers/plans/2026-11-23-os-design-phase1.md, Tasks 3 and 4):
// the trend graphs in a kit card, the line shaded and frameless. Proven against @2, @2 and @1 with the parity helper for
// staff, a client and the PDF export, on what a viewer reads AND on what is handed to the chart (the plotted values are
// geometry, not text). Each kit version is the old version's own render with its section wrapped (trends-kit.tsx), so the
// requests, the annotations, the notes and the hides are the old code; these tests pin that too.
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { render } from '@testing-library/react'
import { Suspense, type ReactElement, type ReactNode } from 'react'

// Recharts draws nothing inside ResponsiveContainer in jsdom (it measures 0 by 0): give it a size, as the goldens do.
vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts')
  const { cloneElement } = await import('react')
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactElement<{ width?: number; height?: number }> }) =>
      cloneElement(children, { width: 800, height: 300 }),
  }
})
// Every LineChart's props, recorded on the way to the real one.
const { charts } = vi.hoisted(() => ({ charts: [] as Record<string, unknown>[] }))
vi.mock('@/components/charts/line-chart', async () => {
  const actual = await vi.importActual<typeof import('@/components/charts/line-chart')>('@/components/charts/line-chart')
  return { ...actual, LineChart: (p: Parameters<typeof actual.LineChart>[0]) => { charts.push(p as unknown as Record<string, unknown>); return <actual.LineChart {...p} /> } }
})
vi.mock('@/lib/organic-social/followers', () => import('./__mocks__/followers'))
vi.mock('@/lib/organic-social/trends', () => import('./__mocks__/trends'))
const { graphPosts } = vi.hoisted(() => ({ graphPosts: vi.fn() }))
vi.mock('@/lib/organic-social/graph-posts', () => ({ graphPosts }))
const { getAnnotationHides } = vi.hoisted(() => ({ getAnnotationHides: vi.fn(async () => new Set<string>()) }))
vi.mock('@/lib/organic-social/annotation-hides/select', () => ({ getAnnotationHides }))
const { getChartNotes } = vi.hoisted(() => ({ getChartNotes: vi.fn(async () => [] as unknown[]) }))
vi.mock('@/lib/organic-social/chart-notes/select', () => ({ getChartNotes }))
vi.mock('@/lib/db/queries', () => ({
  getClientBySlug: vi.fn(async () => ({ id: 'client-uuid', dashSocialConfig: { brandId: 1, reportingMonths: { firstMonth: '2026-08' } } })),
}))
vi.mock('@/app/actions/organic-social', () => ({ setAnnotationHiddenAction: vi.fn(async () => ({ ok: true })) }))

import { getFollowerGraph } from '@/lib/organic-social/followers'
import { getEngagementTrend } from '@/lib/organic-social/trends'
import type { TopContentPost } from '@/lib/organic-social/content-types'
import type { TrendSeries } from '@/lib/organic-social/types'
import { ExportModeProvider } from '@/components/export/export-mode'
import { DashTimeoutError } from '@/lib/dash-social/client'
import { ORGANIC_SOCIAL_PARTS } from './registry'
import { FollowerSectionV2, followerGraphV2 } from './follower-graph'
import { TrendSectionV2, engagementTrendV1, engagementTrendV2 } from './engagement-trend'
import { engagementTrendV3, engagementTrendV4, followerGraphV3, kitSectionFor } from './trends-kit'
import { expectSameValues, visibleValues } from './version-parity'
import { ChannelTrendChart, EngagementTrend } from '../trends'
import { FollowerGraph } from '../follower-graph'
import { FIXTURE_ORGANIC_SOCIAL_CTX } from './__fixtures__/organic-social-ctx'
import kit from '../design/kit.module.css'

// A closed month, in the served canonical form locked months hands the parts.
const AUG = { ...FIXTURE_ORGANIC_SOCIAL_CTX, dateRange: 'custom:2026-08-01,2026-08-31', channel: 'INSTAGRAM' as const }
const series = (values: Record<string, number>, channels = ['Instagram']): TrendSeries => ({
  channels,
  points: Object.entries(values).map(([date, v]) => ({ date, ...Object.fromEntries(channels.map((c, i) => [c, v + i])) })),
})
const DAYS = { '2026-08-03': 4, '2026-08-07': 19, '2026-08-12': 2, '2026-08-18': 27, '2026-08-24': 9, '2026-08-30': 15 }
const post = (id: number, publishedAt: string, engagements: number): TopContentPost => ({
  id, channel: 'INSTAGRAM', platform: 'Instagram', publishedAt, caption: `post ${id}`,
  url: `https://example.com/${id}`, mediaType: 'IMAGE', mediaGroup: null,
  creative: { kind: 'image', thumb: `https://cdn.example.com/t${id}.jpg`, full: `https://cdn.example.com/f${id}.jpg` },
  metrics: { effectiveness: null, engagementRate: null, engagements, impressions: 0 },
  sourceType: 'organic',
})
const POSTS = [post(1, '2026-08-07T14:00:00Z', 300), post(2, '2026-08-18T09:00:00Z', 520), post(3, '2026-08-30T20:00:00Z', 80)]

beforeEach(() => {
  vi.clearAllMocks()
  charts.length = 0
  vi.mocked(getFollowerGraph).mockResolvedValue(series(DAYS) as never)
  vi.mocked(getEngagementTrend).mockResolvedValue(series(DAYS) as never)
  graphPosts.mockResolvedValue(POSTS)
})

const VIEWS = [
  ['staff', { role: 'INTERNAL_ADMIN', email: 'thomas@example.com' }, false],
  ['a client', { role: 'CLIENT_VIEWER' }, false],
  ['the PDF export', { role: 'CLIENT_VIEWER' }, true],
] as const
const draw = (node: ReactNode, exporting: boolean) =>
  render(exporting ? <ExportModeProvider>{node}</ExportModeProvider> : <>{node}</>).container
/** What the chart was handed, minus the two kit options: the plotted data, the series, the dots, the notes, the callouts. */
const plotted = (): Record<string, unknown>[] => charts.map((c) => {
  const rest = { ...c }
  delete rest.shaded
  delete rest.frameless
  const callouts = (c.callouts as { x: string; label: string; muted: boolean }[] | undefined)?.map(({ x, label, muted }) => ({ x, label, muted }))
  return { ...rest, callouts }
})

// The old section and the kit section, rendered the same way. The kit's own section is found through the kit version, so
// these test what a client pinned to the kit version is actually served.
const sectionOf = (el: ReactNode) => (el as ReactElement<{ children: ReactElement<Record<string, unknown>> }>).props.children
async function both(oldVersion: { render: (c: never, r: never) => ReactNode }, kitVersion: { render: (c: never, r: never) => ReactNode }, ctx: object, exporting: boolean) {
  const r = { id: 'x', version: 0, label: 'x' } as never
  const oldEl = sectionOf(oldVersion.render(ctx as never, r))
  const kitEl = sectionOf(kitVersion.render(ctx as never, r))
  charts.length = 0
  const old = draw(await (oldEl.type as (p: object) => Promise<ReactNode>)(oldEl.props), exporting)
  const oldPlot = plotted()
  charts.length = 0
  const kitted = draw(await (kitEl.type as (p: object) => Promise<ReactNode>)(kitEl.props), exporting)
  return { old, kitted, oldPlot, kitPlot: plotted(), kitCharts: [...charts] }
}

const PAIRS = [
  ['follower-graph@3 from @2', followerGraphV2, followerGraphV3, AUG],
  ['engagement-trend@3 from @2, on a platform tab', engagementTrendV2, engagementTrendV3, AUG],
  ['engagement-trend@3 from @2, on Overview (every channel, no annotations)', engagementTrendV2, engagementTrendV3, { ...AUG, channel: null }],
  ['engagement-trend@4 from @1, on Overview', engagementTrendV1, engagementTrendV4, { ...AUG, channel: null }],
  ['engagement-trend@4 from @1, on a platform tab', engagementTrendV1, engagementTrendV4, AUG],
] as const

describe.each(VIEWS)('the trend graphs with the kit read and plot exactly as today, for %s', (_who, view, exporting) => {
  test.each(PAIRS)('%s', async (_name, oldV, kitV, ctx) => {
    if (ctx.channel === null) vi.mocked(getEngagementTrend).mockResolvedValue(series(DAYS, ['Instagram', 'Facebook', 'LinkedIn']) as never)
    const { old, kitted, oldPlot, kitPlot, kitCharts } = await both(oldV, kitV, { ...ctx, ...view }, exporting)
    expect(oldPlot.length).toBeGreaterThan(0)
    expect(kitPlot).toEqual(oldPlot)
    expectSameValues(old, kitted)
    // And the kit really drew: the chart shaded and frameless, inside a kit card.
    for (const c of kitCharts) expect([c.shaded, c.frameless]).toEqual([true, true])
    expect(kitted.firstElementChild?.classList.contains(kit.root)).toBe(true)
    // Round 3, Task 6: line height normal, as the artifact (the class only Organic Social's kit wrappers carry).
    expect(kitted.firstElementChild?.classList.contains(kit.tight)).toBe(true)
    expect(kitted.firstElementChild?.classList.contains(kit.card)).toBe(true)
  })
  test('the annotated graphs really carry annotations on this data, so the comparison above covers them', async () => {
    const { oldPlot } = await both(followerGraphV2, followerGraphV3, { ...AUG, ...view }, exporting)
    expect(oldPlot.some((p) => (p.marks as unknown[] | undefined)?.length)).toBe(true)
  })
})

describe('the trend graphs with the kit', () => {
  const r = { id: 'x', version: 0, label: 'x' }
  test('each part is its old version\'s render with only the section wrapped: same Suspense, skeleton, props and tabs', () => {
    for (const [oldV, kitV] of [[followerGraphV2, followerGraphV3], [engagementTrendV2, engagementTrendV3], [engagementTrendV1, engagementTrendV4]] as const) {
      for (const channel of [null, 'INSTAGRAM', 'TWITTER'] as const) {
        const ctx = { ...AUG, channel }
        const was = oldV.render(ctx, r) as ReactElement<{ fallback: ReactNode; children: ReactElement<object> }>
        const Kit = kitSectionFor(was.props.children.type as never) as unknown as React.FC<object>
        expect(kitV.render(ctx, r)).toEqual(<Suspense fallback={was.props.fallback}><Kit {...was.props.children.props} /></Suspense>)
      }
    }
  })
  test('the wrapped section is made once per section, so a re-render never remounts the chart', () => {
    const a = (followerGraphV3.render(AUG, r) as ReactElement<{ children: ReactElement }>).props.children.type
    const b = (followerGraphV3.render(AUG, r) as ReactElement<{ children: ReactElement }>).props.children.type
    expect(a).toBe(b)
  })
  test('asks exactly what the old versions ask: the same getters, arguments and post read', async () => {
    const calls = () => [vi.mocked(getFollowerGraph).mock.calls, vi.mocked(getEngagementTrend).mock.calls, graphPosts.mock.calls, getChartNotes.mock.calls, getAnnotationHides.mock.calls]
    for (const [oldV, kitV] of [[followerGraphV2, followerGraphV3], [engagementTrendV2, engagementTrendV3], [engagementTrendV1, engagementTrendV4]] as const) {
      vi.clearAllMocks()
      const o = sectionOf(oldV.render(AUG, r)); await (o.type as (p: object) => Promise<ReactNode>)(o.props)
      const was = JSON.stringify(calls())
      vi.clearAllMocks()
      const k = sectionOf(kitV.render(AUG, r)); await (k.type as (p: object) => Promise<ReactNode>)(k.props)
      expect(JSON.stringify(calls())).toBe(was)
    }
  })
  test('a failed or timed-out request shows exactly the card the old version shows, with no kit card around it', async () => {
    for (const failure of [new Error('boom'), new DashTimeoutError()]) {
      vi.mocked(getFollowerGraph).mockRejectedValueOnce(failure)
      const old = draw(await FollowerSectionV2(AUG), false).innerHTML
      vi.mocked(getFollowerGraph).mockRejectedValueOnce(failure)
      const k = sectionOf(followerGraphV3.render(AUG, r))
      expect(draw(await (k.type as (p: object) => Promise<ReactNode>)(k.props), false).innerHTML).toBe(old)
    }
  })
  test('the follower graph still draws nothing on Overview', async () => {
    const k = sectionOf(followerGraphV3.render({ ...AUG, channel: null }, r))
    expect(await (k.type as (p: object) => Promise<ReactNode>)(k.props)).toBeNull()
    expect(await FollowerSectionV2({ ...AUG, channel: null })).toBeNull()
  })
  test('are registered unpublished as follower-graph@3 and engagement-trend@3 and @4, with the old labels', () => {
    expect(ORGANIC_SOCIAL_PARTS['follower-graph'][3]).toBe(followerGraphV3)
    expect(ORGANIC_SOCIAL_PARTS['engagement-trend'][3]).toBe(engagementTrendV3)
    expect(ORGANIC_SOCIAL_PARTS['engagement-trend'][4]).toBe(engagementTrendV4)
    for (const [v, from] of [[followerGraphV3, followerGraphV2], [engagementTrendV3, engagementTrendV2], [engagementTrendV4, engagementTrendV1]] as const) {
      expect(v.published).toBe(false)
      expect(v.defaultLabel).toBe(from.defaultLabel)
    }
  })
  test('the old sections are untouched: @2 still hands the chart no kit options', async () => {
    charts.length = 0
    draw(await TrendSectionV2(AUG), false)
    expect(charts.every((c) => c.shaded === undefined && c.frameless === undefined)).toBe(true)
    expect(visibleValues(draw(await TrendSectionV2(AUG), false)).length).toBeGreaterThan(0)
  })
})

describe('the two chart options on the shared trend chart', () => {
  const s = series(DAYS)
  const wrappers = [
    ['ChannelTrendChart', (o: object) => <ChannelTrendChart title="T" series={s} {...o} />],
    ['FollowerGraph', (o: object) => <FollowerGraph series={s} {...o} />],
    ['EngagementTrend', (o: object) => <EngagementTrend series={s} {...o} />],
  ] as const
  test.each(wrappers)('%s passes shaded and frameless to the live chart and to the PDF chart', (_n, make) => {
    for (const exporting of [false, true]) {
      charts.length = 0
      draw(make({ shaded: true, frameless: true }), exporting)
      expect(charts.length, `exporting=${exporting}`).toBeGreaterThan(0)
      for (const c of charts) expect([c.shaded, c.frameless]).toEqual([true, true])
    }
  })
  test.each(wrappers)('%s without them hands the chart neither key, so every chart today is drawn exactly as before', (_n, make) => {
    for (const exporting of [false, true]) {
      charts.length = 0
      draw(make({}), exporting)
      for (const c of charts) { expect('shaded' in c).toBe(false); expect('frameless' in c).toBe(false) }
    }
  })
})
