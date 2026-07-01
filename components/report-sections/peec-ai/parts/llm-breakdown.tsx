import type { PartImpl } from '@/lib/report-sections/types'
import type { PeecCtx } from '../ctx'

export const llmBreakdownV1: PartImpl<PeecCtx> = {
  id: 'llm-breakdown',
  version: 1,
  published: true,
  defaultLabel: 'LLM Breakdown',
  render: (ctx) => {
    const { llmFiltered, LLM } = ctx
    if (llmFiltered.length === 0) return null
    return <LLM breakdown={llmFiltered} />
  },
}
