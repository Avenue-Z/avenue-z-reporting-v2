// One plain-words name per editable path (spec v1.1 §4), shared by the Before you send panel, grounding flags and save
// errors. A bullet is named by its section's current title. Lookups use own properties only, so no prototype key
// ever becomes a label.
import type { PageKey } from './slots'

const SCALAR_LABELS: Record<string, string> = {
  category: 'Category', market: 'Market', headline: 'Headline', summary: 'Summary sentence', context: 'Competitive context',
  why: 'Why it matters', methodology: 'Methodology', next_step: 'Next step', brand: 'Brand name', window_label: 'Data window',
}
const PAGE_LABELS: Record<PageKey, string> = {
  series: 'Report name', headline_label: 'Headline label', section_1_title: 'Sources section title', section_2_title: 'Visibility section title',
  opps_label: 'Opportunities label', method_nav: 'Methodology menu item', category_label: 'Category label', market_label: 'Market label',
  window_prefix: 'Data window label', chart_1_title: 'Domain types chart title', chart_2_title: 'Visibility chart title', why_title: 'Why it matters title',
  opps_title: 'Opportunities title', opps_col_1: 'Opportunities table, first column', opps_col_2: 'Opportunities table, second column',
  opps_col_3: 'Opportunities table, third column', opps_takeaway: 'Opportunities footnote', method_label: 'Methodology label',
  next_label: 'Next step label', prepared_label: 'Prepared label', footer_name: 'Footer name', footer_desc: 'Footer description',
  footer_link: 'Footer link text', footer_disclaimer: 'Footer disclaimer', sidebar_wordmark: 'Top-left name', sidebar_powered: 'Menu tagline',
  sidebar_link: 'Menu link text', method_title: 'Methodology title',
}
const has = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k)
const PILLAR_FIELDS: Record<string, string> = { workstream: 'name', opportunity: 'description', signal: 'data line' }

/** On a pillar row (round 3) an opportunity field reads as a pillar's. */
export function fieldLabel(path: string, titles: readonly [string, string], pillars = false): string {
  if (has(SCALAR_LABELS, path)) return SCALAR_LABELS[path]
  let m = /^page\.([a-z0-9_]+)$/.exec(path)
  if (m && has(PAGE_LABELS, m[1])) return PAGE_LABELS[m[1] as PageKey]
  const section = (list: string) => (list === 'competitive_bullets' ? titles[0] : titles[1])
  m = /^(competitive_bullets|sources_bullets)\.(\d)\.(lead|text|remove)$/.exec(path)
  if (m) {
    const where = `${section(m[1])}, bullet ${Number(m[2]) + 1}`
    return m[3] === 'lead' ? `${where}, bold lead-in` : m[3] === 'text' ? `${where}, text` : `${where}, remove`
  }
  m = /^(competitive_bullets|sources_bullets)\.add$/.exec(path)
  if (m) return `${section(m[1])}, add a bullet`
  m = /^opportunities\.(\d)\.(signal|opportunity|workstream)$/.exec(path)
  if (m) return pillars ? `Pillar ${Number(m[1]) + 1}, ${PILLAR_FIELDS[m[2]]}` : `Opportunity ${Number(m[1]) + 1}, ${m[2]}`
  m = /^kpis\.(\d)\.(label|value)$/.exec(path)
  if (m) return `Metric card ${Number(m[1]) + 1}, ${m[2]}`
  return path
}
