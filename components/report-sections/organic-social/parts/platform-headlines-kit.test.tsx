// platform-headlines@6 (plan docs/superpowers/plans/2026-11-23-os-design-phase1.md, Task 2): the v1 tiles drawn with the kit.
// Proven against @1 with the parity helper over varied data, for staff, a client and the PDF export. The kit version awaits
// the real HeadlinesSection and redraws only its tiles, so its request is @1's by construction; these tests pin that too.
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { render } from '@testing-library/react'
import { Suspense, type ReactNode } from 'react'

vi.mock('@/lib/organic-social/headlines', () => import('./__mocks__/headlines'))

import { getPlatformHeadlines } from '@/lib/organic-social/headlines'
import type { PlatformHeadline } from '@/lib/organic-social/types'
import { ExportModeProvider } from '@/components/export/export-mode'
import { DashTimeoutError } from '@/lib/dash-social/client'
import { ORGANIC_SOCIAL_PARTS } from './registry'
import { HeadlinesSection } from './platform-headlines'
import { KitHeadlinesSection, platformHeadlinesV6 } from './tiles-kit'
import { HeadlinesSkeleton } from '../skeletons'
import { expectSameValues, visibleValues } from './version-parity'
import { FIXTURE_ORGANIC_SOCIAL_CTX } from './__fixtures__/organic-social-ctx'
import kit from '../design/kit.module.css'

const g = vi.mocked(getPlatformHeadlines)
beforeEach(() => { g.mockReset() })

// Every change the tiles can show: a rise with a non-zero tenth (12.34: @1 shows 12.3, a whole tile 12), a zero, a fall,
// a sub-1% move, a rounding edge (6.45), and no prior on a tile that expects one and on one that does not.
const kpi = (key: string, label: string, value: number, delta?: number, extra: object = {}) => ({ key, label, value, format: 'number' as const, ...(delta === undefined ? {} : { delta }), ...extra })
const HEADLINES: PlatformHeadline[] = [
  { channel: 'INSTAGRAM', label: 'Instagram', noData: false, kpis: [
    kpi('followers', 'Total Followers', 12500, 12.34),
    kpi('netNewFollowers', 'Net New Followers', 230, 0),
    kpi('engagements', 'Total Engagements', 4100, -3.45),
    { key: 'engagementRate', label: 'Engagement Rate', value: 3.21, format: 'percent' as const, delta: 0.04 },
    kpi('impressions', 'Impressions', 98000, 6.45),
  ] },
  { channel: 'FACEBOOK', label: 'Facebook', noData: false, kpis: [
    kpi('followers', 'Total Followers', 8000),
    kpi('engagements', 'Total Engagements', 0, undefined, { footnote: 'Organic only' }),
  ] },
  { channel: 'LINKEDIN', label: 'LinkedIn', noData: true, kpis: [] },
] as PlatformHeadline[]

const VIEWS = [
  ['staff', { role: 'INTERNAL_ADMIN' }, false],
  ['a client', { role: 'CLIENT_VIEWER' }, false],
  ['the PDF export', { role: 'CLIENT_VIEWER' }, true],
] as const
const draw = (node: ReactNode, exporting: boolean) =>
  render(exporting ? <ExportModeProvider>{node}</ExportModeProvider> : <>{node}</>).container

describe.each(VIEWS)('platform-headlines@6 reads exactly as @1, for %s', (_who, view, exporting) => {
  const ctx = { ...FIXTURE_ORGANIC_SOCIAL_CTX, ...view }
  test('on Overview, with every kind of change, a footnote and a platform with no data', async () => {
    g.mockResolvedValue(HEADLINES as never)
    const old = draw(await HeadlinesSection(ctx), exporting)
    const kitted = draw(await KitHeadlinesSection(ctx), exporting)
    // The data reaches every branch the tiles have, or this test would prove less than it says.
    const seen = visibleValues(old)
    for (const shown of ['↑ 12.3% vs prior period', '\u2014 0.0% vs prior period', '↓ 3.5% vs prior period', '↑ 0.0% vs prior period', '↑ 6.5% vs prior period', 'Organic only', 'No data for this period.'])
      expect(seen, shown).toContain(shown)
    expect(old.querySelector('[role=tooltip]')).not.toBeNull()
    // LinkedIn has no data, so its empty card sits among real tiles on purpose.
    expectSameValues(old, kitted, { allowFallback: true })
  })
  test("as the outline fallback (whole numbers, the size-based change), as @4 and @5 draw it", async () => {
    g.mockResolvedValue(HEADLINES as never)
    const old = draw(await HeadlinesSection({ ...ctx, outline: true }), exporting)
    const kitted = draw(await KitHeadlinesSection({ ...ctx, outline: true }), exporting)
    expect(visibleValues(old)).toContain('↑ 12% vs prior period')
    expectSameValues(old, kitted, { allowFallback: true })
  })
})

