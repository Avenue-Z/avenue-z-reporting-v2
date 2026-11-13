// lib/organic-social/aeo-informed/index.ts
// AEO Informed Social: rebuilds the client's Peec dashboard views (three tables, four graph series) from Peec's reports API.
// Read only. Not wired to any page or route yet. Every rule here was reproduced against the client's own PDF from live data; what was
// not is listed in `UNVERIFIED` and returned in `meta.unverified`.
import { createPeecReader, type PeecReader } from './peec-read'
import { pullChunks, pullWindow } from './chunks'
import { parseBrandDayRows, parseBrands, parseClassifications, parseSocialChannels, parseSourceTags, parseUrlRows } from './shape'
import { aggregateByUrl } from './urls'
import { buildBrandChannels, ownerOf } from './ownership'
import { buildGapRows, buildSocialsRows, buildTotals, splitSocials, type AeoTotals, type GapRow, type SocialsRow } from './tables'
import { buildCitationGraph, buildUsedAsSource, CITATION_PLATFORMS, FOURTH_GRAPHS, graphOrder, type FourthGraph, type GraphId, type GraphPoint } from './graphs'
import { assertIsoDate, daysIn, eachDay, previousWindow, type Window } from './windows'
import type { PeecUrlRow } from './types'
import { UNVERIFIED, type UnverifiedId } from './unverified'
import { runGate, AeoGateError, GATE_RULES, type GateInput, type GateRaw, type GateReport } from './gate'

export { PDF_COLUMN_MAP } from './column-map'
export { UNVERIFIED, type UnverifiedId } from './unverified'
export { AeoGateError, GATE_RULES, type GateReport, type GateViolation } from './gate'
export type { SocialsRow, GapRow, GraphPoint, GraphId, AeoTotals, FourthGraph }
export { graphOrder, FOURTH_GRAPHS } from './graphs'
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
    /** Exactly the four graphs drawn: graphOrder(fourthGraph). */
    graphs: Partial<Record<GraphId, { from: string; weeks: number }>>
  }
  /** URL Gaps keeps rows mentioned by at least this many competitor brands (Peec's gap filter, gte). A whole number 1 to 5. Default 1. */
  minCompetitors?: number
  /** The fourth graph. Default 'instagram'. */
  fourthGraph?: FourthGraph
  selector?: { name: string; via: 'classification' | 'tag' }
  /** Test seam. */
  reader?: PeecReader
  /** Whole-call budget in ms. Default 600000. */
  deadlineMs?: number
  /** The clock, for the as-of check (a result must not count an unfinished day). Default: the real clock. */
  now?: () => number
  /** Pull and compare the previous window of the same length (the change values and totals.prior). Default true. False pulls nothing
   *  before the windows and returns every change, previous window, previous chat count and totals.prior as null: for a view that shows
   *  no change (the tab's YTD and All time, issue 451). */
  compare?: boolean
}

export type Meta = {
  /** The as-of date the call was made with. */
  asOf: string
  /** The start date and number of weeks each graph was asked for. */
  graphs: Partial<Record<GraphId, { from: string; weeks: number }>>
  /** The URL Gaps min competitors the call was made with. */
  minCompetitors: number
  /** The fourth graph drawn. */
  fourthGraph: FourthGraph
  /** When the pull finished (ISO time, from input.now): stored with the result, never shown (spec 2026-11-13). */
  pulledAt: string
  /** Whether the previous windows were pulled and compared (input.compare). */
  compare: boolean
  /** The previous windows are null exactly when compare is false. */
  windows: { socials: Window; socialsPrior: Window | null; gaps: Window; gapsPrior: Window | null }
  ownBrandId: string
  ownBrandName: string
  /** Every brand in the project with Peec's display color (null when it has none), for the Mentions dots. */
  brands: { id: string; name: string; color: string | null; isOwn: boolean }[]
  selector: { name: string; via: string; id: string | null }
  /** The previous windows' chats are null exactly when compare is false. */
  chats: { socials: number; socialsPrior: number | null; gaps: number; gapsPrior: number | null }
  counts: { socialsAll: number; socialsOwn: number; socialsCompetitor: number; urlGaps: number; selectorRowsByDay: number; gapRows: number; usedChatRows: number; chatDayRows: number; requests: number }
  warnings: string[]
  unverified: UnverifiedId[]
  /** The data gate's verdict on this result. A returned result has no errors; warnings are passed on. */
  gate: GateReport
}

