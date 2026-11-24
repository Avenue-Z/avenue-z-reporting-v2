// platform-headlines@4 and @5 (the outline Data block) and engagement-breakdown@2 with the design kit (plan
// docs/superpowers/plans/2026-11-23-os-design-phase1.md, Tasks 2 and 5). Each is proven against the version it replaces
// with the parity helper, on every outline channel, with varied changes, Views on Reels, the team's sheet, a failed Reels
// request and an empty month, for staff, a client and the PDF export. Each kit version is the old version's own render
// with its section swapped (tiles-kit.tsx), so routing, requests and logs are the old code; these tests pin that too.
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { render } from '@testing-library/react'
import { Suspense, type ReactNode } from 'react'

vi.mock('@/lib/organic-social/headlines', () => import('./__mocks__/headlines'))
const { getOutlineKpis } = vi.hoisted(() => ({ getOutlineKpis: vi.fn() }))
vi.mock('@/lib/organic-social/outline-headlines', async () => ({
  ...(await vi.importActual<typeof import('@/lib/organic-social/outline-headlines')>('@/lib/organic-social/outline-headlines')),
  getOutlineKpis,
}))
const { getOutlineMediaKpis } = vi.hoisted(() => ({ getOutlineMediaKpis: vi.fn() }))
vi.mock('@/lib/organic-social/outline-media', () => ({ getOutlineMediaKpis }))
const { loadTileSheets } = vi.hoisted(() => ({ loadTileSheets: vi.fn() }))
vi.mock('@/lib/organic-social/tile-sheets', () => ({ loadTileSheets }))

import { buildOutlineKpis } from '@/lib/organic-social/outline-headlines'
import { outlineSpecsFor, OUTLINE_DATA_ROWS, OUTLINE_BREAKDOWN_ROWS, MEDIA_FAILED } from '@/lib/organic-social/outline-layout'
import { metricFor, type DashChannel } from '@/lib/organic-social/metrics'
import { ExportModeProvider } from '@/components/export/export-mode'
import { ORGANIC_SOCIAL_PARTS } from './registry'
import { OutlineDataSection, platformHeadlinesV2, platformHeadlinesV3 } from './outline-data'
import { BreakdownSection, engagementBreakdownV1 } from './engagement-breakdown'
import { HeadlinesSection } from './platform-headlines'
import {
  KitBreakdownSection, KitHeadlinesSection, KitOutlineDataSection,
  engagementBreakdownV2, platformHeadlinesV4, platformHeadlinesV5,
} from './tiles-kit'
import { expectSameValues, visibleValues } from './version-parity'
import { FIXTURE_ORGANIC_SOCIAL_CTX } from './__fixtures__/organic-social-ctx'
import kit from '../design/kit.module.css'

// Each metric gets its own value and prior, so the tiles show every kind of change: a rise with a non-zero tenth
// (12.34%), none, a fall, a sub-1% move, a rounding edge (6.45%) and no prior.
const PAIRS: [number, number | null][] = [[112.34, 100], [100, 100], [96.55, 100], [100.04, 100], [106.45, 100], [50, null]]
const varied = (ch: DashChannel) => buildOutlineKpis(ch,
  Object.fromEntries(outlineSpecsFor(ch).map((s, i) => [metricFor(s), { value: PAIRS[i % PAIRS.length][0], context: PAIRS[i % PAIRS.length][1], context_change: null }])),
  outlineSpecsFor(ch))
const empty = (ch: DashChannel) => buildOutlineKpis(ch,
  Object.fromEntries(outlineSpecsFor(ch).map((s) => [metricFor(s), { value: null, context: null, context_change: null }])),
  outlineSpecsFor(ch))
const REELS = { videoViews: { key: 'videoViews', label: 'Video Views', format: 'number' as const, value: 1234, delta: 12.34 } }
const cells = (m: Record<number, number>) => Array.from({ length: 12 }, (_, i) => (m[i + 1] === undefined ? { kind: 'blank' as const } : { kind: 'number' as const, value: m[i + 1] }))
const SHEET = { key: '2026-09', compareKey: '2026-08', sheets: {
  current: { followers: { INSTAGRAM: cells({ 8: 1000, 9: 1100 }) }, views: { INSTAGRAM: cells({ 8: 200, 9: 300 }) } }, prior: null,
} }