describe('platform-headlines@6', () => {
  test('asks exactly what @1 asks: the four arguments, or five with the size-based change for the outline fallback', async () => {
    g.mockResolvedValue([] as never)
    const { clientSlug, dateRange, compareRange, channel } = FIXTURE_ORGANIC_SOCIAL_CTX
    await KitHeadlinesSection(FIXTURE_ORGANIC_SOCIAL_CTX)
    expect(g.mock.calls.at(-1)).toEqual([clientSlug, dateRange, compareRange, channel])
    await KitHeadlinesSection({ ...FIXTURE_ORGANIC_SOCIAL_CTX, outline: true })
    expect(g.mock.calls.at(-1)).toEqual([clientSlug, dateRange, compareRange, channel, 'size'])
  })
  test('draws the kit: its tiles inside an element carrying the kit colours, never the old card', async () => {
    g.mockResolvedValue(HEADLINES as never)
    const c = draw(await KitHeadlinesSection(FIXTURE_ORGANIC_SOCIAL_CTX), false)
    expect(c.firstElementChild?.classList.contains(kit.root)).toBe(true)
    expect(c.querySelectorAll(`.${kit.kpi}`)).toHaveLength(7)
    // KpiCard's own box (kpi-card.tsx): the hover hint's tooltip shares its border colour, so match the padding too.
    expect(c.querySelector('div.rounded-lg.px-6.py-5')).toBeNull()
    g.mockResolvedValue(HEADLINES as never)
    expect(draw(await HeadlinesSection(FIXTURE_ORGANIC_SOCIAL_CTX), false).querySelectorAll('div.rounded-lg.px-6.py-5')).toHaveLength(7)
  })
  test('keeps one unbreakable PDF block per platform, as @1 does', async () => {
    g.mockResolvedValue(HEADLINES as never)
    const sections = (c: HTMLElement) => [...c.querySelectorAll('section')].map((s) => s.hasAttribute('data-export-block'))
    const old = draw(await HeadlinesSection(FIXTURE_ORGANIC_SOCIAL_CTX), true)
    const kitted = draw(await KitHeadlinesSection(FIXTURE_ORGANIC_SOCIAL_CTX), true)
    expect(sections(kitted)).toEqual(sections(old))
    expect(sections(kitted)).toEqual([true, true, true])
  })
  test('a failed or timed-out request shows exactly the card @1 shows', async () => {
    for (const failure of [new Error('boom'), new DashTimeoutError()]) {
      g.mockRejectedValueOnce(failure)
      const old = draw(await HeadlinesSection(FIXTURE_ORGANIC_SOCIAL_CTX), false).innerHTML
      g.mockRejectedValueOnce(failure)
      expect(draw(await KitHeadlinesSection(FIXTURE_ORGANIC_SOCIAL_CTX), false).innerHTML).toBe(old)
    }
  })
  test('renders in the same Suspense and skeleton as @1, with no outline flag', () => {
    const r = { id: 'platform-headlines', version: 6, label: 'x' }
    expect(platformHeadlinesV6.render(FIXTURE_ORGANIC_SOCIAL_CTX, r))
      .toEqual(<Suspense fallback={<HeadlinesSkeleton />}><KitHeadlinesSection {...FIXTURE_ORGANIC_SOCIAL_CTX} /></Suspense>)
  })
  test('is registered as an unpublished version 6, beside the versions that were there', () => {
    expect(ORGANIC_SOCIAL_PARTS['platform-headlines'][6]).toBe(platformHeadlinesV6)
    expect(platformHeadlinesV6).toMatchObject({ id: 'platform-headlines', version: 6, published: false, defaultLabel: 'Platform Headlines' })
  })
})
