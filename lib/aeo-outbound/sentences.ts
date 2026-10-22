// The data sentences in Ryan's example format (spec v1.1 §19.1): the competitive context, both findings boxes and the
// methodology, and since round 3 the pillar data lines, written by code from a row's data so every number is Peec's.
// Glean writes only the opinion (§19.2).
import { PILLARS } from './config'
import { pyRound, settingsUsedOf, tenths, type SnapshotData } from './metrics'
import type { Bullet, Opportunity } from './slots'

export interface DataSentences { context: string; competitive_bullets: Bullet[]; sources_bullets: Bullet[]; methodology: string; opportunities: Opportunity[] }

/** The slot paths these sentences fill (spec v1.1 §19.1), shared by generation and grounding. */
export const isCodeSentencePath = (path: string): boolean => /^(?:context|methodology|(?:competitive|sources)_bullets\.\d\.(?:lead|text))$/.test(path)

/** A displayed 1-decimal percent in a sentence: whole from 10 up (Ryan's "26%"), one decimal below 10 so a 1.3 and a
 *  1.1 never both read "1%", and never rounded up to 100. Half up, from the value the page shows. */
export function pctText(x: number): string {
  if (x < 10) return `${x.toFixed(1)}%`
  const whole = Math.round(x)
  return whole === 100 && x < 100 ? `${x.toFixed(1)}%` : `${whole}%`
}

/** A count: digits under 1,000, then thousands or millions to one decimal, rounded half up in integer steps. */
export function countText(n: number): string {
  if (n < 1000) return String(n)
  if (n < 999_950) return `${(Math.round(n / 100) / 10).toFixed(1)}K`
  return `${(Math.round(n / 100_000) / 10).toFixed(1)}M`
}

const ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth', 'thirteenth', 'fourteenth', 'fifteenth', 'sixteenth', 'seventeenth', 'eighteenth', 'nineteenth', 'twentieth']
export function ordinal(n: number): string {
  if (n >= 1 && n <= 20) return ORDINALS[n - 1]
  const teen = n % 100 >= 11 && n % 100 <= 13
  const suffix = teen ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'
  return `${n}${suffix}`
}

const WORDS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']
/** A brand count: a word up to ten, digits above. */
const countWord = (n: number): string => (n >= 1 && n <= 10 ? WORDS[n - 1] : String(n))

