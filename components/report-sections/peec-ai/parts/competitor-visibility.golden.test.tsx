import { beforeEach, expect, test, vi } from 'vitest'
import { render } from '@testing-library/react'
import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ReportErrorBoundary } from '@/components/report-sections/error-boundary'
import type { CoverageProjection } from '@/lib/peec/coverage-projection'

vi.mock('@/lib/peec/coverage-projection', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/peec/coverage-projection')>()
  return { ...actual, getCoverageProjection: vi.fn() }
})

import { EMPTY_COVERAGE_PROJECTION, getCoverageProjection } from '@/lib/peec/coverage-projection'
import { resolveSection } from '@/lib/report-sections/resolve'
import { deriveCompareRange } from '@/lib/ga4/client'
import { PEEC_PARTS } from './registry'
import { PEEC_TEMPLATE } from '../template'
import { CompetitorVisibilitySection, competitorVisibilityV1 } from './competitor-visibility'
import { FIXTURE_PEEC_CTX } from './__fixtures__/peec-ctx'
import type { PeecCtx } from '../ctx'
import type { PeecOverview } from '@/lib/peec/client'


/** Header label without the InfoTooltip's "?" trigger. */
const headerText = (th: Element) => (th.textContent ?? '').trim().replace(/\?$/, '')
const cov = (byDomain: Record<string, string[]>): CoverageProjection => ({ ...EMPTY_COVERAGE_PROJECTION, promptIdsByDomain: byDomain })
const CURRENT = cov({ 'rival.com': ['p1', 'p2'] })
const PRIOR = cov({ 'rival.com': ['p1'] })

// Two competitor domains with per-model citations, so a model filter keeps rows (and Δ cells exist to check).
const data = FIXTURE_PEEC_CTX.data as PeecOverview
const CTX: PeecCtx = {
  ...FIXTURE_PEEC_CTX,
  data: {
    ...data,
    topDomains: [
      ...data.topDomains,
      { domain: 'other-rival.com', retrieved: 30.5, retrievedDelta: -2.2, citationRate: 3, citationRateDelta: 0, citationCount: 72, priorCitationCount: 90, type: 'Competitor' },
    ],
    domainCitationsByModel: {
      ...data.domainCitationsByModel,
      'rival.com': { ChatGPT: 80, Perplexity: 48 },
      'other-rival.com': { ChatGPT: 40, Gemini: 32 },
    },
  },
}
const PROFOUND_CTX: PeecCtx = { ...CTX, provider: 'profound', isPeec: false }

beforeEach(() => {
  vi.mocked(getCoverageProjection).mockReset()
  vi.mocked(getCoverageProjection).mockImplementation(async (_slug, range) =>
    range.startDate === deriveCompareRange('last_30_days', 'previous_period')!.startDate ? PRIOR : CURRENT,
  )
})

const sectionProps = (ctx: PeecCtx) => ({ clientSlug: ctx.clientSlug, dateRange: ctx.dateRange, data: ctx.data as PeecOverview, models: ctx.models })
const renderSection = async (ctx: PeecCtx) =>
  render(<TooltipProvider>{await CompetitorVisibilitySection(sectionProps(ctx))}</TooltipProvider>)

/** Text of every cell under a "Δ" header. */
function deltaCells(container: HTMLElement): string[] {
  const headers = [...container.querySelectorAll('thead th')].map(headerText)
  const idx = headers.flatMap((h, i) => (h === 'Δ' ? [i] : []))
  return [...container.querySelectorAll('tbody tr')].flatMap((tr) => idx.map((i) => tr.querySelectorAll('td')[i]?.textContent ?? ''))
}

test('competitor-visibility@1 is registered and published, labelled per the spec', () => {
  expect(PEEC_PARTS['competitor-visibility'][1]).toBe(competitorVisibilityV1)
  expect(competitorVisibilityV1.published).toBe(true)
  expect(competitorVisibilityV1.defaultLabel).toBe('Competitor visibility')
})

test('competitor-visibility@1 golden (Suspense skeleton)', () => {
  const impl = PEEC_PARTS['competitor-visibility'][1]
  const { container } = render(<>{impl.render(CTX, { id: 'competitor-visibility', version: 1, label: impl.defaultLabel })}</>)
  expect(container.firstChild).toMatchSnapshot()
})

test('competitor-visibility@1 golden (resolved table)', async () => {
  const { container } = await renderSection(CTX)
  expect(container.textContent).toContain('Competitor visibility')
  expect(container.textContent).toContain('rival.com')
  expect(container.firstChild).toMatchSnapshot()
})

