import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { Children, isValidElement, type ReactElement, type ReactNode } from 'react'
import { render } from '@testing-library/react'
import type { VisibilityV2 } from '@/lib/aeo/v2/types'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => '/dashboard/fixture-client/reports',
  useSearchParams: () => new URLSearchParams('section=peec-ai'),
}))
vi.mock('@/lib/aeo/v2/visibility', () => ({ getVisibilityV2: vi.fn() }))

import { getVisibilityV2 } from '@/lib/aeo/v2/visibility'
import { ReportErrorBoundary } from '@/components/report-sections/error-boundary'
import { VisibilityV2Section } from '../v2/visibility-v2-section'
import { visibilityChartV2 } from './visibility-chart.v2'
import { FIXTURE_PEEC_CTX } from './__fixtures__/peec-ctx'
import type { PeecCtx } from '../ctx'

const points = (base: number) =>
  ['2026-01-05', '2026-04-06', '2026-07-06', '2026-10-26', '2026-11-16'].map((date, i) => ({ date, visibility: base + i * 2 }))

const FIXTURE: VisibilityV2 = {
  roster: ['Acme Corp', 'Beta LLC', 'Rival Inc'],
  brands: [
    { name: 'Acme Corp', isYou: true, rank: 1, visibility: 55.2, visibilityPrior: 52.1, sov: 28.4, sovPrior: 27.2, usedAsSource: 36.7, usedAsSourcePrior: 35.0 },
    { name: 'Rival Inc', isYou: false, rank: 2, visibility: 38.7, visibilityPrior: 40.2, sov: 20.1, sovPrior: 20.9, usedAsSource: 12.0, usedAsSourcePrior: null },
    { name: 'Beta LLC', isYou: false, rank: 3, visibility: 26.3, visibilityPrior: 25.4, sov: 14.6, sovPrior: 14.1, usedAsSource: null, usedAsSourcePrior: null },
  ],
  trend: [
    { name: 'Beta LLC', isYou: false, points: points(20) },
    { name: 'Acme Corp', isYou: true, points: points(45) },
    { name: 'Rival Inc', isYou: false, points: points(35) },
  ],
  usedAsSourceBasis: 'answers',
}

const CTX: PeecCtx = { ...FIXTURE_PEEC_CTX, compare: 'previous_period' }
const pick = (ctx: PeecCtx) => ({
  provider: ctx.provider, clientSlug: ctx.clientSlug, dateRange: ctx.dateRange,
  compare: ctx.compare, showDeltas: ctx.showDeltas, modelActive: ctx.modelActive,
})

beforeEach(() => {
  // last_30_days resolves against today: pin it so the shading is stable.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-24T12:00:00Z'))
  vi.mocked(getVisibilityV2).mockReset()
  vi.mocked(getVisibilityV2).mockResolvedValue(FIXTURE)
})
afterEach(() => vi.useRealTimers())

test('visibility-chart@2 is version 2 of visibility-chart, published, labelled', () => {
  expect(visibilityChartV2.id).toBe('visibility-chart')
  expect(visibilityChartV2.version).toBe(2)
  expect(visibilityChartV2.published).toBe(true)
  expect(visibilityChartV2.defaultLabel).toBe('Visibility trend')
})

test('visibility-chart@2 golden (resolved chart)', async () => {
  const { container } = render(<>{await VisibilityV2Section({ ctx: pick(CTX) })}</>)
  expect(getVisibilityV2).toHaveBeenCalledWith('peec', 'fixture-client', 'last_30_days', 'previous_period')
  expect(container.querySelectorAll('polyline')).toHaveLength(3)
  expect(container.firstChild).toMatchSnapshot()
})

test('series follow the brand table order with roster colors; the client is cyan', async () => {
  const { container } = render(<>{await VisibilityV2Section({ ctx: pick(CTX) })}</>)
  const lines = [...container.querySelectorAll('polyline')]
  const you = lines.find((l) => l.dataset.brand === 'acme-corp')!
  expect(you.getAttribute('stroke')).toBe('#60FDFF')
  expect([...container.querySelectorAll('input[type="checkbox"]')].map((c) => c.getAttribute('aria-label')))
    .toEqual(['Acme Corp', 'Rival Inc', 'Beta LLC'])
})

test('a model filter adds the all-models note', async () => {
  const { getByText } = render(<>{await VisibilityV2Section({ ctx: pick({ ...CTX, modelActive: true }) })}</>)
  expect(getByText('Model filter not applied here: all models.')).toBeTruthy()
})

test('no comparison: the prior fetch stays previous_period (shared cache) and there is no comparison window', async () => {
  const el = await VisibilityV2Section({ ctx: pick({ ...CTX, compare: 'none', showDeltas: false }) })
  expect(getVisibilityV2).toHaveBeenCalledWith('peec', 'fixture-client', 'last_30_days', 'previous_period')
  expect((el as ReactElement<{ comparePeriod: unknown }>).props.comparePeriod).toBeNull()
})

test('previous year fetches and shades last year', async () => {
  const el = await VisibilityV2Section({ ctx: pick({ ...CTX, compare: 'previous_year' }) })
  expect(getVisibilityV2).toHaveBeenCalledWith('peec', 'fixture-client', 'last_30_days', 'previous_year')
  const props = (el as ReactElement<{ period: { start: string }; comparePeriod: { start: string } }>).props
  expect(props.period.start).toBe('2026-10-25')
  expect(props.comparePeriod.start).toBe('2025-10-25')
})

test('renders nothing when no brand has points, or without a client', async () => {
  vi.mocked(getVisibilityV2).mockResolvedValue({ ...FIXTURE, trend: [] })
  expect(await VisibilityV2Section({ ctx: pick(CTX) })).toBeNull()
  expect(await VisibilityV2Section({ ctx: pick({ ...CTX, clientSlug: undefined }) })).toBeNull()
})

test('the part wraps the async section in an error boundary around Suspense, passing plain ctx fields', () => {
  const el = visibilityChartV2.render(CTX, { id: 'visibility-chart', version: 2, label: 'Visibility trend' }) as ReactElement<{ sectionName: string; children: ReactNode }>
  expect(el.type).toBe(ReportErrorBoundary)
  expect(el.props.sectionName).toBe('the visibility trend')
  const suspense = Children.only(el.props.children) as ReactElement<{ children: ReactNode }>
  const child = Children.only(suspense.props.children)
  expect(isValidElement(child) && child.type).toBe(VisibilityV2Section)
  expect((child as ReactElement<{ ctx: unknown }>).props.ctx).toEqual(pick(CTX))
})

// Final review M9: trend points are rounded to 2 decimals on the server, so the client payload carries no float noise.
test('trend visibility reaches the chart rounded to 2 decimals', async () => {
  vi.mocked(getVisibilityV2).mockResolvedValue({
    ...FIXTURE,
    trend: [{ name: 'Acme Corp', isYou: true, points: [{ date: '2026-11-16', visibility: 33.33333333 }, { date: '2026-11-17', visibility: 12.3456 }] }],
  })
  const el = await VisibilityV2Section({ ctx: pick(CTX) })
  const series = (el as ReactElement<{ series: { name: string; points: { visibility: number }[] }[] }>).props.series
  expect(series.find((s) => s.name === 'Acme Corp')!.points.map((p) => p.visibility)).toEqual([33.33, 12.35])
})
