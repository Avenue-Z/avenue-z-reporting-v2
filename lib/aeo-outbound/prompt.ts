// The prompt that replaces Ryan's Glean skill (spec §6). Rules restated from his skill's Writing rules and
// Fixed document format, plus the strict number rules of lib/peec/content-impact-synopsis.ts:225-227.
import { DECISIONS } from './config'
import { settingsUsedOf, type BrandMetric, type SnapshotData } from './metrics'

const n = (x: number) => x.toLocaleString('en-US')
const p1 = (x: number) => `${x.toFixed(1)}%`

/** Peec text goes into the Data block on one line: a newline in a name or title can't forge a Data line. */
const one = (t: string) => t.replace(/\s+/g, ' ').trim()

/** Peec's impact enum (VERY_HIGH) as plain words for client copy; an empty one says so. */
const impactWords = (t: string) => one(t).replace(/_/g, ' ').toLowerCase() || 'impact not given'

/** Version 2: the top five by rank, with the own brand in place of the fifth when it ranks lower (v1.1 §9). */
function listedBrands(d: SnapshotData, v2: boolean): BrandMetric[] {
  if (d.competitorsTracked === 0) return d.brands.filter((b) => b.isOwn).slice(0, 5)
  const top = d.brands.slice(0, 5)
  if (!v2 || top.some((b) => b.isOwn)) return top
  const own = d.brands.find((b) => b.isOwn)
  return own ? [...top.slice(0, 4), own] : top
}
/** Version 2: the 5 brands above with the smallest gaps, kept in rank order (v1.1 §9). */
function listedGaps(d: SnapshotData, v2: boolean): SnapshotData['leaderGaps'] {
  if (d.competitorsTracked === 0) return []
  if (!v2) return d.leaderGaps
  const keep = new Set([...d.leaderGaps].sort((a, b) => a.visibilityPoints - b.visibilityPoints).slice(0, 5))
  return d.leaderGaps.filter((g) => keep.has(g))
}

export function dataBlock(d: SnapshotData): string {
  // A version 1 row (no schemaVersion) keeps every version 1 line, so grounding on its saves is unchanged (v1.1 §10).
  const v2 = d.schemaVersion === 2
  // No competitors tracked: Peec can still return a row for a brand outside the roster, and metrics counts it in
  // the rank and the comparison set. Name none of them, and print no rank.
  const noRivals = d.competitorsTracked === 0
  const listed = listedBrands(d, v2)
  const gaps = listedGaps(d, v2)
  const points = (x: number) => (v2 ? x.toFixed(1) : String(x))
  const showSov = !(v2 && noRivals)
  const ownSite = d.ownDomains.length ? `answers that retrieved ${d.ownDomains.map(one).join(', ')}` : "answers that retrieved the brand's own site"
  const ownLine = v2 && d.ownSites && d.ownSites.length
    ? `Own site retrievals by domain (answers that retrieved each site): ${d.ownSites.map((s) => `${one(s.domain)} ${n(s.retrievedChats)}${s.retrievedPct !== null ? `, which is ${p1(s.retrievedPct)} of answers` : ''}`).join('; ')}`
    : `Own site retrievals (${ownSite}): ${n(d.ownRetrievedChats)}${d.ownRetrievedPct !== null ? `, which is ${p1(d.ownRetrievedPct)} of answers` : ''}`
  const lines = [
    `Brand: ${one(d.brand)}`,
    `Category: ${d.category === null ? 'not in Peec' : one(d.category)}`,
    `Market: ${d.market === null ? 'not in Peec' : one(d.market)}`,
    `Data window: ${one(d.windowLabel)}`,
    `Key metrics: ${d.kpis.map((k) => `${one(k.label)} ${one(k.value)}`).join('; ')}`,
    `Competitors tracked in Peec: ${d.competitorsTracked}`,
    ...(noRivals ? [] : [`Brands in the comparison set: ${d.rankN}`]),
    `Brands by AI visibility (rank, name, visibility, share of voice): ${listed.map((b) => `${noRivals ? '' : `#${b.rank} `}${one(b.name)} ${p1(b.visibilityPct)}${showSov && b.sovPct !== null ? ` / ${p1(b.sovPct)}` : ''}`).join('; ') || 'none'}`,
    `Gap to each brand ranked above (visibility points, share of voice points): ${gaps.map((g) => `${one(g.name)} ${points(g.visibilityPoints)} points${typeof g.sovPoints === 'number' && g.sovPoints > 0 ? `, ${points(g.sovPoints)} points` : ''}`).join('; ') || 'none'}`,
    ownLine,
    `Source types by share of retrievals: ${d.sourceMix.map((s) => `${one(s.label)} ${p1(s.pct)}`).join('; ') || 'none'}`,
    `Competitor domain gaps (sites where competitors appear and the brand does not, by answers that used them): ${d.gapDomains.map((g) => `${one(g.domain)} ${n(g.retrievedChats)}`).join('; ') || 'none'}`,
    `Current Peec recommended actions (title, impact): ${d.actions.map((a) => `${one(a.title)} (${impactWords(a.impact)})`).join('; ') || 'none'}`,
  ]
  if (settingsUsedOf(d).methodologyStatesPromptsAndModels) lines.push(`Prompts tracked: ${d.promptCount ?? 'not reported'}`, `AI models covered: ${d.models.map(one).join(', ') || 'not reported'}`)
  return lines.join('\n')
}

