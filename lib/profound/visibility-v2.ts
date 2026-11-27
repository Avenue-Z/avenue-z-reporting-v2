// AEO Overview v2, section 02 (Profound): the per-brand table and the year-to-date visibility trend per brand.
// Brands are the category's tracked assets (the visibility report returns every brand any answer mentioned).
// Profound has no per-answer retrieval metric, so the third column is citation share: the share of all
// citations from Visibility-type prompts that point at the brand's own domains (usedAsSourceBasis 'citations').
import { cached } from '@/lib/cache'
import { parseDateRange, deriveCompareRange } from '@/lib/ga4/client'
import { bareDomain, sameOrSubdomain } from '@/lib/aeo-outbound/own-rows'
import { resolveYou } from '@/lib/aeo/v2/you'
import type { DailyPoint } from '@/lib/aeo/types'
import type { BrandRowV2, BrandTrend, CompareMode, VisibilityV2 } from '@/lib/aeo/v2/types'
import { assetDomains, getProfoundAssets, type ProfoundAsset } from './assets'
import { profoundPostAll, visibilityPromptsOnly, type ProfoundNamedRow } from './report-rows'

const BRAND_METRICS = ['visibility_score', 'share_of_voice']
const CITATION_METRICS = ['citation_share', 'count']
const YTD_MAX_ROWS = 50_000

const empty = (): VisibilityV2 => ({ roster: [], brands: [], trend: [], usedAsSourceBasis: 'citations' })

function usedAsSource(asset: ProfoundAsset, cites: ProfoundNamedRow[]): number | null {
  const sites = assetDomains(asset).map(bareDomain).filter(Boolean)
  if (sites.length === 0) return null
  let sum = 0
  for (const c of cites) {
    const host = c.dims.hostname
    if (!host) continue
    const h = bareDomain(host)
    if (sites.some((s) => sameOrSubdomain(h, s))) sum += (c.metrics.citation_share ?? 0) * 100
  }
  return sum
}

export function buildProfoundBrandRows(
  assets: ProfoundAsset[],
  current: ProfoundNamedRow[],
  prior: ProfoundNamedRow[],
  cites: ProfoundNamedRow[],
  citesPrior: ProfoundNamedRow[],
  you: string | null,
): BrandRowV2[] {
  const byName = new Map(assets.map((a) => [a.name, a]))
  const priorByName = new Map<string, ProfoundNamedRow>()
  for (const r of prior) if (r.dims.asset_name) priorByName.set(r.dims.asset_name, r)
  const out: Omit<BrandRowV2, 'rank'>[] = []
  for (const r of current) {
    const name = r.dims.asset_name
    const asset = name ? byName.get(name) : undefined
    if (!name || !asset) continue
    const p = priorByName.get(name)
    const hasDomain = assetDomains(asset).length > 0
    out.push({
      name,
      isYou: name === you,
      visibility: (r.metrics.visibility_score ?? 0) * 100,
      visibilityPrior: p ? (p.metrics.visibility_score ?? 0) * 100 : null,
      sov: (r.metrics.share_of_voice ?? 0) * 100,
      sovPrior: p ? (p.metrics.share_of_voice ?? 0) * 100 : null,
      usedAsSource: usedAsSource(asset, cites),
      usedAsSourcePrior: hasDomain ? usedAsSource(asset, citesPrior) : null,
    })
  }
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
  if (!categoryId) return empty()
  const yourBrand = config?.peecYourBrand ?? ''

  const assets = await getProfoundAssets(categoryId)
  const names = assets.map((a) => a.name)
  if (names.length === 0) return empty()

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

  // Tracked brands present in the current answer, in visibility-rank order, so several matches resolve to the best-ranked.
  const ownByName = new Map(assets.map((a) => [a.name, a.isOwned]))
  const ranked = cur
    .filter((r) => r.dims.asset_name && ownByName.has(r.dims.asset_name))
    .sort((a, b) => (b.metrics.visibility_score ?? 0) - (a.metrics.visibility_score ?? 0))
    .map((r) => ({ name: r.dims.asset_name as string, isOwn: ownByName.get(r.dims.asset_name as string) === true }))
  const you = resolveYou(ranked, yourBrand)

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
