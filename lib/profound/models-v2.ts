// AEO Overview v2, section 03 (Profound): one gauge set per AI model. Per model the client's Visibility, Share of voice and
// Used as a source (citation share: Profound has no per-answer retrieval metric), the same figures in the comparison window,
// and the plain mean over the other tracked assets. Visibility rows come from tracked assets only; citations from Visibility-type prompts.
import { cached } from '@/lib/cache'
import { parseDateRange, deriveCompareRange } from '@/lib/ga4/client'
import { mean } from '@/lib/aeo/v2/mean'
import { resolveYou } from '@/lib/aeo/v2/you'
import type { CompareMode, ModelMetricV2, ModelStatV2, ModelsV2 } from '@/lib/aeo/v2/types'
import { AEO_MODELS, type AEOModel } from '@/lib/peec/models'
import { getProfoundAssets, type ProfoundAsset } from './assets'
import { profoundModel } from './models'
import { profoundPostAll, visibilityPromptsOnly, type ProfoundNamedRow } from './report-rows'
import { usedAsSource } from './used-as-source'
import { rankAssets } from './visibility-v2'

const BRAND_METRICS = ['visibility_score', 'share_of_voice']

type Cell = { visibility: number; sov: number }

const modelOf = (r: ProfoundNamedRow): AEOModel | null => (r.dims.model ? profoundModel(r.dims.model) : null)

/** model -> asset name -> its row, for tracked assets on mapped models (one raw model per bucket by then). */
function visByModel(rows: ProfoundNamedRow[], tracked: ReadonlySet<string>): Map<AEOModel, Map<string, Cell>> {
  const out = new Map<AEOModel, Map<string, Cell>>()
  for (const r of rows) {
    const model = modelOf(r)
    const name = r.dims.asset_name
    if (!model || !name || !tracked.has(name)) continue
    const byAsset = out.get(model) ?? new Map<string, Cell>()
    byAsset.set(name, { visibility: (r.metrics.visibility_score ?? 0) * 100, sov: (r.metrics.share_of_voice ?? 0) * 100 })
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

/** One warning per fetch naming every Profound model the app does not show (its rows are dropped). */
function warnUnmapped(sets: ProfoundNamedRow[][]): void {
  const names = new Set<string>()
  for (const rows of sets) for (const r of rows) if (r.dims.model && !modelOf(r)) names.add(r.dims.model)
  if (names.size > 0) console.warn(`[profound] unmapped models dropped: ${Array.from(names).sort().join(', ')}`)
}

/**
 * Profound reports each raw model separately and gives no counts per model x asset here, so two raw names landing in one
 * bucket cannot be combined (their fractions would add). Keep one raw name per bucket, the first in sorted order over
 * every row set so all four agree, warn naming the others, and drop their rows.
 */
function oneRawModelPerBucket(sets: ProfoundNamedRow[][]): ProfoundNamedRow[][] {
  const raw = new Map<AEOModel, Set<string>>()
  for (const rows of sets) {
    for (const r of rows) {
      const model = modelOf(r)
      if (!model || !r.dims.model) continue
      const names = raw.get(model) ?? new Set<string>()
      names.add(r.dims.model)
      raw.set(model, names)
    }
  }
  const keep = new Map<AEOModel, string>()
  for (const [model, names] of raw) {
    const sorted = Array.from(names).sort()
    keep.set(model, sorted[0])
    if (sorted.length > 1) console.warn(`[profound] several models map to ${model}: ${sorted.join(', ')}; using ${sorted[0]}`)
  }
  return sets.map((rows) => rows.filter((r) => {
    const model = modelOf(r)
    return !model || keep.get(model) === r.dims.model
  }))
}

export function buildProfoundModels(input: {
  assets: ProfoundAsset[]
  yourBrand: string
  vis: ProfoundNamedRow[]
  visPrior: ProfoundNamedRow[]
  cites: ProfoundNamedRow[]
  citesPrior: ProfoundNamedRow[]
  /** The `['asset_name']` visibility report for the current window: section 02's ranking, which picks "you". */
  overall: ProfoundNamedRow[]
}): ModelsV2 {
  const { assets, yourBrand } = input
  warnUnmapped([input.vis, input.visPrior, input.cites, input.citesPrior])
  const [vis, visPrior, citeRows, citeRowsPrior] = oneRawModelPerBucket([input.vis, input.visPrior, input.cites, input.citesPrior])
  const tracked = new Set(assets.map((a) => a.name))
  const current = visByModel(vis, tracked)
  const prior = visByModel(visPrior, tracked)
  const cites = citesByModel(citeRows)
  const citesPrior = citesByModel(citeRowsPrior)

  const you = resolveYou(rankAssets(assets, input.overall), yourBrand)
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

  // The overall ranking is section 02's own call (its loader is not shared across fetchers, so it runs again here).
  const overallVisibility = profoundPostAll('/v1/reports/visibility', {
    category_id: categoryId, ...current, metrics: BRAND_METRICS, dimensions: ['asset_name'], filters: brandFilter,
  })
  const [vis, visPrior, cites, citesPrior, overall] = await Promise.all([
    visibility(current), visibility(prior), citations(current), citations(prior), overallVisibility,
  ])
  return buildProfoundModels({ assets, yourBrand, vis, visPrior, cites, citesPrior, overall })
}

export const getProfoundModelsV2 = cached('profound', 'getModelsV2', getProfoundModelsV2Impl, {
  version: 'v1',
  healthCritical: false,
  extractTags: ([clientSlug]) => ({ client: clientSlug }),
})
