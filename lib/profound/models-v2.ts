// AEO Overview v2, section 03 (Profound): one gauge set per AI model. Per model the client's Visibility, Share of voice and
// Used as a source (citation share: Profound has no per-answer retrieval metric), the same figures in the comparison window,
// and the plain mean over the other tracked assets. Visibility rows come from tracked assets only; citations from Visibility-type prompts.
import { cached } from '@/lib/cache'
import { parseDateRange, deriveCompareRange } from '@/lib/ga4/client'
import { bareDomain, sameOrSubdomain } from '@/lib/aeo-outbound/own-rows'
import { resolveYou } from '@/lib/aeo/v2/you'
import type { CompareMode, ModelMetricV2, ModelStatV2, ModelsV2 } from '@/lib/aeo/v2/types'
import { AEO_MODELS, type AEOModel } from '@/lib/peec/models'
import { assetDomains, getProfoundAssets, type ProfoundAsset } from './assets'
import { profoundModel } from './models'
import { profoundPostAll, visibilityPromptsOnly, type ProfoundNamedRow } from './report-rows'

const BRAND_METRICS = ['visibility_score', 'share_of_voice']

type Cell = { visibility: number; sov: number }

const modelOf = (r: ProfoundNamedRow): AEOModel | null => (r.dims.model ? profoundModel(r.dims.model) : null)

/** model -> asset name -> its row, for tracked assets on mapped models. */
function visByModel(rows: ProfoundNamedRow[], tracked: ReadonlySet<string>): Map<AEOModel, Map<string, Cell>> {
  const out = new Map<AEOModel, Map<string, Cell>>()
  for (const r of rows) {
    const model = modelOf(r)
    const name = r.dims.asset_name
    if (!model || !name || !tracked.has(name)) continue
    const byAsset = out.get(model) ?? new Map<string, Cell>()
    const c = byAsset.get(name) ?? { visibility: 0, sov: 0 }
    c.visibility += (r.metrics.visibility_score ?? 0) * 100
    c.sov += (r.metrics.share_of_voice ?? 0) * 100
    byAsset.set(name, c)
    out.set(model, byAsset)
  }
  return out
}

/** model -> that model's citation rows. */
function citesByModel(rows: ProfoundNamedRow[]): Map<AEOModel, ProfoundNamedRow[]> {
  const out = new Map<AEOModel, ProfoundNamedRow[]>()
  for (const r of rows) {
    const model = modelOf(r)
    if (!model) continue
    const list = out.get(model) ?? []
    list.push(r)
    out.set(model, list)
  }
  return out
}

/** Percent of the model's citations pointing at the asset's domains. Null with no domain or no citation rows on the model
 *  (no figure, never a fabricated 0). */
function usedAsSource(asset: ProfoundAsset, cites: ProfoundNamedRow[] | undefined): number | null {
  const sites = assetDomains(asset).map(bareDomain).filter(Boolean)
  if (sites.length === 0 || !cites || cites.length === 0) return null
  let sum = 0
  for (const c of cites) {
    const host = c.dims.hostname
    if (!host) continue
    const h = bareDomain(host)
    if (sites.some((s) => sameOrSubdomain(h, s))) sum += (c.metrics.citation_share ?? 0) * 100
  }
  return sum
}

function mean(values: readonly (number | null)[]): number | null {
  const v = values.filter((x): x is number => x !== null)
  return v.length === 0 ? null : v.reduce((s, x) => s + x, 0) / v.length
}

/** One warning per fetch naming every Profound model the app does not show (its rows are dropped). */
function warnUnmapped(sets: ProfoundNamedRow[][]): void {
  const names = new Set<string>()
  for (const rows of sets) for (const r of rows) if (r.dims.model && !modelOf(r)) names.add(r.dims.model)
  if (names.size > 0) console.warn(`[profound] unmapped models dropped: ${Array.from(names).sort().join(', ')}`)
}

