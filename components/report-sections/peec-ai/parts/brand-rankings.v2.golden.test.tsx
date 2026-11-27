import { beforeEach, expect, test, vi } from 'vitest'
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
import { TooltipProvider } from '@/components/ui/tooltip'
import { BrandTableV2Section } from '../v2/brand-table-section'
import { brandRankingsV2 } from './brand-rankings.v2'
import { FIXTURE_PEEC_CTX } from './__fixtures__/peec-ctx'
import type { PeecCtx } from '../ctx'

const FIXTURE: VisibilityV2 = {
  roster: ['Acme Corp', 'Beta LLC', 'Rival Inc'],
  brands: [
    { name: 'Acme Corp', isYou: true, rank: 1, visibility: 55.2, visibilityPrior: 52.1, sov: 28.4, sovPrior: 27.2, usedAsSource: 36.7, usedAsSourcePrior: 35.0 },
    { name: 'Rival Inc', isYou: false, rank: 2, visibility: 38.7, visibilityPrior: 40.2, sov: 20.1, sovPrior: 20.9, usedAsSource: 12.0, usedAsSourcePrior: null },
    { name: 'Beta LLC', isYou: false, rank: 3, visibility: 26.3, visibilityPrior: 25.4, sov: 14.6, sovPrior: 14.1, usedAsSource: null, usedAsSourcePrior: null },
  ],
  trend: [],
  usedAsSourceBasis: 'answers',
}
const CTX: PeecCtx = { ...FIXTURE_PEEC_CTX, compare: 'previous_period' }
const pick = (ctx: PeecCtx) => ({
  provider: ctx.provider, clientSlug: ctx.clientSlug, dateRange: ctx.dateRange,
  compare: ctx.compare, showDeltas: ctx.showDeltas, modelActive: ctx.modelActive,
})

beforeEach(() => {
  vi.mocked(getVisibilityV2).mockReset()
  vi.mocked(getVisibilityV2).mockResolvedValue(FIXTURE)
})

test('brand-rankings@2 is version 2 of brand-rankings, published', () => {
  expect(brandRankingsV2.id).toBe('brand-rankings')
  expect(brandRankingsV2.version).toBe(2)
  expect(brandRankingsV2.published).toBe(true)
})

test('brand-rankings@2 golden (resolved table)', async () => {
  const { container } = render(<TooltipProvider>{await BrandTableV2Section({ ctx: pick(CTX) })}</TooltipProvider>)
  expect(getVisibilityV2).toHaveBeenCalledWith('peec', 'fixture-client', 'last_30_days', 'previous_period')
  expect(container.firstChild).toMatchSnapshot()
})

test('a model filter adds the all-models note', async () => {
  const { getByText } = render(<TooltipProvider>{await BrandTableV2Section({ ctx: pick({ ...CTX, modelActive: true }) })}</TooltipProvider>)
  expect(getByText('Model filter not applied here: all models.')).toBeTruthy()
})

test('deltas off drops the Δ columns', async () => {
  const { container } = render(<TooltipProvider>{await BrandTableV2Section({ ctx: pick({ ...CTX, showDeltas: false }) })}</TooltipProvider>)
  expect(container.textContent).not.toContain('Δ')
})

test('renders nothing without a client or without brands', async () => {
  expect(await BrandTableV2Section({ ctx: pick({ ...CTX, clientSlug: undefined }) })).toBeNull()
  vi.mocked(getVisibilityV2).mockResolvedValue({ ...FIXTURE, brands: [] })
  expect(await BrandTableV2Section({ ctx: pick(CTX) })).toBeNull()
})

test('the part wraps the async section in an error boundary around Suspense, passing plain ctx fields', () => {
  const el = brandRankingsV2.render(CTX, { id: 'brand-rankings', version: 2, label: 'Brand Rankings' }) as ReactElement<{ sectionName: string; children: ReactNode }>
  expect(el.type).toBe(ReportErrorBoundary)
  const suspense = Children.only(el.props.children) as ReactElement<{ children: ReactNode }>
  const child = Children.only(suspense.props.children)
  expect(isValidElement(child) && child.type).toBe(BrandTableV2Section)
  expect((child as ReactElement<{ ctx: unknown }>).props.ctx).toEqual(pick(CTX))
})
