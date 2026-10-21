// The editable copy (spec §6, §9a; v1.1 §3). competitive_bullets holds the sources section's box (beside the Domain Types
// donut) and sources_bullets the competitive visibility section's (beside the bars), whatever their order on the page.
// v1.1 makes every visible word a slot: brand, window_label, kpis and the page words. A row from before v1.1 lacks those
// keys; withDefaults fills them from the row's own data and the v1.0 words, never from live settings, so a settings change never alters an existing row.
import { NEEDS_VALIDATION, PAGE_WORDS_V1 } from './config'
import type { Kpi } from './metrics'

export interface Bullet { lead: string; text: string }
export interface Opportunity { signal: string; opportunity: string; workstream: string }
export const PAGE_KEYS = [
  'series', 'headline_label', 'section_1_title', 'section_2_title', 'opps_label', 'method_nav', 'category_label', 'market_label',
  'window_prefix', 'chart_1_title', 'chart_2_title', 'why_title', 'opps_title', 'opps_col_1', 'opps_col_2', 'opps_col_3',
  'opps_takeaway', 'method_label', 'next_label', 'prepared_label', 'footer_name', 'footer_desc', 'footer_link',
  'footer_disclaimer', 'sidebar_wordmark', 'sidebar_powered', 'sidebar_link', 'method_title',
] as const
export type PageKey = (typeof PAGE_KEYS)[number]
export type PageWords = Record<PageKey, string>
const V1_WORDS: PageWords = PAGE_WORDS_V1

/** As stored. Every row has the copy keys; rows from before v1.1 lack brand, window_label, kpis and page. */
export interface Slots {
  category: string
  market: string
  headline: string
  summary: string
  context: string
  competitive_bullets: Bullet[]
  sources_bullets: Bullet[]
  why: string
  opportunities: Opportunity[]
  methodology: string
  next_step: string
  brand?: string
  window_label?: string
  kpis?: Kpi[]
  page?: Partial<PageWords>
}
/** Every key present: what saves, grounding and render work on. */
export type FullSlots = Omit<Slots, 'brand' | 'window_label' | 'kpis' | 'page'> & { brand: string; window_label: string; kpis: Kpi[]; page: PageWords }

export const MAX_VALUE = 1000
export const MAX_LEAD = 80
export const MAX_LABEL = 120
const SCALARS = ['category', 'market', 'headline', 'summary', 'context', 'why', 'methodology', 'next_step'] as const
// The closed path grammar (spec §9a, v1.1 §3). Page keys are spelled out, so no prototype key can ever match.
const PATH = new RegExp(`^(?:(category|market|headline|summary|context|why|methodology|next_step|brand|window_label)|(competitive_bullets|sources_bullets)\\.(\\d)\\.(lead|text)|opportunities\\.(\\d)\\.(signal|opportunity|workstream)|kpis\\.(\\d)\\.(label|value)|page\\.(${PAGE_KEYS.join('|')}))$`)
// Spec v1.1 18.12: in a draft each findings box holds 1 to 6 bullets (Glean still writes 2 or 3).
export const MIN_BULLETS = 1
export const MAX_BULLETS = 6
const STRUCTURE = /^(competitive_bullets|sources_bullets)\.(?:add|([0-5])\.remove)$/
export const isStructuralPath = (path: string): boolean => STRUCTURE.test(path)
export const STRUCTURE_ERRORS = { full: 'A list can have at most six bullets.', min: 'A list needs at least one bullet.' } as const

export function cleanValue(v: string): string {
  return v.replace(/[\x00-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim()
}

function checkValue(raw: unknown, limit: number): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof raw !== 'string') return { ok: false, error: 'value must be text' }
  const value = cleanValue(raw)
  if (!value) return { ok: false, error: "This field can't be empty." }
  if (value.length > limit) return { ok: false, error: `Keep this under ${limit} characters.` }
  return { ok: true, value }
}

/** Characters allowed for a path (v1.1 §3, §16.1): footer description and disclaimer 1,000; other page words, KPIs, brand
 *  and window label 120; a bullet lead and the category 80; the rest of the copy 1,000. */
