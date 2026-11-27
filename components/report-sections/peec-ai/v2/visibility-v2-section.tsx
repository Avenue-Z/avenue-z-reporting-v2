import { getVisibilityV2 } from '@/lib/aeo/v2/visibility'
import type { PeecCtx } from '../ctx'
import { FALLBACK_COLOR, brandColors, brandKey } from './brand-colors'
import { fetchCompareMode, periodWindows } from './compare'
import { BrandTrendChart, type TrendSeries } from './brand-trend-chart'

/** Two decimals is far finer than the chart draws or the tooltip prints (one decimal); it keeps float noise out of the payload. */
const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * Section 02's trend chart, fetched server-side. One series per brand in the brand table's order (visibility desc), so
 * the legend and the default selection follow the table; colors depend on the roster only, never on rank.
 */
export async function VisibilityV2Section({
  ctx,
}: {
  ctx: Pick<PeecCtx, 'provider' | 'clientSlug' | 'dateRange' | 'compare' | 'showDeltas' | 'modelActive'>
}) {
  if (!ctx.clientSlug) return null
  const range = ctx.dateRange ?? 'last_30_days'
  const v = await getVisibilityV2(ctx.provider, ctx.clientSlug, range, fetchCompareMode(ctx.compare))

  const you = v.brands.find((b) => b.isYou)?.name ?? null
  const colors = brandColors(v.roster, you)
  const pointsByName = new Map(v.trend.map((t) => [t.name, t.points.map((p) => ({ ...p, visibility: round2(p.visibility) }))]))
  const series: TrendSeries[] = v.brands.map((b) => ({
    key: brandKey(b.name),
    name: b.name,
    color: colors.get(b.name) ?? FALLBACK_COLOR,
    isYou: b.isYou,
    points: pointsByName.get(b.name) ?? [],
  }))
  if (!series.some((s) => s.points.length > 0)) return null

  const { period, comparePeriod } = periodWindows(range, ctx.compare)
  return (
    <BrandTrendChart
      series={series}
      competitorKeysByVisibility={v.brands.filter((b) => !b.isYou).map((b) => brandKey(b.name))}
      period={period}
      comparePeriod={comparePeriod}
      showDeltas={ctx.showDeltas}
      note={ctx.modelActive ? 'Model filter not applied here: all models.' : null}
    />
  )
}
