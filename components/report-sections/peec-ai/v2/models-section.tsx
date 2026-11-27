import { getModelsV2 } from '@/lib/aeo/v2/models'
import type { PeecCtx } from '../ctx'
import { compareSuffix, fetchCompareMode } from './compare'
import { ModelGaugeGrid } from './model-gauge-grid'

/**
 * Section 03's gauges, fetched server-side on the comparison window. The model filter is applied: only the selected
 * models get a gauge (all when there is no filter). No client, or no data for the selection, shows the grid's empty line.
 */
export async function ModelsSection({
  ctx,
}: {
  ctx: Pick<PeecCtx, 'provider' | 'clientSlug' | 'dateRange' | 'compare' | 'showDeltas' | 'models'>
}) {
  const suffix = compareSuffix(ctx.compare)
  if (!ctx.clientSlug) return <ModelGaugeGrid models={[]} basis="answers" showDeltas={ctx.showDeltas} compareSuffix={suffix} />
  const data = await getModelsV2(ctx.provider, ctx.clientSlug, ctx.dateRange ?? 'last_30_days', fetchCompareMode(ctx.compare))
  const selected = ctx.models
  const models = selected ? data.models.filter((m) => selected.includes(m.model)) : data.models
  return <ModelGaugeGrid models={models} basis={data.usedAsSourceBasis} showDeltas={ctx.showDeltas} compareSuffix={suffix} />
}
