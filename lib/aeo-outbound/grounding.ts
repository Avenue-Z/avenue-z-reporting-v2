// Post-generation checks (spec §6, v1.1 §3): numbers must appear in the Data block, domains must be Peec's, on every
// slot. A KPI value is compared with Peec's value and the window label with Peec's label instead. Modeled on
// lib/peec/content-impact-synopsis.ts:58-100. Runs on every save, so notes stay current. Flags are structured notes.
import { NEEDS_VALIDATION, SENTENCES_VERSION } from './config'
import { settingsUsedOf, type SnapshotData } from './metrics'
import type { Note, NoteKind } from './notes'
import { showsPowered } from './render'
import { dataSentences, isCodeSentencePath, type DataSentences } from './sentences'
import { cleanValue, slotEntries, withDefaults, type Slots } from './slots'

/** Phrases that read as numbers but aren't figures, removed before the scan (Paul, #388 review). */
const IDIOMS = /\b(?:double[- ]down|24\/7)\b/gi
// Spec v1.1 §19.3: number words flagged in a Glean-written field (ordinals are not; "one" is too common to be a figure).
const NUMBER_WORDS = /\b(?:two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|hundred|thousand|half|twice|double|doubled|triple|tripled|percent)\b/gi
const UNCHECKED = (token: string) => `"${token}": check this number against Peec's numbers on the page.`
/** A number standing on its own in Glean's words, read whole: a digit run touching a letter (H1, H10, B2B) is part of a
 *  word, as is one joined by a hyphen to a capital letter (COVID-19, GPT-4; "top-10" is still a number); a K, M or x right
 *  after the digits is part of the number (10K, 3x). */
const NUM_ALONE = /(?<![A-Za-z\d.,#])(?<![A-Z]-)#?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?:%|[KkMmx](?![A-Za-z]))?(?![A-Za-z\d])/g
/** Count words a code-written sentence prints ("the five brands", "two more"), compared when Ryan edits it. "one" is left
 *  out, as in NUMBER_WORDS: it is too common to be a figure (final review M1). */
const COUNT_WORDS = /\b(?:two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\b/gi
/** Rank words in a code-written sentence ("third", "21st"): compared with Peec's sentence when Ryan edits it. */
const ORDINAL = /\b(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth|sixteenth|seventeenth|eighteenth|nineteenth|twentieth|\d+(?:st|nd|rd|th))\b/gi
// Words that say nothing about which action is meant, so they never count as a match (review of Tasks 37 to 40).
const STOP = new Set(['about', 'their', 'these', 'those', 'which', 'where', 'there', 'other', 'every', 'peecs'])
/** The words of five letters or more that can tie a "Peec recommends" line to one of Peec's action titles. */
const keyWords = (s: string) => new Set((s.toLowerCase().match(/[a-z0-9]{5,}/g) ?? []).filter((w) => !STOP.has(w) && !w.startsWith('recommend')))
/** Each token, with how often it occurs. */
const counted = (tokens: string[]) => { const m = new Map<string, number>(); for (const t of tokens) m.set(t, (m.get(t) ?? 0) + 1); return m }

const NUM = /#?\d[\d,]*(?:\.\d+)?%?/g
const DOMAIN = /\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}\b/gi
/** The kind of a number token and its digits: "12%" is a percentage, "#3" a rank, "1,989" a bare count. */
const kindOf = (t: string): 'pct' | 'hash' | 'bare' => (t.endsWith('%') ? 'pct' : t.startsWith('#') ? 'hash' : 'bare')
const digitsOf = (t: string) => t.replace(/[#%,]/g, '')
const DASHES = new RegExp(`[${String.fromCharCode(0x2013)}${String.fromCharCode(0x2014)}]`)
/** Avenue Z's own site, linked from the page itself (v1.1 §3). */
const ALWAYS_ALLOWED_DOMAINS = ['avenuez.com']
const RANK_CARD = /^#\d+ of \d+ brands$/
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Dates (spec v1.1 §17.14). Month names are capitalised, full, three-letter or Sept, with an optional period. Each gap is
// one `\s+`, and every digit run is closed by (?!\d), so the pattern is linear: nothing can backtrack across a run.
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const MONTH_ABBR: Record<string, number> = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, Jun: 6, Jul: 7, Aug: 8, Sept: 9, Sep: 9, Oct: 10, Nov: 11, Dec: 12 }
const DATE_RE = /\b(?:(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept|Sep|Oct|Nov|Dec)\.?\s+(?:(\d{4})(?!\d)|(\d{1,2})(?!\d)(?:,?\s+(\d{4})(?!\d))?)|(\d{4})-(\d{2})-(\d{2})(?!\d))/g
const monthOf = (name: string): number => MONTH_ABBR[name] ?? MONTH_NAMES.indexOf(name) + 1
const isoDay = (y: number, m: number, d: number): number | null => {
  const t = Date.UTC(y, m - 1, d)
  const c = new Date(t)
  return c.getUTCFullYear() === y && c.getUTCMonth() === m - 1 && c.getUTCDate() === d ? t : null
}
const utcOf = (iso: string): number => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)))

