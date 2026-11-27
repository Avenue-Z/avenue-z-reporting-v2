import { beforeEach, expect, test, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { ComponentProps } from 'react'
import type { ModelStatV2, ModelsV2 } from '@/lib/aeo/v2/types'

const replace = vi.fn()
let search = 'section=peec-ai&compareRange=previous_year'
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/dashboard/renaissance/reports',
  useSearchParams: () => new URLSearchParams(search),
}))
vi.mock('@/lib/aeo/v2/models', () => ({ getModelsV2: vi.fn() }))

import { getModelsV2 } from '@/lib/aeo/v2/models'
import { ExportModeProvider } from '@/components/export/export-mode'
import { ModelGaugeGrid } from './model-gauge-grid'
import { ModelsSection } from './models-section'
import { GAUGE_PARAM, gaugeMetricLabel, parseGaugeMetric, serializeGaugeMetric } from './gauge-metric'

const stat = (model: ModelStatV2['model'], base: number): ModelStatV2 => ({
  model,
  visibility: { you: base, youPrior: base - 2, competitorAvg: base - 10 },
  sov: { you: base / 2, youPrior: null, competitorAvg: base / 3 },
  usedAsSource: { you: base / 4, youPrior: base / 4 + 1, competitorAvg: null },
})
const MODELS: ModelStatV2[] = [stat('ChatGPT', 60), stat('Gemini', 40), stat('Google', 20)]

const PROPS: ComponentProps<typeof ModelGaugeGrid> = {
  models: MODELS,
  filterActive: false,
  basis: 'answers',
  showDeltas: true,
  compareSuffix: 'vs previous period',
}

const gauges = (c: HTMLElement) => [...c.querySelectorAll('svg[role="img"]')].map((s) => s.getAttribute('aria-label'))
const lastUrl = () => new URL(replace.mock.calls.at(-1)![0] as string, 'http://x')

beforeEach(() => {
  replace.mockReset()
  search = 'section=peec-ai&compareRange=previous_year'
})

test('parseGaugeMetric recognises only sov and source; serializeGaugeMetric drops the default', () => {
  expect(GAUGE_PARAM).toBe('aeoGauge')
  expect(parseGaugeMetric('sov')).toBe('sov')
  expect(parseGaugeMetric('source')).toBe('source')
  for (const raw of ['visibility', 'SOV', 'Source', '', 'bogus', null, undefined]) expect(parseGaugeMetric(raw)).toBe('visibility')
  expect(serializeGaugeMetric('visibility')).toBeNull()
  expect(serializeGaugeMetric('sov')).toBe('sov')
  expect(serializeGaugeMetric('source')).toBe('source')
})

test('gaugeMetricLabel names the third metric by its basis', () => {
  expect(gaugeMetricLabel('visibility', 'answers')).toBe('Visibility')
  expect(gaugeMetricLabel('sov', 'citations')).toBe('Share of voice')
  expect(gaugeMetricLabel('source', 'answers')).toBe('Used as a source')
  expect(gaugeMetricLabel('source', 'citations')).toBe('Citation share')
})

test('three gauges, Visibility by default, in the responsive grid', () => {
  const { container } = render(<ModelGaugeGrid {...PROPS} />)
  expect(gauges(container)).toEqual([
    'ChatGPT: Visibility 60.0%',
    'Gemini: Visibility 40.0%',
    'Google AI Overview: Visibility 20.0%',
  ])
  const grid = container.querySelector('.grid')!
  expect(grid.className).toContain('gap-4')
  expect(grid.className).toContain('sm:grid-cols-2')
  expect(grid.className).toContain('lg:grid-cols-3')
  expect(screen.getByRole('button', { name: 'Visibility' }).getAttribute('aria-pressed')).toBe('true')
  expect(screen.getByRole('button', { name: 'Share of voice' }).getAttribute('aria-pressed')).toBe('false')
})

