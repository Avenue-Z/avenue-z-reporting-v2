// One section 03 fetch per render: the gauge grid and anything else needing it share one call through React `cache`.
import { cache } from 'react'
import { getPeecModelsV2 } from '@/lib/peec/models-v2'
import { getProfoundModelsV2 } from '@/lib/profound/models-v2'
import type { AeoV2Provider, CompareMode, ModelsV2 } from './types'

export const getModelsV2 = cache(
  (provider: AeoV2Provider, clientSlug: string, dateRange: string, compareMode: CompareMode): Promise<ModelsV2> =>
    provider === 'peec'
      ? getPeecModelsV2(clientSlug, dateRange, compareMode)
      : getProfoundModelsV2(clientSlug, dateRange, compareMode),
)
