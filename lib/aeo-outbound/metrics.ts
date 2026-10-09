// Turns a Peec pull into the numbers the page shows and Glean writes from (spec §5a, §7).
import { DECISIONS } from './config'
import type { PeecPull } from './pull'

/** The three DECISIONS this file reads; a parameter so tests can cover both settings of each. */
export type MetricDecisions = Pick<typeof DECISIONS, 'rankAmong' | 'competitorSiteGaps' | 'sourceMixWeight'>

export interface BrandMetric { id: string; name: string; isOwn: boolean; visibilityPct: number; sovPct: number | null; position: number | null; rank: number }
export interface Kpi { label: string; value: string }
export interface SourceSlice { label: string; weight: number; pct: number }
export interface SnapshotData {
  projectId: string
  projectName: string
  brand: string
  generatedAt: string
  window: { start: string; end: string }
  windowLabel: string
  category: string | null
  market: string | null
  brands: BrandMetric[]
  own: BrandMetric
  kpis: Kpi[]
  competitorsTracked: number
  leaderGaps: { name: string; visibilityPoints: number; sovPoints: number | null }[]
  ownDomains: string[]
  ownRetrievedChats: number
  ownRetrievedPct: number | null
  sourceMix: SourceSlice[]
  gapDomains: { domain: string; retrievedChats: number }[]
  actions: { title: string; impact: string; type: string }[]
  promptCount: number | null
  models: string[]
  notes: string[]
}

/** Python's round(x, dp): correctly rounded from the exact binary value, ties to even (symmetric for negatives). */
export function pyRound(x: number, dp: number): number {
  if (x < 0) return -pyRound(-x, dp)
  const exact = x.toFixed(100)
  const [int, frac = ''] = exact.split('.')
  const tail = frac.slice(dp)
  if (/^50*$/.test(tail)) {
    const kept = frac.slice(0, dp)
    const last = Number((kept || int).slice(-1))
    const down = Number(dp ? `${int}.${kept}` : int)
    return last % 2 === 0 ? down : Number((down + 10 ** -dp).toFixed(dp))
  }
  return Number(x.toFixed(dp))
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** 'YYYY-MM-DD' (a UTC calendar day from Peec) to 'Oct 1, 2026'. */
export function fmtDay(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return `${MONTHS[m - 1]} ${d}, ${y}`
}

/** The US Eastern calendar day of an instant, formatted like fmtDay (spec §5 row 10). */
export function fmtEasternDay(d: Date): string {
  return fmtDay(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d))
}

const TITLE: Record<string, string> = {
  CORPORATE: 'Corporate', EDITORIAL: 'Editorial', INSTITUTIONAL: 'Institutional', OTHER: 'Other',
  REFERENCE: 'Reference', UGC: 'UGC', COMPETITOR: 'Competitor', OWN: 'You', RELATED: 'Related',
}
/** aivx agent/peec_api_transform.py:21-32: built-ins to their display form, OWN to You, custom names verbatim. */
export const titleClassification = (c: string): string => TITLE[c] ?? c

const pct1 = (ratio: number) => pyRound(ratio * 100, 1)
const bare = (d: string) => d.trim().toLowerCase().replace(/^www\./, '')