/**
 * Every written date in a slot's text that falls outside the data window (UTC calendar days, both bounds inclusive).
 * With a year the day must be in the window; "Month YYYY" passes when any day of that month is; with no year the month
 * and day must be in the window in at least one of its years. An impossible date is outside by definition.
 */
export function datesOutsideWindow(text: string, window: { start: string; end: string }): string[] {
  const start = utcOf(window.start), end = utcOf(window.end)
  if (!Number.isFinite(start) || !Number.isFinite(end)) return []
  const y0 = new Date(start).getUTCFullYear(), y1 = new Date(end).getUTCFullYear()
  const inWindow = (t: number | null) => t !== null && t >= start && t <= end
  const out: string[] = []
  for (const m of text.matchAll(DATE_RE)) {
    let ok: boolean
    if (m[1]) {
      const mo = monthOf(m[1])
      if (m[2]) {
        const y = Number(m[2])
        ok = Date.UTC(y, mo - 1, 1) <= end && Date.UTC(y, mo, 0) >= start
      } else if (m[4]) {
        ok = inWindow(isoDay(Number(m[4]), mo, Number(m[3])))
      } else {
        ok = false
        for (let y = y0; y <= y1 && !ok; y++) ok = inWindow(isoDay(y, mo, Number(m[3])))
      }
    } else {
      ok = inWindow(isoDay(Number(m[5]), Number(m[6]), Number(m[7])))
    }
    if (!ok) out.push(m[0])
  }
  return out
}

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
  // Spec v1.1 §19.3: the new checks run only on rows generated with code-written sentences, so an older row's flags
  // are exactly what they were.
  const sentencesRow = typeof d.sentences === 'number'
  // On a row with sentences, each domain also without its "www.", the way a code-written sentence prints it
  // (sentences.ts, capital). An older row's set is unchanged.
  const allowedDomains = new Set([...d.ownDomains, ...d.gapDomains.map((g) => g.domain), ...(dataText.match(DOMAIN) ?? []), ...ALWAYS_ALLOWED_DOMAINS]
    .map((x) => x.toLowerCase()).flatMap((x) => (sentencesRow ? [x, x.replace(/^www\./, '')] : [x])))
  // With no competitors tracked the Data block names no outside brand, so its digits are not exempt either. A row with
  // sentences also names its no-data roster brands in the context (v1.1 §19.1), so those names are exempt too.
  const brandNames = [
    ...(d.competitorsTracked === 0 ? d.brands.filter((b) => b.isOwn) : d.brands).map((b) => b.name),
    ...(sentencesRow && d.competitorsTracked > 0 ? d.noDataBrands ?? [] : []),
  ]
  // An edited brand name is exempt too (v1.1 §14). It is added only when it differs, so a version 1 row is unchanged.
  const renamed = full.brand !== d.brand ? [full.brand] : []
  const exemptNames = [...brandNames, ...renamed, ...allowedDomains].filter(Boolean).sort((a, b) => b.length - a.length)
  /** The text with every exempt name and domain removed, longest first: digits inside a name are not figures. */
  const stripNames = (v: string) => { let t = v; for (const name of exemptNames) t = t.split(name).join(' '); return t }
  // Digits inside a name or a domain are not figures. The window's days and years are in the Data block, so they stay allowed as bare numbers.
  const figures = stripNames(dataText)
  const allowed = new Set((figures.match(NUM) ?? []).map((t) => `${kindOf(t)}:${digitsOf(t)}`))
  for (const y of [d.window.start, d.window.end]) allowed.add(`bare:${y.slice(0, 4)}`)
  // Every number of the code-written sentences is allowed (whole percents, points, counts), read the same way as a slot.
  // Allowed numbers come from today's sentences on any new row; the word-for-word check needs the row's own version.
  const sentences: DataSentences | null = sentencesRow ? dataSentences(d) : null
  const sameVersion = d.sentences === SENTENCES_VERSION
  // Round 3 (pillars spec P7): on a pillar row the data line is a code sentence and no opportunity field is Glean's.
  // Table rows are checked exactly as before.
  const pillarRow = full.opportunities_layout === 'pillars'
  const pillarLine = (path: string): boolean => pillarRow && /^opportunities\.\d\.signal$/.test(path)
  if (sentences) {
    const s = sentences
    // A hidden Opportunities page is not on the page, so its pillar lines' numbers are not data for other fields (round 3).
    const sentenceText = stripNames([s.context, s.methodology, ...[...s.competitive_bullets, ...s.sources_bullets].flatMap((b) => [b.lead, b.text]), ...(pillarRow && full.opportunities_page !== 'hidden' ? s.opportunities.map((o) => o.signal) : [])].join(' | '))
    for (const t of sentenceText.match(NUM) ?? []) allowed.add(`${kindOf(t)}:${digitsOf(t)}`)
  }
  const fixedNext = settingsUsedOf(d).fixedNextStep
  /** A field Glean wrote (v1.1 §19.3): the category only while it is not Peec's value, next_step only with no fixed sentence. */
  const gleanWrote = (path: string): boolean => {
    if (pillarRow && path.startsWith('opportunities.')) return false
    if (/^(?:headline|summary|why|opportunities\.\d\.(?:signal|opportunity|workstream))$/.test(path)) return true
    if (path === 'category') return cleanValue(full.category) !== cleanValue(d.category ?? NEEDS_VALIDATION)
    return path === 'next_step' && fixedNext === null
  }
  const domainsLongestFirst = [...allowedDomains].sort((a, b) => b.length - a.length)
  const namesOnly = [...brandNames, ...renamed].filter(Boolean).sort((a, b) => b.length - a.length)
  const stripBrandNames = (v: string) => { let t = v; for (const name of namesOnly) t = t.split(name).join(' '); return t }
  const withoutDomains = (v: string) => { let t = v; for (const x of domainsLongestFirst) t = t.replace(new RegExp(`(?<![A-Za-z0-9.-])${escapeRe(x)}(?!\\.?[A-Za-z0-9-])`, 'gi'), ' '); return t }
  /** Peec's own sentence for a code-written path, found by path, and for a bullet by its lead, so an added or removed
   *  bullet still matches; undefined when Ryan changed the lead (then the number check uses every Peec number). */
  const peecSentence = (path: string): string | undefined => {
    if (!sentences) return undefined
    if (path === 'context') return sentences.context
    if (path === 'methodology') return sentences.methodology
    const line = pillarLine(path) ? /^opportunities\.(\d)\.signal$/.exec(path) : null
    if (line) return sentences.opportunities[Number(line[1])]?.signal
    const m = /^(competitive_bullets|sources_bullets)\.(\d)\.(lead|text)$/.exec(path)
    if (!m) return undefined
    const key = m[1] as 'competitive_bullets' | 'sources_bullets'
    const lead = full[key][Number(m[2])]?.lead
    const gen = lead === undefined ? undefined : sentences[key].find((b) => cleanValue(b.lead) === cleanValue(lead))
    return gen ? (m[3] === 'lead' ? gen.lead : gen.text) : undefined
  }
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
    const text = stripNames(value)
    // The report name and the top-left name come from settings or Ryan's own edit, not from Glean (v1.1 §17.5): no domain or number check.
    if (path !== 'page.series' && path !== 'page.sidebar_wordmark') {
      // A code-written sentence names brands, some shaped like domains (Care.com): check it with the names removed. Peec's
      // domains go first and in any case, so a brand that starts its own domain ("Giggle", "Gigglefinance.com") cannot
      // leave half a domain behind (final review I2).
      const domainText = sentencesRow && (isCodeSentencePath(path) || pillarLine(path)) ? stripBrandNames(withoutDomains(value)) : value
      for (const m of domainText.match(DOMAIN) ?? []) if (!allowedDomains.has(m.toLowerCase())) add('domain_not_in_data', path, `"${m}" is not a domain in the Peec data`)
      const ref = sameVersion && (isCodeSentencePath(path) || pillarLine(path)) ? peecSentence(path) : undefined
      if (sentencesRow && gleanWrote(path)) {
        // Peec's own action titles (an "H1 heading") are not Glean's numbers.
        let words = text
        for (const a of d.actions) if (a.title) words = words.split(a.title).join(' ')
        words = words.replace(IDIOMS, ' ')
        for (const m of words.match(NUM_ALONE) ?? []) add('unchecked_number', path, UNCHECKED(m))
        for (const m of words.match(NUMBER_WORDS) ?? []) add('unchecked_number', path, UNCHECKED(m))
      } else if (ref !== undefined) {
        // Ryan edited a code-written sentence: every number and rank word must be one Peec's sentence has (review of Tasks 37 to 40).
        const want = counted((stripNames(ref).match(NUM) ?? []).map((t) => `${kindOf(t)}:${digitsOf(t)}`))
        for (const m of text.match(NUM) ?? []) {
          const k = `${kindOf(m)}:${digitsOf(m)}`
          if (want.get(k)) want.set(k, want.get(k)! - 1)
          else add('number_not_in_data', path, `"${m}" does not match Peec's number in this sentence`)
        }
        const ranks = new Set((stripNames(ref).match(ORDINAL) ?? []).map((w) => w.toLowerCase()))
        for (const w of text.match(ORDINAL) ?? []) if (!ranks.has(w.toLowerCase())) add('number_not_in_data', path, `"${w}" does not match Peec's rank in this sentence`)
        const words = counted((stripNames(ref).match(COUNT_WORDS) ?? []).map((w) => w.toLowerCase()))
        for (const w of text.match(COUNT_WORDS) ?? []) {
          const k = w.toLowerCase()
          if (words.get(k)) words.set(k, words.get(k)! - 1)
          else add('number_not_in_data', path, `"${w}" does not match Peec's number in this sentence`)
        }
      } else {
        for (const m of text.match(NUM) ?? []) if (!grounded(m)) add('number_not_in_data', path, `"${m}" is not in the Peec data`)
      }
      for (const m of datesOutsideWindow(text, d.window)) add('date_not_in_window', path, `"${m}" is outside the data window (${d.windowLabel})`)
    }
    if (sentencesRow && !pillarRow && /^opportunities\.\d\.signal$/.test(path) && /peec\s+recommend/i.test(value)) {
      const words = keyWords(value)
      const actionWords = d.actions.map((a) => keyWords(a.title))
      if (!d.actions.length) add('peec_recommends', path, 'Peec has no recommended actions for this project.')
      else if (!actionWords.some((a) => [...words].some((w) => a.has(w)))) add('peec_recommends', path, `Check this against Peec's recommended actions: ${d.actions.map((a) => a.title).join('; ')}.`)
    }
    if (!dashExempt(path, full, d) && DASHES.test(text)) add('long_dash', path, 'contains a long dash; use a period or comma')
  }
  if (d.brand && full.brand !== d.brand) {
    const n = entries.filter(([p, v]) => p !== 'brand' && v.split(full.brand).join(' ').includes(d.brand)).length
    if (n > 0) add('brand_changed', 'brand', `The copy still says ${d.brand} in ${n} ${n === 1 ? 'place' : 'places'}`)
  }
  return out
}
