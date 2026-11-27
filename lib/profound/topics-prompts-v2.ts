// AEO Overview v2, section 04 (Profound): per-(topic, brand, model) visibility counts for the matrix and the client brand's
// per-prompt stats for Prompt Performance, for the current and comparison windows. The visibility report covers only
// Visibility-type prompts, so no prompt-type filter is sent. A prompt x model where the brand is never mentioned has no row
// in the `you` report, so its answers come from the unfiltered runs report (executions per prompt, not multiplied by brands).
import { cached } from '@/lib/cache'
import { parseDateRange, deriveCompareRange } from '@/lib/ga4/client'
import { resolveYou } from '@/lib/aeo/v2/you'
import type { AEOModel } from '@/lib/peec/models'
import type { CompareMode, PromptModelStat, PromptV2, TopicCell, TopicsPromptsV2 } from '@/lib/aeo/v2/types'
import { getProfoundAssets, type ProfoundAsset } from './assets'
import { profoundModel } from './models'
import { profoundPostAll, type ProfoundNamedRow } from './report-rows'

function sumCells(rows: ProfoundNamedRow[], tracked: ReadonlySet<string>): TopicCell[] {
  const cells = new Map<string, TopicCell>()
  for (const r of rows) {
    const { topic, model: rawModel, asset_name: brand } = r.dims
    const model = rawModel ? profoundModel(rawModel) : null
    if (!topic || !brand || !model || !tracked.has(brand)) continue
    const key = `${topic}\u0000${brand}\u0000${model}`
    const mentions = r.metrics.mentions_count ?? 0
    const answers = r.metrics.executions ?? 0
    const c = cells.get(key)
    if (c) { c.mentions += mentions; c.answers += answers }
    else cells.set(key, { topic, brand, model, mentions, answers })
  }
  return Array.from(cells.values())
}

type Meta = { text: string; topic: string }

/** Per prompt and model: answers from the runs report, mentions and position from the client's own rows. */
function promptStats(runs: ProfoundNamedRow[], you: ProfoundNamedRow[], meta: Map<string, Meta>): Map<string, Partial<Record<AEOModel, PromptModelStat>>> {
  const youBy = new Map<string, ProfoundNamedRow>()
  for (const r of you) {
    const model = r.dims.model ? profoundModel(r.dims.model) : null
    if (r.dims.prompt_id && model) youBy.set(`${r.dims.prompt_id}\u0000${model}`, r)
  }
  const out = new Map<string, Partial<Record<AEOModel, PromptModelStat>>>()
  for (const r of runs) {
    const id = r.dims.prompt_id
    const model = r.dims.model ? profoundModel(r.dims.model) : null
    if (!id || !model) continue
    if (!meta.has(id)) meta.set(id, { text: r.dims.prompt?.trim() || '(untitled prompt)', topic: r.dims.topic || 'Other' })
    const y = youBy.get(`${id}\u0000${model}`)
    const mentions = y?.metrics.mentions_count ?? 0
    const byModel = out.get(id) ?? {}
    const s = byModel[model]
    const answers = r.metrics.executions ?? 0
    const posSum = (y?.metrics.average_position ?? 0) * mentions
    if (s) { s.answers += answers; s.mentions += mentions; s.posSum += posSum; s.posCount += mentions }
    else byModel[model] = { mentions, answers, posSum, posCount: mentions }
    out.set(id, byModel)
  }
  return out
}

export function buildProfoundTopicsPrompts(input: {
  assets: ProfoundAsset[]
  yourBrand: string
  cells: ProfoundNamedRow[]
  cellsPrior: ProfoundNamedRow[]
  runs: ProfoundNamedRow[]
  runsPrior: ProfoundNamedRow[]
  you: ProfoundNamedRow[]
  youPrior: ProfoundNamedRow[]
}): TopicsPromptsV2 {
  const tracked = new Set(input.assets.map((a) => a.name))
  const you = resolveYou(input.assets.map((a) => ({ name: a.name, isOwn: a.isOwned })), input.yourBrand)
  const meta = new Map<string, Meta>()
  const current = promptStats(input.runs, input.you, meta)
  const prior = promptStats(input.runsPrior, input.youPrior, new Map())
  const prompts: PromptV2[] = []
  for (const [id, cur] of current) {
    const m = meta.get(id)!
    prompts.push({ id, text: m.text, topic: m.topic, current: cur, prior: prior.get(id) ?? null })
  }
  return { you, cells: sumCells(input.cells, tracked), cellsPrior: sumCells(input.cellsPrior, tracked), prompts }
}

async function getProfoundTopicsPromptsV2Impl(clientSlug: string, dateRange: string, compareMode: CompareMode): Promise<TopicsPromptsV2> {
  const { getClientBySlug } = await import('@/lib/db/queries')
  const config = await getClientBySlug(clientSlug)
  const categoryId = config?.profoundCategoryId
  if (!categoryId) throw new Error(`[profound] no Profound category configured for ${clientSlug}`)
  const yourBrand = config?.peecYourBrand ?? ''

  const assets = await getProfoundAssets(categoryId)
  const names = assets.map((a) => a.name)
  if (names.length === 0) throw new Error(`[profound] no tracked assets for ${clientSlug}`)
  const you = resolveYou(assets.map((a) => ({ name: a.name, isOwn: a.isOwned })), yourBrand)

  const mainDates = parseDateRange(dateRange)
  const compareDates = deriveCompareRange(dateRange, compareMode) ?? mainDates
  const current = { start_date: mainDates.startDate, end_date: mainDates.endDate }
  const prior = { start_date: compareDates.startDate, end_date: compareDates.endDate }

  const report = (dates: { start_date: string; end_date: string }, dimensions: string[], metrics: string[], filters?: unknown[]) =>
    profoundPostAll('/v1/reports/visibility', { category_id: categoryId, ...dates, metrics, dimensions, ...(filters ? { filters } : {}) })
  const cells = (d: { start_date: string; end_date: string }) =>
    report(d, ['topic', 'model', 'asset_name'], ['mentions_count', 'executions'], [{ field: 'asset_name', operator: 'in', value: names }])
  const runs = (d: { start_date: string; end_date: string }) => report(d, ['prompt_id', 'prompt', 'topic', 'model'], ['executions'])
  const youRows = (d: { start_date: string; end_date: string }): Promise<ProfoundNamedRow[]> =>
    you === null ? Promise.resolve([]) : report(d, ['prompt_id', 'model'], ['mentions_count', 'average_position'], [{ field: 'asset_name', operator: 'is', value: you }])

  const [c, cp, r, rp, y, yp] = await Promise.all([cells(current), cells(prior), runs(current), runs(prior), youRows(current), youRows(prior)])
  return buildProfoundTopicsPrompts({ assets, yourBrand, cells: c, cellsPrior: cp, runs: r, runsPrior: rp, you: y, youPrior: yp })
}

export const getProfoundTopicsPromptsV2 = cached('profound', 'getTopicsPromptsV2', getProfoundTopicsPromptsV2Impl, {
  version: 'v1',
  healthCritical: false,
  extractTags: ([clientSlug]) => ({ client: clientSlug }),
})
