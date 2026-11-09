// lib/organic-social/aeo-informed/gate.ts
// The data gate. It runs on every result before anything can use it. A result that breaks an error rule is not returned (AeoGateError);
// warnings ride along in meta.gate. Two kinds of rule:
//   1. the typed contract (contract.ts): every field of every table and graph point has the right type, range, allowed values and nothing extra;
//   2. cross-checks that no field-by-field contract can express: ranks, ordering, shares that add to 1, deltas that agree with each other, graph buckets
//      that are continuous, windows that are the right length. Each is a named rule in GATE_RULES with a plain-English sentence, and gate.test.ts proves
//      each one fires by corrupting a good result in exactly that way (and fails if a rule has no such test).
// Violations name a rule, a place and a message. They never contain a value from the data.
import { OUTPUTS, GRAPH_IDS, type FieldSpec } from './contract'
import { validateRows } from './contract-validate'
import { previousWindow, daysIn, type Window } from './windows'
import { UNVERIFIED } from './unverified'
import type { GapRow, SocialsRow } from './tables'
import type { GraphPoint } from './graphs'
import type { Meta, AeoInformedResult } from './index'

export type GateSeverity = 'error' | 'warning'
export type GateViolation = { code: string; severity: GateSeverity; where: string; message: string }
export type GateMode = 'enforce' | 'report'
export type GateReport = { mode: GateMode; rulesChecked: number; errors: GateViolation[]; warnings: GateViolation[] }
export type GateInput = Omit<AeoInformedResult, 'meta'> & { meta: Omit<Meta, 'gate'> }

export class AeoGateError extends Error {
  constructor(public report: GateReport) {
    const shown = report.errors.slice(0, 8).map((v) => `${v.code} at ${v.where}`).join('; ')
    super(`AEO result failed the data gate with ${report.errors.length} error(s): ${shown}${report.errors.length > 8 ? '; ...' : ''}`)
    this.name = 'AeoGateError'
  }
}

export type GateRule = { code: string; severity: GateSeverity; plain: string }
/** Every rule, in plain English. Rendered in docs and in the team-facing mapping; gate.test.ts proves each one fires. */
export const GATE_RULES: GateRule[] = [
  { code: 'contract', severity: 'error', plain: 'Every row of every table and every graph point matches the data contract: the right type, an allowed range, allowed values only, and no extra fields.' },
  { code: 'no-nan', severity: 'error', plain: 'No number anywhere in the result is "not a number" or infinite.' },
  { code: 'meta.windows', severity: 'error', plain: 'Each "change" window is exactly as long as the window it is compared with and ends the day before it starts.' },
  { code: 'meta.as-of', severity: 'error', plain: 'No table window runs past the as-of date, so no day that is not finished is counted.' },
  { code: 'meta.counts', severity: 'error', plain: 'The row counts in the result summary equal the real number of rows.' },
  { code: 'meta.chats', severity: 'error', plain: 'Chat totals are whole numbers and never negative.' },
  { code: 'meta.unverified', severity: 'error', plain: 'The list of things not yet proven against the outline is always present and complete, so nothing unproven is passed off as proven.' },
  { code: 'meta.identity', severity: 'error', plain: 'The result names the own brand and the tag it was filtered on.' },
  { code: 'socials-all.rank', severity: 'error', plain: 'The first table is numbered 1, 2, 3 with no gaps or repeats.' },
  { code: 'socials-all.order', severity: 'error', plain: 'The first table is sorted by retrievals, highest first, ties by URL.' },
  { code: 'socials-all.own-flag', severity: 'error', plain: 'A row is starred as our own channel exactly when its owner is our brand.' },
  { code: 'socials-all.retrieved-pct', severity: 'error', plain: 'Retrieved % equals the row\'s retrievals divided by the window\'s chats.' },
  { code: 'socials-all.pct-delta', severity: 'error', plain: 'The Retrieved % change equals today\'s % minus the previous window\'s %, and is empty when there is nothing to compare.' },
  { code: 'socials-all.new-url-deltas', severity: 'error', plain: 'A URL that is new this window has an empty change in both retrievals and citations, never one without the other.' },
  { code: 'socials-all.mentions', severity: 'error', plain: 'If our brand is mentioned, at least one brand is counted; the names listed never exceed the count.' },
  { code: 'socials-split.subset', severity: 'error', plain: 'Every row of the own and competitor tables is a row of the first table with the same numbers.' },
  { code: 'socials-own.membership', severity: 'error', plain: 'Everything in the own table is owned by our brand and starred.' },
  { code: 'socials-competitor.membership', severity: 'error', plain: 'Everything in the competitor table is owned by another brand and not starred.' },
  { code: 'socials-split.complete', severity: 'error', plain: 'The own and competitor tables hold every matching row of the first table, in the same order, and no row is in both.' },
  { code: 'socials-split.rank', severity: 'error', plain: 'The own and competitor tables are each numbered from 1 with no gaps.' },
  { code: 'url-gaps.rank-order', severity: 'error', plain: 'The URL gaps table is numbered 1, 2, 3 and sorted by retrievals, highest first.' },
  { code: 'url-gaps.share', severity: 'error', plain: 'Citation share is each row\'s citations divided by all citations in the table, so the shares add up to 100%.' },
  { code: 'url-gaps.competitor-mentioned', severity: 'error', plain: 'Every URL gaps row has at least one brand mentioned: a gap needs a competitor.' },
  { code: 'url-gaps.new-url-deltas', severity: 'error', plain: 'A new URL has an empty change in both retrievals and citations, never one without the other.' },
  { code: 'graphs.complete', severity: 'error', plain: 'Each of the four graphs is present with the right number of weekly points up to the as-of date.' },
  { code: 'graphs.buckets', severity: 'error', plain: 'Each graph\'s points are 7-day buckets, one right after the other, starting on the graph\'s own start date.' },
  { code: 'graphs.partial', severity: 'error', plain: 'A weekly point is flagged "partial" exactly when its week has not finished by the as-of date.' },
  { code: 'graphs.series-unit', severity: 'error', plain: 'Every point is for our brand and uses the graph\'s unit (citations or percent).' },
  { code: 'graphs.percent-range', severity: 'error', plain: 'A percentage graph never goes below 0% or above 100%.' },
  { code: 'graphs.citation-integer', severity: 'error', plain: 'A citations graph shows whole citations only.' },
  { code: 'graphs.null-pattern', severity: 'error', plain: 'A graph is either all "No source data" or has data in every week; it never mixes the two without a stated reason.' },
  { code: 'view.no-chats', severity: 'error', plain: 'A table is never built on a window that has no chats at all.' },
  { code: 'view.no-chats-previous', severity: 'warning', plain: 'The previous window has no chats, so every "change" is empty. The tables still stand.' },
  { code: 'view.empty-socials', severity: 'warning', plain: 'The first table is empty: no tagged sources in the window.' },
  { code: 'view.empty-gaps', severity: 'warning', plain: 'The URL gaps table is empty for the window.' },
  { code: 'view.warning', severity: 'warning', plain: 'Something the adapter noticed while pulling (for example days with no chat data) is passed on.' },
]

