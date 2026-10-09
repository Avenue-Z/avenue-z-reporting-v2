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
  /** The size of the ranked set: the n in "#i of n brands". */
  rankN: number
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
  // One entry per distinct brand id across the roster and the report rows. A roster brand with no row is a
  // zero-visibility entry for ranking only (spec "Competitive rank"): it is never drawn or listed.
  type Entry = { id: string; name: string; visibility: number; share_of_voice: number | null | undefined; position: number | null | undefined; hasRow: boolean; pct: number }
  const byId = new Map<string, Entry>()
  for (const b of pull.roster) byId.set(b.id, { id: b.id, name: b.name, visibility: 0, share_of_voice: null, position: null, hasRow: false, pct: 0 })
  for (const r of pull.brands) byId.set(r.brand.id, { id: r.brand.id, name: r.brand.name, visibility: r.visibility, share_of_voice: r.share_of_voice, position: r.position, hasRow: true, pct: pct1(r.visibility) })
  const entries = [...byId.values()].sort((a, b) => (b.pct - a.pct) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const totalBrands = entries.length
  // Q2: keep the brand and its rankAmong - 1 most visible competitors, in displayed-visibility order.
  const cut = decisions.rankAmong !== null && decisions.rankAmong < totalBrands
  const keptIds = new Set(entries.filter((e) => e.id !== pull.ownBrand.id).slice(0, cut ? decisions.rankAmong! - 1 : totalBrands).map((e) => e.id))
  const ranked = entries.filter((e) => e.id === pull.ownBrand.id || keptIds.has(e.id))
  const rankN = ranked.length
  const noData = entries.filter((e) => !e.hasRow).length
  const brands: BrandMetric[] = ranked.filter((e) => e.hasRow).map((e) => ({
    id: e.id,
    name: e.name,
    isOwn: e.id === pull.ownBrand.id,
    visibilityPct: e.pct,
    sovPct: typeof e.share_of_voice === 'number' ? pct1(e.share_of_voice) : null,
    position: typeof e.position === 'number' ? pyRound(e.position, 1) : null,
    rank: 1 + ranked.filter((o) => o.pct > e.pct).length,
  }))
  const own = brands.find((b) => b.isOwn)!
  const competitorsTracked = pull.roster.filter((b) => !b.is_own).length

  const kpis: Kpi[] = [{ label: 'AI visibility', value: `${own.visibilityPct.toFixed(1)}%` }]
  if (own.sovPct !== null) kpis.push({ label: 'AI share of voice', value: `${own.sovPct.toFixed(1)}%` })
  else notes.push('Peec has no share of voice for the brand in this window, so that card is left out.')
  if (own.position !== null) kpis.push({ label: 'Average answer position', value: `#${own.position.toFixed(1)}` })
  else notes.push('Peec has no answer position for the brand in this window, so that card is left out.')
  if (competitorsTracked > 0) {
    kpis.push({ label: 'Competitive rank', value: `#${own.rank} of ${rankN} brands` })
    notes.push(cut
      ? `Rank is by visibility among ${rankN} of the ${totalBrands} brands tracked in Peec: the brand and the competitors with the highest visibility.`
      : `Rank is by visibility among the ${rankN} brands tracked in Peec.`)
    if (noData === 1) notes.push('1 tracked brand has no Peec data in this window and counts as zero visibility.')
    else if (noData > 1) notes.push(`${noData} tracked brands have no Peec data in this window and count as zero visibility.`)
  } else {
    notes.push('No competitors tracked in this Peec project')
  }
  if (pull.rangePicked && (pull.requested.start !== pull.window.start || pull.requested.end !== pull.window.end)) {
    notes.push(`Requested ${pull.requested.start} to ${pull.requested.end}; Peec data covers ${pull.window.start} to ${pull.window.end}.`)
  }

  // Spec 5a row 17: competitor minus own from the exact ratios, rounded once at the end. Only brands with a
  // higher displayed visibility and an exact gap above 0 are listed, so a tied brand is never a leader.
  const ownEntry = byId.get(own.id)!
  const leaderGaps = ranked
    .filter((e) => e.hasRow && e.pct > own.visibilityPct)
    .map((rival) => ({
      name: rival.name,
      visibilityPoints: pyRound((rival.visibility - ownEntry.visibility) * 100, 1),
      sovPoints: typeof rival.share_of_voice === 'number' && typeof ownEntry.share_of_voice === 'number'
        ? pyRound((rival.share_of_voice - ownEntry.share_of_voice) * 100, 1)
        : null,
    }))
    .filter((g) => g.visibilityPoints > 0)

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
  const rosterDomains = pull.roster.flatMap((b) => (b.domains ?? []).map(bare)).filter(Boolean)
  const isRosterSite = (domain: string) => { const d = bare(domain); return rosterDomains.some((rd) => d === rd || d.endsWith(`.${rd}`)) }
  const gapDomains = !decisions.competitorSiteGaps ? [] : pull.domains
    .filter((r) => {
      if (r.classification === 'COMPETITOR' || r.classification === 'OWN' || isRosterSite(r.domain)) return false
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
    rankN,
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