test('renders nothing under Profound (D-7) and never fetches', () => {
  const impl = PEEC_PARTS['competitor-visibility'][1]
  expect(impl.render(PROFOUND_CTX, { id: 'competitor-visibility', version: 1, label: impl.defaultLabel })).toBeNull()
  expect(getCoverageProjection).not.toHaveBeenCalled()
})

test('without a model filter, deltas show against the previous period (D-8)', async () => {
  const { container } = await renderSection(CTX)
  expect(deltaCells(container).some((t) => t.includes('pp'))).toBe(true)
  // Current = the picker range, previous = the previous period of it.
  expect(getCoverageProjection).toHaveBeenCalledTimes(2)
})

test('with a model filter every Δ is -- and rows are model-filtered (FB-063)', async () => {
  const { container } = await renderSection({ ...CTX, models: ['Gemini'], modelActive: true })
  const cells = deltaCells(container)
  expect(cells.length).toBeGreaterThan(0)
  expect(cells.every((t) => t === '--')).toBe(true)
  // Only other-rival.com has Gemini citations.
  expect(container.textContent).toContain('other-rival.com')
  expect(container.querySelectorAll('tbody tr')).toHaveLength(1)
})

test('an incomplete coverage walk renders prompt coverage as --, not 0%', async () => {
  vi.mocked(getCoverageProjection).mockResolvedValue({ ...CURRENT, complete: false })
  const { container } = await renderSection(CTX)
  const headers = [...container.querySelectorAll('thead th')].map(headerText)
  const i = headers.indexOf('Prompt Coverage')
  expect([...container.querySelectorAll('tbody tr')].map((tr) => tr.querySelectorAll('td')[i].textContent)).toEqual(['--', '--'])
})

test('the default template ends with the Competitors parts, then the footer (D-11)', () => {
  const ids = resolveSection(PEEC_TEMPLATE, undefined).map((r) => r.id)
  expect(ids.slice(-3)).toEqual(['competitor-visibility', 'competitor-gaps', 'footer'])
})

test("a frozen override keeps its snapshot: no Competitors parts", () => {
  const frozenOrder = PEEC_TEMPLATE.order.filter((p) => !p.id.startsWith('competitor-'))
  const ids = resolveSection(PEEC_TEMPLATE, { frozen: { order: frozenOrder, labels: {}, thresholds: {} } }).map((r) => r.id)
  expect(ids).toEqual(frozenOrder.map((p) => p.id))
  expect(ids).not.toContain('competitor-visibility')
  expect(ids).not.toContain('competitor-gaps')
})

// R10: a failure inside the async child blanks only this card, through ReportErrorBoundary.
// jsdom's client React never settles an async component, so this uses the closest seam (as
// shared-parts-header.test does): the part's own boundary element, taken from render(), with
// its async child swapped for one that throws the error the real child throws on this input.
test('a throwing child renders the boundary fallback for this part only; sibling parts still render', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const broken: PeecCtx = { ...CTX, data: { ...(CTX.data as PeecOverview), topDomains: null as never } } // .filter on null throws
  const error = await CompetitorVisibilitySection(sectionProps(broken)).then(() => null, (e: unknown) => e as Error)
  expect(error).toBeInstanceOf(Error)

  const impl = PEEC_PARTS['competitor-visibility'][1]
  const part = impl.render(broken, { id: 'competitor-visibility', version: 1, label: impl.defaultLabel })
  const suspense = part as ReactElement<{ children: ReactNode }>
  const boundary = Children.toArray(suspense.props.children).find(
    (c): c is ReactElement<{ children: ReactNode }> => isValidElement(c) && c.type === ReportErrorBoundary,
  )
  expect(boundary, 'the async child is wrapped in ReportErrorBoundary inside its Suspense').toBeTruthy()
  const child = Children.only(boundary!.props.children) as ReactElement
  expect(child.type).toBe(CompetitorVisibilitySection)
  const Throws = () => { throw error }
  const footer = PEEC_PARTS['footer'][1]
  const { getByText, queryByText } = render(
    <TooltipProvider>
      <div>{cloneElement(boundary!, {}, <Throws />)}</div>
      <div>{footer.render(broken, { id: 'footer', version: 1, label: footer.defaultLabel })}</div>
    </TooltipProvider>,
  )
  expect(getByText(`Failed to load ${impl.defaultLabel}`)).toBeTruthy()
  expect(getByText('Live data from Peec AI')).toBeTruthy()
  expect(queryByText('Which competitor domains are winning for our target prompts?')).toBeNull()
  vi.mocked(console.error).mockRestore()
})
