// AEO Overview v2, section 04 (Peec): per-(topic, brand, model) visibility counts for the matrix and the client brand's
// per-prompt stats for Prompt Performance, for the current and comparison windows. Unlike v1's single 5,000-row page
// (223 of Renaissance's 300 prompt x model cells), this pages through every row. Topic = peecPromptTopic, the one rule v1 uses.
import { cached } from '@/lib/cache'
import { parseDateRange, deriveCompareRange } from '@/lib/ga4/client'
import { resolveYou } from '@/lib/aeo/v2/you'
import type { AEOModel } from './models'
import type { CompareMode, PromptModelStat, PromptV2, TopicCell, TopicsPromptsV2 } from '@/lib/aeo/v2/types'
import { fetchAllRows, normalizeSource, peecGet, peecPromptTopic, type ApiBrandRow } from './client'
import { getPeecRoster } from './roster'

const MAX_ROWS = 50_000
const PAGE_SIZE = 5_000

type PromptIn = { id: string; messages?: { content?: string }[]; tags?: { id: string }[] }

const modelOf = (r: ApiBrandRow): AEOModel | null => normalizeSource(r.model?.id ?? r.model_channel?.id ?? '')
const promptIdOf = (r: ApiBrandRow): string | null => (r.prompt?.id != null ? String(r.prompt.id) : r.prompt_id != null ? String(r.prompt_id) : null)

function sumCells(rows: ApiBrandRow[], topicOf: Map<string, string>): TopicCell[] {
  const cells = new Map<string, TopicCell>()
  for (const r of rows) {
    const model = modelOf(r)
    const id = promptIdOf(r)
    const topic = id ? topicOf.get(id) : undefined
    if (!model || !topic) continue
    const key = `${topic}\u0000${r.brand.name}\u0000${model}`
    const c = cells.get(key)
    if (c) { c.mentions += r.visibility_count; c.answers += r.visibility_total }
    else cells.set(key, { topic, brand: r.brand.name, model, mentions: r.visibility_count, answers: r.visibility_total })
  }
  return Array.from(cells.values())
}

/** The client brand's stats per prompt and model. */
function youStats(rows: ApiBrandRow[], you: string | null): Map<string, Partial<Record<AEOModel, PromptModelStat>>> {
  const out = new Map<string, Partial<Record<AEOModel, PromptModelStat>>>()
  if (you === null) return out
  for (const r of rows) {
    if (r.brand.name !== you) continue
    const model = modelOf(r)
    const id = promptIdOf(r)
    if (!model || !id) continue
    const byModel = out.get(id) ?? {}
    const s = byModel[model]
    if (s) { s.mentions += r.visibility_count; s.answers += r.visibility_total; s.posSum += r.position_sum; s.posCount += r.position_count }
    else byModel[model] = { mentions: r.visibility_count, answers: r.visibility_total, posSum: r.position_sum, posCount: r.position_count }
    out.set(id, byModel)
  }
  return out
}

export function buildPeecTopicsPrompts(input: {
  prompts: PromptIn[]
  tags: { id: string; name: string }[]
  rows: ApiBrandRow[]
  rowsPrior: ApiBrandRow[]
  yourBrand: string
  /** Peec roster own flags by brand name; only breaks ties or decides when no brand name is configured. */
  ownByName?: ReadonlyMap<string, boolean>
}): TopicsPromptsV2 {
  const tagNameById = new Map(input.tags.map((t) => [t.id, t.name]))
  const meta = new Map<string, { text: string; topic: string }>()
  for (const p of input.prompts) {
    const text = (p.messages ?? []).map((m) => m.content).filter(Boolean).join(' ').trim() || '(untitled prompt)'
    meta.set(p.id, { text, topic: peecPromptTopic(p.tags, text, tagNameById).group })
  }
  const topicOf = new Map(Array.from(meta.entries()).map(([id, m]) => [id, m.topic]))

  const brands = Array.from(new Set(input.rows.map((r) => r.brand.name)))
  const you = resolveYou(brands.map((name) => ({ name, isOwn: input.ownByName?.get(name) ?? false })), input.yourBrand)

  const current = youStats(input.rows, you)
  const prior = youStats(input.rowsPrior, you)
  const priorPromptIds = new Set(input.rowsPrior.map(promptIdOf))
  const prompts: PromptV2[] = []
  for (const [id, m] of meta) {
    const cur = current.get(id)
    if (!cur) continue
    prompts.push({ id, text: m.text, topic: m.topic, current: cur, prior: priorPromptIds.has(id) ? (prior.get(id) ?? {}) : null })
  }
  return { you, cells: sumCells(input.rows, topicOf), cellsPrior: sumCells(input.rowsPrior, topicOf), prompts }
}

async function getPeecTopicsPromptsV2Impl(clientSlug: string, dateRange: string, compareMode: CompareMode): Promise<TopicsPromptsV2> {
  const { getClientBySlug } = await import('@/lib/db/queries')
  const config = await getClientBySlug(clientSlug)
  const pid = config?.peecCustomerProjectId
  if (!pid) throw new Error(`[peec] no Peec project configured for ${clientSlug}`)
  const yourBrand = config?.peecYourBrand ?? ''

  const mainDates = parseDateRange(dateRange)
  const compareDates = deriveCompareRange(dateRange, compareMode) ?? mainDates
  const current = { start_date: mainDates.startDate, end_date: mainDates.endDate }
  const prior = { start_date: compareDates.startDate, end_date: compareDates.endDate }
  const dimensions = ['prompt_id', 'model_channel_id', 'model_id']

  const [roster, promptsRes, tagsRes, rows, rowsPrior] = await Promise.all([
    getPeecRoster(pid),
    peecGet<{ data: PromptIn[] }>('/prompts', { limit: '1000' }, pid),
    peecGet<{ data: { id: string; name: string }[] }>('/tags', { limit: '500' }, pid),
    fetchAllRows({ ...current, dimensions }, pid, MAX_ROWS, PAGE_SIZE),
    fetchAllRows({ ...prior, dimensions }, pid, MAX_ROWS, PAGE_SIZE),
  ])
  if (rows.length >= MAX_ROWS || rowsPrior.length >= MAX_ROWS) console.warn(`[peec] topics rows hit ${MAX_ROWS} for ${clientSlug}; figures may be partial`)
  return buildPeecTopicsPrompts({
    prompts: promptsRes.data ?? [],
    tags: tagsRes.data ?? [],
    rows,
    rowsPrior,
    yourBrand,
    ownByName: new Map(roster.map((b) => [b.name, b.isOwn])),
  })
}

export const getPeecTopicsPromptsV2 = cached('peec', 'getTopicsPromptsV2', getPeecTopicsPromptsV2Impl, {
  version: 'v1',
  healthCritical: false,
  extractTags: ([clientSlug]) => ({ client: clientSlug }),
})
