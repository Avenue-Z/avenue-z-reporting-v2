// The editable copy (spec §6, §9a). competitive_bullets holds the first data section (strengths) and
// sources_bullets the second (gaps), as spec §5 row 5-6 says.
import { NEEDS_VALIDATION } from './config'

export interface Bullet { lead: string; text: string }
export interface Opportunity { signal: string; opportunity: string; workstream: string }
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
}
export const MAX_VALUE = 1000
const GENERATED_KEYS = ['headline', 'summary', 'context', 'competitive_bullets', 'sources_bullets', 'why', 'opportunities', 'methodology', 'next_step']
const BULLET_KEYS = ['lead', 'text']
const OPPORTUNITY_KEYS = ['signal', 'opportunity', 'workstream']
export const MAX_LEAD = 80
const SCALARS = ['category', 'market', 'headline', 'summary', 'context', 'why', 'methodology', 'next_step'] as const
type Scalar = (typeof SCALARS)[number]
const PATH = /^(?:(category|market|headline|summary|context|why|methodology|next_step)|(competitive_bullets|sources_bullets)\.(\d)\.(lead|text)|opportunities\.(\d)\.(signal|opportunity|workstream))$/

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

export function applySlotPatch(slots: Slots, path: string, raw: unknown): { ok: true; slots: Slots } | { ok: false; error: string } {
  const m = PATH.exec(path)
  if (!m) return { ok: false, error: 'unknown field' }
  const checked = checkValue(raw, m[4] === 'lead' ? MAX_LEAD : MAX_VALUE)
  if (!checked.ok) return checked
  const next: Slots = structuredClone(slots)
  if (m[1]) {
    next[m[1] as Scalar] = checked.value
  } else if (m[2]) {
    const item = next[m[2] as 'competitive_bullets' | 'sources_bullets'][Number(m[3])]
    if (!item) return { ok: false, error: 'unknown field' }
    item[m[4] as keyof Bullet] = checked.value
  } else {
    const item = next.opportunities[Number(m[5])]
    if (!item) return { ok: false, error: 'unknown field' }
    item[m[6] as keyof Opportunity] = checked.value
  }
  return { ok: true, slots: next }
}

/** Every [path, value] in page order. */
export function slotEntries(s: Slots): [string, string][] {
  const out: [string, string][] = SCALARS.map((k) => [k, s[k]])
  for (const list of ['competitive_bullets', 'sources_bullets'] as const) s[list].forEach((b, i) => { out.push([`${list}.${i}.lead`, b.lead], [`${list}.${i}.text`, b.text]) })
  s.opportunities.forEach((o, i) => { out.push([`opportunities.${i}.signal`, o.signal], [`opportunities.${i}.opportunity`, o.opportunity], [`opportunities.${i}.workstream`, o.workstream]) })
  return out
}

export const needsValidationPaths = (s: Slots): string[] => slotEntries(s).filter(([, v]) => v.includes(NEEDS_VALIDATION)).map(([p]) => p)

/** Shape and limits for a model reply (spec §6). category, market and an optional fixed next_step come from code. */
export function validateGeneratedSlots(raw: unknown, fixed: { category: string; market: string; next_step?: string }): { ok: true; slots: Slots } | { ok: false; errors: string[] } {
  const errors: string[] = []
  const o = (raw && typeof raw === 'object' ? raw : null) as Record<string, unknown> | null
  if (!o) return { ok: false, errors: ['reply is not a JSON object'] }
  const onlyKeys = (key: string, v: unknown, allowed: string[]): void => {
    if (v && typeof v === 'object') for (const k of Object.keys(v)) if (!allowed.includes(k)) errors.push(`${key}: unexpected key ${k}`)
  }
  onlyKeys('reply', o, GENERATED_KEYS)
  const text = (key: string, v: unknown, limit = MAX_VALUE): string => {
    const c = checkValue(v, limit)
    if (!c.ok) { errors.push(`${key}: ${c.error}`); return '' }
    return c.value
  }
  const bullets = (key: 'competitive_bullets' | 'sources_bullets'): Bullet[] => {
    const v = o[key]
    if (!Array.isArray(v) || v.length < 2 || v.length > 3) { errors.push(`${key}: needs 2 or 3 bullets`); return [] }
    return v.map((b, i) => (onlyKeys(`${key}.${i}`, b, BULLET_KEYS), { lead: text(`${key}.${i}.lead`, (b as Bullet)?.lead, MAX_LEAD), text: text(`${key}.${i}.text`, (b as Bullet)?.text) }))
  }
  const opps = Array.isArray(o.opportunities) && o.opportunities.length === 3
    ? o.opportunities.map((x, i) => (onlyKeys(`opportunities.${i}`, x, OPPORTUNITY_KEYS), {
        signal: text(`opportunities.${i}.signal`, (x as Opportunity)?.signal),
        opportunity: text(`opportunities.${i}.opportunity`, (x as Opportunity)?.opportunity),
        workstream: text(`opportunities.${i}.workstream`, (x as Opportunity)?.workstream),
      }))
    : (errors.push('opportunities: needs exactly 3'), [])
  const slots: Slots = {
    category: fixed.category,
    market: fixed.market,
    headline: text('headline', o.headline),
    summary: text('summary', o.summary),
    context: text('context', o.context),
    competitive_bullets: bullets('competitive_bullets'),
    sources_bullets: bullets('sources_bullets'),
    why: text('why', o.why),
    opportunities: opps,
    methodology: text('methodology', o.methodology),
    next_step: fixed.next_step ?? text('next_step', o.next_step),
  }
  return errors.length ? { ok: false, errors } : { ok: true, slots }
}