beforeEach(() => {
  getOutlineKpis.mockReset()
  getOutlineMediaKpis.mockReset(); getOutlineMediaKpis.mockResolvedValue(REELS)
  loadTileSheets.mockReset(); loadTileSheets.mockResolvedValue(null)
})

const VIEWS = [
  ['staff', { role: 'INTERNAL_ADMIN' }, false],
  ['a client', { role: 'CLIENT_VIEWER' }, false],
  ['the PDF export', { role: 'CLIENT_VIEWER' }, true],
] as const
const draw = (node: ReactNode, exporting: boolean) =>
  render(exporting ? <ExportModeProvider>{node}</ExportModeProvider> : <>{node}</>).container
const CHANNELS: DashChannel[] = ['INSTAGRAM', 'FACEBOOK', 'LINKEDIN', 'TIKTOK']

describe.each(VIEWS)('the Data block with the kit reads exactly as today, for %s', (_who, view, exporting) => {
  const variants = [['@4 from @2', 'standard'], ['@5 from @3', 'profileClicks']] as const
  for (const [name, variant] of variants) {
    test.each(CHANNELS)(`${name}, on %s, with every kind of change`, async (ch) => {
      const ctx = { ...FIXTURE_ORGANIC_SOCIAL_CTX, ...view, channel: ch }
      const rows = OUTLINE_DATA_ROWS[variant][ch]!
      getOutlineKpis.mockResolvedValue(varied(ch))
      const old = draw(await OutlineDataSection({ ctx, channel: ch, rows }), exporting)
      const kitted = draw(await KitOutlineDataSection({ ctx, channel: ch, rows }), exporting)
      expect(visibleValues(old)).toContain('↑ 12% vs prior period')
      expectSameValues(old, kitted)
    })
  }
  test('with the team sheet behind Total Followers and Views, a finished month', async () => {
    const ctx = { ...FIXTURE_ORGANIC_SOCIAL_CTX, ...view, channel: 'INSTAGRAM' as const,
      dateRange: 'custom:2026-09-01,2026-09-30', compareRange: 'custom:2026-08-01,2026-08-31' }
    const rows = OUTLINE_DATA_ROWS.standard.INSTAGRAM!
    getOutlineKpis.mockResolvedValue(varied('INSTAGRAM'))
    loadTileSheets.mockResolvedValue(SHEET)
    const old = draw(await OutlineDataSection({ ctx, channel: 'INSTAGRAM', rows }), exporting)
    const kitted = draw(await KitOutlineDataSection({ ctx, channel: 'INSTAGRAM', rows }), exporting)
    expect(visibleValues(old)).toContain('1,100')
    expectSameValues(old, kitted)
  })
  test('with Views on Reels failed: its tile blank with the flag, the rest as normal', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const ctx = { ...FIXTURE_ORGANIC_SOCIAL_CTX, ...view, channel: 'INSTAGRAM' as const }
    const rows = OUTLINE_DATA_ROWS.standard.INSTAGRAM!
    getOutlineKpis.mockResolvedValue(varied('INSTAGRAM'))
    getOutlineMediaKpis.mockRejectedValue(new Error('boom'))
    const old = draw(await OutlineDataSection({ ctx, channel: 'INSTAGRAM', rows }), exporting)
    const kitted = draw(await KitOutlineDataSection({ ctx, channel: 'INSTAGRAM', rows }), exporting)
    expect(visibleValues(old)).toContain(MEDIA_FAILED)
    expectSameValues(old, kitted)
    vi.mocked(console.error).mockRestore()
  })
  test('an empty month: the "Data" heading over the empty card, as today', async () => {
    const ctx = { ...FIXTURE_ORGANIC_SOCIAL_CTX, ...view, channel: 'FACEBOOK' as const }
    const rows = OUTLINE_DATA_ROWS.standard.FACEBOOK!
    getOutlineKpis.mockResolvedValue(empty('FACEBOOK'))
    const old = draw(await OutlineDataSection({ ctx, channel: 'FACEBOOK', rows }), exporting)
    const kitted = draw(await KitOutlineDataSection({ ctx, channel: 'FACEBOOK', rows }), exporting)
    expect(visibleValues(old)).toEqual(['Data', 'No data for this period.'])
    expectSameValues(old, kitted, { allowFallback: true })
  })
  test.each(CHANNELS)('engagement-breakdown@2 from @1, on %s', async (ch) => {
    const ctx = { ...FIXTURE_ORGANIC_SOCIAL_CTX, ...view, channel: ch }
    const rows = OUTLINE_BREAKDOWN_ROWS[ch]!
    getOutlineKpis.mockResolvedValue(varied(ch))
    const old = draw(await BreakdownSection({ ctx, channel: ch, rows }), exporting)
    const kitted = draw(await KitBreakdownSection({ ctx, channel: ch, rows }), exporting)
    expectSameValues(old, kitted)
  })
})

