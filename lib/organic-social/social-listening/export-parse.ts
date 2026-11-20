// lib/organic-social/social-listening/export-parse.ts
// Reads one Talkwalker dashboard export (legacy .xls) into the stored shape and checks it against the export contract,
// rules V1 to V9 (spec docs/superpowers/specs/2026-11-19-social-listening-tab-design.md, section 6). Every rule must
// pass or nothing is stored; every failed rule is collected, so the refusal names them all.
//
// The frame of every sheet (docs/findings/2026-11-19-social-listening-xls-parser.md and the earlier format finding the
// spec cites): row 1 `Title: <widget>`, row 2 `Filters: <topic>, <media types...>, MM/DD/YY - MM/DD/YY`, row 3 blank,
// row 4 the header, data from row 5. Widgets are found by title and header shape, never by sheet name (names collide
// and truncate). Column positions follow the parse that matched the real files 16 of 16.
//
// Safety: the file is untrusted. It is read with SheetJS 0.20.3 (the CDN release with both advisories fixed), formulas
// are never read or evaluated, dates stay text, and parsed names go into arrays, never object keys. Messages name a
// rule and a widget title (our own fixed strings), never a value, name or file name from the file; the only exceptions
// are the month names V4 prints.
import * as XLSX from 'xlsx'
import type { SlExport, SlMonth, SlParseResult, SlRuleId, SlSentimentCounts, SlTopic } from './types'

export const MAX_EXPORT_BYTES = 2 * 1024 * 1024

const NOT_ORIGINAL = "This isn't the original Talkwalker .xls export. Upload the file as downloaded."
const TOO_BIG = 'The file is over 2 MB.'
// The OLE2 compound file signature: the legacy .xls container the exports arrive in.
const OLE2 = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]
// BIFF8 holds at most 65,536 rows and 256 columns; anything past that is not an export.
const MAX_ROWS = 65536
const MAX_COLS = 256
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const SENTIMENT_LABELS = ['Positive', 'Neutral', 'Negative'] as const
// The Top influencers widget: columns are found by their header names, never by position or count. The June 2026
// export had 17 columns; the October export pulled 2026-11-19 has 18 (a Country column was added at the end), so a fixed
// width refused a real file. Header names as measured on that file; matched exactly, so "Engagement" never matches
// "Engagement per Result".
const INFLUENCER_HEADERS = {
  authorId: 'Authors', name: 'Influencer', network: 'Source Type', posts: 'Total',
  pos: 'Positive', neu: 'Neutral', neg: 'Negative', reach: 'Potential Reach', engagement: 'Engagement',
} as const
const MAX_INFLUENCERS = 5
// Overview: four cards on rows 5, 7, 9 and 11 (0-based 4, 6, 8, 10); each card's unit sits in column 4 of the row above.
const OVERVIEW_ROWS = [4, 6, 8, 10]
const OWNED_TITLE = 'Share of Sentiment - Without Brand Owned Channels'

type Cell = string | number | boolean | null
type Sheet = { index: number; title: string | null; filters: string | null; rows: Cell[][]; width: number }
type Failure = { rule: SlRuleId; message: string }

class Failures {
  readonly list: Failure[] = []
  add(rule: SlRuleId, message: string) {
    if (!this.list.some((f) => f.rule === rule && f.message === message)) this.list.push({ rule, message })
  }
}

function monthOf(month: SlMonth): { y: number; m: number; days: number; name: string } {
  const match = /^(\d{4})-(\d{2})$/.exec(month)
  const y = match ? Number(match[1]) : NaN
  const m = match ? Number(match[2]) : NaN
  if (!match || m < 1 || m > 12) throw new TypeError('parseTalkwalkerExport: month must be YYYY-MM')
  return { y, m, days: new Date(Date.UTC(y, m, 0)).getUTCDate(), name: `${MONTHS[m - 1]} ${y}` }
}

const pad = (n: number) => String(n).padStart(2, '0')

function isOle2(bytes: Uint8Array): boolean {
  return bytes.length >= OLE2.length && OLE2.every((b, i) => bytes[i] === b)
}

function cellValue(cell: XLSX.CellObject | undefined): Cell {
  if (!cell) return null
  // Strings, numbers and booleans only: error cells and anything else read as empty.
  if (cell.t === 's' || cell.t === 'n' || cell.t === 'b') return cell.v as Cell
  return null
}