export function limitFor(path: string): number {
  if (path === 'page.footer_desc' || path === 'page.footer_disclaimer') return MAX_VALUE
  if (path.startsWith('page.') || path.startsWith('kpis.') || path === 'brand' || path === 'window_label') return MAX_LABEL
  // A bullet lead, and the category since Ryan's Q3 answer (spec v1.1 §16.1, Task 3b): 80.
  return path.endsWith('.lead') || path === 'category' ? MAX_LEAD : MAX_VALUE
}

/** The page words a new row is created with: v1.0's, with the section titles, wordmark and report name from settings (v1.1 §3). */
export function pageDefaults(s: { sectionTitles: readonly string[]; sidebarWordmark: string; series: string }): PageWords {
  return { ...V1_WORDS, section_1_title: s.sectionTitles[0], section_2_title: s.sectionTitles[1], sidebar_wordmark: s.sidebarWordmark, series: s.series }
}

/** Every key filled. Missing keys read the row's own data (brand, window label, KPIs) and the v1.0 words. Never mutates. */
export function withDefaults(s: Slots, d: { brand: string; windowLabel: string; kpis: Kpi[] }): FullSlots {
  const { brand, window_label, kpis, page, ...copy } = structuredClone(s)
  return { ...copy, brand: brand ?? d.brand, window_label: window_label ?? d.windowLabel, kpis: kpis ?? structuredClone(d.kpis), page: { ...V1_WORDS, ...(page ?? {}) } }
}

export function applySlotPatch(slots: FullSlots, path: string, raw: unknown): { ok: true; slots: FullSlots } | { ok: false; error: string } {
  const m = PATH.exec(path)
  if (!m) return { ok: false, error: 'unknown field' }
  const checked = checkValue(raw, limitFor(path))
  if (!checked.ok) return checked
  const next: FullSlots = structuredClone(slots)
  if (m[1]) {
    (next as unknown as Record<string, string>)[m[1]] = checked.value
  } else if (m[2]) {
    const item = next[m[2] as 'competitive_bullets' | 'sources_bullets'][Number(m[3])]
    if (!item) return { ok: false, error: 'unknown field' }
    item[m[4] as keyof Bullet] = checked.value
  } else if (m[5]) {
    const item = next.opportunities[Number(m[5])]
    if (!item) return { ok: false, error: 'unknown field' }
    item[m[6] as keyof Opportunity] = checked.value
  } else if (m[7]) {
    const item = next.kpis[Number(m[7])]
    if (!item) return { ok: false, error: 'unknown field' }
    item[m[8] as keyof Kpi] = checked.value
  } else {
    next.page[m[9] as PageKey] = checked.value
  }
  return { ok: true, slots: next }
}

/** Add a bullet to a list shorter than MAX_BULLETS, or remove one from a list longer than MIN_BULLETS (v1.1 §3, 18.12).
 *  A remove checks its index first: one at or past the end is unknown field. value is the literal "structure": ignored,
 *  but it must be non-empty text, so the §9a rule holds for every PATCH. */
export function applyStructure(slots: FullSlots, path: string, raw: unknown): { ok: true; slots: FullSlots } | { ok: false; error: string } {
  const m = STRUCTURE.exec(path)
  if (!m) return { ok: false, error: 'unknown field' }
  const checked = checkValue(raw, MAX_VALUE)
  if (!checked.ok) return checked
  const next: FullSlots = structuredClone(slots)
  const list = next[m[1] as 'competitive_bullets' | 'sources_bullets']
  if (m[2] === undefined) {
    if (list.length >= MAX_BULLETS) return { ok: false, error: STRUCTURE_ERRORS.full }
    list.push({ lead: NEEDS_VALIDATION, text: NEEDS_VALIDATION })
  } else {
    const index = Number(m[2])
    if (index >= list.length) return { ok: false, error: 'unknown field' }
    if (list.length <= MIN_BULLETS) return { ok: false, error: STRUCTURE_ERRORS.min }
    list.splice(index, 1)
  }
  return { ok: true, slots: next }
}