export function buildPrompt(d: SnapshotData, violations: string[]): string {
  const used = settingsUsedOf(d)
  const peecRows = used.peecOpportunityRows
  return `You write a client-facing one-page AI Visibility Snapshot for a prospect brand.

Use ONLY the Data section below. Do not search company documents, Slack, email or any other source. If something is not in the Data section, leave it out.

Writing rules:
- Concise, polished, neutral and client-facing. Plain English. No em dashes or en dashes; use periods and commas.
- Keep findings, hypotheses and recommendations distinct. Use explore, investigate and test. Do not present a full roadmap.
- Use Peec terms where possible: visibility, share of voice, position, retrievals.
- Do not write any numbers, percentages, counts or ranks, in digits or in words. Describe position and direction in words (leads, trails, ahead of, behind). The page shows every number from Peec next to your words.
- Do not say "no" or "none" when a count is positive. Do not state a positive number when the count is zero.
- Do not infer model coverage, timeframe, market, sentiment or causality beyond the Data section.
- Never mention a discovery call, an internal brief or how the data was gathered. No pricing, no agency comparisons, no criticism of prior partners.

Write these fields:
- headline: one short headline about the brand's own most decision-relevant signal. The brand is the subject; never make a competitor the subject.
- summary: one sentence stating that signal, with competitive context when the data supports it.
- why: one compact paragraph connecting the pattern to consideration and category discovery, without claiming causality.
- opportunities: exactly 3 items, each { "signal", "opportunity", "workstream" }. Each connects a data signal to something to explore. Workstreams such as Content / AEO, PR / earned media, Technical AEO / SEO.${peecRows > 0 ? ` If the Peec recommended actions list is not "none", you may base at most ${peecRows} of the 3 on those actions, and only where an action fits the data. Never force one. An opportunity based on an action has a signal that starts with "Peec recommends".` : ''}
${used.fixedNextStep === null ? '- next_step: one sentence on a next step, such as a full AEO audit.\n' : ''}${DECISIONS.writeSpecificCategory ? '- category: a short, specific category for the brand based on the data, at most 80 characters.\n' : ''}
Output strictly valid JSON with exactly these keys and no markdown fences or commentary.${violations.length ? `\n\nIMPORTANT: A previous attempt had these problems: ${violations.join(' | ')}. Do not repeat them.` : ''}

Data:
${dataBlock(d)}`
}

export function parseModelJson(raw: string): unknown | null {
  const tryParse = (s: string) => { try { return JSON.parse(s) } catch { return null } }
  const direct = tryParse(raw.trim())
  if (direct !== null) return direct
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced?.[1]) { const v = tryParse(fenced[1].trim()); if (v !== null) return v }
  const first = raw.indexOf('{'), last = raw.lastIndexOf('}')
  if (first !== -1 && last > first) return tryParse(raw.slice(first, last + 1))
  return null
}
