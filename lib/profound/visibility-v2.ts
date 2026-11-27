// AEO Overview v2, section 02 (Profound): the per-brand table and the year-to-date visibility trend per brand.
// Brands are the category's tracked assets (the visibility report returns every brand any answer mentioned).
// Profound has no per-answer retrieval metric, so the third column is citation share: the share of all
// citations from Visibility-type prompts that point at the brand's own domains (usedAsSourceBasis 'citations').
import { cached } from '@/lib/cache'
import { parseDateRange, deriveCompareRange } from '@/lib/ga4/client'
import { resolveYou } from '@/lib/aeo/v2/you'
import type { DailyPoint } from '@/lib/aeo/types'
import type { BrandRowV2, BrandTrend, CompareMode, VisibilityV2 } from '@/lib/aeo/v2/types'
import { getProfoundAssets, type ProfoundAsset } from './assets'
import { profoundPostAll, visibilityPromptsOnly, type ProfoundNamedRow } from './report-rows'
import { usedAsSource } from './used-as-source'

const BRAND_METRICS = ['visibility_score', 'share_of_voice']
const CITATION_METRICS = ['citation_share', 'count']
const YTD_MAX_ROWS = 50_000

/** Every tracked asset (one missing from the answer at 0) in overall visibility-rank order, from an `['asset_name']`
 *  visibility report, so several name matches resolve to the best-ranked. Sections 02 and 03 both pick "you" from it. */
export function rankAssets(
  assets: readonly ProfoundAsset[],
  overall: readonly ProfoundNamedRow[],
): { name: string; isOwn: boolean; visibility: number }[] {
  const visByName = new Map<string, number>()
  for (const r of overall) if (r.dims.asset_name) visByName.set(r.dims.asset_name, r.metrics.visibility_score ?? 0)
  return assets
    .map((a) => ({ name: a.name, isOwn: a.isOwned, visibility: visByName.get(a.name) ?? 0 }))
    .sort((a, b) => b.visibility - a.visibility)
}

export function buildProfoundBrandRows(
  assets: ProfoundAsset[],
  current: ProfoundNamedRow[],
  prior: ProfoundNamedRow[],
  cites: ProfoundNamedRow[],
  citesPrior: ProfoundNamedRow[],
  you: string | null,
): BrandRowV2[] {
  const byAssetName = (rows: ProfoundNamedRow[]) => {
    const m = new Map<string, ProfoundNamedRow>()
    for (const r of rows) if (r.dims.asset_name) m.set(r.dims.asset_name, r)
    return m
  }
  const currentByName = byAssetName(current)
  const priorByName = byAssetName(prior)
  // Every tracked asset is listed: one no answer mentioned this window has no row and shows 0 visibility and 0 share of voice
  // (no mentions), so the client can always be pinned. A brand with no prior row is new this period: no prior in any column.
  const out: Omit<BrandRowV2, 'rank'>[] = assets.map((asset) => {
    const r = currentByName.get(asset.name)
    const p = priorByName.get(asset.name)
    return {
      name: asset.name,
      isYou: asset.name === you,
      visibility: (r?.metrics.visibility_score ?? 0) * 100,
      visibilityPrior: p ? (p.metrics.visibility_score ?? 0) * 100 : null,
      sov: (r?.metrics.share_of_voice ?? 0) * 100,
      sovPrior: p ? (p.metrics.share_of_voice ?? 0) * 100 : null,
      usedAsSource: usedAsSource(asset, cites),
      usedAsSourcePrior: p ? usedAsSource(asset, citesPrior) : null,
    }
  })
  return out.sort((a, b) => b.visibility - a.visibility).map((b, i) => ({ ...b, rank: i + 1 }))
}

function buildTrend(rows: ProfoundNamedRow[], assets: ProfoundAsset[], you: string | null): BrandTrend[] {
  const byName = new Map(assets.map((a) => [a.name, a]))
  const byBrand = new Map<string, DailyPoint[]>()
  for (const r of rows) {
    const name = r.dims.asset_name
    const date = r.dims.date
    if (!name || !date || !byName.has(name)) continue
    const pts = byBrand.get(name) ?? []
    pts.push({ date: date.slice(0, 10), visibility: (r.metrics.visibility_score ?? 0) * 100 })
    byBrand.set(name, pts)
  }
  return Array.from(byBrand.entries()).map(([name, pts]) => ({
    name,
    isYou: name === you,
    points: pts.sort((a, b) => a.date.localeCompare(b.date)),
  }))
}

async function getProfoundVisibilityV2Impl(clientSlug: string, dateRange: string, compareMode: CompareMode): Promise<VisibilityV2> {
  const { getClientBySlug } = await import('@/lib/db/queries')
  const config = await getClientBySlug(clientSlug)
  const categoryId = config?.profoundCategoryId
  if (!categoryId) throw new Error(`[profound] no Profound category configured for ${clientSlug}`)
  const yourBrand = config?.peecYourBrand ?? ''

  const assets = await getProfoundAssets(categoryId)
  const names = assets.map((a) => a.name)
  if (names.length === 0) throw new Error(`[profound] no tracked assets for ${clientSlug}`)

  const mainDates = parseDateRange(dateRange)
  const compareDates = deriveCompareRange(dateRange, compareMode) ?? mainDates
  const current = { start_date: mainDates.startDate, end_date: mainDates.endDate }
  const prior = { start_date: compareDates.startDate, end_date: compareDates.endDate }
  const todayISO = new Date().toISOString().slice(0, 10)
  const ytd = { start_date: `${todayISO.slice(0, 4)}-01-01`, end_date: todayISO }

  const brandFilter = [{ field: 'asset_name', operator: 'in', value: names }]
  const visibility = (dates: { start_date: string; end_date: string }) =>
    profoundPostAll('/v1/reports/visibility', { category_id: categoryId, ...dates, metrics: BRAND_METRICS, dimensions: ['asset_name'], filters: brandFilter })
  const citations = (dates: { start_date: string; end_date: string }) =>
    profoundPostAll('/v1/reports/citations', { category_id: categoryId, ...dates, metrics: CITATION_METRICS, dimensions: ['hostname'], filters: [...visibilityPromptsOnly] })

  const [cur, pri, cites, citesPrior, ytdRows] = await Promise.all([
    visibility(current),
    visibility(prior),
    citations(current),
    citations(prior),
    profoundPostAll('/v1/reports/visibility', {
      category_id: categoryId, ...ytd, metrics: ['visibility_score'], dimensions: ['date', 'asset_name'], date_interval: 'day', filters: brandFilter,
    }, YTD_MAX_ROWS),
  ])

  const you = resolveYou(rankAssets(assets, cur), yourBrand)

  return {
    roster: names,
    brands: buildProfoundBrandRows(assets, cur, pri, cites, citesPrior, you),
    trend: buildTrend(ytdRows, assets, you),
    usedAsSourceBasis: 'citations',
  }
}

export const getProfoundVisibilityV2 = cached('profound', 'getVisibilityV2', getProfoundVisibilityV2Impl, {
  version: 'v1',
  healthCritical: false,
  extractTags: ([clientSlug]) => ({ client: clientSlug }),
})
