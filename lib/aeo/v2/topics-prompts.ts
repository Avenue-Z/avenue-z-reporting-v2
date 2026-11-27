// One section 04 fetch per render: the matrix and Prompt Performance both call this, React `cache` dedupes them.
import { cache } from 'react'
import { getPeecTopicsPromptsV2 } from '@/lib/peec/topics-prompts-v2'
import { getProfoundTopicsPromptsV2 } from '@/lib/profound/topics-prompts-v2'
import type { AeoV2Provider, CompareMode, TopicsPromptsV2 } from './types'

export const getTopicsPromptsV2 = cache(
  (provider: AeoV2Provider, clientSlug: string, dateRange: string, compareMode: CompareMode): Promise<TopicsPromptsV2> =>
    provider === 'peec'
      ? getPeecTopicsPromptsV2(clientSlug, dateRange, compareMode)
      : getProfoundTopicsPromptsV2(clientSlug, dateRange, compareMode),
)
