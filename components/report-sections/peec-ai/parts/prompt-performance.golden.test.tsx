import { beforeEach, expect, test, vi } from 'vitest'
import { Children, isValidElement, type ReactElement, type ReactNode } from 'react'
import { render } from '@testing-library/react'
import type { PromptV2, TopicsPromptsV2 } from '@/lib/aeo/v2/types'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => '/dashboard/fixture-client/reports',
  useSearchParams: () => new URLSearchParams('section=peec-ai'),
}))
vi.mock('@/lib/aeo/v2/topics-prompts', () => ({ getTopicsPromptsV2: vi.fn() }))

import { getTopicsPromptsV2 } from '@/lib/aeo/v2/topics-prompts'
import { ReportErrorBoundary } from '@/components/report-sections/error-boundary'
import { PromptPerformanceSection } from '../v2/topics-section'
import { promptPerformanceV1 } from './prompt-performance'
import { FIXTURE_PEEC_CTX } from './__fixtures__/peec-ctx'
import type { PeecCtx } from '../ctx'

const stat = (mentions: number, answers: number, posSum: number, posCount: number) => ({ mentions, answers, posSum, posCount })
const p = (id: string, cur: PromptV2['current'], prior: PromptV2['prior']): PromptV2 =>
  ({ id, text: `Prompt ${id}`, topic: 'Pricing', current: cur, prior })
const DATA: TopicsPromptsV2 = {
  you: 'Acme Corp', cells: [], cellsPrior: [], topicAnswers: [], topicAnswersPrior: [],
  prompts: [
    p('a', { ChatGPT: stat(6, 10, 6, 6), Gemini: stat(3, 10, 6, 3) }, { ChatGPT: stat(5, 10, 15, 5) }),
    p('b', { ChatGPT: stat(2, 8, 6, 2) }, null),
    p('c', { Gemini: stat(1, 4, 2, 1) }, { Gemini: stat(2, 4, 2, 2) }),
  ],
}
const CTX: PeecCtx = { ...FIXTURE_PEEC_CTX, compare: 'previous_period' }
const pick = (ctx: PeecCtx) => ({
  provider: ctx.provider, clientSlug: ctx.clientSlug, dateRange: ctx.dateRange,
  compare: ctx.compare, showDeltas: ctx.showDeltas, models: ctx.models,
})

beforeEach(() => {
  vi.mocked(getTopicsPromptsV2).mockReset()
  vi.mocked(getTopicsPromptsV2).mockResolvedValue(DATA)
})

test('prompt-performance@1 is version 1, labelled', () => {
  expect(promptPerformanceV1.id).toBe('prompt-performance')
  expect(promptPerformanceV1.version).toBe(1)
  expect(promptPerformanceV1.defaultLabel).toBe('Prompt Performance')
})

test('prompt-performance@1 golden', async () => {
  const { container, getByText } = render(<>{await PromptPerformanceSection({ ctx: pick(CTX) })}</>)
  expect(getTopicsPromptsV2).toHaveBeenCalledWith('peec', 'fixture-client', 'last_30_days', 'previous_period')
  expect(getByText('How is the brand ranking on each tracked prompt?')).toBeTruthy()
  expect(container.firstChild).toMatchSnapshot()
})

test('the model filter is applied', async () => {
  const { container } = render(<>{await PromptPerformanceSection({ ctx: pick({ ...CTX, models: ['Gemini'], modelActive: true }) })}</>)
  const names = [...container.querySelectorAll('tbody tr')].map((tr) => tr.querySelector('td')!.textContent)
  expect(names).not.toContain('Prompt b')
  expect(container.textContent).not.toContain('Model filter not applied')
})

test('says there is no prompt data without a client, or with no prompts', async () => {
  const empty = async (ctx: PeecCtx) => {
    const { container, unmount } = render(<>{await PromptPerformanceSection({ ctx: pick(ctx) })}</>)
    expect(container.textContent).toContain('No prompt data for this period.')
    expect(container.querySelector('table')).toBeNull()
    unmount()
  }
  await empty({ ...CTX, clientSlug: undefined })
  vi.mocked(getTopicsPromptsV2).mockResolvedValue({ ...DATA, prompts: [] })
  await empty(CTX)
})

test('the part wraps the async section in an error boundary around Suspense', () => {
  const el = promptPerformanceV1.render(CTX, { id: 'prompt-performance', version: 1, label: 'Prompt Performance' }) as ReactElement<{ sectionName: string; children: ReactNode }>
  expect(el.type).toBe(ReportErrorBoundary)
  const suspense = Children.only(el.props.children) as ReactElement<{ children: ReactNode }>
  const child = Children.only(suspense.props.children)
  expect(isValidElement(child) && child.type).toBe(PromptPerformanceSection)
  expect((child as ReactElement<{ ctx: unknown }>).props.ctx).toEqual(pick(CTX))
})
