// Post-generation checks (spec §6, v1.1 §3): numbers must appear in the Data block, domains must be Peec's, on every
// slot. A KPI value is compared with Peec's value and the window label with Peec's label instead. Modeled on
// lib/peec/content-impact-synopsis.ts:58-100. Runs on every save, so notes stay current. Flags are structured notes.
import { NEEDS_VALIDATION } from './config'
import { settingsUsedOf, type SnapshotData } from './metrics'
import type { Note, NoteKind } from './notes'
import { showsPowered } from './render'
import { cleanValue, slotEntries, withDefaults, type Slots } from './slots'

const NUM = /#?\d[\d,]*(?:\.\d+)?%?/g
const DOMAIN = /\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}\b/gi
/** The kind of a number token and its digits: "12%" is a percentage, "#3" a rank, "1,989" a bare count. */
const kindOf = (t: string): 'pct' | 'hash' | 'bare' => (t.endsWith('%') ? 'pct' : t.startsWith('#') ? 'hash' : 'bare')
const digitsOf = (t: string) => t.replace(/[#%,]/g, '')
const DASHES = new RegExp(`[${String.fromCharCode(0x2013)}${String.fromCharCode(0x2014)}]`)
/** Avenue Z's own site, linked from the page itself (v1.1 §3). */
const ALWAYS_ALLOWED_DOMAINS = ['avenuez.com']
const RANK_CARD = /^#\d+ of \d+ brands$/

/**
 * True when a KPI value Ryan typed differs from Peec's (v1.1 §3). The rank card compares its number tokens in order;
 * every other card compares one number after removing %, # and commas, at Peec's displayed precision. Anything that is
 * not such a number differs.
 */
export function kpiDiffers(shown: string, peec: string): boolean {
  if (RANK_CARD.test(peec)) {
    const want = peec.match(/\d+/g) ?? []
    const got = shown.match(/\d+(?:\.\d+)?/g) ?? []
    return got.length !== want.length || got.some((g, i) => Number(g) !== Number(want[i]))
  }
  const p = peec.replace(/[%#,]/g, '').trim()
  const s = shown.replace(/[%#,]/g, '').trim()
  const places = (p.split('.')[1] ?? '').length
  const sn = Number(s)
  if (s === '' || !Number.isFinite(sn)) return true
  return sn.toFixed(places) !== Number(p).toFixed(places)
}

/**
 * Paths whose long dash is not flagged because code set the text and Glean can't fix it (spec v1.1 §16.1, from Task 3b):
 * market always; category on a version 1 row always, on a version 2 row only while it still equals the code value
 * (Peec's category or "Needs validation"); next_step only while it still equals the row's fixed sentence. The fixed
 * sentence is read from the row (the settings it was generated with), never live settings. Compared after cleanValue,
 * the way every slot is stored.
 */
function dashExempt(path: string, s: { category: string; next_step: string }, d: SnapshotData): boolean {
  if (path === 'market') return true
  if (path === 'category') return d.schemaVersion !== 2 || cleanValue(s.category) === cleanValue(d.category ?? NEEDS_VALIDATION)
  if (path === 'next_step') {
    const fixed = settingsUsedOf(d).fixedNextStep
    return fixed !== null && cleanValue(s.next_step) === cleanValue(fixed)
  }
  return false
}

export function groundingFlags(slots: Slots, d: SnapshotData, dataText: string): Note[] {
  const full = withDefaults(slots, d)
  const allowedDomains = new Set([...d.ownDomains, ...d.gapDomains.map((g) => g.domain), ...(dataText.match(DOMAIN) ?? []), ...ALWAYS_ALLOWED_DOMAINS].map((x) => x.toLowerCase()))
  // With no competitors tracked the Data block names no outside brand, so its digits are not exempt either.
  const brandNames = (d.competitorsTracked === 0 ? d.brands.filter((b) => b.isOwn) : d.brands).map((b) => b.name)
  // An edited brand name is exempt too (v1.1 §14). It is added only when it differs, so a version 1 row is unchanged.
  const renamed = full.brand !== d.brand ? [full.brand] : []
  const exemptNames = [...brandNames, ...renamed, ...allowedDomains].filter(Boolean).sort((a, b) => b.length - a.length)
  // Digits inside a name or a domain are not figures. The window's days and years are in the Data block, so they stay allowed as bare numbers.
  let figures = dataText
  for (const name of exemptNames) figures = figures.split(name).join(' ')
  const allowed = new Set((figures.match(NUM) ?? []).map((t) => `${kindOf(t)}:${digitsOf(t)}`))
  for (const y of [d.window.start, d.window.end]) allowed.add(`bare:${y.slice(0, 4)}`)
  const grounded = (t: string) => {
    const k = kindOf(t), v = digitsOf(t)
    return allowed.has(`${k}:${v}`) || (k === 'bare' && allowed.has(`hash:${v}`))
  }
  const out: Note[] = []
  const seen = new Set<string>()
  const add = (kind: NoteKind, path: string, text: string) => {
    const key = `${kind}|${path}|${text}`
    if (!seen.has(key)) { seen.add(key); out.push({ kind, path, text }) }
  }
  const entries = slotEntries(full)
  for (const [path, value] of entries) {
    // The page hides the context box when no competitor is tracked (render.ts), so its text is never shown.
    if (path === 'context' && d.competitorsTracked === 0) continue
    if (path === 'brand') continue
    // The page hides the Powered by line under an Avenue Z wordmark (spec v1.1 §16.1), so its text is never shown.
    if (path === 'page.sidebar_powered' && !showsPowered(full.page.sidebar_wordmark)) continue
    const kpi = /^kpis\.(\d)\.value$/.exec(path)
    if (kpi) {
      const peec = d.kpis[Number(kpi[1])]
      if (peec && kpiDiffers(value, peec.value)) add('kpi_changed', path, `${peec.label} shows ${value} but Peec says ${peec.value}`)
      continue
    }
    if (path === 'window_label') {
      if (value !== d.windowLabel) add('kpi_changed', path, `Data window shows ${value} but Peec says ${d.windowLabel}`)
      continue
    }
    let text = value
    for (const name of exemptNames) text = text.split(name).join(' ')
    // The report name and the top-left name come from settings or Ryan's own edit, not from Glean (v1.1 §17.5): no domain or number check.
    if (path !== 'page.series' && path !== 'page.sidebar_wordmark') {
      for (const m of value.match(DOMAIN) ?? []) if (!allowedDomains.has(m.toLowerCase())) add('domain_not_in_data', path, `"${m}" is not a domain in the Peec data`)
      for (const m of text.match(NUM) ?? []) if (!grounded(m)) add('number_not_in_data', path, `"${m}" is not in the Peec data`)
    }
    if (!dashExempt(path, full, d) && DASHES.test(text)) add('long_dash', path, 'contains a long dash; use a period or comma')
  }
  if (d.brand && full.brand !== d.brand) {
    const n = entries.filter(([p, v]) => p !== 'brand' && v.split(full.brand).join(' ').includes(d.brand)).length
    if (n > 0) add('brand_changed', 'brand', `The copy still says ${d.brand} in ${n} ${n === 1 ? 'place' : 'places'}`)
  }
  return out
}