test('aeoGauge=sov shows share of voice; aeoGauge=source with citations basis reads Citation share', () => {
  search = 'aeoGauge=sov'
  const { container, rerender } = render(<ModelGaugeGrid {...PROPS} />)
  expect(gauges(container)[0]).toBe('ChatGPT: Share of voice 30.0%')
  search = 'aeoGauge=source'
  rerender(<ModelGaugeGrid {...PROPS} basis="citations" />)
  expect(gauges(container)).toEqual([
    'ChatGPT: Citation share 15.0%',
    'Gemini: Citation share 10.0%',
    'Google AI Overview: Citation share 5.0%',
  ])
  expect(screen.getByRole('button', { name: 'Citation share' }).getAttribute('aria-pressed')).toBe('true')
  rerender(<ModelGaugeGrid {...PROPS} basis="answers" />)
  expect(gauges(container)[0]).toBe('ChatGPT: Used as a source 15.0%')
})

test('aeoGauge=bogus reads as Visibility', () => {
  search = 'aeoGauge=bogus'
  const { container } = render(<ModelGaugeGrid {...PROPS} />)
  expect(gauges(container)[0]).toBe('ChatGPT: Visibility 60.0%')
})

test('clicking Share of voice writes aeoGauge=sov and keeps every other param, without scrolling', () => {
  render(<ModelGaugeGrid {...PROPS} />)
  fireEvent.click(screen.getByRole('button', { name: 'Share of voice' }))
  const url = lastUrl()
  expect(url.pathname).toBe('/dashboard/renaissance/reports')
  expect(url.searchParams.get('aeoGauge')).toBe('sov')
  expect(url.searchParams.get('section')).toBe('peec-ai')
  expect(url.searchParams.get('compareRange')).toBe('previous_year')
  expect(replace.mock.calls.at(-1)![1]).toEqual({ scroll: false })
})

test('clicking Visibility deletes the param', () => {
  search = 'section=peec-ai&aeoGauge=source'
  render(<ModelGaugeGrid {...PROPS} />)
  fireEvent.click(screen.getByRole('button', { name: 'Visibility' }))
  expect(lastUrl().searchParams.has('aeoGauge')).toBe(false)
  expect(lastUrl().searchParams.get('section')).toBe('peec-ai')
})

test('the change line follows showDeltas and the comparison wording', () => {
  const { rerender } = render(<ModelGaugeGrid {...PROPS} />)
  expect(screen.getAllByText('+2.0 pts vs previous period')).toHaveLength(3)
  rerender(<ModelGaugeGrid {...PROPS} showDeltas={false} />)
  expect(screen.queryByText(/vs previous period/)).toBeNull()
})

test('the metric buttons sit in a group named Gauge metric', () => {
  render(<ModelGaugeGrid {...PROPS} />)
  const group = screen.getByRole('group', { name: 'Gauge metric' })
  expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual(['Visibility', 'Share of voice', 'Used as a source'])
})

test('no models with a filter: the selected-models line; with no filter: the no-data-for-this-period line', () => {
  const one = render(<ModelGaugeGrid {...PROPS} models={[]} filterActive />)
  expect(one.getByText('No data for the selected models.')).toBeTruthy()
  one.unmount()
  render(<ModelGaugeGrid {...PROPS} models={[]} filterActive={false} />)
  expect(screen.getByText('No AI model data for this period.')).toBeTruthy()
  expect(screen.queryByText('No data for the selected models.')).toBeNull()
})

test('no models: the muted empty line, as an export block, and no buttons', () => {
  const { container } = render(<ModelGaugeGrid {...PROPS} models={[]} filterActive />)
  const line = screen.getByText('No data for the selected models.')
  expect(line.closest('[data-export-block]')).toBeTruthy()
  expect(line.className).toContain('text-text-muted')
  expect(container.querySelectorAll('button')).toHaveLength(0)
  expect(gauges(container)).toHaveLength(0)
})

