// lib/organic-social/social-listening/test-workbook.ts
// Test only: builds a synthetic Talkwalker dashboard export (legacy .xls, BIFF8) with made-up numbers, in the frame the
// real exports use (docs/findings/2026-11-19-social-listening-xls-parser.md): one sheet per widget, row 1 `Title: <widget>`,
// row 2 `Filters: <topic>, <media types>, MM/DD/YY - MM/DD/YY`, row 3 blank, row 4 the header, data from row 5. Column
// positions follow the earlier verified parse of the real files. No client value, name or file name is used here.
import * as XLSX from 'xlsx'
import type { SlTopic } from './types'

export type TestCell = string | number | null
/** One sheet: its tab name and every row from the title row down. */
export type TestSheet = { name: string; rows: TestCell[][] }
export type TestSentimentRow = [label: string, count: TestCell]

export type TestWorkbookInput = {
  /** The first item of every filter line. */
  filterTopic: string
  /** The end of every filter line, `MM/DD/YY - MM/DD/YY`. */
  range: string
  results: TestCell
  /** Brand only. */
  uniqueAuthors: TestCell
  engagement: TestCell
  potentialReach: TestCell
  /** One date cell per daily row, `MM/DD/YY hh:mm:ss AM` text as exported. */
  dates: TestCell[]
  daily: TestCell[]
  /** Industry only: [positive, neutral, negative] per day, under `dailyBySentimentHeader`. */
  dailyBySentiment: [TestCell, TestCell, TestCell][]
  dailyBySentimentHeader: [string, string, string]
  sentiment: TestSentimentRow[]
  /** Sentiment by media type: the media names (header) and one row per sentiment label. */
  media: string[]
  mediaRows: { label: string; counts: TestCell[] }[]
  /** Brand, optional widget; null leaves it out. */
  owned: TestSentimentRow[] | null
  /** One entry per Themes widget, in sheet order: [theme, share, colour]. */
  themes: [string, TestCell, string][][]
  /** Brand: rows of the Top influencers widget. */
  influencers: { authorId: string; name: string; network: string; posts: TestCell; pos: TestCell; neu: TestCell; neg: TestCell; reach: TestCell; engagement: TestCell }[]
  /** Brand: the four Overview cards; `value` is text, as exported. */
  overview: { who: string; label: string; network: string; value: TestCell; unit: string }[]
  /** Last structural edit before writing (drop, add or change sheets). */
  editSheets?: (sheets: TestSheet[]) => TestSheet[]
}

const SENTIMENTS = ['Positive', 'Neutral', 'Negative'] as const
const pad = (n: number) => String(n).padStart(2, '0')

function monthParts(month: string): { y: number; m: number; days: number } {
  const [y, m] = month.split('-').map(Number)
  return { y, m, days: new Date(Date.UTC(y, m, 0)).getUTCDate() }
}

/** `MM/DD/YY - MM/DD/YY` for the first to last day of `month`. */
export function monthRange(month: string): string {
  const { y, m, days } = monthParts(month)
  const yy = pad(y % 100)
  return `${pad(m)}/01/${yy} - ${pad(m)}/${pad(days)}/${yy}`
}

/** The made-up defaults for a topic and month: every sum agrees, so the workbook passes V1 to V9. */
export function defaultInput(opts: { topic: SlTopic; topicName: string; month: string }): TestWorkbookInput {
  const { y, m, days } = monthParts(opts.month)
  const dates = Array.from({ length: days }, (_, i) => `${pad(m)}/${pad(i + 1)}/${pad(y % 100)} 12:00:00 AM`)
  const daily = Array.from({ length: days }, (_, i) => 10 + (i % 7))
  const bySent = daily.map((r): [number, number, number] => {
    const pos = Math.floor(r / 4)
    const neg = Math.floor(r / 3)
    return [pos, r - pos - neg, neg]
  })
  const total = daily.reduce((a, b) => a + b, 0)
  const sent: [number, number, number] =
    opts.topic === 'industry'
      ? [0, 1, 2].map((i) => bySent.reduce((a, d) => a + d[i], 0)) as [number, number, number]
      : (() => {
          const pos = Math.floor(total / 2)
          const neg = Math.floor(total / 5)
          return [pos, total - pos - neg, neg]
        })()
  const media = ['Instagram', 'Reddit', 'News']
  const mediaRows = SENTIMENTS.map((label, i) => {
    const s = sent[i]
    const a = Math.floor(s / 2)
    const b = Math.floor(s / 3)
    return { label, counts: [a, b, s - a - b] as TestCell[] }
  })
  const twoWord: [string, TestCell, string][] = [
    ['apple orchard', 0.25, '#1FCE6E'],
    ['river stone', 0.125, '#F2C100'],
    ['cloud harbor', 0.0625, '#E74C3C'],
  ]
  const threeWord: [string, TestCell, string][] = [
    ['quiet blue lantern', 0.2, '#4bd78b'],
    ['green paper kite', 0.1, '#eb6f63'],
  ]
  return {
    filterTopic: opts.topicName,
    range: monthRange(opts.month),
    results: total,
    uniqueAuthors: 41,
    engagement: 1234.5,
    potentialReach: 987654,
    dates,
    daily,
    dailyBySentiment: bySent,
    dailyBySentimentHeader: ['Positive', 'Neutral', 'Negative'],
    sentiment: SENTIMENTS.map((label, i) => [label, sent[i]]),
    media,
    mediaRows,
    owned: opts.topic === 'brand' ? [['Positive', 7], ['Neutral', 5], ['Negative', 3]] : null,
    themes: opts.topic === 'brand' ? [threeWord, twoWord] : [twoWord],
    influencers: [
      { authorId: 'instagram:1001', name: 'Test Author One, @one', network: 'instagram', posts: 6, pos: 3, neu: 2, neg: 1, reach: 5000, engagement: 120.5 },
      { authorId: 'reddit:2002', name: 'Test Author Two', network: 'reddit', posts: 4, pos: 1, neu: 1, neg: 2, reach: 300, engagement: 8 },
    ],
    overview: [
      { who: 'AuthorA', label: 'Most active author', network: 'instagram', value: '12', unit: 'Results' },
      { who: 'AuthorB', label: 'Most influential author', network: 'reddit', value: '3,400', unit: 'Reach' },
      { who: 'site-a.example', label: 'Most active site', network: 'news', value: '9', unit: 'Results' },
      { who: 'site-b.example', label: 'Most influential site', network: 'news', value: '45000', unit: 'Reach' },
    ],
  }
}