describe('the Data block and the breakdown with the kit', () => {
  const IG = { ...FIXTURE_ORGANIC_SOCIAL_CTX, channel: 'INSTAGRAM' as const }
  const r = (id: string, version: number) => ({ id, version, label: 'x' })

  test('each part is its old version\'s render with only the section swapped: same tabs, Suspense, skeleton and props', () => {
    type AnySection = React.FC<Record<string, unknown>>
    const swap: Record<string, AnySection> = { [HeadlinesSection.name]: KitHeadlinesSection as unknown as AnySection, [OutlineDataSection.name]: KitOutlineDataSection as unknown as AnySection, [BreakdownSection.name]: KitBreakdownSection as unknown as AnySection }
    const pairs = [
      [platformHeadlinesV2, platformHeadlinesV4], [platformHeadlinesV3, platformHeadlinesV5], [engagementBreakdownV1, engagementBreakdownV2],
    ] as const
    for (const [old, next] of pairs) {
      for (const channel of [null, 'INSTAGRAM', 'FACEBOOK', 'LINKEDIN', 'TIKTOK', 'TWITTER'] as const) {
        const ctx = { ...FIXTURE_ORGANIC_SOCIAL_CTX, channel }
        const was = old.render(ctx, r(old.id, old.version)) as React.ReactElement<{ fallback: ReactNode; children: React.ReactElement<object> }> | null
        const now = next.render(ctx, r(next.id, next.version))
        if (was === null) { expect(now, `${next.id}@${next.version} ${channel}`).toBeNull(); continue }
        const Kit = swap[(was.props.children.type as { name: string }).name]
        expect(Kit, `${old.id}@${old.version} ${channel} renders a known section`).toBeDefined()
        expect(now).toEqual(<Suspense fallback={was.props.fallback}><Kit {...(was.props.children.props as Record<string, unknown>)} /></Suspense>)
      }
    }
  })
  test('on Overview and an uncovered channel, @4 and @5 show the kit v1 tiles with whole numbers and the size-based change', () => {
    for (const ctx of [FIXTURE_ORGANIC_SOCIAL_CTX, { ...FIXTURE_ORGANIC_SOCIAL_CTX, channel: 'TWITTER' as const }]) {
      for (const v of [platformHeadlinesV4, platformHeadlinesV5]) {
        const el = v.render(ctx, r('platform-headlines', v.version)) as React.ReactElement<{ children: React.ReactElement<Record<string, unknown>> }>
        expect(el.props.children.type).toBe(KitHeadlinesSection)
        expect(el.props.children.props.outline).toBe(true)
      }
    }
  })
  test('asks Dash, Views on Reels and the sheet exactly what today asks, and logs a failed Reels request the same way', async () => {
    const rows = OUTLINE_DATA_ROWS.standard.INSTAGRAM!
    const calls = async (Section: (p: Parameters<typeof OutlineDataSection>[0]) => Promise<unknown>) => {
      getOutlineKpis.mockReset(); getOutlineKpis.mockResolvedValue(varied('INSTAGRAM'))
      getOutlineMediaKpis.mockClear(); loadTileSheets.mockClear()
      await Section({ ctx: IG, channel: 'INSTAGRAM', rows })
      return [getOutlineKpis.mock.calls, getOutlineMediaKpis.mock.calls, loadTileSheets.mock.calls]
    }
    expect(await calls(KitOutlineDataSection)).toEqual(await calls(OutlineDataSection))
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    for (const Section of [OutlineDataSection, KitOutlineDataSection]) {
      getOutlineKpis.mockResolvedValue(varied('INSTAGRAM')); getOutlineMediaKpis.mockRejectedValueOnce(new Error('boom'))
      await Section({ ctx: IG, channel: 'INSTAGRAM', rows })
    }
    expect(err.mock.calls[1]).toEqual(err.mock.calls[0])
    expect(err).toHaveBeenCalledTimes(2)
    err.mockRestore()
  })
  test('a failed request, and an empty month under the graph, show exactly what today shows', async () => {
    const rows = OUTLINE_DATA_ROWS.standard.INSTAGRAM!
    getOutlineKpis.mockRejectedValueOnce(new Error('boom'))
    const old = draw(await OutlineDataSection({ ctx: IG, channel: 'INSTAGRAM', rows }), false).innerHTML
    getOutlineKpis.mockRejectedValueOnce(new Error('boom'))
    expect(draw(await KitOutlineDataSection({ ctx: IG, channel: 'INSTAGRAM', rows }), false).innerHTML).toBe(old)
    getOutlineKpis.mockResolvedValue(empty('INSTAGRAM'))
    expect(await KitBreakdownSection({ ctx: IG, channel: 'INSTAGRAM', rows: OUTLINE_BREAKDOWN_ROWS.INSTAGRAM! })).toBeNull()
  })
  test('draws the kit: tiles inside an element carrying the kit colours, never the old card', async () => {
    getOutlineKpis.mockResolvedValue(varied('INSTAGRAM'))
    const data = draw(await KitOutlineDataSection({ ctx: IG, channel: 'INSTAGRAM', rows: OUTLINE_DATA_ROWS.standard.INSTAGRAM! }), false)
    const breakdown = draw(await KitBreakdownSection({ ctx: IG, channel: 'INSTAGRAM', rows: OUTLINE_BREAKDOWN_ROWS.INSTAGRAM! }), false)
    for (const c of [data, breakdown]) {
      expect(c.firstElementChild?.classList.contains(kit.root)).toBe(true)
      // Round 3, Task 6: line height normal, as the artifact (the class only Organic Social's kit wrappers carry).
      expect(c.firstElementChild?.classList.contains(kit.tight)).toBe(true)
      expect(c.querySelectorAll(`.${kit.kpi}`).length).toBeGreaterThan(0)
      expect(c.querySelector('div.rounded-lg.px-6.py-5')).toBeNull()
    }
    expect(data.querySelector('section')?.hasAttribute('data-export-block')).toBe(true)
  })
  test('are registered unpublished as @4, @5 and engagement-breakdown@2, beside the versions that were there', () => {
    expect(ORGANIC_SOCIAL_PARTS['platform-headlines'][4]).toBe(platformHeadlinesV4)
    expect(ORGANIC_SOCIAL_PARTS['platform-headlines'][5]).toBe(platformHeadlinesV5)
    expect(ORGANIC_SOCIAL_PARTS['engagement-breakdown'][2]).toBe(engagementBreakdownV2)
    for (const v of [platformHeadlinesV4, platformHeadlinesV5, engagementBreakdownV2]) expect(v.published).toBe(false)
    expect(engagementBreakdownV2.defaultLabel).toBe(engagementBreakdownV1.defaultLabel)
  })
})
