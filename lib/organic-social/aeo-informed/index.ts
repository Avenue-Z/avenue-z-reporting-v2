// lib/organic-social/aeo-informed/index.ts
// AEO Informed Social: rebuilds the client's Peec dashboard views (three tables, four graph series) from Peec's reports API.
// Read only. Not wired to any page or route yet. Every rule here was reproduced against the client's own PDF from live data; what was
// not is listed in `UNVERIFIED` and returned in `meta.unverified`.
import { createPeecReader, type PeecReader } from './peec-read'
import { pullChunks } from './chunks'
import { parseBrandDayRows, parseBrands, parseClassifications, parseSocialChannels, parseSourceTags, parseUrlRows } from './shape'
import { aggregateByUrl } from './urls'
import { buildBrandChannels } from './ownership'
import { buildGapRows, buildSocialsRows, splitSocials, type GapRow, type SocialsRow } from './tables'
import { buildCitationGraph, buildUsedAsSource, FIVE_PLATFORMS, type GraphId, type GraphPoint } from './graphs'
import { assertIsoDate, daysIn, eachDay, previousWindow, type Window } from './windows'
import type { PeecUrlRow } from './types'
import { UNVERIFIED, type UnverifiedId } from './unverified'
import { runGate, AeoGateError, GATE_RULES, type GateMode, type GateReport } from './gate'

export { PDF_COLUMN_MAP } from './column-map'
export { UNVERIFIED, type UnverifiedId } from './unverified'
export { AeoGateError, GATE_RULES, runGate, type GateReport, type GateViolation, type GateMode } from './gate'
export type { SocialsRow, GapRow, GraphPoint, GraphId }
export type { Window } from './windows'

export class AeoPullError extends Error {
  constructor(public label: string, public window: Window | null, public override cause: unknown) {
    const c = cause as Error
    super(`AEO pull "${label}"${window ? ` (${window.start}..${window.end})` : ''} failed: ${c?.name ?? 'Error'}: ${c?.message ?? String(cause)}`)
    this.name = 'AeoPullError'
  }
}
export class PeecSelectorError extends Error {
  constructor(message: string) { super(message); this.name = 'PeecSelectorError' }
}
export class PeecBrandError extends Error {
  constructor(message: string) { super(message); this.name = 'PeecBrandError' }
}

export type AeoInformedInput = {
  apiKey: string
  projectId: string
  /** Last day to count, YYYY-MM-DD, UTC (normally yesterday). A graph bucket after it is dropped; one crossing it is flagged partial. */
  asOf: string
  views: {
    socials: Window
    gaps: Window
    graphs: Record<GraphId, { from: string; weeks: number }>
  }
  selector?: { name: string; via: 'classification' | 'tag' }
  /** Test seam. */
  reader?: PeecReader
  /** Whole-call budget in ms. Default 600000. */
  deadlineMs?: number
  /** 'enforce' (default): a result that fails an error rule of the data gate is not returned (AeoGateError). 'report': always returned, violations in meta.gate. */
  gate?: GateMode
}

export type Meta = {
  /** The as-of date the call was made with. */
  asOf: string
  /** The start date and number of weeks each graph was asked for. */
  graphs: Record<GraphId, { from: string; weeks: number }>
  windows: { socials: Window; socialsPrior: Window; gaps: Window; gapsPrior: Window }
  ownBrandId: string
  ownBrandName: string
  selector: { name: string; via: string; id: string | null }
  chats: { socials: number; socialsPrior: number; gaps: number; gapsPrior: number }
  counts: { socialsAll: number; socialsOwn: number; socialsCompetitor: number; urlGaps: number; selectorRowsByDay: number; gapRowsByDay: number; usedChatRows: number; chatDayRows: number; requests: number }
  warnings: string[]
  unverified: UnverifiedId[]
  /** The data gate's verdict on this result. */
  gate: GateReport
}

