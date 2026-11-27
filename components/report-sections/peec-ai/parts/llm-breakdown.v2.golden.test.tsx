import { beforeEach, expect, test, vi } from 'vitest'
import { Children, isValidElement, type ReactElement, type ReactNode } from 'react'
import { render } from '@testing-library/react'
import type { ModelsV2 } from '@/lib/aeo/v2/types'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => '/dashboard/fixture-client/reports',
  useSearchParams: () => new URLSearchParams('section=peec-ai'),
}))
vi.mock('@/lib/aeo/v2/models', () => ({ getModelsV2: vi.fn() }))

import { getModelsV2 } from '@/lib/aeo/v2/models'
import { ReportErrorBoundary } from '@/components/report-sections/error-boundary'
import { ModelsSection } from '../v2/models-section'
import { llmBreakdownV2 } from './llm-breakdown.v2'
import { FIXTURE_PEEC_CTX } from './__fixtures__/peec-ctx'
import type { PeecCtx } from '../ctx'

const MODELS: ModelsV2 = {
  usedAsSourceBasis: 'answers',
  models: [
    {
      model: 'ChatGPT',
      visibility: { you: 42.3, youPrior: 45.4, competitorAvg: 46.2 },
      sov: { you: 18.6, youPrior: 17.9, competitorAvg: 12.4 },
      usedAsSource: { you: 9.8, youPrior: null, competitorAvg: 7.1 },
    },
    {
      model: 'Gemini',
      visibility: { you: 31.0, youPrior: 29.5, competitorAvg: 35.0 },
      sov: { you: 14.2, youPrior: 15.0, competitorAvg: 11.8 },
      usedAsSource: { you: 6.4, youPrior: 6.0, competitorAvg: null },
    },
    {
      model: 'Google',
      visibility: { you: 120, youPrior: null, competitorAvg: 22.5 },
      sov: { you: 10.1, youPrior: 10.1, competitorAvg: 9.9 },
      usedAsSource: { you: null, youPrior: null, competitorAvg: 3.2 },
    },
  ],
}

const CTX: PeecCtx = { ...FIXTURE_PEEC_CTX, compare: 'previous_period' }
const pick = (ctx: PeecCtx) => ({
  provider: ctx.provider, clientSlug: ctx.clientSlug, dateRange: ctx.dateRange,
  compare: ctx.compare, showDeltas: ctx.showDeltas, models: ctx.models,
})

beforeEach(() => {
  vi.mocked(getModelsV2).mockReset()
  vi.mocked(getModelsV2).mockResolvedValue(MODELS)
})

test('llm-breakdown@2 is version 2 of llm-breakdown, labelled', () => {
  expect(llmBreakdownV2.id).toBe('llm-breakdown')
  expect(llmBreakdownV2.version).toBe(2)
  expect(llmBreakdownV2.defaultLabel).toBe('Performance by AI model')
})

test('llm-breakdown@2 golden (resolved gauges)', async () => {
  const { container } = render(<>{await ModelsSection({ ctx: pick(CTX) })}</>)
  expect(getModelsV2).toHaveBeenCalledWith('peec', 'fixture-client', 'last_30_days', 'previous_period')
  expect(container.firstChild).toMatchSnapshot()
})

test('the part wraps the async section in an error boundary around Suspense, passing plain ctx fields', () => {
  const el = llmBreakdownV2.render(CTX, { id: 'llm-breakdown', version: 2, label: 'Performance by AI model' }) as ReactElement<{ sectionName: string; children: ReactNode }>
  expect(el.type).toBe(ReportErrorBoundary)
  expect(el.props.sectionName).toBe('performance by AI model')
  const suspense = Children.only(el.props.children) as ReactElement<{ children: ReactNode }>
  const child = Children.only(suspense.props.children)
  expect(isValidElement(child) && child.type).toBe(ModelsSection)
  expect((child as ReactElement<{ ctx: unknown }>).props.ctx).toEqual(pick(CTX))
})
