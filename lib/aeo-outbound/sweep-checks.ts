// The any-client check (2026-10-22): what generation builds before Glean, checked for anything a prospect would read
// as broken. Pure: no network, no database. scripts/aeo-outbound-sweep.ts runs it on every Peec pitch project.
// Only checks that do not repeat the code's own formula; a check that recomputes a sentence the same way proves nothing.
import { visibilityBarFigure } from './charts'
import { chartedBrands } from './charted'
import { groundingFlags } from './grounding'
import type { SnapshotData } from './metrics'
import { dataBlock } from './prompt'
import { renderSnapshotHtml } from './render'
import { dataSentences } from './sentences'
import type { Slots } from './slots'

const WORDING: { kind: string; re: RegExp; excerpt: boolean }[] = [
  { kind: 'plural after 1', re: /\b1 (?:retrievals|prompts|citations|brands|answers|sites)\b/, excerpt: true },
  { kind: '"a" before a vowel sound', re: /\ba (?:8[\d.]*|1[18](?:\.\d+)?)-point\b/, excerpt: true },
  { kind: 'double period', re: /\S*[^.\s]\.\.(?=\s|$)/, excerpt: true },
  { kind: 'stray space', re: /^\s|\s$|\s{2}|\s['’.,;:!?]/, excerpt: false },
  { kind: 'broken value', re: /\b(?:undefined|NaN|null|Infinity)\b|\[object|\$\{|approximately|-%/, excerpt: true },
]

/** Wording problems in sentences a prospect reads. Brand names are left out of the long-dash check (a name may carry one). */
export function wordingProblems(texts: string[], brandNames: string[]): string[] {
  const out = new Set<string>()
  for (const text of texts) {
    for (const w of WORDING) {
      const m = text.match(w.re)
      if (m) out.add(w.excerpt ? `${w.kind}: "${m[0]}"` : w.kind)
    }
    let stripped = text
    for (const name of [...brandNames].sort((a, b) => b.length - a.length)) if (name) stripped = stripped.split(name).join(' ')
    if (/[\u2013\u2014]/.test(stripped)) out.add('long dash')
  }
  return [...out]
}

/** Every problem with one project's report, as generation would build it before Glean writes its fields. */
export function checkReport(d: SnapshotData): string[] {
  const problems: string[] = []
  const s = dataSentences(d)
  const boxes = { cited: s.competitive_bullets, visibility: s.sources_bullets }
  const texts = [s.context, s.methodology, ...[...boxes.cited, ...boxes.visibility].flatMap((b) => [b.lead, b.text]), ...s.opportunities.map((o) => o.signal)]
  problems.push(...wordingProblems(texts, d.brands.map((b) => b.name)))
  for (const [name, box] of Object.entries(boxes)) if (box.length < 1 || box.length > 4) problems.push(`${name} box has ${box.length} bullets`)
  // The citation count is the own site's retrieved chats, exactly.
  const cv = boxes.cited.find((b) => b.lead === 'Citation volume:')?.text.match(/appears in ([\d,]+) retrieved/)
  const site = d.ownSites?.[0]
  if (cv && site && Number(cv[1].replace(/,/g, '')) !== site.retrievedChats) problems.push(`citation count ${cv[1]} is not ${site.retrievedChats}`)
  // The chart: at most ten bars, the brand always among them; at most four gap domains.
  const bars = ((visibilityBarFigure(d.brands).data[0] as { y?: unknown[] } | undefined)?.y ?? []).length
  if (bars > 10) problems.push(`${bars} bars on the chart`)
  if (d.brands.some((b) => b.isOwn) && !chartedBrands(d.brands).some((b) => b.isOwn)) problems.push('the brand is not on the chart')
  if (d.gapDomains.length > 4) problems.push(`${d.gapDomains.length} gap domains`)
  // The code's own sentences must pass the grounding check; Glean's fields are numberless placeholders.
  const slots: Slots = {
    category: d.category ?? 'Category', market: d.market ?? 'Market', headline: 'Headline', summary: 'Summary.', why: 'Why.', next_step: 'Next.',
    ...s, opportunities_layout: 'pillars', section_order: 'visibility_first',
  }
  for (const f of groundingFlags(slots, d, dataBlock(d))) problems.push(`grounding: ${f.path ?? ''} ${f.text}`)
  // The page renders in every mode with no broken value in its visible text.
  for (const mode of ['draft', 'preview', 'final'] as const) {
    try {
      const visible = renderSnapshotHtml(d, slots, mode, 'Oct 22, 2026')
        .replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ')
      const m = visible.match(/\b(?:undefined|NaN|Infinity)\b|\[object|\$\{/)
      if (m) problems.push(`${mode} page shows "${m[0]}"`)
    } catch (e) {
      problems.push(`${mode} page failed to render: ${String((e as Error)?.message ?? e).slice(0, 120)}`)
    }
  }
  return problems
}
