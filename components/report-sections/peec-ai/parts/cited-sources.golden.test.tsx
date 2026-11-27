import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { render } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { CitedUrls } from '@/lib/aeo/cited-urls'

vi.mock('@/lib/peec/cited-urls', () => ({ getPeecCitedUrls: vi.fn() }))
vi.mock('@/lib/profound/cited-urls', () => ({ getProfoundCitedUrls: vi.fn() }))

import { getPeecCitedUrls } from '@/lib/peec/cited-urls'
import { getProfoundCitedUrls } from '@/lib/profound/cited-urls'
import { PEEC_PARTS } from './registry'
import { CitedSourcesSection, citedSourcesV1 } from './cited-sources'
import { FIXTURE_PEEC_CTX } from './__fixtures__/peec-ctx'
import type { AeoCompare } from '../v2/compare'
import type { AeoProvider } from '../provider-tabs'

const FIXTURE: CitedUrls = {
  provider: 'peec',
  totalRows: 2,
  totalCitations: 120,
  compared: true,
  hasPageType: true,
  complete: true,
  tooLong: false,
  rows: [
    { rank: 1, key: 'acme.com/a', url: 'https://acme.com/a', title: 'Acme A', sourceType: 'own', sourceLabel: 'Your site', pageType: 'Article', usedPct: 17, citationRate: 2.5, prior: { usedPct: 15, citationRate: 2 } },
    { rank: 2, key: 'rival.com/x', url: 'https://rival.com/x', title: 'Rival X', sourceType: 'competitor', sourceLabel: 'Competitor', pageType: 'Listicle', usedPct: 9, citationRate: 1.2, prior: null },
  ],
}

const props = (o: Partial<{ provider: AeoProvider; clientSlug: string | undefined; dateRange: string | undefined; compare: AeoCompare }> = {}) => ({
  provider: 'peec' as AeoProvider,
  clientSlug: FIXTURE_PEEC_CTX.clientSlug,
  dateRange: FIXTURE_PEEC_CTX.dateRange,
  compare: FIXTURE_PEEC_CTX.compare,
  showDeltas: FIXTURE_PEEC_CTX.showDeltas,
  modelActive: FIXTURE_PEEC_CTX.modelActive,
  ...o,
})

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-25T12:00:00Z'))
  vi.mocked(getPeecCitedUrls).mockReset().mockResolvedValue(FIXTURE)
  vi.mocked(getProfoundCitedUrls).mockReset().mockResolvedValue({ ...FIXTURE, provider: 'profound', hasPageType: false })
})
afterEach(() => vi.useRealTimers())

test('cited-sources@1 is registered, published and labelled', () => {
  expect(PEEC_PARTS['cited-sources'][1]).toBe(citedSourcesV1)
  expect(citedSourcesV1.published).toBe(true)
  expect(citedSourcesV1.defaultLabel).toBe('Cited Sources')
})

test('cited-sources@1 golden (Peec)', async () => {
  const { container } = render(<TooltipProvider>{await CitedSourcesSection(props())}</TooltipProvider>)
  expect(getPeecCitedUrls).toHaveBeenCalledTimes(1)
  expect(container.firstChild).toMatchSnapshot()
})

test('Profound routes to the Profound fetcher', async () => {
  await CitedSourcesSection(props({ provider: 'profound' }))
  expect(getProfoundCitedUrls).toHaveBeenCalledTimes(1)
  const [slug, current, prior] = vi.mocked(getProfoundCitedUrls).mock.calls[0]
  expect(slug).toBe('fixture-client')
  expect(current).toEqual({ startDate: '2026-10-26', endDate: '2026-11-24' })
  expect(prior).toEqual({ startDate: '2026-09-26', endDate: '2026-10-25' })
  expect(getPeecCitedUrls).not.toHaveBeenCalled()
})

test('compare previous_year passes the year-ago window; none passes null', async () => {
  await CitedSourcesSection(props({ compare: 'previous_year' }))
  expect(vi.mocked(getPeecCitedUrls).mock.calls[0][2]).toEqual({ startDate: '2025-10-26', endDate: '2025-11-24' })
  await CitedSourcesSection(props({ compare: 'none' }))
  expect(vi.mocked(getPeecCitedUrls).mock.calls[1][2]).toBeNull()
})

test('too-long window skips fetchers and shows the notice', async () => {
  const { container } = render(<TooltipProvider>{await CitedSourcesSection(props({ dateRange: 'year_to_date' }))}</TooltipProvider>)
  expect(getPeecCitedUrls).not.toHaveBeenCalled()
  expect(getProfoundCitedUrls).not.toHaveBeenCalled()
  expect(container.textContent).toContain('Choose a date range of 92 days or less')
})

test('no client slug renders nothing and never fetches', async () => {
  expect(await CitedSourcesSection(props({ clientSlug: undefined }))).toBeNull()
  expect(getPeecCitedUrls).not.toHaveBeenCalled()
})

test('the part wraps the section in Suspense with an export-pending skeleton and a boundary', () => {
  const { container } = render(<>{citedSourcesV1.render(FIXTURE_PEEC_CTX, { id: 'cited-sources', version: 1, label: 'Cited Sources' })}</>)
  expect(container.firstChild).toMatchSnapshot()
})
