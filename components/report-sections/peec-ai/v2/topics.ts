import type { PromptModelStat, PromptV2, TopicAnswers, TopicCell, TopicsPromptsV2, VisCount } from '@/lib/aeo/v2/types'
import { AEO_MODELS, type AEOModel } from '@/lib/peec/models'
import { roundForUnit } from './delta'

export function visPct(c: VisCount | undefined): number | null {
  return c && c.answers > 0 ? (c.mentions / c.answers) * 100 : null
}

export type MatrixCell = { value: number | null; delta: number | null }

/** Topic and brand names are vendor data, so every record keyed by one is a Map (a topic named `__proto__` is just a key). */
export type TopicMatrixData = {
  topics: string[]
  /** Topic -> brand -> cell. */
  byBrand: Map<string, Map<string, MatrixCell>>
  /** Topic -> the client's cell per model. */
  byModel: Map<string, Partial<Record<AEOModel, MatrixCell>>>
  modelsPresent: AEOModel[]
}

const selected = (model: AEOModel, models: AEOModel[] | null) => models === null || models.includes(model)

function getOrSet<K, V>(map: Map<K, V>, key: K, make: () => V): V {
  let v = map.get(key)
  if (v === undefined) map.set(key, (v = make()))
  return v
}

const sum = (m: Map<AEOModel, number> | undefined) => (m ? Array.from(m.values()).reduce((s, n) => s + n, 0) : 0)

/** One window over the selected models: topic -> model -> all answers, and topic -> brand -> model -> mentions. */
type Window = { answers: Map<string, Map<AEOModel, number>>; mentions: Map<string, Map<string, Map<AEOModel, number>>> }

function windowOf(cells: TopicCell[], totals: TopicAnswers[], models: AEOModel[] | null): Window {
  const answers: Window['answers'] = new Map()
  for (const t of totals) {
    if (!selected(t.model, models)) continue
    const byModel = getOrSet(answers, t.topic, () => new Map<AEOModel, number>())
    byModel.set(t.model, (byModel.get(t.model) ?? 0) + t.answers)
  }
  const mentions: Window['mentions'] = new Map()
  for (const c of cells) {
    if (!selected(c.model, models)) continue
    const byModel = getOrSet(getOrSet(mentions, c.topic, () => new Map<string, Map<AEOModel, number>>()), c.brand, () => new Map<AEOModel, number>())
    byModel.set(c.model, (byModel.get(c.model) ?? 0) + c.mentions)
  }
  return { answers, mentions }
}

/** Mentions out of all answers, in percent: 0 when there were answers and no mention, null when there were no answers. */
const share = (mentions: number, answers: number) => (answers > 0 ? (mentions / answers) * 100 : null)

/** A brand's visibility on a topic: its mentions over the selected models out of the topic's answers on those models. */
const topicValue = (w: Window, topic: string, brand: string) => share(sum(w.mentions.get(topic)?.get(brand)), sum(w.answers.get(topic)))

const modelValue = (w: Window, topic: string, brand: string, model: AEOModel) =>
  share(w.mentions.get(topic)?.get(brand)?.get(model) ?? 0, w.answers.get(topic)?.get(model) ?? 0)

function diff(value: number | null, prior: number | null): number | null {
  return value != null && prior != null ? value - prior : null
}

/**
 * The section 04 matrix over the selected models. Every cell divides a brand's mentions by the topic's total answers
 * (`topicAnswers`), never by the answers on the brand's own cells, which a provider omits when the brand had no mention.
 * Rows are every topic with answers, sorted by the client's value (desc), then name. `you` defaults to the data's client.
 */
export function topicMatrix(data: TopicsPromptsV2, models: AEOModel[] | null, you: string | null = data.you): TopicMatrixData {
  const cur = windowOf(data.cells, data.topicAnswers, models)
  const pri = windowOf(data.cellsPrior, data.topicAnswersPrior, models)
  const present = new Set<AEOModel>()
  for (const byModel of cur.answers.values()) for (const [model, n] of byModel) if (n > 0) present.add(model)
  const modelsPresent = AEO_MODELS.filter((m) => present.has(m))
  if (you === null) return { topics: [], byBrand: new Map(), byModel: new Map(), modelsPresent }

  const brands = new Set<string>([you])
  for (const c of data.cells) if (selected(c.model, models)) brands.add(c.brand)

  const byBrand: TopicMatrixData['byBrand'] = new Map()
  const byModel: TopicMatrixData['byModel'] = new Map()
  for (const [topic, answers] of cur.answers) {
    if (!(sum(answers) > 0)) continue
    const row = new Map<string, MatrixCell>()
    for (const brand of brands) {
      const value = topicValue(cur, topic, brand)
      row.set(brand, { value, delta: diff(value, topicValue(pri, topic, brand)) })
    }
    byBrand.set(topic, row)
    const perModel: Partial<Record<AEOModel, MatrixCell>> = {}
    for (const model of modelsPresent) {
      const value = modelValue(cur, topic, you, model)
      perModel[model] = { value, delta: diff(value, modelValue(pri, topic, you, model)) }
    }
    byModel.set(topic, perModel)
  }

  const clientValue = (topic: string) => byBrand.get(topic)?.get(you)?.value ?? 0
  const topics = Array.from(byBrand.keys()).sort((a, b) => clientValue(b) - clientValue(a) || a.localeCompare(b))
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
