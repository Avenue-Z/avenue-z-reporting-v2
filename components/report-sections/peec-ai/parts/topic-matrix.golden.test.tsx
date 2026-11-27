import { beforeEach, expect, test, vi } from 'vitest'
import { Children, isValidElement, type ReactElement, type ReactNode } from 'react'
import { render } from '@testing-library/react'
import type { TopicCell, TopicsPromptsV2, VisibilityV2 } from '@/lib/aeo/v2/types'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => '/dashboard/fixture-client/reports',
  useSearchParams: () => new URLSearchParams('section=peec-ai'),
}))
vi.mock('@/lib/aeo/v2/visibility', () => ({ getVisibilityV2: vi.fn() }))
vi.mock('@/lib/aeo/v2/topics-prompts', () => ({ getTopicsPromptsV2: vi.fn() }))

import { getVisibilityV2 } from '@/lib/aeo/v2/visibility'
import { getTopicsPromptsV2 } from '@/lib/aeo/v2/topics-prompts'
import { ReportErrorBoundary } from '@/components/report-sections/error-boundary'
import { TopicMatrixSection } from '../v2/topics-section'
import { topicMatrixV1 } from './topic-matrix'
import { FIXTURE_PEEC_CTX } from './__fixtures__/peec-ctx'
import type { PeecCtx } from '../ctx'

const VIS: VisibilityV2 = {
  roster: ['Acme Corp', 'Beta LLC', 'Rival Inc'],
  brands: [
    { name: 'Acme Corp', isYou: true, rank: 1, visibility: 55.2, visibilityPrior: 52.1, sov: 28.4, sovPrior: 27.2, usedAsSource: 36.7, usedAsSourcePrior: 35.0 },
    { name: 'Rival Inc', isYou: false, rank: 2, visibility: 38.7, visibilityPrior: 40.2, sov: 20.1, sovPrior: 20.9, usedAsSource: 12.0, usedAsSourcePrior: null },
    { name: 'Beta LLC', isYou: false, rank: 3, visibility: 26.3, visibilityPrior: 25.4, sov: 14.6, sovPrior: 14.1, usedAsSource: null, usedAsSourcePrior: null },
  ],
  trend: [],
  usedAsSourceBasis: 'answers',
}

const c = (topic: string, brand: string, model: TopicCell['model'], mentions: number, answers: number): TopicCell =>
  ({ topic, brand, model, mentions, answers })
const TOPICS: TopicsPromptsV2 = {
  you: 'Acme Corp',
  cells: [
    c('Pricing', 'Acme Corp', 'ChatGPT', 6, 10), c('Pricing', 'Rival Inc', 'ChatGPT', 4, 10), c('Pricing', 'Beta LLC', 'ChatGPT', 1, 10),
    c('Pricing', 'Acme Corp', 'Gemini', 3, 10), c('Pricing', 'Rival Inc', 'Gemini', 5, 10), c('Pricing', 'Beta LLC', 'Gemini', 0, 10),
    c('Support', 'Acme Corp', 'ChatGPT', 2, 8), c('Support', 'Rival Inc', 'ChatGPT', 6, 8), c('Support', 'Beta LLC', 'ChatGPT', 3, 8),
  ],
  cellsPrior: [
    c('Pricing', 'Acme Corp', 'ChatGPT', 5, 10), c('Pricing', 'Rival Inc', 'ChatGPT', 5, 10), c('Pricing', 'Beta LLC', 'ChatGPT', 2, 10),
  ],
  prompts: [],
}

const CTX: PeecCtx = { ...FIXTURE_PEEC_CTX, compare: 'previous_period' }
const pick = (ctx: PeecCtx) => ({
  provider: ctx.provider, clientSlug: ctx.clientSlug, dateRange: ctx.dateRange,
  compare: ctx.compare, showDeltas: ctx.showDeltas, models: ctx.models,
})

