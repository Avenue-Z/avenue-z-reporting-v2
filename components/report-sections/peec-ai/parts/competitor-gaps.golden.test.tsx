import { beforeEach, expect, test, vi } from 'vitest'
import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ReportErrorBoundary } from '@/components/report-sections/error-boundary'
import type { CoverageProjection } from '@/lib/peec/coverage-projection'
import type { UrlCitation } from '@/lib/peec/url-citations'

vi.mock('@/lib/peec/coverage-projection', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/peec/coverage-projection')>()
  return { ...actual, getCoverageProjection: vi.fn() }
})
vi.mock('@/lib/peec/url-citations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/peec/url-citations')>()
  return { ...actual, getUrlCitations: vi.fn() }
})

import { EMPTY_COVERAGE_PROJECTION, getCoverageProjection } from '@/lib/peec/coverage-projection'
import { getUrlCitations } from '@/lib/peec/url-citations'
import { PEEC_PARTS } from './registry'
import { CompetitorGapsSection, competitorGapsV1 } from './competitor-gaps'
import { CompetitorUrlsBrandAbsentTable } from '../competitor-tables'
import { FIXTURE_PEEC_CTX } from './__fixtures__/peec-ctx'
import type { PeecCtx, ReportAudience } from '../ctx'
import type { PeecOverview } from '@/lib/peec/client'

// Fixture tracked prompts (FIXTURE_PEEC_CTX.data.trackedPrompts): p1, p2.

/** Header label without the InfoTooltip's "?" trigger. */
const headerText = (th: Element) => (th.textContent ?? '').trim().replace(/\?$/, '')
const PROMPT_1 = 'best digital marketing agency 2025'
const PROMPT_2 = 'top pr firms for tech startups'

const cite = (path: string, o: Partial<UrlCitation> = {}): UrlCitation => ({
  url: `https://rival.com/${path}`, urlKey: `rival.com/${path}`, domain: 'rival.com', classification: 'LISTICLE',
  title: `Rival ${path}`, citationCount: 10, citationRate: 0, citationAvg: 0, engines: [], mentionedBrandIds: [],
  competitorBrandNames: ['Rival Inc'], mentionsYourBrand: false, ...o,
})
const CITATIONS = [
  cite('best-agencies', { citationCount: 40, title: 'Best agencies ranked' }),
  cite('forum-thread', { citationCount: 20, classification: 'UGC', domain: 'reddit.com', url: 'https://reddit.com/r/x/forum-thread', urlKey: 'reddit.com/r/x/forum-thread', title: null }),
  cite('about-us', { citationCount: 30, mentionsYourBrand: true }), // names the brand: excluded
  cite('filler', { citationCount: 10, competitorBrandNames: [] }),  // names no competitor: excluded
]
const PRIOR_CITATIONS = [cite('best-agencies', { citationCount: 10 }), cite('filler', { citationCount: 30 })]
const COVERAGE: CoverageProjection = {
  ...EMPTY_COVERAGE_PROJECTION,
  promptIdsByUrlKey: { 'rival.com/best-agencies': ['p1', 'p2'], 'reddit.com/r/x/forum-thread': ['p2'] },
}

const PROFOUND_CTX: PeecCtx = { ...FIXTURE_PEEC_CTX, provider: 'profound', isPeec: false }

beforeEach(() => {
  vi.mocked(getUrlCitations).mockReset()
  vi.mocked(getUrlCitations).mockImplementation(async (_slug, opts) => (opts ? PRIOR_CITATIONS : CITATIONS))
  vi.mocked(getCoverageProjection).mockReset()
  vi.mocked(getCoverageProjection).mockResolvedValue(COVERAGE)
})

const sectionProps = (ctx: PeecCtx) => ({
  clientSlug: ctx.clientSlug, dateRange: ctx.dateRange, modelActive: ctx.modelActive, audience: ctx.audience,
  trackedPrompts: (ctx.data as PeecOverview).trackedPrompts,
})
const ctxFor = (audience: ReportAudience, o: Partial<PeecCtx> = {}): PeecCtx => ({ ...FIXTURE_PEEC_CTX, audience, ...o })
const renderSection = async (ctx: PeecCtx) =>
  render(<TooltipProvider>{await CompetitorGapsSection(sectionProps(ctx))}</TooltipProvider>)

