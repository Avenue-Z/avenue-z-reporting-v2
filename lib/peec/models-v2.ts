// AEO Overview v2, section 03 (Peec): one gauge set per AI model. Per model the client's Visibility, Share of voice and
// Used as a source %, the same figures in the comparison window, and the plain mean over the other tracked brands.
// Window, project and "your brand" resolve as getPeecVisibilityV2 does; the metric math is v1's (summed visibility,
// mean of row share of voice) and the brand table's (Used as a source = retrieved answers / the model's answers).
import { cached } from '@/lib/cache'
import { parseDateRange, deriveCompareRange } from '@/lib/ga4/client'
import { mean } from '@/lib/aeo/v2/mean'
import { resolveYou } from '@/lib/aeo/v2/you'
import type { CompareMode, ModelMetricV2, ModelStatV2, ModelsV2 } from '@/lib/aeo/v2/types'
import {
  distinctAnswersByBrandModel,
  multiRowBrands,
  usedAsSourceByBrand,
  type DomainShareRow,
} from '@/lib/aeo/v2/used-as-source'
import { AEO_MODELS, type AEOModel } from './models'
import { normalizeSource, peecPost, type ApiBrandRow, type ApiDomainRow } from './client'
import { getPeecRoster, type PeecRosterBrand } from './roster'

const BRAND_LIMIT = 2_000
const DOMAIN_LIMIT = 10_000
const PAGES_MAX = 5
const MAX_ROWS = PAGES_MAX * DOMAIN_LIMIT
const MODEL_DIMS = ['model_channel_id', 'model_id']

type Agg = { c: number; t: number; sovSum: number; sovRows: number }
type DistinctMap = Map<string, Map<AEOModel, number>>

const modelOf = (r: { model?: { id: string }; model_channel?: { id: string } }): AEOModel | null =>
  normalizeSource(r.model?.id ?? r.model_channel?.id ?? '')

/** brand name -> model -> summed visibility and share-of-voice rows. */
function aggregate(rows: readonly ApiBrandRow[]): Map<string, Map<AEOModel, Agg>> {
  const out = new Map<string, Map<AEOModel, Agg>>()
  for (const r of rows) {
    const model = modelOf(r)
    if (!model) continue
    const byModel = out.get(r.brand.name) ?? new Map<AEOModel, Agg>()
    const a = byModel.get(model) ?? { c: 0, t: 0, sovSum: 0, sovRows: 0 }
    a.c += r.visibility_count
    a.t += r.visibility_total
    a.sovSum += r.share_of_voice
    a.sovRows += 1
    byModel.set(model, a)
    out.set(r.brand.name, byModel)
  }
  return out
}

const visOf = (a: Agg | undefined): number | null => (a && a.t > 0 ? (a.c / a.t) * 100 : null)
const sovOf = (a: Agg | undefined): number | null => (a && a.sovRows > 0 ? (a.sovSum / a.sovRows) * 100 : null)

/**
 * Domain rows per model bucket, one row per domain. Several raw models can share a bucket (Google AI Overview and AI
 * Mode are both `Google`), and each reports its own row per domain against its own answer count. An answer belongs to
 * one model, so a domain's retrieved answers add up across them exactly, and the bucket's answers are each raw model's
 * total taken once. Without the merge the brand would read as a multi-domain brand over one raw model's answers.
 */
function bucketShareRows(rows: readonly ApiDomainRow[]): Map<AEOModel, DomainShareRow[]> {
  const byBucket = new Map<AEOModel, { answers: Map<string, number>; totals: Map<string, number> }>()
  for (const r of rows) {
    const model = modelOf(r)
    if (!model) continue
    const b = byBucket.get(model) ?? { answers: new Map<string, number>(), totals: new Map<string, number>() }
    b.answers.set(r.domain, (b.answers.get(r.domain) ?? 0) + r.retrieved_chat_count)
    const raw = `${r.model_channel?.id ?? ''}|${r.model?.id ?? ''}`
    b.totals.set(raw, Math.max(b.totals.get(raw) ?? 0, r.total_chat_count))
    byBucket.set(model, b)
  }
  const out = new Map<AEOModel, DomainShareRow[]>()
  for (const [model, b] of byBucket) {
    let totalAnswers = 0
    for (const t of b.totals.values()) totalAnswers += t
    out.set(model, Array.from(b.answers, ([domain, answers]) => ({ domain, answers, totalAnswers })))
  }
  return out
}

