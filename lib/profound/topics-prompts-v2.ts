// AEO Overview v2, section 04 (Profound): per-(topic, brand, model) visibility counts for the matrix and the client brand's
// per-prompt stats for Prompt Performance, for the current and comparison windows. The visibility report covers only
// Visibility-type prompts, so no prompt-type filter is sent. A prompt x model where the brand is never mentioned has no row
// in the `you` report, so its answers come from the unfiltered runs report (executions per prompt, not multiplied by brands).
// The same runs report gives each topic x model its total answers: an asset with no mention there has no cell row. A prompt
// or cell without a topic goes under Other.
import { cached } from '@/lib/cache'
import { parseDateRange, deriveCompareRange } from '@/lib/ga4/client'
import { resolveYou } from '@/lib/aeo/v2/you'
import type { AEOModel } from '@/lib/peec/models'
import type { CompareMode, PromptModelStat, PromptV2, TopicAnswers, TopicCell, TopicsPromptsV2 } from '@/lib/aeo/v2/types'
import { getProfoundAssets, type ProfoundAsset } from './assets'
import { profoundModel } from './models'
import { profoundPostAll, type ProfoundNamedRow } from './report-rows'

const topicOf = (r: ProfoundNamedRow) => r.dims.topic || 'Other'
const modelOf = (r: ProfoundNamedRow) => (r.dims.model ? profoundModel(r.dims.model) : null)

function sumCells(rows: ProfoundNamedRow[], tracked: ReadonlySet<string>): TopicCell[] {
  const cells = new Map<string, TopicCell>()
  for (const r of rows) {
    const brand = r.dims.asset_name
    const topic = topicOf(r)
    const model = modelOf(r)
    if (!brand || !model || !tracked.has(brand)) continue
    const key = `${topic}\u0000${brand}\u0000${model}`
    const mentions = r.metrics.mentions_count ?? 0
    const answers = r.metrics.executions ?? 0
    const c = cells.get(key)
    if (c) { c.mentions += mentions; c.answers += answers }
    else cells.set(key, { topic, brand, model, mentions, answers })
  }
  return Array.from(cells.values())
}

/** All answers per topic and model: the runs report's executions, summed. */
function sumTopicAnswers(runs: ProfoundNamedRow[]): TopicAnswers[] {
  const totals = new Map<string, TopicAnswers>()
  for (const r of runs) {
    const model = modelOf(r)
    if (!model) continue
    const topic = topicOf(r)
    const key = `${topic}\u0000${model}`
    const answers = r.metrics.executions ?? 0
    const t = totals.get(key)
    if (t) t.answers += answers
    else totals.set(key, { topic, model, answers })
  }
  return Array.from(totals.values())
}

/** Tracked assets in visibility-rank order (mentions over every cell; every asset shares the denominator), for `resolveYou`. */
function rankedAssets(assets: ProfoundAsset[], cells: ProfoundNamedRow[]): { name: string; isOwn: boolean }[] {
  const mentions = new Map<string, number>()
  for (const r of cells) {
    const name = r.dims.asset_name
    if (name && modelOf(r)) mentions.set(name, (mentions.get(name) ?? 0) + (r.metrics.mentions_count ?? 0))
  }
  return assets
    .map((a) => ({ name: a.name, isOwn: a.isOwned, mentions: mentions.get(a.name) ?? 0 }))
    .sort((a, b) => b.mentions - a.mentions)
}

type Meta = { text: string; topic: string }

/** Per prompt and model: answers from the runs report, mentions and position from the client's own rows. */
function promptStats(runs: ProfoundNamedRow[], you: ProfoundNamedRow[], meta: Map<string, Meta>): Map<string, Partial<Record<AEOModel, PromptModelStat>>> {
  const youBy = new Map<string, ProfoundNamedRow>()
  for (const r of you) {
    const model = modelOf(r)
    if (r.dims.prompt_id && model) youBy.set(`${r.dims.prompt_id}\u0000${model}`, r)
  }
  const out = new Map<string, Partial<Record<AEOModel, PromptModelStat>>>()
  for (const r of runs) {
    const id = r.dims.prompt_id
    const model = modelOf(r)
    if (!id || !model) continue
    if (!meta.has(id)) meta.set(id, { text: r.dims.prompt?.trim() || '(untitled prompt)', topic: topicOf(r) })
    const y = youBy.get(`${id}\u0000${model}`)
    const mentions = y?.metrics.mentions_count ?? 0
    const byModel = out.get(id) ?? {}
    const s = byModel[model]
    const answers = r.metrics.executions ?? 0
    // A position counts only when Profound gave a finite average for the mentions.
    const pos = y?.metrics.average_position
    const posCount = typeof pos === 'number' && Number.isFinite(pos) ? mentions : 0
    const posSum = posCount > 0 ? (pos as number) * posCount : 0
    if (s) { s.answers += answers; s.mentions += mentions; s.posSum += posSum; s.posCount += posCount }
    else byModel[model] = { mentions, answers, posSum, posCount }
    out.set(id, byModel)
  }
  return out
}