export type AeoInformedResult = {
  socialsAll: SocialsRow[]
  socialsOwn: SocialsRow[]
  socialsCompetitor: SocialsRow[]
  urlGaps: GapRow[]
  graphs: GraphPoint[]
  /** The tiles before the tables: totals over socialsOwn, with the previous window's (team feedback 2026-11-12). */
  totals: AeoTotals
  meta: Meta
}

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
  // Only an absent value takes the default: null is a mistake, not a choice.
  const min = i.minCompetitors === undefined ? 1 : i.minCompetitors
  if (typeof min !== 'number' || !Number.isInteger(min) || min < 1 || min > 5) throw new RangeError(`minCompetitors must be a whole number from 1 to 5, got ${String(min)}`)
  if (i.compare !== undefined && typeof i.compare !== 'boolean') throw new RangeError(`compare must be true or false, got ${String(i.compare)}`)
  const fourth = i.fourthGraph === undefined ? 'instagram' : i.fourthGraph
  if (!FOURTH_GRAPHS.includes(fourth)) throw new RangeError(`fourthGraph must be one of ${FOURTH_GRAPHS.join(', ')}, got ${String(fourth)}`)
  const drawn = graphOrder(fourth)
  for (const id of drawn) if (!i.views.graphs[id]) throw new RangeError(`views.graphs.${id} is missing`)
  for (const id of Object.keys(i.views.graphs)) if (!drawn.includes(id as GraphId)) throw new RangeError(`views.graphs.${id} is not drawn (the graphs are ${drawn.join(', ')})`)
  for (const id of drawn) {
    const g = i.views.graphs[id]!
    assertIsoDate(g.from)
    if (!Number.isInteger(g.weeks) || g.weeks < 1) throw new RangeError(`views.graphs.${id}.weeks must be a whole number of at least 1, got ${g.weeks}`)
  }
}

const rowsIn = (rows: PeecUrlRow[], w: Window) => rows.filter((r) => r.date !== undefined && r.date >= w.start && r.date <= w.end)

/**
 * Pulls and builds everything, and returns it with the raw rows it was built from, UNGATED. Not for views: use getAeoInformedSocial.
 * It exists so the gate can be run, and tested, against the raw rows (inspect.ts).
 */