/** Used as a source % per brand name for one window, model by model. */
function usedByModel(
  roster: readonly PeecRosterBrand[],
  domainRows: readonly ApiDomainRow[],
  distinct: DistinctMap | undefined,
): Map<AEOModel, Map<string, number | null>> {
  const out = new Map<AEOModel, Map<string, number | null>>()
  for (const [model, rows] of bucketShareRows(domainRows)) {
    const perBrand = new Map<string, number>()
    if (distinct) {
      for (const [brand, byModel] of distinct) {
        const n = byModel.get(model)
        if (n !== undefined) perBrand.set(brand, n)
      }
    }
    out.set(model, usedAsSourceByBrand(roster, rows, distinct ? perBrand : undefined))
  }
  return out
}

export function buildPeecModels(input: {
  roster: PeecRosterBrand[]
  brandRows: ApiBrandRow[]
  brandRowsPrior: ApiBrandRow[]
  domainRows: ApiDomainRow[]
  domainRowsPrior: ApiDomainRow[]
  distinct?: DistinctMap
  distinctPrior?: DistinctMap
  yourBrand: string
}): ModelsV2 {
  const { roster, yourBrand } = input
  const current = aggregate(input.brandRows)
  const prior = aggregate(input.brandRowsPrior)

  // Brands in overall visibility-rank order, so several name matches resolve to the best-ranked one.
  const ownByName = new Map(roster.map((b) => [b.name, b.isOwn]))
  const ranked = Array.from(current.entries())
    .map(([name, byModel]) => {
      let c = 0
      let t = 0
      for (const a of byModel.values()) { c += a.c; t += a.t }
      return { name, isOwn: ownByName.get(name) ?? false, visibility: t > 0 ? c / t : 0 }
    })
    .sort((a, b) => b.visibility - a.visibility)
  const you = resolveYou(ranked, yourBrand)
  if (you === null) return { models: [], usedAsSourceBasis: 'answers' }

  const used = usedByModel(roster, input.domainRows, input.distinct)
  const usedPrior = usedByModel(roster, input.domainRowsPrior, input.distinctPrior)
  const competitors = ranked.map((b) => b.name).filter((n) => n !== you)
  // The mean covers every tracked competitor with a value; Used as a source also reaches roster brands with no brand row.
  const competitorRoster = roster.map((b) => b.name).filter((n) => n !== you)

  const models: ModelStatV2[] = []
  for (const model of AEO_MODELS) {
    const mine = current.get(you)?.get(model)
    if (!mine || mine.t <= 0) continue
    const mineBefore = prior.get(you)?.get(model)
    const metric = (youVal: number | null, youPriorVal: number | null, others: (number | null)[]): ModelMetricV2 =>
      ({ you: youVal, youPrior: mineBefore ? youPriorVal : null, competitorAvg: mean(others) })
    const usedNow = used.get(model)
    models.push({
      model,
      visibility: metric(visOf(mine), visOf(mineBefore), competitors.map((n) => visOf(current.get(n)?.get(model)))),
      sov: metric(sovOf(mine), sovOf(mineBefore), competitors.map((n) => sovOf(current.get(n)?.get(model)))),
      usedAsSource: metric(
        usedNow?.get(you) ?? null,
        usedPrior.get(model)?.get(you) ?? null,
        competitorRoster.map((n) => usedNow?.get(n) ?? null),
      ),
    })
  }
  return { models, usedAsSourceBasis: 'answers' }
}