const EPS = 1e-9
const DAY_MS = 86_400_000
const addDays = (s: string, n: number) => new Date(Date.parse(`${s}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10)
const near = (a: number, b: number) => Math.abs(a - b) <= EPS
const sameWindow = (a: Window, b: Window) => a.start === b.start && a.end === b.end

const GRAPH_UNIT: Record<(typeof GRAPH_IDS)[number], 'citations' | 'percent'> = {
  used_as_source_all: 'percent', citations_all: 'citations', citations_linkedin: 'citations', citations_instagram: 'citations',
}

export function runGate(r: GateInput): GateViolation[] {
  const out: GateViolation[] = []
  const err = (code: string, where: string, message: string) => out.push({ code, severity: 'error', where, message })
  const warn = (code: string, where: string, message: string) => out.push({ code, severity: 'warning', where, message })
  const m = r.meta

  // ---- 1. the typed contract ----
  const tables: [string, readonly unknown[], readonly FieldSpec[], string][] = [
    ['socialsAll', r.socialsAll, OUTPUTS.socials_table, 'socials_table'],
    ['socialsOwn', r.socialsOwn, OUTPUTS.socials_table, 'socials_table'],
    ['socialsCompetitor', r.socialsCompetitor, OUTPUTS.socials_table, 'socials_table'],
    ['urlGaps', r.urlGaps, OUTPUTS.url_gaps_table, 'url_gaps_table'],
    ['graphs', r.graphs, OUTPUTS.graph_points, 'graph_points'],
  ]
  for (const [label, rows, fields, name] of tables) for (const v of validateRows(rows, fields, label, { closed: true })) err(`contract.${name}.${v.rule}`, v.where, v.message)

  // ---- 2. no NaN or infinity anywhere ----
  let nanReported = 0
  const scan = (v: unknown, path: string) => {
    if (typeof v === 'number') { if (!Number.isFinite(v) && nanReported++ < 5) err('no-nan', path, 'a number is not finite'); return }
    if (Array.isArray(v)) { v.forEach((x, i) => scan(x, `${path}[${i}]`)); return }
    if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) scan(x, `${path}.${k}`)
  }
  scan({ socialsAll: r.socialsAll, socialsOwn: r.socialsOwn, socialsCompetitor: r.socialsCompetitor, urlGaps: r.urlGaps, graphs: r.graphs, chats: m.chats }, 'result')

  // ---- 3. summary ----
  try {
    if (!sameWindow(m.windows.socialsPrior, previousWindow(m.windows.socials))) err('meta.windows', 'meta.windows.socialsPrior', 'the previous window is not the same length ending the day before')
    if (!sameWindow(m.windows.gapsPrior, previousWindow(m.windows.gaps))) err('meta.windows', 'meta.windows.gapsPrior', 'the previous window is not the same length ending the day before')
    for (const [k, w] of Object.entries(m.windows)) if (daysIn(w) < 1) err('meta.windows', `meta.windows.${k}`, 'the window is empty')
  } catch {
    err('meta.windows', 'meta.windows', 'a window is not a valid range of dates')
  }
  if (m.windows.socials.end > m.asOf) err('meta.as-of', 'meta.windows.socials', 'the window ends after the as-of date')
  if (m.windows.gaps.end > m.asOf) err('meta.as-of', 'meta.windows.gaps', 'the window ends after the as-of date')
  const c = m.counts
  const countChecks: [string, number, number][] = [['socialsAll', c.socialsAll, r.socialsAll.length], ['socialsOwn', c.socialsOwn, r.socialsOwn.length], ['socialsCompetitor', c.socialsCompetitor, r.socialsCompetitor.length], ['urlGaps', c.urlGaps, r.urlGaps.length]]
  for (const [k, said, real] of countChecks) if (said !== real) err('meta.counts', `meta.counts.${k}`, 'the count does not match the rows')
  if (!Number.isInteger(c.requests) || c.requests < 6) err('meta.counts', 'meta.counts.requests', 'implausible request count')
  for (const [k, v] of Object.entries(m.chats)) if (!Number.isInteger(v) || v < 0) err('meta.chats', `meta.chats.${k}`, 'chats must be a whole number, 0 or more')
  if (JSON.stringify(m.unverified) !== JSON.stringify([...UNVERIFIED])) err('meta.unverified', 'meta.unverified', 'the unverified list is not the complete list')
  if (!m.ownBrandId || !m.ownBrandName || !m.selector.name) err('meta.identity', 'meta', 'the own brand or the selector is not named')

  // ---- 4. the first table and its two splits ----
  const rankOrder = <T extends { rank: number; retrievals: number; url: string }>(rows: readonly T[], code: string, label: string) => {
    rows.forEach((x, i) => { if (x.rank !== i + 1) err(code, `${label}[${i}].rank`, 'rank is not the row position') })
    for (let i = 1; i < rows.length; i++) {
      const a = rows[i - 1], b = rows[i]
      if (!(a.retrievals > b.retrievals || (a.retrievals === b.retrievals && a.url < b.url))) err(label === 'urlGaps' ? 'url-gaps.rank-order' : 'socials-all.order', `${label}[${i}]`, 'rows are not sorted by retrievals descending, then URL')
    }
  }
  rankOrder(r.socialsAll, 'socials-all.rank', 'socialsAll')
  r.socialsAll.forEach((x, i) => {
    const at = `socialsAll[${i}]`
    if ((x.ownerBrandId === m.ownBrandId) !== x.isOwnChannel) err('socials-all.own-flag', at, 'the star does not match the owner')
    const expectPct = m.chats.socials > 0 ? x.retrievals / m.chats.socials : 0
    if (!near(x.retrievedPct, expectPct)) err('socials-all.retrieved-pct', at, 'retrieved % is not retrievals over chats')
    if (m.chats.socials === 0 || m.chats.socialsPrior === 0 || x.retrievalsDelta === null) {
      if (x.retrievedPctDelta !== null) err('socials-all.pct-delta', at, 'the change should be empty here')
    } else if (x.retrievedPctDelta === null || !near(x.retrievedPctDelta, x.retrievedPct - (x.retrievals - x.retrievalsDelta) / m.chats.socialsPrior)) {
      err('socials-all.pct-delta', at, 'the change does not agree with the retrievals change and the chats')
    }
    if ((x.retrievalsDelta === null) !== (x.totalCitationsDelta === null)) err('socials-all.new-url-deltas', at, 'one change is empty and the other is not')
    if (x.ownBrandMentioned && x.mentionedBrandCount < 1) err('socials-all.mentions', at, 'our brand is mentioned but no brand is counted')
    if (x.mentionedBrandNames !== null && (x.mentionedBrandCount === 0 || x.mentionedBrandNames.split('|').length > x.mentionedBrandCount)) err('socials-all.mentions', at, 'more names than the count allows')
  })
  const byUrl = new Map(r.socialsAll.map((x) => [x.url, x]))
  const strip = (x: SocialsRow) => ({ ...x, rank: 0 })
  const split = (label: 'socialsOwn' | 'socialsCompetitor', rows: SocialsRow[], isMember: (x: SocialsRow) => boolean, memberCode: string) => {
    rows.forEach((x, i) => {
      const src = byUrl.get(x.url)
      if (!src || JSON.stringify(strip(src)) !== JSON.stringify(strip(x))) err('socials-split.subset', `${label}[${i}]`, 'the row is not a row of the first table')
      if (!isMember(x)) err(memberCode, `${label}[${i}]`, 'the row does not belong in this table')
      if (x.rank !== i + 1) err('socials-split.rank', `${label}[${i}].rank`, 'rank is not the row position')
    })
    const expected = r.socialsAll.filter(isMember).map((x) => x.url)
    if (JSON.stringify(expected) !== JSON.stringify(rows.map((x) => x.url))) err('socials-split.complete', label, 'the table does not hold exactly the matching rows of the first table in order')
  }
  split('socialsOwn', r.socialsOwn, (x) => x.ownerBrandId === m.ownBrandId, 'socials-own.membership')
  split('socialsCompetitor', r.socialsCompetitor, (x) => x.ownerBrandId !== null && x.ownerBrandId !== m.ownBrandId, 'socials-competitor.membership')
  const inBoth = r.socialsOwn.some((x) => r.socialsCompetitor.some((y) => y.url === x.url))
  if (inBoth) err('socials-split.complete', 'socialsOwn/socialsCompetitor', 'a row is in both tables')

  // ---- 5. URL gaps ----
  rankOrder(r.urlGaps, 'url-gaps.rank-order', 'urlGaps')
  const gapTotal = r.urlGaps.reduce((s, x) => s + x.totalCitations, 0)
  r.urlGaps.forEach((x: GapRow, i) => {
    const at = `urlGaps[${i}]`
    if (!near(x.citationShare, gapTotal > 0 ? x.totalCitations / gapTotal : 0)) err('url-gaps.share', at, 'citation share is not citations over the table total')
    if (x.mentionedBrandCount < 1) err('url-gaps.competitor-mentioned', at, 'a gap row needs at least one brand mentioned')
    if ((x.retrievalsDelta === null) !== (x.totalCitationsDelta === null)) err('url-gaps.new-url-deltas', at, 'one change is empty and the other is not')
  })

  // ---- 6. graphs ----
  const dataGapWarned = m.warnings.some((w) => w.startsWith('days with no chats data in window: usedAsSource'))
  for (const id of GRAPH_IDS) {
    const cfg = m.graphs[id]
    const pts: GraphPoint[] = r.graphs.filter((p) => p.graphId === id)
    let expected = 0
    for (let i = 0; i < cfg.weeks; i++) if (addDays(cfg.from, 7 * i) <= m.asOf) expected++
    if (pts.length !== expected) err('graphs.complete', `graphs.${id}`, 'the graph does not have the expected number of weekly points')
    pts.forEach((p, i) => {
      const at = `graphs.${id}[${i}]`
      const start = addDays(cfg.from, 7 * i)
      if (p.weekStart !== start || p.weekEnd !== addDays(start, 6)) err('graphs.buckets', at, 'the point is not the next 7-day bucket')
      if (p.partial !== (p.weekEnd > m.asOf)) err('graphs.partial', at, 'the partial flag does not match the as-of date')
      if (p.series !== m.ownBrandName || p.unit !== GRAPH_UNIT[id]) err('graphs.series-unit', at, 'wrong series or unit for this graph')
      if (p.unit === 'percent' && p.value !== null && (p.value < 0 || p.value > 1)) err('graphs.percent-range', at, 'a percentage is outside 0 to 1')
      if (p.unit === 'citations' && p.value !== null && !Number.isInteger(p.value)) err('graphs.citation-integer', at, 'citations must be whole numbers')
    })
    const nulls = pts.filter((p) => p.value === null).length
    if (nulls > 0 && nulls < pts.length && !(id === 'used_as_source_all' && dataGapWarned)) err('graphs.null-pattern', `graphs.${id}`, 'some weeks have no data and others do, with no stated reason')
  }

  // ---- 7. is the view fit to use ----
  for (const w of m.warnings) {
    if (/^no chats in window: (socials|gaps)$/.test(w)) err('view.no-chats', 'meta.warnings', w)
    else if (/^no chats in window: /.test(w)) warn('view.no-chats-previous', 'meta.warnings', w)
    else if (w !== 'gap view is empty for the gaps window') warn('view.warning', 'meta.warnings', w)
  }
  if (r.socialsAll.length === 0) warn('view.empty-socials', 'socialsAll', 'the first table is empty')
  if (r.urlGaps.length === 0) warn('view.empty-gaps', 'urlGaps', 'the URL gaps table is empty')
  return out
}