export function buildSnapshotData(pull: PeecPull, generatedAt: string, decisions: MetricDecisions = DECISIONS): SnapshotData {
  if (decisions.rankAmong !== null && !(Number.isInteger(decisions.rankAmong) && decisions.rankAmong >= 2)) throw new Error('DECISIONS.rankAmong must be null or a whole number of 2 or more')
  const notes: string[] = []
  const sorted = [...pull.brands].sort((a, b) => (b.visibility - a.visibility) || (a.brand.id < b.brand.id ? -1 : a.brand.id > b.brand.id ? 1 : 0))
  // Q2: keep the brand and its rankAmong - 1 most visible competitors, in visibility order.
  const cut = decisions.rankAmong !== null && decisions.rankAmong < sorted.length
  const keptIds = new Set(sorted.filter((r) => r.brand.id !== pull.ownBrand.id).slice(0, cut ? decisions.rankAmong! - 1 : sorted.length).map((r) => r.brand.id))
  const kept = sorted.filter((r) => r.brand.id === pull.ownBrand.id || keptIds.has(r.brand.id))
  const brands: BrandMetric[] = kept.map((r, i) => ({
    id: r.brand.id,
    name: r.brand.name,
    isOwn: r.brand.id === pull.ownBrand.id,
    visibilityPct: pct1(r.visibility),
    sovPct: typeof r.share_of_voice === 'number' ? pct1(r.share_of_voice) : null,
    position: typeof r.position === 'number' ? pyRound(r.position, 1) : null,
    rank: i + 1,
  }))
  const own = brands.find((b) => b.isOwn)!
  const competitorsTracked = pull.roster.filter((b) => !b.is_own).length

  const kpis: Kpi[] = [{ label: 'AI visibility', value: `${own.visibilityPct.toFixed(1)}%` }]
  if (own.sovPct !== null) kpis.push({ label: 'AI share of voice', value: `${own.sovPct.toFixed(1)}%` })
  else notes.push('Peec has no share of voice for the brand in this window, so that card is left out.')
  if (own.position !== null) kpis.push({ label: 'Average answer position', value: `#${own.position.toFixed(1)}` })
  else notes.push('Peec has no answer position for the brand in this window, so that card is left out.')
  if (competitorsTracked > 0) {
    kpis.push({ label: 'Competitive rank', value: `#${own.rank} of ${brands.length} brands` })
    notes.push(cut
      ? `Rank is by visibility among ${brands.length} of the ${sorted.length} brands tracked in Peec: the brand and the competitors with the highest visibility.`
      : `Rank is by visibility among the ${brands.length} brands tracked in Peec.`)
  } else {
    notes.push('No competitors tracked in this Peec project')
  }

  // Spec 5a row 17: competitor minus own from the exact ratios, rounded once at the end.
  const ratioOf = (id: string) => kept.find((r) => r.brand.id === id)!
  const ownRatio = ratioOf(own.id)
  const leaderGaps = brands.filter((b) => b.rank < own.rank).map((b) => {
    const rival = ratioOf(b.id)
    return {
      name: b.name,
      visibilityPoints: pyRound((rival.visibility - ownRatio.visibility) * 100, 1),
      sovPoints: typeof rival.share_of_voice === 'number' && typeof ownRatio.share_of_voice === 'number'
        ? pyRound((rival.share_of_voice - ownRatio.share_of_voice) * 100, 1)
        : null,
    }
  })

  const ownDomains = (pull.ownBrand.domains ?? []).map(bare)
  const ownRows = pull.domains.filter((r) => ownDomains.includes(bare(r.domain)))
  const ownRetrievedChats = ownRows.reduce((s, r) => s + (r.retrieved_chat_count ?? 0), 0)
  const topOwn = [...ownRows].sort((a, b) => (b.retrieved_chat_count ?? 0) - (a.retrieved_chat_count ?? 0))[0]
  const ownRetrievedPct = typeof topOwn?.retrieved_percentage === 'number' ? pct1(topOwn.retrieved_percentage) : null
  if (!ownRows.length) notes.push("No retrievals of the brand's own site in this window.")
  if (ownRows.length > 1) notes.push(`The brand has ${ownRows.length} own domains with retrievals; the chat count adds them up and the percentage is for ${topOwn.domain} only.`)

  const weights = new Map<string, number>()
  for (const r of pull.domains) {
    const w = r[decisions.sourceMixWeight] ?? 0
    if (w <= 0) continue
    const label = r.classification ? titleClassification(r.classification) : 'Uncategorized'
    weights.set(label, (weights.get(label) ?? 0) + w)
  }
  const total = [...weights.values()].reduce((s, w) => s + w, 0)
  const sourceMix = [...weights.entries()]
    .sort((a, b) => (b[1] - a[1]) || (a[0] < b[0] ? -1 : 1))
    .map(([label, weight]) => ({ label, weight, pct: total ? pyRound((weight / total) * 100, 1) : 0 }))

  if (!sourceMix.length) notes.push('Peec reported no source weights for this window, so the source mix is empty.')

  const competitorIds = new Set(pull.roster.filter((b) => !b.is_own).map((b) => b.id))
  const gapDomains = !decisions.competitorSiteGaps ? [] : pull.domains
    .filter((r) => {
      const ids = new Set((r.mentioned_brands ?? []).map((m) => m.id))
      return !ids.has(pull.ownBrand.id) && [...ids].some((id) => competitorIds.has(id))
    })
    .sort((a, b) => ((b.retrieved_chat_count ?? 0) - (a.retrieved_chat_count ?? 0)) || (a.domain < b.domain ? -1 : 1))
    .slice(0, 4)
    .map((r) => ({ domain: r.domain, retrievedChats: r.retrieved_chat_count ?? 0 }))

  if (!pull.profile) notes.push('Peec has no project profile, so category and market need validation.')
  notes.push(...pull.warnings)
  notes.push(`Peec project ${pull.project.id} (${pull.project.status}). Window ${pull.window.start} to ${pull.window.end}, all models: ${pull.models.join(', ') || 'none reported'}.`)

  return {
    projectId: pull.project.id,
    projectName: pull.project.name,
    brand: pull.ownBrand.name,
    generatedAt,
    window: pull.window,
    windowLabel: `${fmtDay(pull.window.start)} to ${fmtDay(pull.window.end)}`,
    category: pull.profile?.industry ?? null,
    market: pull.profile?.markets.length ? pull.profile.markets.join(', ') : null,
    brands,
    own,
    kpis,
    competitorsTracked,
    leaderGaps,
    ownDomains,
    ownRetrievedChats,
    ownRetrievedPct,
    sourceMix,
    gapDomains,
    actions: pull.actions.map((a) => ({ title: String(a.title ?? ''), impact: String(a.impact ?? ''), type: String(a.type ?? '') })).filter((a) => a.title).slice(0, 10),
    promptCount: pull.promptCount,
    models: pull.models,
    notes,
  }
}