export async function buildAeoInformed(input: AeoInformedInput): Promise<{ draft: GateInput; raw: GateRaw }> {
  validate(input)
  // validate() refused anything but undefined or a valid value
  const minCompetitors = input.minCompetitors ?? 1
  const fourthGraph = input.fourthGraph ?? 'instagram'
  const order = graphOrder(fourthGraph)
  const selector = input.selector ?? { name: 'Organic Social', via: 'classification' as const }
  const compare = input.compare ?? true
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
    // Exactly one: the tag is what Jasmine applies in Peec (spec 2026-11-13), so a second tag with the name is refused, never silently
    // picked. No tag keeps today's message, which lists the tags that exist.
    const matches = tags.filter((x) => x.name === selector.name)
    if (matches.length === 0) throw new PeecSelectorError(`no source tag named "${selector.name}". Tags that exist: ${tags.map((x) => x.name).join(', ') || '(none)'}`)
    if (matches.length > 1) throw new PeecSelectorError(`expected exactly one source tag named "${selector.name}", found ${matches.length}`)
    const t = matches[0]
    selId = t.id
    selFilter = { field: 'domain_tag_id', operator: 'in', values: [t.id] }
  } else {
    const cls = await step('domain-classifications', null, async () => parseClassifications(await reader.get('/classifications/domains', { limit: String(LIST_LIMIT) }, 'domain-classifications'), '/classifications/domains'))
    if (cls.length >= LIST_LIMIT) throw new AeoPullError('domain-classifications', null, new Error(`the classification list returned ${LIST_LIMIT} rows, the limit, so it may be cut off`))
    if (!cls.some((x) => x.name === selector.name)) throw new PeecSelectorError(`no domain classification named "${selector.name}". Classifications that exist: ${cls.map((x) => x.name).join(', ') || '(none)'}`)
    selFilter = { field: 'domain_classification', operator: 'in', values: [selector.name] }
  }

  // 3) windows. Counts add across days, so one by-day span serves every window that needs it.
  const { socials, gaps } = input.views
  // validate() proved every drawn id is present
  const graphs = input.views.graphs as Record<GraphId, { from: string; weeks: number }>
  // No previous window when nothing is compared (issue 451): nothing before the windows is pulled.
  const socialsPrior = compare ? previousWindow(socials) : null
  const gapsPrior = compare ? previousWindow(gaps) : null
  const priorStarts = [socialsPrior, gapsPrior].flatMap((w) => (w ? [w.start] : []))
  const graphWin = (id: GraphId): Window => ({ start: graphs[id].from, end: minDate(addDays(graphs[id].from, graphs[id].weeks * 7 - 1), input.asOf) })
  const citationIds = order.filter((id): id is Exclude<GraphId, 'used_as_source_all'> => id !== 'used_as_source_all')
  const citWins = citationIds.map(graphWin).filter((w) => w.start <= w.end)
  const selSpan: Window = {
    start: minDate(socials.start, ...(socialsPrior ? [socialsPrior.start] : []), ...citWins.map((w) => w.start)),
    end: maxDate(socials.end, ...citWins.map((w) => w.end)),
  }
  const usedWin = graphWin('used_as_source_all')

  // 4) pulls, one at a time
  const selRows = await step('socials-by-day', selSpan, () =>
    pullChunks(reader, '/reports/urls', { dimensions: ['date'], filters: [selFilter] }, selSpan, (b, p) => parseUrlRows(b, p, { requireDate: true }), 'socials-by-day'))
  // The outline's URL gaps table lists Peec's own rows, and Peec returns a URL as several rows when different competitors cite it (445 rows for 410 URLs on the September check, against
  // the outline's 442). A by-day pull splits rows by day and merging by URL loses the split, so each window is one request with no date dimension and the table keeps the rows as returned.
  // A previous-window URL that is not a gap in that window has no prior row and its change is empty.
  const gapFilters = [selFilter, { field: 'gap', operator: 'gte', value: minCompetitors }]
  const gapCurrentRows = await step('gaps-current', gaps, () => pullWindow(reader, '/reports/urls', { filters: gapFilters }, gaps, (b, p) => parseUrlRows(b, p), 'gaps-current'))
  const gapPriorRows = gapsPrior
    ? await step('gaps-prior', gapsPrior, () => pullWindow(reader, '/reports/urls', { filters: gapFilters }, gapsPrior, (b, p) => parseUrlRows(b, p), 'gaps-prior'))
    : []
  const chatRows = usedWin.start <= usedWin.end
    ? await step('used-chat-level', usedWin, () =>
        pullChunks(reader, '/reports/urls', { dimensions: ['date', 'chat_id'], filters: [selFilter] }, usedWin, (b, p) => parseUrlRows(b, p, { requireDate: true, requireChat: true }), 'used-chat-level', { chunkDays: 14 }))
    : []
  const chatSpan: Window = {
    start: minDate(socials.start, gaps.start, ...priorStarts, ...citWins.map((w) => w.start), usedWin.start),
    end: maxDate(socials.end, gaps.end, ...citWins.map((w) => w.end), usedWin.end),
  }
  const dayRows = await step('chats-by-day', chatSpan, () =>
    pullChunks(reader, '/reports/brands', { dimensions: ['date'], filters: [{ field: 'brand_id', operator: 'in', values: [ownBrand.id] }] }, chatSpan, (b) => parseBrandDayRows(b), 'chats-by-day'))
  const chatsByDay = new Map<string, number>()
  for (const r of dayRows) chatsByDay.set(r.date, (chatsByDay.get(r.date) ?? 0) + r.visibility_total)
  const chatsIn = (w: Window) => eachDay(w).reduce((s, d) => s + (chatsByDay.get(d) ?? 0), 0)

  // 5) build. One clock for when the pull finished: meta.pulledAt and the gate's raw.today (spec 2026-11-13).
  const pulledAt = new Date((input.now ?? Date.now)()).toISOString()
  const warnings: string[] = []
  const chats = { socials: chatsIn(socials), socialsPrior: socialsPrior ? chatsIn(socialsPrior) : null, gaps: chatsIn(gaps), gapsPrior: gapsPrior ? chatsIn(gapsPrior) : null }
  for (const [k, v] of Object.entries(chats)) if (v === 0) warnings.push(`no chats in window: ${k}`)
  const windowsByName = ([['socials', socials], ['socialsPrior', socialsPrior], ['gaps', gaps], ['gapsPrior', gapsPrior]] as [string, Window | null][])
    .filter((e): e is [string, Window] => e[1] !== null)
  if (usedWin.start <= usedWin.end) windowsByName.push(['usedAsSource', usedWin])
  for (const [k, w] of windowsByName) {
    const missing = eachDay(w).filter((d) => !chatsByDay.has(d)).length
    if (missing > 0) warnings.push(`days with no chats data in window: ${k} (${missing})`)
  }

  const socialsPriorAgg = socialsPrior ? aggregateByUrl(rowsIn(selRows, socialsPrior)) : []
  const socialsAll = buildSocialsRows({
    current: aggregateByUrl(rowsIn(selRows, socials)), prior: socialsPriorAgg,
    chatsCurrent: chats.socials, chatsPrior: chats.socialsPrior ?? 0, brands, domainType: selector.name,
  })
  const split = splitSocials(socialsAll, ownBrand.id)
  // The previous window's own URLs, by the rule splitSocials uses (the URL's chosen channel title), including URLs with no row this window.
  const priorOwn = socialsPriorAgg.filter((u) => ownerOf({ url: u.url, channelTitle: u.channelTitle }, brands) === ownBrand.id)
  const totals = buildTotals(split.own, chats.socialsPrior !== null && chats.socialsPrior > 0 ? priorOwn : null)
  const gapCurrent = gapCurrentRows.flatMap((r) => aggregateByUrl([r]))
  if (gapCurrent.length === 0) warnings.push('gap view is empty for the gaps window')
  const urlGaps = buildGapRows({ current: gapCurrent, prior: gapPriorRows.flatMap((r) => aggregateByUrl([r])), brands, domainType: selector.name })

  const common = (id: GraphId) => ({ brands, ownBrandId: ownBrand.id, ownBrandName: ownBrand.name, from: graphs[id].from, weeks: graphs[id].weeks, asOf: input.asOf })
  const graphPoints: GraphPoint[] = [
    ...buildUsedAsSource({ ...common('used_as_source_all'), rows: chatRows, chatsByDay }),
    ...citationIds.flatMap((id) => buildCitationGraph({ ...common(id), graphId: id, platforms: CITATION_PLATFORMS[id], rows: selRows })),
  ]

  const draft = {
    socialsAll,
    socialsOwn: split.own,
    socialsCompetitor: split.competitor,
    urlGaps,
    graphs: graphPoints,
    totals,
    meta: {
      asOf: input.asOf,
      graphs: input.views.graphs,
      minCompetitors,
      fourthGraph,
      pulledAt,
      compare,
      windows: { socials, socialsPrior, gaps, gapsPrior },
      ownBrandId: ownBrand.id,
      ownBrandName: ownBrand.name,
      brands: brandsRaw.map((b) => ({ id: b.id, name: b.name, color: b.color, isOwn: b.is_own })),
      selector: { name: selector.name, via: selector.via, id: selId },
      chats,
      counts: { socialsAll: socialsAll.length, socialsOwn: split.own.length, socialsCompetitor: split.competitor.length, urlGaps: urlGaps.length, selectorRowsByDay: selRows.length, gapRows: gapCurrentRows.length + gapPriorRows.length, usedChatRows: chatRows.length, chatDayRows: dayRows.length, requests },
      warnings,
      unverified: [...UNVERIFIED],
    },
  }

  const raw: GateRaw = { selRows, gapCurrentRows, gapPriorRows, chatRows, dayRows, brands, today: pulledAt.slice(0, 10) }
  return { draft, raw }
}

/**
 * The only function a view should call. The result passes the data gate (see gate.ts) before it is returned; a result that breaks an error rule
 * throws AeoGateError and nothing is returned.
 */
export async function getAeoInformedSocial(input: AeoInformedInput): Promise<AeoInformedResult> {
  const { draft, raw } = await buildAeoInformed(input)
  const violations = runGate(draft, raw)
  const report: GateReport = {
    rulesChecked: GATE_RULES.length,
    errors: violations.filter((v) => v.severity === 'error'),
    warnings: violations.filter((v) => v.severity === 'warning'),
  }
  if (report.errors.length > 0) throw new AeoGateError(report)
  return { ...draft, meta: { ...draft.meta, gate: report } }
}
