import { getVisibilityV2 } from '@/lib/aeo/v2/visibility'
import type { PeecCtx } from '../ctx'
import { brandColors } from './brand-colors'
import { fetchCompareMode } from './compare'
import { BrandTableV2 } from './brand-table'

/** Section 02's brand table, fetched server-side through the same cached call as the trend chart. */
export async function BrandTableV2Section({
  ctx,
}: {
  ctx: Pick<PeecCtx, 'provider' | 'clientSlug' | 'dateRange' | 'compare' | 'showDeltas' | 'modelActive'>
}) {
  if (!ctx.clientSlug) return null
  const v = await getVisibilityV2(ctx.provider, ctx.clientSlug, ctx.dateRange ?? 'last_30_days', fetchCompareMode(ctx.compare))
  if (v.brands.length === 0) return null
  const you = v.brands.find((b) => b.isYou)?.name ?? null
  return (
    <BrandTableV2
      rows={v.brands}
      colors={brandColors(v.roster, you)}
      showDeltas={ctx.showDeltas}
      usedAsSourceBasis={v.usedAsSourceBasis}
      note={ctx.modelActive ? 'Model filter not applied here: all models.' : null}
    />
  )
}