/** "A", "A and B", "A, B, and C" (Ryan's serial comma). */
export function listText(items: string[]): string {
  if (items.length <= 1) return items[0] ?? ''
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(', ')}, and ${items.at(-1)}`
}

/** A domain that starts a sentence: no leading "www.", a capital first letter, as Ryan wrote "Ualett.com". */
const capital = (s: string): string => { const d = s.replace(/^www\./i, ''); return d.charAt(0).toUpperCase() + d.slice(1) }
const points = (x: number): string => Math.abs(x).toFixed(1)
const MAX_NAMED = 5
/** Editorial and UGC each under this share (percent, as displayed) read as "limited" (Ryan's example: 6% and 3%). */
const LIMITED_SHARE_PCT = 10
/** A peer cluster wider than this many visibility points is not a cluster, so the bullet is left out (round 3 QA, spec
 *  2026-10-22 F2: staging read "a 96.4-point visibility range"). Ryan's PocketGuard example is 7.8. */
const PEER_CLUSTER_MAX_POINTS = 10

/** At most five names, then "and k more" (k as a count word). */
const someNames = (names: string[]): string => listText(names.length > MAX_NAMED ? [...names.slice(0, MAX_NAMED), `${countWord(names.length - MAX_NAMED)} more`] : names)

/** The percents one sentence names: a value keeps one decimal when another value in the sentence differs from it but
 *  would read the same as a whole number, so values ranked apart never read as equal (spec v1.1 §19.11). */
function pctAll(values: number[]): string[] {
  const text = values.map(pctText)
  return values.map((v, i) => (text.some((t, j) => j !== i && t === text[i] && values[j] !== v) ? `${v.toFixed(1)}%` : text[i]))
}

/** A source share, as pctAll prints it, except that a whole number rounds the exact share (weight over total), as Peec's
 *  dashboard and the donut (charts.ts sliceLabel) do, not the stored one-decimal pct (spec amendment 2026-10-20). The
 *  choice of decimal or whole, and every decimal printed, stay on the stored pct, so Ryan's format is unchanged. */
function sharePctAll(items: { pct: number; exact: number }[]): string[] {
  const one = ({ pct, exact }: { pct: number; exact: number }) => {
    if (pct < 10) return `${pct.toFixed(1)}%`
    const whole = Math.round(exact)
    return whole === 100 && pct < 100 ? `${pct.toFixed(1)}%` : `${whole}%`
  }
  const text = items.map(one)
  return items.map((v, i) => (text.some((t, j) => j !== i && t === text[i] && items[j].pct !== v.pct) ? `${v.pct.toFixed(1)}%` : text[i]))
}

/** Spec 2026-10-22 D5: source shares in the source-type mix sentence. The stored one-decimal pct decides: below 1.0 one
 *  decimal, else whole, rounding the exact share as the donut does; a whole 100 under 100 keeps one decimal; two values
 *  that differ never read the same. */
function mixPctAll(items: { pct: number; exact: number }[]): string[] {
  const one = ({ pct, exact }: { pct: number; exact: number }) => {
    if (pct < 1) return `${pct.toFixed(1)}%`
    const whole = Math.round(exact)
    return whole === 100 && pct < 100 ? `${pct.toFixed(1)}%` : `${whole}%`
  }
  const text = items.map(one)
  return items.map((v, i) => (text.some((t, j) => j !== i && t === text[i] && items[j].pct !== v.pct) ? `${v.pct.toFixed(1)}%` : text[i]))
}

/** Spec 2026-10-22 D6: an own domain in a sentence. Without www.; when the brand is one word starting with a capital and the
 *  domain's first label is that word, the label takes the brand's casing ("PocketGuard.com"); otherwise today's capital. */
export function ownDomainText(domain: string, brand: string): string {
  const d = domain.replace(/^www\./i, '')
  const first = d.split('.')[0]
  if (/^[A-Z]\S*$/.test(brand) && first.toLowerCase() === brand.toLowerCase()) return brand + d.slice(first.length)
  return capital(d)
}

const upper = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)

function write(d: SnapshotData) {
  const brand = d.brand
  const own = d.own
  const N = d.rankN
  const noun = settingsUsedOf(d).rankAmong !== null ? 'compared' : 'tracked'
  const solo = d.competitorsTracked === 0
  const others = d.brands.filter((b) => !b.isOwn)
  const noData = d.noDataBrands ?? []
  const allZero = d.brands.every((b) => b.visibilityPct === 0)
  const ownZero = own.visibilityPct === 0
  const top = d.brands[0]
  const topGroup = top ? d.brands.filter((b) => b.visibilityPct === top.visibilityPct) : []
  const level = others.filter((b) => b.visibilityPct === own.visibilityPct)
  // The runner-up group: every brand at the highest visibility below the top. At zero the brand itself is never named.
  const runnerPct = Math.max(-1, ...d.brands.filter((b) => top && b.visibilityPct < top.visibilityPct && !(ownZero && b.isOwn)).map((b) => b.visibilityPct))
  const runners = runnerPct < 0 ? [] : d.brands.filter((b) => b.visibilityPct === runnerPct && !(ownZero && b.isOwn))
  // No-data brands rank at zero visibility, so they sit below the brand only when it is above zero.
  const below = [...others.filter((b) => b.visibilityPct < own.visibilityPct).map((b) => b.name), ...(ownZero ? [] : noData)]

  function leaders(): string {
    if (topGroup.length >= 3) return `${someNames(topGroup.map((b) => b.name))} lead at ${pctText(top.visibilityPct)} visibility.`
    if (topGroup.length === 2) {
      const [a, b] = topGroup
      const [sa, sb] = a.sovPct !== null && b.sovPct !== null ? pctAll([a.sovPct, b.sovPct]) : ['', '']
      return `${a.name} and ${b.name} lead at ${pctText(top.visibilityPct)} visibility${sa ? `, with ${sa} and ${sb} share of voice` : ''}.`
    }
    if (runners.length >= 2) {
      const [vt, vr] = pctAll([top.visibilityPct, runnerPct])
      return `${top.name} leads at ${vt} visibility${top.sovPct === null ? '' : ` / ${pctText(top.sovPct)} share of voice`}, followed by ${someNames(runners.map((b) => b.name))} at ${vr}.`
    }
    const next = runners[0]
    if (!next) return `${top.name} leads at ${pctText(top.visibilityPct)} visibility${top.sovPct === null ? '' : ` / ${pctText(top.sovPct)} share of voice`}.`
    const [vt, vn] = pctAll([top.visibilityPct, next.visibilityPct])
    const [st, sn] = top.sovPct !== null && next.sovPct !== null ? pctAll([top.sovPct, next.sovPct]) : [top.sovPct === null ? '' : pctText(top.sovPct), next.sovPct === null ? '' : pctText(next.sovPct)]
    // With no share of voice for the leader, the runner-up's is labelled, so its second number says what it is.
    const nextSov = next.sovPct === null ? '' : top.sovPct === null ? ` / ${sn} share of voice` : ` / ${sn}`
    return `${top.name} leads at ${vt} visibility${st ? ` / ${st} share of voice` : ''}, followed by ${next.name} at ${vn}${nextSov}.`
  }

  function context(): string {
    if (solo) return 'No competitors are tracked in this Peec project.'
    if (allZero) return 'Competitive context: No brand tracked shows visibility in this window.'
    if (ownZero) return `Competitive context: ${leaders()} ${brand} has ${pctText(0)} visibility in this window.`
    if (others.length === 0) {
      const k = noData.length
      return `Competitive context: ${brand} leads at ${pctText(own.visibilityPct)} visibility; ${k === 1 ? `the other brand ${noun} has` : `the other ${countWord(k)} brands ${noun} have`} no Peec data in this window.`
    }
    const ownLeads = topGroup.some((b) => b.isOwn)
    // When the brand leads alone, its runner-up is already named: the rest follow with "also".
    const named = ownLeads && topGroup.length === 1 ? new Set(runners.map((b) => b.name)) : new Set<string>()
    const rest = below.filter((n) => !named.has(n))
    let tail: string
    if (!ownLeads && level.length) tail = `${brand} is level with ${someNames(level.map((b) => b.name))}${below.length ? ` and ranks ahead of ${someNames(below)}` : ''}.`
    else if (rest.length) tail = `${brand} ${named.size ? 'also ' : ''}ranks ahead of ${someNames(rest)}.`
    else tail = ownLeads ? '' : `${brand} ranks last of the ${countWord(N)} brands ${noun}.`
    return `Competitive context: ${leaders()}${tail ? ` ${tail}` : ''}`
  }

  function firstBox(): Bullet[] {
    const out: Bullet[] = []
    if (solo) out.push({ lead: 'AI visibility:', text: `${brand} appears in ${pctText(own.visibilityPct)} of tracked answers.` })
    else if (ownZero) out.push({ lead: 'Category position:', text: `${brand} shows ${pctText(0)} visibility among the ${countWord(N)} brands ${noun}.` })
    else {
      const strong = own.rank <= 3 && own.rank <= Math.ceil(N / 2) && own.visibilityPct * 2 >= top.visibilityPct
      const sov = own.sovPct === null ? '' : ` and ${pctText(own.sovPct)} share of voice`
      out.push({ lead: strong ? 'Strong category position:' : 'Category position:', text: `${brand} ranks ${ordinal(own.rank)} among the ${countWord(N)} brands ${noun}, with ${pctText(own.visibilityPct)} visibility${sov}.` })
    }
    const site = d.ownSites?.[0]
    if (!site || site.retrievedChats <= 0) {
      out.push({ lead: 'Own-site retrievals:', text: `${brand}'s own site was not retrieved in this window.` })
      return out
    }
    const count = `${site.retrievedChats >= 1000 ? 'approximately ' : ''}${countText(site.retrievedChats)}`
    const inTop = d.ownSiteRank !== null && d.ownSiteRank !== undefined && d.ownSiteRank <= 10
    out.push(inTop
      ? { lead: 'Present in the source ecosystem:', text: `${capital(site.domain)} appears among the top domains at ${count} retrievals.` }
      : { lead: 'Own-site retrievals:', text: `${capital(site.domain)} appears in ${count} retrievals.` })
    if (site.retrievedPct !== null) {
      // One site's figure is never given to the whole brand (v1.1 §9): the brand only when it has exactly one own site.
      const subject = d.ownSites!.length === 1 ? brand : capital(site.domain)
      out.push({ lead: 'Source-use signal:', text: `${subject} is used as a source in ${pctText(site.retrievedPct)} of tracked answers.` })
    }
    return out
  }

  /** The share-of-voice part of a gap clause. `gap` points the same way as the visibility gap when positive (the rival
   *  minus the brand when the brand trails, the brand minus #2 when it leads); zero matches; negative is the other way. */
  const sovClause = (gap: number | null, behind: boolean): string => {
    if (gap === null) return ''
    if (gap === 0) return ' and matches it in share of voice'
    if (gap > 0) return ` and ${points(gap)} points in share of voice`
    return ` and ${behind ? 'leads' : 'trails'} it by ${points(gap)} points in share of voice`
  }

  function leadership(): Bullet | null {
    if (solo) return null
    if (allZero) return { lead: 'Leadership gap:', text: 'No brand tracked shows visibility in this window.' }
    const gaps = d.leaderGaps
    if (gaps.length) {
      const [g1, g2] = gaps
      let text = `${brand} trails ${g1.name} by ${points(g1.visibilityPoints)} percentage points in visibility${sovClause(g1.sovPoints, true)}`
      if (g2) {
        const respectively = g1.sovPoints !== null && g1.sovPoints > 0 && g2.sovPoints !== null && g2.sovPoints > 0
        text += respectively
          ? `; it trails ${g2.name} by ${points(g2.visibilityPoints)} and ${points(g2.sovPoints!)} points, respectively`
          : `; it trails ${g2.name} by ${points(g2.visibilityPoints)} points in visibility${sovClause(g2.sovPoints, true)}`
      }
      return { lead: 'Leadership gap:', text: `${text}.` }
    }
    if (level.length) return { lead: 'Leadership position:', text: `${brand} is level with ${someNames(level.map((b) => b.name))} at the top of the ${countWord(N)} brands ${noun}.` }
    const second = d.brands.find((b) => !b.isOwn)
    if (!second) return { lead: 'Leadership position:', text: `${brand} ranks first of the ${countWord(N)} brands ${noun}.` }
    const sov = own.sovPct !== null && second.sovPct !== null ? tenths(own.sovPct, second.sovPct) : null
    return { lead: 'Leadership position:', text: `${brand} leads ${second.name} by ${points(tenths(own.visibilityPct, second.visibilityPct))} percentage points in visibility${sovClause(sov, false)}.` }
  }

  function gapsBullet(): Bullet | null {
    if (!d.gapDomains.length) return null
    const items = d.gapDomains.map((g, i) => `${g.domain} at ${countText(g.retrievedChats)}${i === 0 ? ' retrievals' : ''}`)
    return { lead: 'Competitor domain gaps:', text: `The largest gaps include ${listText(items)}.` }
  }

  function secondBox(): Bullet[] {
    const out: Bullet[] = []
    const lead = leadership()
    if (lead) out.push(lead)
    const gaps = gapsBullet()
    if (gaps) out.push(gaps)
    const mix = d.sourceMix
    if (!mix.length) out.push({ lead: 'Source mix:', text: 'Peec reported no source types for this window.' })
    else if (mix.length === 1) out.push({ lead: 'Source mix:', text: `The domain mix is all ${label(mix[0].label)} sources.` })
    // Every other type rounds to 0.0%, so none of them is a leading type (final review M6).
    else if (mix[1].pct === 0) out.push({ lead: 'Source mix:', text: `The domain mix is almost entirely ${label(mix[0].label)} sources.` })
    else {
      const [t1, t2] = mix
      const named = new Set([t1.label, t2.label])
      const extras = ['Editorial', 'UGC'].filter((l) => !named.has(l)).map((l) => [l, mix.find((m) => m.label === l)?.pct ?? 0] as const)
      // Every percent in this one sentence is read together, so no two values ranked apart read the same. Whole numbers
      // round the exact share, as the donut does (spec amendment 2026-10-20).
      const total = mix.reduce((s, m) => s + m.weight, 0)
      const share = (l: string) => { const m = mix.find((x) => x.label === l); return { pct: m?.pct ?? 0, exact: m && total ? (m.weight / total) * 100 : 0 } }
      const [p1, p2, ...pe] = sharePctAll([share(t1.label), share(t2.label), ...extras.map(([l]) => share(l))])
      const tail = extras.length === 2
        ? `; ${extras[0][0]} represents ${pe[0]} and ${extras[1][0]} ${pe[1]}`
        : extras.length === 1 ? `; ${extras[0][0]} represents ${pe[0]}` : ''
      // "Limited" only when Editorial and UGC are both outside the top two and each under 10%, as in Ryan's example (6% and
      // 3%); otherwise the heading would state something the numbers don't (Paul, #388 review).
      const limited = extras.length === 2 && extras.every(([, v]) => v < LIMITED_SHARE_PCT)
      out.push({
        lead: limited ? 'Limited editorial and UGC presence:' : 'Source mix:',
        text: `The domain mix is led by ${label(t1.label)} sources at ${p1} and ${label(t2.label)} sources at ${p2}${tail}.`,
      })
    }
    return out
  }

  // Spec 2026-10-22 B1: the Cited Sources box, in Ryan's order.
  function citedSourcesBox(): Bullet[] {
    const out: Bullet[] = []
    const site = d.ownSites?.[0]
    if (!site || site.retrievedChats <= 0) {
      out.push({ lead: 'Citation volume:', text: `${brand}'s own site does not appear in any retrieved citations in this window.` })
    } else {
      const domain = ownDomainText(site.domain, brand)
      const n = site.retrievedChats
      out.push({ lead: 'Citation volume:', text: `${domain} appears in ${n >= 1000 ? 'approximately ' : ''}${countText(n)} retrieved ${n === 1 ? 'citation' : 'citations'}.` })
      // A rate that rounds to 0.0 after a count above zero reads "under 0.1%", as the pillar lines do (Paul, #417 review).
      const rate = site.retrievedPct === 0 ? 'under 0.1%' : site.retrievedPct === null ? null : pctText(site.retrievedPct)
      if (rate !== null) out.push({ lead: 'Citation rate:', text: `${d.ownSites!.length === 1 ? brand : domain} is cited in ${rate} of tracked answers.` })
    }
    out.push(sourceTypeMix())
    return out
  }

  function sourceTypeMix(): Bullet {
    const lead = 'Source-type mix:'
    const mix = d.sourceMix
    if (!mix.length) return { lead, text: 'Peec reported no source types for this window.' }
    if (mix.length === 1) return { lead, text: `All citations come from ${label(mix[0].label)} sources.` }
    if (mix[1].pct === 0) return { lead, text: `Almost all citations come from ${label(mix[0].label)} sources.` }
    const [t1, t2] = mix
    const named = new Set([t1.label, t2.label])
    const extras = ['Editorial', 'UGC'].filter((l) => !named.has(l))
    const total = mix.reduce((s, m) => s + m.weight, 0)
    const share = (l: string) => { const m = mix.find((x) => x.label === l); return { pct: m?.pct ?? 0, exact: m && total ? (m.weight / total) * 100 : 0 } }
    const [p1, p2, ...pe] = mixPctAll([share(t1.label), share(t2.label), ...extras.map(share)])
    const tail = extras.length === 2 ? `; ${extras[0]} accounts for ${pe[0]} and ${extras[1]} for ${pe[1]}` : extras.length === 1 ? `; ${extras[0]} accounts for ${pe[0]}` : ''
    return { lead, text: `${upper(label(t1.label))} sources account for ${p1} of citations, followed by ${label(t2.label)} sources at ${p2}${tail}.` }
  }

  // Spec 2026-10-22 B2: the Competitive Visibility box, in Ryan's order, then the gaps (D1).
  function competitiveBox(): Bullet[] {
    const out: Bullet[] = []
    if (solo) out.push({ lead: 'AI visibility:', text: `${brand} appears in ${pctText(own.visibilityPct)} of tracked answers.` })
    else if (!others.length) out.push({ lead: 'AI visibility:', text: `${brand} appears in ${pctText(own.visibilityPct)} of tracked answers; no other brand tracked has Peec data in this window.` })
    else {
      out.push(nextTier())
      if (!allZero) {
        const t = topTier()
        if (t) out.push(t)
        const p = peerCluster()
        if (p) out.push(p)
      }
    }
    const gaps = gapsBullet()
    if (gaps) out.push(gaps)
    return out
  }

  function nextTier(): Bullet {
    const lead = 'Next-tier gap:'
    if (allZero) return { lead, text: 'No brand tracked shows visibility in this window.' }
    const above = others.filter((b) => b.visibilityPct > own.visibilityPct)
    if (above.length) {
      const next = Math.min(...above.map((b) => b.visibilityPct))
      return { lead, text: `${brand} is ${points(tenths(next, own.visibilityPct))} percentage points behind ${someNames(above.filter((b) => b.visibilityPct === next).map((b) => b.name))} in visibility.` }
    }
    if (level.length) return { lead, text: `${brand} is level with ${someNames(level.map((b) => b.name))} at the top in visibility.` }
    const next = Math.max(...others.map((b) => b.visibilityPct))
    return { lead, text: `${brand} is ${points(tenths(own.visibilityPct, next))} percentage points ahead of ${someNames(others.filter((b) => b.visibilityPct === next).map((b) => b.name))} in visibility.` }
  }

  function topTier(): Bullet | null {
    const top3 = others.slice(0, 3)
    if (top3.length < 2) return null
    // In whole tenths, half up, so the average and the distance are exact on the printed one-decimal values (spec D3).
    const avg = Math.round(top3.reduce((s, b) => s + Math.round(b.visibilityPct * 10), 0) / top3.length) / 10
    const x = tenths(avg, own.visibilityPct)
    const set = `top-${countWord(top3.length)} average visibility of ${avg.toFixed(1)}%`
    if (x === 0) return { lead: 'Top-tier distance:', text: `${brand} matches the ${set}.` }
    return { lead: 'Top-tier distance:', text: `${brand} is ${points(x)} percentage points ${x > 0 ? 'below' : 'above'} the ${set}.` }
  }

  function peerCluster(): Bullet | null {
    if (others.length < 2) return null
    const i = d.brands.findIndex((b) => b.isOwn)
    const above = d.brands.slice(0, i)
    const below = d.brands.slice(i + 1)
    const peers = !above.length ? below.slice(0, 2) : !below.length ? above.slice(-2) : [above[above.length - 1], below[0]]
    const values = [own.visibilityPct, ...peers.map((b) => b.visibilityPct)]
    const x = tenths(Math.max(...values), Math.min(...values))
    if (x > PEER_CLUSTER_MAX_POINTS) return null
    const [p1, p2] = peers
    if (x === 0) return { lead: 'Peer cluster:', text: `${brand} sits at the same visibility as ${p1.name} and ${p2.name}.` }
    return { lead: 'Peer cluster:', text: `${brand} sits within a ${points(x)}-point visibility range alongside ${p1.name} and ${p2.name}.` }
  }

  function methodology(): string {
    const used = settingsUsedOf(d).methodologyStatesPromptsAndModels
    const parts = [
      used && d.promptCount !== null ? `${d.promptCount.toLocaleString('en-US')} prompts tracked` : null,
      used && d.models.length ? `answers from ${listText(d.models)}` : null,
    ].filter((p): p is string => p !== null)
    const end = 'Results are directional and intended to identify areas for deeper analysis.'
    const set = solo ? 'the brand alone' : `${countWord(N)} brands compared`
    if (parts.length) return `Snapshot based on Peec AI data for ${d.windowLabel}: ${listText([set, ...parts])}. ${end}`
    return `Snapshot based on Peec AI data for ${d.windowLabel}, ${solo ? 'for the brand alone' : `comparing ${countWord(N)} brands`}. ${end}`
  }

  /** Round 3 (Ryan, 2026-10-21; pillars spec P3): one data line per pillar from the source shares. */
  function pillars(): Opportunity[] {
    const none = 'Peec reported no source types for this window.'
    const lines = d.sourceMix.length ? pillarLines() : [none, none, none]
    return PILLARS.map((p, i) => ({ workstream: p.name, opportunity: p.description, signal: lines[i] }))
  }
  function pillarLines(): string[] {
    const mix = d.sourceMix
    const total = mix.reduce((s, m) => s + m.weight, 0)
    // The brand's own site counts once, in the Content line: an own row Peec files as Editorial or Competitor comes out
    // of that line (Paul, #415 review). A slice left with nothing reads as absent.
    const outside = (label: string) => {
      const m = mix.find((x) => x.label === label)
      const weight = (m?.weight ?? 0) - (d.ownMixByType?.[label] ?? 0)
      return m && weight > 0 ? { weight, pct: total ? pyRound((weight / total) * 100, 1) : 0 } : undefined
    }
    const editorial = outside('Editorial')
    const competitor = outside('Competitor')
    const ownWeight = d.ownMixWeight ?? 0
    const own = ownWeight > 0 ? { weight: ownWeight, pct: total ? pyRound((ownWeight / total) * 100, 1) : 0 } : undefined
    // The shares shown, each rounded on its own below (round 3 QA replaced the single pass of pillars spec §9 m1).
    const shown = [editorial, own, competitor].filter((x): x is { weight: number; pct: number } => !!x)
    // Round 3 QA (spec 2026-10-22 F3): the source-mix bullet's rounding (D5), each share on its own, so a pillar reads as
    // its donut slice does. The three are separate facts, not a ranking, so two may read alike (dev click-through).
    const texts = shown.map((x) => mixPctAll([{ pct: x.pct, exact: total ? (x.weight / total) * 100 : 0 }])[0])
    const share = (x: { weight: number; pct: number }) => (x.pct === 0 ? 'under 0.1%' : texts[shown.indexOf(x)])
    // "Citations", Ryan's word for the same shares (bullets spec 2026-10-22 D2).
    const tail = 'of citations in this window.'
    const missing = 'among citations in this window.'
    const plural = new Set(d.ownDomains.filter(Boolean)).size > 1
    const ownSubject = `${brand}'s own ${plural ? 'sites' : 'site'}`
    return [
      editorial ? `Editorial sites make up ${share(editorial)} ${tail}` : `Editorial sites don't appear ${missing}`,
      own ? `${ownSubject} ${plural ? 'make' : 'makes'} up ${share(own)} ${tail}` : `${ownSubject} ${plural ? "don't" : "doesn't"} appear ${missing}`,
      competitor ? `Competitors' own websites make up ${share(competitor)} ${tail}` : solo ? 'No competitors are tracked in this Peec project.' : `Competitors' own websites don't appear ${missing}`,
    ]
  }

  return {
    context: context(),
    methodology: methodology(),
    current: { competitive_bullets: citedSourcesBox(), sources_bullets: competitiveBox() },
    v2: { competitive_bullets: firstBox(), sources_bullets: secondBox() },
    opportunities: pillars(),
  }
}