/** Every [path, value] in page order: the copy as v1.0 listed it, then brand, window label, KPIs and page words. */
export function slotEntries(s: FullSlots): [string, string][] {
  const out: [string, string][] = SCALARS.map((k) => [k, s[k]])
  for (const list of ['competitive_bullets', 'sources_bullets'] as const) s[list].forEach((b, i) => { out.push([`${list}.${i}.lead`, b.lead], [`${list}.${i}.text`, b.text]) })
  s.opportunities.forEach((o, i) => { out.push([`opportunities.${i}.signal`, o.signal], [`opportunities.${i}.opportunity`, o.opportunity], [`opportunities.${i}.workstream`, o.workstream]) })
  out.push(['brand', s.brand], ['window_label', s.window_label])
  s.kpis.forEach((k, i) => { out.push([`kpis.${i}.label`, k.label], [`kpis.${i}.value`, k.value]) })
  for (const k of PAGE_KEYS) out.push([`page.${k}`, s.page[k]])
  return out
}

/** Case-insensitive: a reviewer typing "needs validation" still blocks Approve (spec §9). */
export const needsValidationPaths = (s: FullSlots): string[] => slotEntries(s).filter(([, v]) => v.toLowerCase().includes(NEEDS_VALIDATION.toLowerCase())).map(([p]) => p)

/** The slots code writes at generation (spec §6; v1.1 §19.2): category, market, an optional fixed next_step, and the
 *  data sentences (context, both boxes, methodology) when given. */
export interface FixedSlots {
  category: string
  market: string
  next_step?: string
  context?: string
  methodology?: string
  competitive_bullets?: Bullet[]
  sources_bullets?: Bullet[]
}

/** Shape and limits for a model reply (spec §6). A field in `fixed` comes from code and is checked for length only; a
 *  code-written box needs at least one bullet but not Glean's 2 or 3 (v1.1 §19.2). */
export function validateGeneratedSlots(raw: unknown, fixed: FixedSlots): { ok: true; slots: Slots } | { ok: false; errors: string[] } {
  const errors: string[] = []
  const o = (raw && typeof raw === 'object' ? raw : null) as Record<string, unknown> | null
  if (!o) return { ok: false, errors: ['reply is not a JSON object'] }
  const text = (key: string, v: unknown, limit = MAX_VALUE): string => {
    const c = checkValue(v, limit)
    if (!c.ok) { errors.push(`${key}: ${c.error}`); return '' }
    return c.value
  }
  const bullets = (key: 'competitive_bullets' | 'sources_bullets'): Bullet[] => {
    const code = fixed[key]
    if (code) {
      if (!code.length) { errors.push(`${key}: needs at least 1 bullet`); return [] }
      return code.map((b, i) => ({ lead: text(`${key}.${i}.lead`, b.lead, MAX_LEAD), text: text(`${key}.${i}.text`, b.text) }))
    }
    const v = o[key]
    if (!Array.isArray(v) || v.length < 2 || v.length > 3) { errors.push(`${key}: needs 2 or 3 bullets`); return [] }
    return v.map((b, i) => ({ lead: text(`${key}.${i}.lead`, (b as Bullet)?.lead, MAX_LEAD), text: text(`${key}.${i}.text`, (b as Bullet)?.text) }))
  }
  const opps = Array.isArray(o.opportunities) && o.opportunities.length === 3
    ? o.opportunities.map((x, i) => ({
        signal: text(`opportunities.${i}.signal`, (x as Opportunity)?.signal),
        opportunity: text(`opportunities.${i}.opportunity`, (x as Opportunity)?.opportunity),
        workstream: text(`opportunities.${i}.workstream`, (x as Opportunity)?.workstream),
      }))
    : (errors.push('opportunities: needs exactly 3'), [])
  const slots: Slots = {
    category: text('category', fixed.category),
    market: text('market', fixed.market),
    headline: text('headline', o.headline),
    summary: text('summary', o.summary),
    context: text('context', fixed.context ?? o.context),
    competitive_bullets: bullets('competitive_bullets'),
    sources_bullets: bullets('sources_bullets'),
    why: text('why', o.why),
    opportunities: opps,
    methodology: text('methodology', fixed.methodology ?? o.methodology),
    next_step: text('next_step', fixed.next_step ?? o.next_step),
  }
  return errors.length ? { ok: false, errors } : { ok: true, slots }
}