beforeEach(() => {
  vi.mocked(getVisibilityV2).mockReset()
  vi.mocked(getVisibilityV2).mockResolvedValue(VIS)
  vi.mocked(getTopicsPromptsV2).mockReset()
  vi.mocked(getTopicsPromptsV2).mockResolvedValue(TOPICS)
})

test('topic-matrix@1 is version 1 of topic-matrix, labelled', () => {
  expect(topicMatrixV1.id).toBe('topic-matrix')
  expect(topicMatrixV1.version).toBe(1)
  expect(topicMatrixV1.defaultLabel).toBe('Visibility by topic')
})

test('topic-matrix@1 golden (resolved matrix)', async () => {
  const { container, getByText } = render(<>{await TopicMatrixSection({ ctx: pick(CTX) })}</>)
  expect(getTopicsPromptsV2).toHaveBeenCalledWith('peec', 'fixture-client', 'last_30_days', 'previous_period')
  expect(getVisibilityV2).toHaveBeenCalledWith('peec', 'fixture-client', 'last_30_days', 'previous_period')
  expect(getByText('Where does the brand show up by topic?')).toBeTruthy()
  expect(container.firstChild).toMatchSnapshot()
})

test('columns follow the brand table order with roster colors, the client first in cyan', async () => {
  const { container } = render(<>{await TopicMatrixSection({ ctx: pick(CTX) })}</>)
  const cols = [...container.querySelectorAll('thead th')].slice(1)
  expect(cols.map((h) => h.textContent)).toEqual(['Acme Corp', 'Rival Inc', 'Beta LLC'])
  expect(cols[0].querySelector('span[style]')!.getAttribute('style')).toContain('rgb(96, 253, 255)')
  // Topics are ordered by the client's visibility: Pricing 45% before Support 25%.
  expect([...container.querySelectorAll('tbody th')].map((h) => h.textContent)).toEqual(['Pricing', 'Support'])
})

test('the model filter is applied: only the selected models are summed', async () => {
  const { container } = render(<>{await TopicMatrixSection({ ctx: pick({ ...CTX, models: ['Gemini'], modelActive: true }) })}</>)
  expect([...container.querySelectorAll('tbody th')].map((h) => h.textContent)).toEqual(['Pricing'])
  expect((container.querySelector('tbody td[data-brand="Acme Corp"]') as HTMLElement).textContent).toBe('30.0%')
  expect(container.textContent).not.toContain('Model filter not applied')
})

test('previous year is the window both loaders fetch', async () => {
  await TopicMatrixSection({ ctx: pick({ ...CTX, compare: 'previous_year' }) })
  expect(getTopicsPromptsV2).toHaveBeenCalledWith('peec', 'fixture-client', 'last_30_days', 'previous_year')
  expect(getVisibilityV2).toHaveBeenCalledWith('peec', 'fixture-client', 'last_30_days', 'previous_year')
})

test('renders nothing without a client, or with no topics', async () => {
  expect(await TopicMatrixSection({ ctx: pick({ ...CTX, clientSlug: undefined }) })).toBeNull()
  vi.mocked(getTopicsPromptsV2).mockResolvedValue({ ...TOPICS, cells: [] })
  expect(await TopicMatrixSection({ ctx: pick(CTX) })).toBeNull()
})

test('the part wraps the async section in an error boundary around Suspense, passing plain ctx fields', () => {
  const el = topicMatrixV1.render(CTX, { id: 'topic-matrix', version: 1, label: 'Visibility by topic' }) as ReactElement<{ sectionName: string; children: ReactNode }>
  expect(el.type).toBe(ReportErrorBoundary)
  expect(el.props.sectionName).toBe('the topic matrix')
  const suspense = Children.only(el.props.children) as ReactElement<{ children: ReactNode }>
  const child = Children.only(suspense.props.children)
  expect(isValidElement(child) && child.type).toBe(TopicMatrixSection)
  expect((child as ReactElement<{ ctx: unknown }>).props.ctx).toEqual(pick(CTX))
})