/** Props of the first element of `type` in a server-rendered tree: what crosses to the client. */
function propsOf(node: ReactNode, type: unknown): Record<string, unknown> | null {
  if (Array.isArray(node)) {
    for (const n of node) { const p = propsOf(n, type); if (p) return p }
    return null
  }
  if (!isValidElement(node)) return null
  const props = node.props as Record<string, unknown>
  if (node.type === type) return props
  return propsOf(props.children as ReactNode, type)
}

function column(container: HTMLElement, label: string): string[] {
  const headers = [...container.querySelectorAll('thead th')].map(headerText)
  const i = headers.indexOf(label)
  expect(i, label).toBeGreaterThanOrEqual(0)
  return [...container.querySelectorAll('tbody tr')].map((tr) => tr.querySelectorAll('td')[i]?.textContent ?? '')
}

test('competitor-gaps@1 is registered and published, labelled per the spec', () => {
  expect(PEEC_PARTS['competitor-gaps'][1]).toBe(competitorGapsV1)
  expect(competitorGapsV1.published).toBe(true)
  expect(competitorGapsV1.defaultLabel).toBe("Where competitors are cited and you aren't")
})

test('competitor-gaps@1 golden (Suspense skeleton)', () => {
  const impl = PEEC_PARTS['competitor-gaps'][1]
  const { container } = render(<>{impl.render(FIXTURE_PEEC_CTX, { id: 'competitor-gaps', version: 1, label: impl.defaultLabel })}</>)
  expect(container.firstChild).toMatchSnapshot()
})

test('competitor-gaps@1 golden (resolved table, internal)', async () => {
  const { container } = await renderSection(ctxFor('internal'))
  expect(container.textContent).toContain("Where competitors are cited and you aren't")
  expect(container.firstChild).toMatchSnapshot()
})

test('renders nothing under Profound (D-7) and never fetches', () => {
  const impl = PEEC_PARTS['competitor-gaps'][1]
  expect(impl.render(PROFOUND_CTX, { id: 'competitor-gaps', version: 1, label: impl.defaultLabel })).toBeNull()
  expect(getUrlCitations).not.toHaveBeenCalled()
  expect(getCoverageProjection).not.toHaveBeenCalled()
})

test('columns per D-3: page (title + slug link), humanised type, domain, share, Δ, prompt count, competitors', async () => {
  const { container } = await renderSection(ctxFor('client'))
  const headers = [...container.querySelectorAll('thead th')].map(headerText)
  expect(headers).toEqual(['Page', 'Page type', 'Domain', 'Citation share', 'Δ', 'Prompts citing it', 'Competitors mentioned'])
  expect(column(container, 'Page')[0]).toContain('Best agencies ranked')
  expect(container.querySelector('a[href="https://rival.com/best-agencies"]')?.textContent).toBe('/best-agencies')
  expect(column(container, 'Page type')).toEqual(['Listicle', 'Forum'])
  expect(column(container, 'Domain')).toEqual(['rival.com', 'reddit.com'])
  expect(column(container, 'Prompts citing it')).toEqual(['2', '1'])
})

test('D-15: a client sees only the count; no prompt text or id reaches the client table', async () => {
  const el = await CompetitorGapsSection(sectionProps(ctxFor('client')))
  const props = propsOf(el, CompetitorUrlsBrandAbsentTable)
  expect(props).not.toBeNull()
  const wire = JSON.stringify(props)
  for (const s of [PROMPT_1, PROMPT_2, '"p1"', '"p2"', 'promptIds']) expect(wire).not.toContain(s)

  const { container } = render(<TooltipProvider>{el}</TooltipProvider>)
  expect(container.textContent).not.toContain(PROMPT_1)
  expect(container.textContent).not.toContain(PROMPT_2)
  expect(container.querySelector('tbody button')).toBeNull()
})