/** One warning per fetch naming every Profound model the app does not show (its rows are dropped). */
function warnUnmapped(sets: ProfoundNamedRow[][]): void {
  const names = new Set<string>()
  for (const rows of sets) for (const r of rows) if (r.dims.model && !modelOf(r)) names.add(r.dims.model)
  if (names.size > 0) console.warn(`[profound] unmapped models dropped: ${Array.from(names).sort().join(', ')}`)
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
  const you = resolveYou(rankedAssets(input.assets, input.cells), input.yourBrand)
  warnUnmapped([input.cells, input.cellsPrior, input.runs, input.runsPrior, input.you, input.youPrior])
  const meta = new Map<string, Meta>()
  const current = promptStats(input.runs, input.you, meta)
  const prior = promptStats(input.runsPrior, input.youPrior, new Map())
  const prompts: PromptV2[] = []
  for (const [id, cur] of current) {
    const m = meta.get(id)!
    prompts.push({ id, text: m.text, topic: m.topic, current: cur, prior: prior.get(id) ?? null })
  }
  return {
    you,
    cells: sumCells(input.cells, tracked),
    cellsPrior: sumCells(input.cellsPrior, tracked),
    topicAnswers: sumTopicAnswers(input.runs),
    topicAnswersPrior: sumTopicAnswers(input.runsPrior),
    prompts,
  }
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

  const mainDates = parseDateRange(dateRange)
  const compareDates = deriveCompareRange(dateRange, compareMode) ?? mainDates
  const current = { start_date: mainDates.startDate, end_date: mainDates.endDate }
  const prior = { start_date: compareDates.startDate, end_date: compareDates.endDate }

  const report = (dates: { start_date: string; end_date: string }, dimensions: string[], metrics: string[], filters?: unknown[]) =>
    profoundPostAll('/v1/reports/visibility', { category_id: categoryId, ...dates, metrics, dimensions, ...(filters ? { filters } : {}) })
  const cells = (d: { start_date: string; end_date: string }) =>
    report(d, ['topic', 'model', 'asset_name'], ['mentions_count', 'executions'], [{ field: 'asset_name', operator: 'in', value: names }])
  const runs = (d: { start_date: string; end_date: string }) => report(d, ['prompt_id', 'prompt', 'topic', 'model'], ['executions'])
  const youRows = (d: { start_date: string; end_date: string }, you: string | null): Promise<ProfoundNamedRow[]> =>
    you === null ? Promise.resolve([]) : report(d, ['prompt_id', 'model'], ['mentions_count', 'average_position'], [{ field: 'asset_name', operator: 'is', value: you }])

  // The client's rows are filtered by name, and "you" is resolved over the assets in visibility-rank order (as slice 2 does),
  // so they wait for the current cells; the runs reports go out at once.
  const runsP = Promise.all([runs(current), runs(prior)])
  runsP.catch(() => {}) // Rejections surface at the await below; this only keeps one from going unhandled meanwhile.
  const [c, cp] = await Promise.all([cells(current), cells(prior)])
  const you = resolveYou(rankedAssets(assets, c), yourBrand)
  const [[r, rp], [y, yp]] = await Promise.all([runsP, Promise.all([youRows(current, you), youRows(prior, you)])])
  return buildProfoundTopicsPrompts({ assets, yourBrand, cells: c, cellsPrior: cp, runs: r, runsPrior: rp, you: y, youPrior: yp })
}

export const getProfoundTopicsPromptsV2 = cached('profound', 'getTopicsPromptsV2', getProfoundTopicsPromptsV2Impl, {
  // v2: the result gained topicAnswers (lib/cache.ts: bump on a shape change).
  version: 'v2',
  healthCritical: false,
  extractTags: ([clientSlug]) => ({ client: clientSlug }),
})
