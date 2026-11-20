// lib/organic-social/social-listening/trends.ts
// Theme trends (emerging, decreasing, new themes). Talkwalker's export does not hold them, so staff type them per month
// (spec docs/superpowers/specs/2026-11-19-social-listening-tab-design.md, sections 7 and 8). Pure, safe in the browser
// (the editor previews with the same parser).
import type { SlTrend, SlTrendLists, SlTrends } from './types'

/** At most 25 themes per list. */
export const MAX_TRENDS = 25
// My own bound, not the spec's: a keyword theme is a few words.
const MAX_THEME = 100

// A trailing change as the deck writes it: an optional sign, a number, an optional K or M, then %.
const LINE = /^(.*\S)\s+([+-]?\d+(?:\.\d+)?[KkMm]?%)$/

/** One theme per line; a line may end with its change (`+5.1K%`, `-77%`, `12.5%`), kept as typed. Blank lines are
 *  skipped. A line that is only a change is a theme of that text, never an empty theme. */
export function parseTrendLines(text: string): SlTrend[] {
  const out: SlTrend[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const m = LINE.exec(line)
    out.push(m ? { theme: m[1].trim(), change: m[2] } : { theme: line, change: null })
  }
  return out
}

/** The editor's text for a list: the inverse of parseTrendLines. */
export function formatTrendLines(list: readonly SlTrend[]): string {
  return list.map((t) => (t.change ? `${t.theme} ${t.change}` : t.theme)).join('\n')
}

const NAMES = { emerging: 'Emerging', decreasing: 'Decreasing', newThemes: 'New themes' } as const

/** The editor's three texts, parsed and bounded. */
export function checkTrendLists(input: unknown): { ok: true; lists: SlTrendLists } | { ok: false; error: string } {
  if (typeof input !== 'object' || input === null) return { ok: false, error: 'invalid trends' }
  const i = input as Record<string, unknown>
  const lists = {} as SlTrendLists
  for (const key of ['emerging', 'decreasing', 'newThemes'] as const) {
    const text = i[key]
    if (typeof text !== 'string') return { ok: false, error: 'invalid trends' }
    if (text.includes('\u0000')) return { ok: false, error: `${NAMES[key]} holds a character that cannot be saved.` }
    const list = parseTrendLines(text)
    if (list.length > MAX_TRENDS) return { ok: false, error: `${NAMES[key]} has more than ${MAX_TRENDS} themes.` }
    if (list.some((t) => t.theme.length > MAX_THEME)) return { ok: false, error: `A theme in ${NAMES[key]} is over ${MAX_THEME} characters.` }
    lists[key] = list
  }
  return { ok: true, lists }
}

/** What a client sees: the approved lists, never a draft (R2-11), and nothing when all three are empty, so the
 *  section stays hidden ("only when staff entered them", section 9). */
export function clientTrends(t: SlTrends | null): SlTrendLists | null {
  const a = t?.approved
  if (!a) return null
  return a.emerging.length + a.decreasing.length + a.newThemes.length > 0 ? a : null
}