test('internal: the count expands to the prompt texts', async () => {
  const { container } = await renderSection(ctxFor('internal'))
  expect(container.textContent).not.toContain(PROMPT_1)
  fireEvent.click(screen.getByRole('button', { name: /2 prompts/ }))
  expect(container.textContent).toContain(PROMPT_1)
  expect(container.textContent).toContain(PROMPT_2)
})

test('last 30 days: citation-share Δ shows against the previous period (D-8)', async () => {
  const { container } = await renderSection(ctxFor('client'))
  expect(column(container, 'Δ')[0]).toContain('pp')
  expect(getUrlCitations).toHaveBeenCalledTimes(2)
})

test('a model filter hides every Δ and skips the prior fetch (FB-063)', async () => {
  const { container } = await renderSection(ctxFor('client', { models: ['ChatGPT'], modelActive: true }))
  expect(column(container, 'Δ').every((t) => t === '--')).toBe(true)
  expect(getUrlCitations).toHaveBeenCalledTimes(1)
})

test('off "last 30 days" the Δ is hidden: H2 rows are fixed to the last 30 days (D-8, D-10)', async () => {
  const { container } = await renderSection(ctxFor('client', { dateRange: 'last_90_days' }))
  expect(column(container, 'Δ').every((t) => t === '--')).toBe(true)
  expect(getUrlCitations).toHaveBeenCalledTimes(1)
  expect(getUrlCitations).toHaveBeenCalledWith('fixture-client')
})

test('an incomplete or failed coverage walk renders the count as --, never 0', async () => {
  vi.mocked(getCoverageProjection).mockResolvedValueOnce({ ...COVERAGE, complete: false })
  const incomplete = await renderSection(ctxFor('internal'))
  expect(column(incomplete.container, 'Prompts citing it')).toEqual(['--', '--'])
  incomplete.unmount()

  vi.mocked(getCoverageProjection).mockRejectedValueOnce(new Error('peec down'))
  const failed = await renderSection(ctxFor('internal'))
  expect(column(failed.container, 'Prompts citing it')).toEqual(['--', '--'])
})

// R10: a failure inside the async child blanks only this card, through ReportErrorBoundary.
// jsdom's client React never settles an async component, so this uses the closest seam (as
// shared-parts-header.test does): the part's own boundary element, taken from render(), with
// its async child swapped for one that throws the error the real child throws on this input.
test('a throwing child renders the boundary fallback for this part only; sibling parts still render', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.mocked(getUrlCitations).mockResolvedValue(null as never) // buildBrandAbsentRows throws on null
  const error = await CompetitorGapsSection(sectionProps(ctxFor('client'))).then(() => null, (e: unknown) => e as Error)
  expect(error).toBeInstanceOf(Error)

  const impl = PEEC_PARTS['competitor-gaps'][1]
  const part = impl.render(ctxFor('client'), { id: 'competitor-gaps', version: 1, label: impl.defaultLabel })
  const suspense = part as ReactElement<{ children: ReactNode }>
  const boundary = Children.toArray(suspense.props.children).find(
    (c): c is ReactElement<{ children: ReactNode }> => isValidElement(c) && c.type === ReportErrorBoundary,
  )
  expect(boundary, 'the async child is wrapped in ReportErrorBoundary inside its Suspense').toBeTruthy()
  const child = Children.only(boundary!.props.children) as ReactElement
  expect(child.type).toBe(CompetitorGapsSection)
  const Throws = () => { throw error }
  const footer = PEEC_PARTS['footer'][1]
  const { getByText, queryByText } = render(
    <TooltipProvider>
      <div>{cloneElement(boundary!, {}, <Throws />)}</div>
      <div>{footer.render(ctxFor('client'), { id: 'footer', version: 1, label: footer.defaultLabel })}</div>
    </TooltipProvider>,
  )
  expect(getByText(`Failed to load ${impl.defaultLabel}`)).toBeTruthy()
  expect(getByText('Live data from Peec AI')).toBeTruthy()
  expect(queryByText('Where are we absent when competitors are cited or mentioned?')).toBeNull()
  vi.mocked(console.error).mockRestore()
})