function readSheets(wb: XLSX.WorkBook): Sheet[] {
  return wb.SheetNames.map((name, index) => {
    const data = (wb.Sheets[name]?.['!data'] ?? []) as (XLSX.CellObject[] | undefined)[]
    const rows: Cell[][] = []
    for (let r = 0; r < Math.min(data.length, MAX_ROWS); r++) {
      const row = data[r]
      rows.push(row ? Array.from({ length: Math.min(row.length, MAX_COLS) }, (_, c) => cellValue(row[c])) : [])
    }
    const first = rows[0]?.[0]
    const second = rows[1]?.[0]
    const title = typeof first === 'string' && first.startsWith('Title: ') ? first.slice('Title: '.length) : null
    const filters = typeof second === 'string' && second.startsWith('Filters: ') ? second.slice('Filters: '.length) : null
    // Header shape: the widest row from the header row down.
    let width = 0
    for (let r = 3; r < rows.length; r++) {
      for (let c = rows[r].length - 1; c >= 0; c--) {
        if (rows[r][c] !== null && rows[r][c] !== '') {
          width = Math.max(width, c + 1)
          break
        }
      }
    }
    return { index, title, filters, rows, width }
  })
}

const isBlank = (v: Cell | undefined) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '')
const text = (v: Cell | undefined) => (isBlank(v) ? '' : String(v).trim())
/** Data rows: from row 5 down, skipping blank rows. */
const dataRows = (s: Sheet, keyCol = 0) => s.rows.slice(4).filter((r) => !isBlank(r[keyCol]))