/** The sheets of a synthetic export, in the real exports' order. */
export function buildSheets(topic: SlTopic, input: TestWorkbookInput): TestSheet[] {
  const filters = `Filters: ${input.filterTopic}, ${input.media.join(', ')}, ${input.range}`
  const sheet = (name: string, title: string, header: TestCell[], data: TestCell[][]): TestSheet => ({
    name,
    rows: [[`Title: ${title}`], [filters], [], header, ...data],
  })
  const sentimentSheet = (name: string, title: string, rows: TestSentimentRow[]) =>
    sheet(name, title, ['Sentiment', 'Results'], rows.map(([l, c]) => [l, c]))
  const themesSheet = (name: string, list: [string, TestCell, string][]) =>
    sheet(name, 'Themes', ['#', 'Theme', 'Share', 'Color'], list.map(([t, s, c], i) => [i + 1, t, s, c]))

  const sheets: TestSheet[] = [sheet('Results', 'Results', ['Results'], [[input.results]])]
  if (topic === 'brand') {
    sheets.push(
      sheet('Unique Authors', 'Unique Authors', ['Unique Authors'], [[input.uniqueAuthors]]),
      sheet('Engagement', 'Engagement', ['Engagement'], [[input.engagement]]),
      sheet('Potential Reach', 'Potential Reach', ['Potential Reach'], [[input.potentialReach]]),
    )
  }
  sheets.push(
    sheet('Results over time', 'Results over time', ['Date', 'Results'], input.daily.map((r, i) => [input.dates[i] ?? null, r])),
    sentimentSheet('Share of Sentiment', 'Share of Sentiment', input.sentiment),
    sheet('Share of Sentiment(1)', 'Share of Sentiment', ['Sentiment', ...input.media], input.mediaRows.map((r) => [r.label, ...r.counts])),
  )
  if (topic === 'industry') {
    sheets.push(
      sheet('Results over time(1)', 'Results over time', ['Date', ...input.dailyBySentimentHeader], input.dailyBySentiment.map((r, i) => [input.dates[i] ?? null, ...r])),
    )
  } else {
    // Not read by the parser; present in the real brand export.
    sheets.push(sheet('Share of Media Types', 'Share of Media Types', ['Media type', 'Results'], input.media.map((m) => [m, 1])))
  }
  input.themes.forEach((list, i) => sheets.push(themesSheet(i === 0 ? 'Themes' : `Themes(${i})`, list)))
  if (topic === 'brand') {
    sheets.push(
      sheet(
        'Top influencers',
        'Top influencers',
        Array.from({ length: 17 }, (_, c) => `Column ${c + 1}`),
        input.influencers.map((p, i) => [
          i + 1, 'https://avatar.example/x.png', null, null, p.authorId, p.name, p.network,
          p.posts, p.pos, p.neu, p.neg, p.reach, 1, p.engagement, 1, null, null,
        ]),
      ),
    )
    // Overview alternates a unit row and a card row; the first unit sits in the header row.
    const ov: TestCell[][] = []
    input.overview.forEach((card, i) => {
      if (i > 0) ov.push([null, null, null, card.unit])
      ov.push([card.who, card.label, card.network, card.value])
    })
    sheets.push(sheet('Overview', 'Overview', ['Who', 'Label', 'Network', input.overview[0]?.unit ?? null], ov))
    if (input.owned) sheets.push(sentimentSheet('Share of Sentiment - Without Br', 'Share of Sentiment - Without Brand Owned Channels', input.owned))
  }
  return input.editSheets ? input.editSheets(sheets) : sheets
}

/** Writes sheets as a workbook; `biff8` is the legacy .xls the real exports are. */
export function writeWorkbook(sheets: TestSheet[], bookType: XLSX.BookType = 'biff8'): Uint8Array {
  const wb = XLSX.utils.book_new()
  for (const s of sheets) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s.rows), s.name)
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType }))
}

/** A passing synthetic export for `topic` and `month` (`YYYY-MM`), with optional overrides. */
export function buildWorkbook(opts: { topic: SlTopic; topicName: string; month: string; overrides?: Partial<TestWorkbookInput> }): Uint8Array {
  const input = { ...defaultInput(opts), ...opts.overrides }
  return writeWorkbook(buildSheets(opts.topic, input))
}
