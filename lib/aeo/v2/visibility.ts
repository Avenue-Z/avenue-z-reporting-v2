// One section 02 fetch per render: the trend chart and the brand table both call this, React `cache` dedupes them.
import { cache } from 'react'
import { getPeecVisibilityV2 } from '@/lib/peec/visibility-v2'
import { getProfoundVisibilityV2 } from '@/lib/profound/visibility-v2'
import type { AeoV2Provider, CompareMode, VisibilityV2 } from './types'

export const getVisibilityV2 = cache(
  (provider: AeoV2Provider, clientSlug: string, dateRange: string, compareMode: CompareMode): Promise<VisibilityV2> =>
    provider === 'peec'
      ? getPeecVisibilityV2(clientSlug, dateRange, compareMode)
      : getProfoundVisibilityV2(clientSlug, dateRange, compareMode),
)