export type AeoInformedResult = {
  socialsAll: SocialsRow[]
  socialsOwn: SocialsRow[]
  socialsCompetitor: SocialsRow[]
  urlGaps: GapRow[]
  graphs: GraphPoint[]
  meta: Meta
}

const GRAPH_ORDER: GraphId[] = ['used_as_source_all', 'citations_all', 'citations_linkedin', 'citations_instagram']
const LIST_LIMIT = 1000

const minDate = (...d: string[]) => d.reduce((a, b) => (a < b ? a : b))
const maxDate = (...d: string[]) => d.reduce((a, b) => (a > b ? a : b))
const addDays = (s: string, n: number) => new Date(Date.parse(`${s}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

function validate(i: AeoInformedInput): void {
  assertIsoDate(i.asOf)
  for (const [name, w] of [['socials', i.views.socials], ['gaps', i.views.gaps]] as const) {
    assertIsoDate(w.start); assertIsoDate(w.end); daysIn(w)
    if (w.end > i.asOf) throw new RangeError(`views.${name}.end (${w.end}) is after asOf (${i.asOf})`)
  }
  for (const id of GRAPH_ORDER) {
    const g = i.views.graphs[id]
    if (!g) throw new RangeError(`views.graphs.${id} is missing`)
    assertIsoDate(g.from)
    if (!Number.isInteger(g.weeks) || g.weeks < 1) throw new RangeError(`views.graphs.${id}.weeks must be a whole number of at least 1, got ${g.weeks}`)
  }
}

const rowsIn = (rows: PeecUrlRow[], w: Window) => rows.filter((r) => r.date !== undefined && r.date >= w.start && r.date <= w.end)

export async function getAeoInformedSocial(input: AeoInformedInput): Promise<AeoInformedResult> {
  validate(input)
  const selector = input.selector ?? { name: 'Organic Social', via: 'classification' as const }
  const inner = input.reader ?? createPeecReader({ apiKey: input.apiKey, projectId: input.projectId, deadlineMs: input.deadlineMs })
  let requests = 0
  const reader: PeecReader = {
    get: (p, q, l) => { requests++; return inner.get(p, q, l) },
    post: (p, b, l) => { requests++; return inner.post(p, b, l) },
  }
  const step = async <T>(label: string, w: Window | null, fn: () => Promise<T>): Promise<T> => {
    try { return await fn() } catch (e) {
      if (e instanceof PeecSelectorError || e instanceof PeecBrandError) throw e
      throw new AeoPullError(label, w, e)
    }
  }

  // 1) brands and their registered channels
  const brandsRaw = await step('brands', null, async () => parseBrands(await reader.get('/brands', { limit: String(LIST_LIMIT) }, 'brands')))
  if (brandsRaw.length >= LIST_LIMIT) throw new AeoPullError('brands', null, new Error(`the brands list returned ${LIST_LIMIT} rows, the limit, so it may be cut off`))
  const own = brandsRaw.filter((b) => b.is_own)
  if (own.length !== 1) throw new PeecBrandError(`expected exactly one own brand in the project, found ${own.length}`)
  const channels = await step('social-channels', null, async () => parseSocialChannels(await reader.get('/brands/social-channels', {}, 'social-channels')))
  const brands = buildBrandChannels(brandsRaw, channels)
  const ownBrand = own[0]

  // 2) the Organic Social selector
  let selFilter: Record<string, unknown>
  let selId: string | null = null
  if (selector.via === 'tag') {
    const tags = await step('source-tags', null, async () => parseSourceTags(await reader.get('/source-tags', { limit: String(LIST_LIMIT) }, 'source-tags')))
    if (tags.length >= LIST_LIMIT) throw new AeoPullError('source-tags', null, new Error(`the source tag list returned ${LIST_LIMIT} rows, the limit, so it may be cut off`))
    const t = tags.find((x) => x.name === selector.name)
    if (!t) throw new PeecSelectorError(`no source tag named "${selector.name}". Tags that exist: ${tags.map((x) => x.name).join(', ') || '(none)'}`)
    selId = t.id
    selFilter = { field: 'domain_tag_id', operator: 'in', values: [t.id] }
  } else {
    const cls = await step('domain-classifications', null, async () => parseClassifications(await reader.get('/classifications/domains', { limit: String(LIST_LIMIT) }, 'domain-classifications'), '/classifications/domains'))
    if (cls.length >= LIST_LIMIT) throw new AeoPullError('domain-classifications', null, new Error(`the classification list returned ${LIST_LIMIT} rows, the limit, so it may be cut off`))
    if (!cls.some((x) => x.name === selector.name)) throw new PeecSelectorError(`no domain classification named "${selector.name}". Classifications that exist: ${cls.map((x) => x.name).join(', ') || '(none)'}`)
    selFilter = { field: 'domain_classification', operator: 'in', values: [selector.name] }
  }

  // 3) windows. Counts add across days, so one by-day span serves every window that needs it.
  const { socials, gaps, graphs } = input.views
  const socialsPrior = previousWindow(socials)
  const gapsPrior = previousWindow(gaps)
  const graphWin = (id: GraphId): Window => ({ start: graphs[id].from, end: minDate(addDays(graphs[id].from, graphs[id].weeks * 7 - 1), input.asOf) })
  const citationIds: GraphId[] = ['citations_all', 'citations_linkedin', 'citations_instagram']
  const citWins = citationIds.map(graphWin).filter((w) => w.start <= w.end)
  const selSpan: Window = {
    start: minDate(socialsPrior.start, ...citWins.map((w) => w.start)),
    end: maxDate(socials.end, ...citWins.map((w) => w.end)),
  }
  const gapSpan: Window = { start: gapsPrior.start, end: gaps.end }
  const usedWin = graphWin('used_as_source_all')

  // 4) pulls, one at a time
  const selRows = await step('socials-by-day', selSpan, () =>
    pullChunks(reader, '/reports/urls', { dimensions: ['date'], filters: [selFilter] }, selSpan, (b, p) => parseUrlRows(b, p, { requireDate: true }), 'socials-by-day'))
  // Peec evaluates `gap` per (url, day) row, so a URL that is a gap on only some days contributes only those days. That is why the item count can differ
  // from a URL-level reading (see url_gaps_item_count in UNVERIFIED).
  const gapRows = await step('gaps-by-day', gapSpan, () =>
    pullChunks(reader, '/reports/urls', { dimensions: ['date'], filters: [selFilter, { field: 'gap', operator: 'gte', value: 1 }] }, gapSpan, (b, p) => parseUrlRows(b, p, { requireDate: true }), 'gaps-by-day'))
  const chatRows = usedWin.start <= usedWin.end
    ? await step('used-chat-level', usedWin, () =>
        pullChunks(reader, '/reports/urls', { dimensions: ['date', 'chat_id'], filters: [selFilter] }, usedWin, (b, p) => parseUrlRows(b, p, { requireDate: true, requireChat: true }), 'used-chat-level', { chunkDays: 14 }))
    : []
  const chatSpan: Window = {
    start: minDate(socialsPrior.start, gapsPrior.start, ...citWins.map((w) => w.start), usedWin.start),
    end: maxDate(socials.end, gaps.end, ...citWins.map((w) => w.end), usedWin.end),
  }
  const dayRows = await step('chats-by-day', chatSpan, () =>
    pullChunks(reader, '/reports/brands', { dimensions: ['date'], filters: [{ field: 'brand_id', operator: 'in', values: [ownBrand.id] }] }, chatSpan, (b) => parseBrandDayRows(b), 'chats-by-day'))
  const chatsByDay = new Map<string, number>()
  for (const r of dayRows) chatsByDay.set(r.date, (chatsByDay.get(r.date) ?? 0) + r.visibility_total)
  const chatsIn = (w: Window) => eachDay(w).reduce((s, d) => s + (chatsByDay.get(d) ?? 0), 0)

  // 5) build
  const warnings: string[] = []
  const chats = { socials: chatsIn(socials), socialsPrior: chatsIn(socialsPrior), gaps: chatsIn(gaps), gapsPrior: chatsIn(gapsPrior) }
  for (const [k, v] of Object.entries(chats)) if (v === 0) warnings.push(`no chats in window: ${k}`)
  const windowsByName: [string, Window][] = [['socials', socials], ['socialsPrior', socialsPrior], ['gaps', gaps], ['gapsPrior', gapsPrior]]
  if (usedWin.start <= usedWin.end) windowsByName.push(['usedAsSource', usedWin])
  for (const [k, w] of windowsByName) {
    const missing = eachDay(w).filter((d) => !chatsByDay.has(d)).length
    if (missing > 0) warnings.push(`days with no chats data in window: ${k} (${missing})`)
  }

  const socialsAll = buildSocialsRows({
    current: aggregateByUrl(rowsIn(selRows, socials)), prior: aggregateByUrl(rowsIn(selRows, socialsPrior)),
    chatsCurrent: chats.socials, chatsPrior: chats.socialsPrior, brands, domainType: selector.name,
  })
  const split = splitSocials(socialsAll, ownBrand.id)
  const gapCurrent = aggregateByUrl(rowsIn(gapRows, gaps))
  if (gapCurrent.length === 0) warnings.push('gap view is empty for the gaps window')
  const urlGaps = buildGapRows({ current: gapCurrent, prior: aggregateByUrl(rowsIn(gapRows, gapsPrior)), brands, domainType: selector.name })

  const common = (id: GraphId) => ({ brands, ownBrandId: ownBrand.id, ownBrandName: ownBrand.name, from: graphs[id].from, weeks: graphs[id].weeks, asOf: input.asOf })
  const graphPoints: GraphPoint[] = [
    ...buildUsedAsSource({ ...common('used_as_source_all'), rows: chatRows, chatsByDay }),
    ...buildCitationGraph({ ...common('citations_all'), graphId: 'citations_all', platforms: FIVE_PLATFORMS, rows: selRows }),
    ...buildCitationGraph({ ...common('citations_linkedin'), graphId: 'citations_linkedin', platforms: ['linkedin'], rows: selRows }),
    ...buildCitationGraph({ ...common('citations_instagram'), graphId: 'citations_instagram', platforms: ['instagram'], rows: selRows }),
  ]

  const draft = {
    socialsAll,
    socialsOwn: split.own,
    socialsCompetitor: split.competitor,
    urlGaps,
    graphs: graphPoints,
    meta: {
      asOf: input.asOf,
      graphs,
      windows: { socials, socialsPrior, gaps, gapsPrior },
      ownBrandId: ownBrand.id,
      ownBrandName: ownBrand.name,
      selector: { name: selector.name, via: selector.via, id: selId },
      chats,
      counts: { socialsAll: socialsAll.length, socialsOwn: split.own.length, socialsCompetitor: split.competitor.length, urlGaps: urlGaps.length, selectorRowsByDay: selRows.length, gapRowsByDay: gapRows.length, usedChatRows: chatRows.length, chatDayRows: dayRows.length, requests },
      warnings,
      unverified: [...UNVERIFIED],
    },
  }

  // 6) the data gate: nothing leaves this function without passing it (unless the caller asked only to be told)
  const mode: GateMode = input.gate ?? 'enforce'
  const violations = runGate(draft)
  const report: GateReport = {
    mode,
    rulesChecked: GATE_RULES.length,
    errors: violations.filter((v) => v.severity === 'error'),
    warnings: violations.filter((v) => v.severity === 'warning'),
  }
  if (mode === 'enforce' && report.errors.length > 0) throw new AeoGateError(report)
  return { ...draft, meta: { ...draft.meta, gate: report } }
}
