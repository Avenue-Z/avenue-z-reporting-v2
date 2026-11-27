import type { PromptModelStat, PromptV2, TopicCell, TopicsPromptsV2, VisCount } from '@/lib/aeo/v2/types'
import { AEO_MODELS, type AEOModel } from '@/lib/peec/models'
import { roundForUnit } from './delta'

export function visPct(c: VisCount | undefined): number | null {
  return c && c.answers > 0 ? (c.mentions / c.answers) * 100 : null
}

export type MatrixCell = { value: number | null; delta: number | null }

type Sums = Record<string, Record<string, VisCount>>

const keep = (cell: TopicCell, models: AEOModel[] | null) => models === null || models.includes(cell.model)

/** Sums the selected models' cells per topic and brand, and each topic's answers (per model, the largest answers over brands). */
function sumCells(cells: TopicCell[], models: AEOModel[] | null) {
  const brandSums: Sums = {}
  const topicModelAnswers: Record<string, Partial<Record<AEOModel, number>>> = {}
  for (const cell of cells) {
    if (!keep(cell, models)) continue
    const b = ((brandSums[cell.topic] ??= {})[cell.brand] ??= { mentions: 0, answers: 0 })
    b.mentions += cell.mentions
    b.answers += cell.answers
    const t = (topicModelAnswers[cell.topic] ??= {})
    t[cell.model] = Math.max(t[cell.model] ?? 0, cell.answers)
  }
  const topicAnswers: Record<string, number> = {}
  for (const [topic, byModel] of Object.entries(topicModelAnswers)) {
    topicAnswers[topic] = Object.values(byModel).reduce((s, n) => s + (n ?? 0), 0)
  }
  return { brandSums, topicAnswers }
}

function brandValue(s: ReturnType<typeof sumCells>, topic: string, brand: string): number | null {
  if (!(s.topicAnswers[topic] > 0)) return null
  return visPct(s.brandSums[topic]?.[brand]) ?? 0
}

function diff(value: number | null, prior: number | null): number | null {
  return value != null && prior != null ? value - prior : null
}

export function topicMatrix(
  data: TopicsPromptsV2,
  models: AEOModel[] | null,
): {
  topics: string[]
  byBrand: Record<string, Record<string, MatrixCell>>
  byModel: Record<string, Partial<Record<AEOModel, MatrixCell>>>
  modelsPresent: AEOModel[]
} {
  const cur = sumCells(data.cells, models)
  const pri = sumCells(data.cellsPrior, models)
  const brands = new Set<string>()
  const present = new Set<AEOModel>()
  for (const cell of data.cells) {
    if (!keep(cell, models)) continue
    brands.add(cell.brand)
    present.add(cell.model)
  }
  const modelsPresent = AEO_MODELS.filter((m) => present.has(m))

  const byBrand: Record<string, Record<string, MatrixCell>> = {}
  for (const topic of Object.keys(cur.topicAnswers)) {
    if (!(cur.topicAnswers[topic] > 0)) continue
    const row: Record<string, MatrixCell> = {}
    for (const brand of brands) {
      const value = brandValue(cur, topic, brand)
      row[brand] = { value, delta: diff(value, brandValue(pri, topic, brand)) }
    }
    byBrand[topic] = row
  }

  const you = data.you
  if (you === null) return { topics: [], byBrand, byModel: {}, modelsPresent }

  const clientValue = (topic: string) => byBrand[topic]?.[you]?.value ?? null
  const topics = Object.keys(byBrand)
    .filter((t) => (cur.brandSums[t]?.[you]?.answers ?? 0) > 0)
    .sort((a, b) => (clientValue(b) ?? 0) - (clientValue(a) ?? 0) || a.localeCompare(b))

  const priorByKey = new Map<string, TopicCell>()
  for (const cell of data.cellsPrior) if (cell.brand === you) priorByKey.set(`${cell.topic}\0${cell.model}`, cell)
  const byModel: Record<string, Partial<Record<AEOModel, MatrixCell>>> = {}
  for (const cell of data.cells) {
    if (cell.brand !== you || !keep(cell, models)) continue
    const value = visPct(cell)
    const prior = visPct(priorByKey.get(`${cell.topic}\0${cell.model}`))
    ;(byModel[cell.topic] ??= {})[cell.model] = { value, delta: diff(value, prior) }
  }
  return { topics, byBrand, byModel, modelsPresent }
}

export type PromptPerfRow = {
  id: string
  text: string
  topic: string
  rank: number | null
  priorRank: number | null
  rankDelta: number | null
  isNew: boolean
  visibility: number
  visibilityPrior: number | null
  visibilityDelta: number | null
}

function sumStats(stats: Partial<Record<AEOModel, PromptModelStat>>, models: AEOModel[] | null): PromptModelStat {
  const t: PromptModelStat = { mentions: 0, answers: 0, posSum: 0, posCount: 0 }
  for (const m of AEO_MODELS) {
    if (models !== null && !models.includes(m)) continue
    const s = stats[m]
    if (!s) continue
    t.mentions += s.mentions
    t.answers += s.answers
    t.posSum += s.posSum
    t.posCount += s.posCount
  }
  return t
}

const rankOf = (s: PromptModelStat) => (s.posCount > 0 ? s.posSum / s.posCount : null)

export function promptPerformanceRows(prompts: PromptV2[], models: AEOModel[] | null): PromptPerfRow[] {
  const rows: PromptPerfRow[] = []
  for (const p of prompts) {
    const cur = sumStats(p.current, models)
    if (cur.answers === 0) continue
    const prior = p.prior === null ? null : sumStats(p.prior, models)
    const rank = rankOf(cur)
    const priorRank = prior ? rankOf(prior) : null
    const visibility = (cur.mentions / cur.answers) * 100
    const visibilityPrior = prior ? visPct(prior) : null
    rows.push({
      id: p.id,
      text: p.text,
      topic: p.topic,
      rank,
      priorRank,
      rankDelta: rank != null && priorRank != null ? priorRank - rank : null,
      isNew: p.prior === null,
      visibility,
      visibilityPrior,
      visibilityDelta: visibilityPrior != null ? visibility - visibilityPrior : null,
    })
  }
  return rows
}

export function promptChange(r: PromptPerfRow): 'gained' | 'lost' | 'same' | null {
  if (r.rankDelta == null) return null
  const s = Math.sign(roundForUnit(r.rankDelta, 'places'))
  return s > 0 ? 'gained' : s < 0 ? 'lost' : 'same'
}