test('export mode: no buttons, a line names the metric shown and keeps with the gauges', () => {
  search = 'aeoGauge=source'
  const { container } = render(
    <ExportModeProvider><ModelGaugeGrid {...PROPS} basis="citations" /></ExportModeProvider>,
  )
  expect(container.querySelectorAll('button')).toHaveLength(0)
  const line = screen.getByText('Metric shown: Citation share')
  expect(line.closest('[data-export-keep-with-next]')).toBeTruthy()
  expect(gauges(container)).toHaveLength(3)
})

test('the metric line is not drawn on screen', () => {
  render(<ModelGaugeGrid {...PROPS} />)
  expect(screen.queryByText(/Metric shown/)).toBeNull()
})

// The section: the server fetch and the model filter.
const DATA: ModelsV2 = { models: MODELS, usedAsSourceBasis: 'answers' }
const CTX = {
  provider: 'peec' as const,
  clientSlug: 'renaissance',
  dateRange: 'last_30_days',
  compare: 'previous_year' as const,
  showDeltas: true,
  models: null,
}

beforeEach(() => {
  vi.mocked(getModelsV2).mockReset()
  vi.mocked(getModelsV2).mockResolvedValue(DATA)
})

test('ModelsSection fetches on the comparison window and draws every model with no filter', async () => {
  const { container } = render(<>{await ModelsSection({ ctx: CTX })}</>)
  expect(getModelsV2).toHaveBeenCalledWith('peec', 'renaissance', 'last_30_days', 'previous_year')
  expect(gauges(container)).toHaveLength(3)
  expect(screen.getAllByText(/vs same period last year/).length).toBeGreaterThan(0)
})

test('ModelsSection applies the model filter: Gemini alone is one gauge, no note', async () => {
  const { container } = render(<>{await ModelsSection({ ctx: { ...CTX, models: ['Gemini'] } })}</>)
  expect(gauges(container)).toEqual(['Gemini: Visibility 40.0%'])
  expect(container.textContent).not.toContain('not applied')
})

test('ModelsSection: a selected model missing from the data shows the selected-models line', async () => {
  // The data has ChatGPT only, so filtering to Gemini genuinely leaves nothing.
  vi.mocked(getModelsV2).mockResolvedValue({ ...DATA, models: [stat('ChatGPT', 60)] })
  const { container } = render(<>{await ModelsSection({ ctx: { ...CTX, models: ['Gemini'] } })}</>)
  expect(screen.getByText('No data for the selected models.')).toBeTruthy()
  expect(gauges(container)).toHaveLength(0)
})

test('ModelsSection: no models and no filter (no client resolved, or no data) shows the no-data line', async () => {
  vi.mocked(getModelsV2).mockResolvedValue({ ...DATA, models: [] })
  render(<>{await ModelsSection({ ctx: CTX })}</>)
  expect(screen.getByText('No AI model data for this period.')).toBeTruthy()
})

test('ModelsSection: no clientSlug renders nothing and fetches nothing, like the sibling sections', async () => {
  const { container } = render(<>{await ModelsSection({ ctx: { ...CTX, clientSlug: undefined } })}</>)
  expect(container.innerHTML).toBe('')
  expect(getModelsV2).not.toHaveBeenCalled()
})

test('ModelsSection passes the basis through: Profound citations read Citation share', async () => {
  search = 'aeoGauge=source'
  vi.mocked(getModelsV2).mockResolvedValue({ ...DATA, usedAsSourceBasis: 'citations' })
  const { container } = render(<>{await ModelsSection({ ctx: { ...CTX, provider: 'profound' } })}</>)
  expect(getModelsV2).toHaveBeenCalledWith('profound', 'renaissance', 'last_30_days', 'previous_year')
  expect(gauges(container)[0]).toBe('ChatGPT: Citation share 15.0%')
})