async function pagedDomains(
  body: Record<string, unknown>,
  pid: string,
  label: string,
  clientSlug: string,
): Promise<{ rows: ApiDomainRow[]; capped: boolean }> {
  const rows: ApiDomainRow[] = []
  for (let offset = 0; ; offset += DOMAIN_LIMIT) {
    const res = await peecPost<{ data: ApiDomainRow[] }>('/reports/domains', { ...body, limit: DOMAIN_LIMIT, offset }, pid)
    const batch = res.data ?? []
    rows.push(...batch)
    if (batch.length < DOMAIN_LIMIT) return { rows, capped: false }
    if (rows.length >= MAX_ROWS) {
      console.warn(`[peec] ${label} rows hit ${MAX_ROWS} for ${clientSlug}${label === 'chat_id' ? '; distinct answers unavailable' : '; figures may be truncated'}`)
      return { rows, capped: true }
    }
  }
}

async function windowData(
  roster: PeecRosterBrand[],
  window: { start_date: string; end_date: string },
  pid: string,
  clientSlug: string,
): Promise<{ brandRows: ApiBrandRow[]; domainRows: ApiDomainRow[]; distinct: DistinctMap | undefined }> {
  const [brandsRes, domains] = await Promise.all([
    peecPost<{ data: ApiBrandRow[] }>('/reports/brands', { ...window, dimensions: MODEL_DIMS, limit: BRAND_LIMIT }, pid),
    pagedDomains({ ...window, dimensions: MODEL_DIMS }, pid, 'domains', clientSlug),
  ])
  const rows = domains.rows
  const brandRows = brandsRes.data ?? []
  if (brandRows.length >= BRAND_LIMIT) console.warn(`[peec] model x brand rows hit ${BRAND_LIMIT} for ${clientSlug}`)
  // A brand with several matching domains on a model needs a per-answer count; one call per window covers every model.
  const byBrand = new Map<string, Set<string>>()
  for (const modelRows of bucketShareRows(rows).values()) {
    for (const m of multiRowBrands(roster, modelRows)) {
      const set = byBrand.get(m.name) ?? new Set<string>()
      m.domains.forEach((d) => set.add(d))
      byBrand.set(m.name, set)
    }
  }
  let distinct: DistinctMap | undefined
  if (byBrand.size > 0) {
    const multi = Array.from(byBrand.entries()).map(([name, d]) => ({ name, domains: Array.from(d) }))
    const values = Array.from(new Set(multi.flatMap((m) => m.domains)))
    const chat = await pagedDomains(
      { ...window, dimensions: ['chat_id', ...MODEL_DIMS], filters: [{ field: 'domain', operator: 'in', values }] },
      pid, 'chat_id', clientSlug,
    )
    if (!chat.capped) distinct = distinctAnswersByBrandModel(multi, chat.rows)
  }
  return { brandRows, domainRows: rows, distinct }
}

async function getPeecModelsV2Impl(clientSlug: string, dateRange: string, compareMode: CompareMode): Promise<ModelsV2> {
  const { getClientBySlug } = await import('@/lib/db/queries')
  const config = await getClientBySlug(clientSlug)
  const pid = config?.peecCustomerProjectId
  if (!pid) throw new Error(`[peec] no Peec project configured for ${clientSlug}`)
  const yourBrand = config?.peecYourBrand ?? ''

  const mainDates = parseDateRange(dateRange)
  const compareDates = deriveCompareRange(dateRange, compareMode) ?? mainDates
  const current = { start_date: mainDates.startDate, end_date: mainDates.endDate }
  const prior = { start_date: compareDates.startDate, end_date: compareDates.endDate }

  const roster = await getPeecRoster(pid)
  const [now, before] = await Promise.all([
    windowData(roster, current, pid, clientSlug),
    windowData(roster, prior, pid, clientSlug),
  ])
  return buildPeecModels({
    roster,
    brandRows: now.brandRows,
    brandRowsPrior: before.brandRows,
    domainRows: now.domainRows,
    domainRowsPrior: before.domainRows,
    distinct: now.distinct,
    distinctPrior: before.distinct,
    yourBrand,
  })
}

export const getPeecModelsV2 = cached('peec', 'getModelsV2', getPeecModelsV2Impl, {
  version: 'v1',
  healthCritical: false,
  extractTags: ([clientSlug]) => ({ client: clientSlug }),
})