export function dataSentences(d: SnapshotData): DataSentences {
  const w = write(d)
  return { context: w.context, competitive_bullets: w.current.competitive_bullets, sources_bullets: w.current.sources_bullets, methodology: w.methodology, opportunities: w.opportunities }
}

/** Spec 2026-10-22 B3: the version 2 boxes, kept unchanged so grounding can still allow the numbers that a row written with
 *  them prints. Rows of today's version never use them. */
export function boxesV2(d: SnapshotData): Pick<DataSentences, 'competitive_bullets' | 'sources_bullets'> {
  return write(d).v2
}

/** The boxes each earlier sentences version printed, by version (Paul, #417 review). A row written under version n also
 *  allows the numbers OLDER_BOXES[n] prints. Bumping SENTENCES_VERSION means adding the outgoing version here, or its
 *  rows gain flags on bullets they stored; grounding.test.ts fails until it is added. Version 1 keeps version 2's boxes,
 *  as it did before this lookup. */
export const OLDER_BOXES: Readonly<Record<number, (d: SnapshotData) => Pick<DataSentences, 'competitive_bullets' | 'sources_bullets'>>> = { 1: boxesV2, 2: boxesV2 }

/** The own-site slice reads "own-site" in a sentence; every other type as the donut shows it. */
const label = (l: string): string => (l === 'You' ? 'own-site' : l)