/** Parses an export (`bytes`) for the client's topic and the month chosen by the server, never by the file. */
export function parseTalkwalkerExport(bytes: Uint8Array, expect: { topic: SlTopic; topicName: string; month: SlMonth }): SlParseResult {
  const month = monthOf(expect.month)
  const topicName = expect.topicName.trim()
  if (!topicName) throw new TypeError('parseTalkwalkerExport: topicName must not be empty')

  // V1: the file itself. Nothing else can be checked without a workbook, so it stops here.
  if (bytes.length > MAX_EXPORT_BYTES) return { ok: false, failed: [{ rule: 'V1', message: TOO_BIG }] }
  if (!isOle2(bytes)) return { ok: false, failed: [{ rule: 'V1', message: NOT_ORIGINAL }] }
  let wb: XLSX.WorkBook
  try {
    wb = XLSX.read(bytes, {
      type: 'array',
      dense: true,
      cellFormula: false,
      cellHTML: false,
      cellText: false,
      cellNF: false,
      cellStyles: false,
      cellDates: false,
      bookVBA: false,
      sheetStubs: false,
    })
  } catch {
    return { ok: false, failed: [{ rule: 'V1', message: NOT_ORIGINAL }] }
  }
  const sheets = readSheets(wb)
  if (sheets.length === 0) return { ok: false, failed: [{ rule: 'V1', message: NOT_ORIGINAL }] }

  const f = new Failures()

  // V2: every sheet has the Title and Filters rows.
  for (const s of sheets) {
    if (s.title === null || s.filters === null) f.add('V2', `Sheet ${s.index + 1} doesn't start with the Title and Filters rows of a Talkwalker export.`)
  }
  const framed = sheets.filter((s) => s.title !== null && s.filters !== null)
  if (framed.length === 0) return { ok: false, failed: f.list }

  // V4: every filter line ends with the same range, and it is the chosen month's first to last day.
  const RANGE = /(\d{2})\/(\d{2})\/(\d{2}) - (\d{2})\/(\d{2})\/(\d{2})$/
  const ranges = framed.map((s) => RANGE.exec((s.filters ?? '').trim()))
  if (ranges.some((r) => r === null)) {
    f.add('V4', "The filter line doesn't end with a date range.")
  } else if (new Set(ranges.map((r) => r![0])).size > 1) {
    f.add('V4', 'The sheets in this export cover different date ranges.')
  } else {
    const [, m1, d1, y1, m2, d2, y2] = ranges[0]!.map(Number)
    const yy = month.y % 100
    const whole = (mm: number, yr: number) => {
      const days = new Date(Date.UTC(2000 + yr, mm, 0)).getUTCDate()
      return mm >= 1 && mm <= 12 && m1 === mm && m2 === mm && y1 === yr && y2 === yr && d1 === 1 && d2 === days
    }
    if (!whole(month.m, yy)) {
      if (whole(m1, y1)) f.add('V4', `This export covers ${MONTHS[m1 - 1]} ${2000 + y1}, not ${month.name}.`)
      else f.add('V4', `This export doesn't cover one whole month. Export ${month.name} from its first day to its last.`)
    }
  }

  const byTitle = (title: string) => framed.filter((s) => s.title === title)
  const looksBrand = byTitle('Unique Authors').length > 0

  // V5: the filter line's first item is the client's topic name for the chosen topic. The comma after the name keeps
  // a longer topic name that merely starts with it from passing.
  if (framed.some((s) => !(s.filters ?? '').startsWith(`${topicName}, `))) {
    if (expect.topic === 'brand' && !looksBrand) f.add('V5', 'This is the Industry export, not the brand export.')
    else if (expect.topic === 'industry' && looksBrand) f.add('V5', 'This is the Brand export, not the industry export.')
    else f.add('V5', `This export is for a different Talkwalker topic than this client's ${expect.topic} topic.`)
  }

  // V3: the widgets, by title and header shape.
  const one = (label: string, candidates: Sheet[], required = true): Sheet | null => {
    if (candidates.length === 1) return candidates[0]
    if (candidates.length === 0) {
      if (required) f.add('V3', `The ${label} widget is missing.`)
    } else {
      f.add('V3', `There is more than one ${label} widget, so the right one can't be chosen.`)
    }
    return null
  }
  const shape = (label: string, s: Sheet | null, ok: (width: number) => boolean): Sheet | null => {
    if (s && !ok(s.width)) {
      f.add('V3', `The ${label} widget doesn't have the expected columns.`)
      return null
    }
    return s
  }

  // V6 helpers: counts are whole numbers at or above 0; other numbers are at or above 0. A widget with a bad number is
  // remembered so V7 does not also report the sum it spoils.
  const badNumbers = new Set<string>()
  const count = (label: string, v: Cell | undefined): number => {
    if (typeof v === 'number' && Number.isInteger(v) && v >= 0) return v
    badNumbers.add(label)
    f.add('V6', `The ${label} widget has a count that isn't a whole number at or above 0.`)
    return 0
  }
  const amount = (label: string, v: Cell | undefined): number => {
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return v
    badNumbers.add(label)
    f.add('V6', `The ${label} widget has a number below 0 or a cell that isn't a number.`)
    return 0
  }
  /** Overview stores its numbers as text, for example `3,400`. */
  const amountText = (label: string, v: Cell | undefined): number => {
    if (typeof v === 'string' && /^(\d{1,3}(,\d{3})+|\d+)(\.\d+)?$/.test(v.trim())) return Number(v.trim().replace(/,/g, ''))
    return amount(label, v)
  }

  /** Reads sentiment labels in column 1 of the data rows (V9) into counts. */
  const sentimentRows = (label: string, rows: Cell[][], col: number): SlSentimentCounts | null => {
    const labels = rows.map((r) => text(r[0]))
    const exact = labels.length === 3 && SENTIMENT_LABELS.every((l) => labels.filter((x) => x === l).length === 1)
    if (!exact) {
      f.add('V9', `The ${label} widget has a sentiment label other than Positive, Neutral and Negative.`)
      return null
    }
    const at = (l: string) => count(label, rows[labels.indexOf(l)][col])
    return { pos: at('Positive'), neu: at('Neutral'), neg: at('Negative') }
  }

  /** Daily date cells: `MM/DD/YY ...` text. A number means Excel turned the dates into date cells: a re-saved file. */
  let resaved = false
  const days = (label: string, rows: Cell[][]): string[] | null => {
    const out: string[] = []
    for (const r of rows) {
      const v = r[0]
      if (typeof v === 'number') {
        resaved = true
        return null
      }
      const d = typeof v === 'string' ? /^(\d{2})\/(\d{2})\/(\d{2})(\s|$)/.exec(v.trim()) : null
      out.push(d ? `20${d[3]}-${d[1]}-${d[2]}` : '')
    }
    const expected = Array.from({ length: month.days }, (_, i) => `${month.y}-${pad(month.m)}-${pad(i + 1)}`)
    if (out.length !== expected.length || out.some((d, i) => d !== expected[i])) {
      f.add('V8', `The daily rows in ${label} must list each day of the month once, in order.`)
      return null
    }
    return out
  }

  const single = (title: string, isCount: boolean): number | undefined => {
    const s = shape(title, one(title, byTitle(title)), (w) => w >= 1)
    if (!s) return undefined
    const v = s.rows[4]?.[0]
    return isCount ? count(title, v) : amount(title, v)
  }

  const results = single('Results', true)
  const brand = expect.topic === 'brand'
  const uniqueAuthors = brand ? single('Unique Authors', true) : undefined
  const engagement = brand ? single('Engagement', false) : undefined
  const potentialReach = brand ? single('Potential Reach', false) : undefined

  // Results over time: 2 columns is the daily total, 4 columns is daily by sentiment (industry).
  const overTime = byTitle('Results over time')
  const dailySheet = shape('Results over time', one('Results over time', overTime.filter((s) => s.width < 4)), (w) => w === 2)
  let daily: SlExport['daily'] | undefined
  if (dailySheet) {
    const rows = dataRows(dailySheet)
    const ds = days('Results over time', rows)
    if (ds) daily = rows.map((r, i) => ({ day: ds[i], results: count('Results over time', r[1]) }))
  }
  let dailyBySentiment: SlExport['dailyBySentiment']
  if (!brand) {
    const label = 'Results over time (by sentiment)'
    const s = shape(label, one(label, overTime.filter((x) => x.width >= 4)), (w) => w === 4)
    if (s) {
      const header = [1, 2, 3].map((c) => text(s.rows[3]?.[c]))
      const cols = SENTIMENT_LABELS.map((l) => header.indexOf(l) + 1)
      if (cols.some((c) => c === 0)) {
        f.add('V9', `The ${label} widget has a sentiment label other than Positive, Neutral and Negative.`)
      } else {
        const rows = dataRows(s)
        const ds = days(label, rows)
        if (ds) dailyBySentiment = rows.map((r, i) => ({ day: ds[i], pos: count(label, r[cols[0]]), neu: count(label, r[cols[1]]), neg: count(label, r[cols[2]]) }))
      }
    }
  }

  // Share of Sentiment: 2 columns is the split, more is by media type (media types across, sentiments down).
  const shareOf = byTitle('Share of Sentiment')
  const splitSheet = one('Share of Sentiment', shareOf.filter((s) => s.width <= 2))
  const sentiment = splitSheet && shape('Share of Sentiment', splitSheet, (w) => w === 2) ? sentimentRows('Share of Sentiment', dataRows(splitSheet), 1) : null
  const mediaLabel = 'Share of Sentiment (by media type)'
  const mediaSheet = one(mediaLabel, shareOf.filter((s) => s.width > 2))
  let sentimentByMedia: SlExport['sentimentByMedia'] | null = null
  if (mediaSheet) {
    const media = Array.from({ length: mediaSheet.width - 1 }, (_, i) => text(mediaSheet.rows[3]?.[i + 1]))
    if (media.some((m) => m === '')) {
      f.add('V3', `The ${mediaLabel} widget doesn't have the expected columns.`)
    } else {
      const rows = dataRows(mediaSheet)
      const labels = rows.map((r) => text(r[0]))
      if (!(labels.length === 3 && SENTIMENT_LABELS.every((l) => labels.filter((x) => x === l).length === 1))) {
        f.add('V9', `The ${mediaLabel} widget has a sentiment label other than Positive, Neutral and Negative.`)
      } else {
        const row = (l: string) => rows[labels.indexOf(l)]
        sentimentByMedia = media.map((m, i) => ({
          media: m,
          pos: count(mediaLabel, row('Positive')[i + 1]),
          neu: count(mediaLabel, row('Neutral')[i + 1]),
          neg: count(mediaLabel, row('Negative')[i + 1]),
        }))
      }
    }
  }

  // Share of Sentiment - Without Brand Owned Channels: brand, optional.
  let ownedExcluded: SlSentimentCounts | undefined
  if (brand) {
    const s = shape(OWNED_TITLE, one(OWNED_TITLE, byTitle(OWNED_TITLE), false), (w) => w === 2)
    if (s) ownedExcluded = sentimentRows(OWNED_TITLE, dataRows(s), 1) ?? undefined
  }

  // Themes: [rank, theme, share, colour]. The brand export has two widgets (three-word and two-word); the cloud uses
  // the one with no three-word entries (decision D4, review R2-17), refused when that is not exactly one widget.
  let themes: SlExport['themes'] | undefined
  const themeSheets = byTitle('Themes')
  const badShape = themeSheets.filter((s) => s.width < 4)
  if (themeSheets.length === 0) {
    f.add('V3', 'The Themes widget is missing.')
  } else if (badShape.length > 0) {
    f.add('V3', "The Themes widget doesn't have the expected columns.")
  } else {
    const words = (s: Sheet) => dataRows(s, 1).map((r) => text(r[1]).split(/\s+/).length)
    const chosen = !brand && themeSheets.length === 1 ? themeSheets : themeSheets.filter((s) => !words(s).includes(3))
    if (chosen.length !== 1) {
      f.add('V3', "The two-word Themes widget can't be told apart: there must be exactly one Themes widget with no three-word themes.")
    } else {
      themes = dataRows(chosen[0], 1).map((r) => ({ theme: text(r[1]), share: amount('Themes', r[2]), color: text(r[3]) }))
    }
  }

  // Top influencers: brand, the export's top 5.
  let influencers: SlExport['influencers']
  if (brand) {
    const label = 'Top influencers'
    const s = one(label, byTitle(label))
    if (s) {
      const header = s.rows[3] ?? []
      const col = Object.fromEntries(
        Object.entries(INFLUENCER_HEADERS).map(([key, name]) => [key, header.findIndex((h) => text(h) === name)]),
      ) as Record<keyof typeof INFLUENCER_HEADERS, number>
      if (Object.values(col).some((i) => i < 0)) {
        f.add('V3', `The ${label} widget doesn't have the expected columns.`)
      } else {
        influencers = dataRows(s, col.authorId)
          .slice(0, MAX_INFLUENCERS)
          .map((r) => ({
            authorId: text(r[col.authorId]),
            // The name cell is `Name, handle`; the name is the part before the first comma.
            name: text(r[col.name]).split(',')[0].trim(),
            network: text(r[col.network]),
            posts: count(label, r[col.posts]),
            pos: count(label, r[col.pos]),
            neu: count(label, r[col.neu]),
            neg: count(label, r[col.neg]),
            reach: amount(label, r[col.reach]),
            engagement: amount(label, r[col.engagement]),
          }))
      }
    }
  }

  // Overview: brand, four cards.
  let overview: SlExport['overview']
  if (brand) {
    const label = 'Overview'
    const s = shape(label, one(label, byTitle(label)), (w) => w >= 4)
    if (s) {
      if (OVERVIEW_ROWS.some((r) => isBlank(s.rows[r]?.[1]))) {
        f.add('V3', `The ${label} widget doesn't have the expected cards.`)
      } else {
        overview = OVERVIEW_ROWS.map((r) => ({
          label: text(s.rows[r][1]),
          who: text(s.rows[r][0]),
          network: text(s.rows[r][2]),
          value: amountText(label, s.rows[r][3]),
          unit: text(s.rows[r - 1]?.[3]),
        }))
      }
    }
  }

  // A number in a date cell: the file was opened and re-saved, so its values can't be trusted as exported.
  if (resaved) f.add('V1', NOT_ORIGINAL)

  // V7: results equal the daily sum, the sentiment split and sentiment by media type (each checked when it was read).
  if (results !== undefined && !badNumbers.has('Results')) {
    const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
    const tri = (c: SlSentimentCounts) => c.pos + c.neu + c.neg
    if (daily && !badNumbers.has('Results over time') && sum(daily.map((d) => d.results)) !== results) f.add('V7', "Results don't add up: the daily results don't sum to the Results total.")
    if (sentiment && !badNumbers.has('Share of Sentiment') && tri(sentiment) !== results) f.add('V7', "Results don't add up: the sentiment split doesn't sum to the Results total.")
    if (sentimentByMedia && !badNumbers.has(mediaLabel) && sum(sentimentByMedia.map(tri)) !== results) f.add('V7', "Results don't add up: sentiment by media type doesn't sum to the Results total.")
  }

  if (f.list.length > 0) return { ok: false, failed: f.list }

  const data: SlExport = {
    version: 1,
    topic: expect.topic,
    month: expect.month,
    results: results!,
    ...(brand ? { uniqueAuthors: uniqueAuthors!, engagement: engagement!, potentialReach: potentialReach! } : {}),
    daily: daily!,
    ...(dailyBySentiment ? { dailyBySentiment } : {}),
    sentiment: sentiment!,
    sentimentByMedia: sentimentByMedia!,
    ...(ownedExcluded ? { ownedExcluded } : {}),
    themes: themes!,
    ...(influencers ? { influencers } : {}),
    ...(overview ? { overview } : {}),
  }
  return { ok: true, data }
}
