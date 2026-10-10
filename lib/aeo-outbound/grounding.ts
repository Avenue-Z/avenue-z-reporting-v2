// Post-generation checks (spec §6): numbers must appear in the Data block, domains must be Peec's.
// Modeled on lib/peec/content-impact-synopsis.ts:58-100. Runs on every save too, so notes stay current.
import { DECISIONS } from './config'
import type { SnapshotData } from './metrics'
import { slotEntries, type Slots } from './slots'

const NUM = /#?\d[\d,]*(?:\.\d+)?%?/g
const DOMAIN = /\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}\b/gi
/** The kind of a number token and its digits: "12%" is a percentage, "#3" a rank, "1,989" a bare count. */
const kindOf = (t: string): 'pct' | 'hash' | 'bare' => (t.endsWith('%') ? 'pct' : t.startsWith('#') ? 'hash' : 'bare')
const digitsOf = (t: string) => t.replace(/[#%,]/g, '')
const DASHES = new RegExp(`[${String.fromCharCode(0x2013)}${String.fromCharCode(0x2014)}]`)
/** Paths set by code, not by Glean: a dash there comes from Peec or a fixed sentence and Glean can't fix it. */
const CODE_SET = new Set(['category', 'market', ...(DECISIONS.fixedNextStep !== null ? ['next_step'] : [])])

export function groundingFlags(slots: Slots, d: SnapshotData, dataText: string): string[] {
  const allowedDomains = new Set([...d.ownDomains, ...d.gapDomains.map((g) => g.domain), ...(dataText.match(DOMAIN) ?? [])].map((x) => x.toLowerCase()))
  // With no competitors tracked the Data block names no outside brand, so its digits are not exempt either.
  const brandNames = (d.competitorsTracked === 0 ? d.brands.filter((b) => b.isOwn) : d.brands).map((b) => b.name)
  const exemptNames = [...brandNames, ...allowedDomains].filter(Boolean).sort((a, b) => b.length - a.length)
  // Digits inside a name or a domain are not figures. The window's days and years are in the Data block, so they stay allowed as bare numbers.
  let figures = dataText
  for (const name of exemptNames) figures = figures.split(name).join(' ')
  const allowed = new Set((figures.match(NUM) ?? []).map((t) => `${kindOf(t)}:${digitsOf(t)}`))
  for (const y of [d.window.start, d.window.end]) allowed.add(`bare:${y.slice(0, 4)}`)
  const grounded = (t: string) => {
    const k = kindOf(t), v = digitsOf(t)
    return allowed.has(`${k}:${v}`) || (k === 'bare' && allowed.has(`hash:${v}`))
  }
  const flags: string[] = []
  for (const [path, value] of slotEntries(slots)) {
    let text = value
    for (const name of exemptNames) text = text.split(name).join(' ')
    for (const m of value.match(DOMAIN) ?? []) if (!allowedDomains.has(m.toLowerCase())) flags.push(`${path.split('.')[0]}: "${m}" is not a domain in the Peec data`)
    for (const m of text.match(NUM) ?? []) if (!grounded(m)) flags.push(`${path.split('.')[0]}: "${m}" is not in the Peec data`)
    if (!CODE_SET.has(path) && DASHES.test(text)) flags.push(`${path.split('.')[0]}: contains a long dash; use a period or comma`)
  }
  return [...new Set(flags)]
}
