// The prompt that replaces Ryan's Glean skill (spec §6). Rules restated from his skill's Writing rules and
// Fixed document format, plus the strict number rules of lib/peec/content-impact-synopsis.ts:225-227.
import { DECISIONS } from './config'
import type { SnapshotData } from './metrics'

const n = (x: number) => x.toLocaleString('en-US')
const p1 = (x: number) => `${x.toFixed(1)}%`

/** Peec text goes into the Data block on one line: a newline in a name or title can't forge a Data line. */
const one = (t: string) => t.replace(/\s+/g, ' ').trim()

export function dataBlock(d: SnapshotData): string {
  // No competitors tracked: Peec can still return a row for a brand outside the roster, and metrics counts it in
  // the rank and the comparison set. Name none of them, and print no rank.
  const noRivals = d.competitorsTracked === 0
  const listed = noRivals ? d.brands.filter((b) => b.isOwn) : d.brands
  const gaps = noRivals ? [] : d.leaderGaps
  const ownSite = d.ownDomains.length ? `answers that retrieved ${d.ownDomains.map(one).join(', ')}` : "answers that retrieved the brand's own site"
  const lines = [
    `Brand: ${one(d.brand)}`,
    `Category: ${d.category === null ? 'not in Peec' : one(d.category)}`,
    `Market: ${d.market === null ? 'not in Peec' : one(d.market)}`,
    `Data window: ${one(d.windowLabel)}`,
    `Key metrics: ${d.kpis.map((k) => `${one(k.label)} ${one(k.value)}`).join('; ')}`,
    `Competitors tracked in Peec: ${d.competitorsTracked}`,
    ...(noRivals ? [] : [`Brands in the comparison set: ${d.rankN}`]),
    `Brands by AI visibility (rank, name, visibility, share of voice): ${listed.slice(0, 5).map((b) => `${noRivals ? '' : `#${b.rank} `}${one(b.name)} ${p1(b.visibilityPct)}${b.sovPct !== null ? ` / ${p1(b.sovPct)}` : ''}`).join('; ') || 'none'}`,
    `Gap to each brand ranked above (visibility points, share of voice points): ${gaps.map((g) => `${one(g.name)} ${g.visibilityPoints} points${g.sovPoints !== null ? `, ${g.sovPoints} points` : ''}`).join('; ') || 'none'}`,
    `Own site retrievals (${ownSite}): ${n(d.ownRetrievedChats)}${d.ownRetrievedPct !== null ? `, which is ${p1(d.ownRetrievedPct)} of answers` : ''}`,
    `Source types by share of retrievals: ${d.sourceMix.map((s) => `${one(s.label)} ${p1(s.pct)}`).join('; ') || 'none'}`,
    `Competitor domain gaps (sites where competitors appear and the brand does not, by answers that used them): ${d.gapDomains.map((g) => `${one(g.domain)} ${n(g.retrievedChats)}`).join('; ') || 'none'}`,
    `Current Peec recommended actions (title, impact): ${d.actions.map((a) => `${one(a.title)} (${one(a.impact)})`).join('; ') || 'none'}`,
  ]
  if (DECISIONS.methodologyStatesPromptsAndModels) lines.push(`Prompts tracked: ${d.promptCount ?? 'not reported'}`, `AI models covered: ${d.models.map(one).join(', ') || 'not reported'}`)
  return lines.join('\n')
}

export function buildPrompt(d: SnapshotData, violations: string[]): string {
  const peecRows = DECISIONS.peecOpportunityRows
  return `You write a client-facing one-page AI Visibility Snapshot for a prospect brand.

Use ONLY the Data section below. Do not search company documents, Slack, email or any other source. If something is not in the Data section, leave it out.

Writing rules:
- Concise, polished, neutral and client-facing. Plain English. No em dashes or en dashes; use periods and commas.
- Keep findings, hypotheses and recommendations distinct. Use explore, investigate and test. Do not present a full roadmap.
- Use Peec terms where possible: visibility, share of voice, position, retrievals.
- Every number you write must appear exactly in the Data section. Do not calculate new numbers. Do not round.
- Do not say "no" or "none" when a count is positive. Do not state a positive number when the count is zero.
- Do not infer prompt count, model coverage, timeframe, market, sentiment or causality beyond the Data section.
- Never mention a discovery call, an internal brief or how the data was gathered. No pricing, no agency comparisons, no criticism of prior partners.
- Keep strengths and gaps distinct; never repeat a strength as a gap.

Write these fields:
- headline: one short headline about the most decision-relevant signal.
- summary: one sentence stating that signal, with competitive context when the data supports it.
- context: one sentence naming the leading competitors with their visibility and share of voice, then the brand's rank. If no competitors are tracked, write one sentence about the brand alone.
- competitive_bullets: 2 or 3 bullets of validated strengths (category position, own-site presence, source use). Each has a short "lead" ending in a colon (at most 80 characters) and a "text".
- sources_bullets: 2 or 3 bullets of gaps (visibility gaps to leaders, competitor domain gaps, source mix). Same lead and text shape.
- why: one compact paragraph connecting the pattern to consideration and category discovery, without claiming causality.
- opportunities: exactly 3 items, each { "signal", "opportunity", "workstream" }. Each connects a data signal to something to explore. Workstreams such as Content / AEO, PR / earned media, Technical AEO / SEO.${peecRows > 0 ? ` If the Peec recommended actions list is not "none", exactly ${peecRows} of the 3 must be based on those actions and its signal must start with "Peec recommends".` : ''}
- methodology: one sentence naming the data window, the comparison set${DECISIONS.methodologyStatesPromptsAndModels ? ', the prompt count and the AI models covered' : ''}. Say results are directional.
${DECISIONS.fixedNextStep === null ? '- next_step: one sentence on a next step, such as a full AEO audit.\n' : ''}${DECISIONS.writeSpecificCategory ? '- category: a short, specific category for the brand based on the data.\n' : ''}
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