export function buildProfoundModels(input: {
  assets: ProfoundAsset[]
  yourBrand: string
  vis: ProfoundNamedRow[]
  visPrior: ProfoundNamedRow[]
  cites: ProfoundNamedRow[]
  citesPrior: ProfoundNamedRow[]
}): ModelsV2 {
  const { assets, yourBrand } = input
  warnUnmapped([input.vis, input.visPrior, input.cites, input.citesPrior])
  const tracked = new Set(assets.map((a) => a.name))
  const current = visByModel(input.vis, tracked)
  const prior = visByModel(input.visPrior, tracked)
  const cites = citesByModel(input.cites)
  const citesPrior = citesByModel(input.citesPrior)

  // Assets in overall visibility-rank order, so several name matches resolve to the best-ranked one.
  const total = new Map<string, number>()
  for (const byAsset of current.values()) for (const [n, c] of byAsset) total.set(n, (total.get(n) ?? 0) + c.visibility)
  const ranked = assets
    .map((a) => ({ name: a.name, isOwn: a.isOwned, visibility: total.get(a.name) ?? 0 }))
    .sort((a, b) => b.visibility - a.visibility)
  const you = resolveYou(ranked, yourBrand)
  if (you === null) return { models: [], usedAsSourceBasis: 'citations' }
  const youAsset = assets.find((a) => a.name === you)!
  const competitors = assets.filter((a) => a.name !== you)

  const models: ModelStatV2[] = []
  for (const model of AEO_MODELS) {
    const now = current.get(model)
    if (!now) continue
    const before = prior.get(model)
    const mine = now.get(you)
    const mineBefore = before?.get(you)
    // A tracked asset no answer mentioned on a model with data has no row: 0 now, and no prior when absent before too.
    const metric = (key: keyof Cell, others: (number | null)[]): ModelMetricV2 => ({
      you: mine ? mine[key] : 0,
      youPrior: mineBefore ? mineBefore[key] : null,
      competitorAvg: mean(others),
    })
    const used = (asset: ProfoundAsset) => usedAsSource(asset, cites.get(model))
    models.push({
      model,
      visibility: metric('visibility', competitors.map((a) => now.get(a.name)?.visibility ?? 0)),
      sov: metric('sov', competitors.map((a) => now.get(a.name)?.sov ?? 0)),
      usedAsSource: {
        you: used(youAsset),
        youPrior: mineBefore ? usedAsSource(youAsset, citesPrior.get(model)) : null,
        competitorAvg: mean(competitors.map(used)),
      },
    })
  }
  return { models, usedAsSourceBasis: 'citations' }
}

async function getProfoundModelsV2Impl(clientSlug: string, dateRange: string, compareMode: CompareMode): Promise<ModelsV2> {
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

  const brandFilter = [{ field: 'asset_name', operator: 'in', value: names }]
  const visibility = (dates: { start_date: string; end_date: string }) =>
    profoundPostAll('/v1/reports/visibility', { category_id: categoryId, ...dates, metrics: BRAND_METRICS, dimensions: ['model', 'asset_name'], filters: brandFilter })
  const citations = (dates: { start_date: string; end_date: string }) =>
    profoundPostAll('/v1/reports/citations', { category_id: categoryId, ...dates, metrics: ['citation_share'], dimensions: ['model', 'hostname'], filters: [...visibilityPromptsOnly] })

  const [vis, visPrior, cites, citesPrior] = await Promise.all([
    visibility(current), visibility(prior), citations(current), citations(prior),
  ])
  return buildProfoundModels({ assets, yourBrand, vis, visPrior, cites, citesPrior })
}

export const getProfoundModelsV2 = cached('profound', 'getModelsV2', getProfoundModelsV2Impl, {
  version: 'v1',
  healthCritical: false,
  extractTags: ([clientSlug]) => ({ client: clientSlug }),
})
