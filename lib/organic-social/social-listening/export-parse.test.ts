import { describe, expect, it } from 'vitest'
import { MAX_EXPORT_BYTES, parseTalkwalkerExport } from './export-parse'
import { buildSheets, buildWorkbook, defaultInput, monthRange, writeWorkbook, type TestSheet, type TestWorkbookInput } from './test-workbook'
import type { SlParseResult, SlRuleId, SlTopic } from './types'

// Made-up topic names: the parser only compares them with the filter line.
const BRAND = 'Test Brand Topic'
const INDUSTRY = 'Test Industry Topic'
const OCT = '2026-10'
const NOT_ORIGINAL = "This isn't the original Talkwalker .xls export. Upload the file as downloaded."

const nameOf = (topic: SlTopic) => (topic === 'brand' ? BRAND : INDUSTRY)
const expectFor = (topic: SlTopic, month = OCT) => ({ topic, topicName: nameOf(topic), month })

function build(topic: SlTopic, overrides?: Partial<TestWorkbookInput>, month = OCT) {
  return buildWorkbook({ topic, topicName: nameOf(topic), month, overrides })
}
function failures(r: SlParseResult) {
  if (r.ok) throw new Error('expected a refusal, got a parse')
  return r.failed
}
function rules(r: SlParseResult): SlRuleId[] {
  return [...new Set(failures(r).map((f) => f.rule))]
}
function messages(r: SlParseResult, rule: SlRuleId) {
  return failures(r).filter((f) => f.rule === rule).map((f) => f.message)
}
const editSheets = (fn: (s: TestSheet[]) => TestSheet[]) => ({ editSheets: fn })
const sheetIndex = (sheets: TestSheet[], name: string) => {
  const i = sheets.findIndex((s) => s.name === name)
  if (i < 0) throw new Error(`no sheet ${name}`)
  return i
}

describe('parseTalkwalkerExport: passing exports', () => {
  it('parses every field of a brand export', () => {
    const input = defaultInput({ topic: 'brand', topicName: BRAND, month: OCT })
    const r = parseTalkwalkerExport(build('brand'), expectFor('brand'))
    if (!r.ok) throw new Error(JSON.stringify(r.failed))
    const total = input.daily.reduce<number>((a, b) => a + Number(b), 0)
    expect(r.data).toEqual({
      version: 1,
      topic: 'brand',
      month: OCT,
      results: total,
      uniqueAuthors: 41,
      engagement: 1234.5,
      potentialReach: 987654,
      daily: input.daily.map((results, i) => ({ day: `2026-10-${String(i + 1).padStart(2, '0')}`, results })),
      sentiment: { pos: input.sentiment[0][1], neu: input.sentiment[1][1], neg: input.sentiment[2][1] },
      sentimentByMedia: input.media.map((media, j) => ({
        media,
        pos: input.mediaRows[0].counts[j],
        neu: input.mediaRows[1].counts[j],
        neg: input.mediaRows[2].counts[j],
      })),
      ownedExcluded: { pos: 7, neu: 5, neg: 3 },
      themes: [
        { theme: 'apple orchard', share: 0.25, color: '#1FCE6E' },
        { theme: 'river stone', share: 0.125, color: '#F2C100' },
        { theme: 'cloud harbor', share: 0.0625, color: '#E74C3C' },
      ],
      influencers: [
        { authorId: 'instagram:1001', name: 'Test Author One', network: 'instagram', posts: 6, pos: 3, neu: 2, neg: 1, reach: 5000, engagement: 120.5 },
        { authorId: 'reddit:2002', name: 'Test Author Two', network: 'reddit', posts: 4, pos: 1, neu: 1, neg: 2, reach: 300, engagement: 8 },
      ],
      overview: [
        { label: 'Most active author', who: 'AuthorA', network: 'instagram', value: 12, unit: 'Results' },
        { label: 'Most influential author', who: 'AuthorB', network: 'reddit', value: 3400, unit: 'Reach' },
        { label: 'Most active site', who: 'site-a.example', network: 'news', value: 9, unit: 'Results' },
        { label: 'Most influential site', who: 'site-b.example', network: 'news', value: 45000, unit: 'Reach' },
      ],
    })
    expect(r.data.daily).toHaveLength(31)
  })

  it('parses every field of an industry export', () => {
    const input = defaultInput({ topic: 'industry', topicName: INDUSTRY, month: OCT })
    const r = parseTalkwalkerExport(build('industry'), expectFor('industry'))
    if (!r.ok) throw new Error(JSON.stringify(r.failed))
    const day = (i: number) => `2026-10-${String(i + 1).padStart(2, '0')}`
    expect(r.data).toEqual({
      version: 1,
      topic: 'industry',
      month: OCT,
      results: input.daily.reduce<number>((a, b) => a + Number(b), 0),
      daily: input.daily.map((results, i) => ({ day: day(i), results })),
      dailyBySentiment: input.dailyBySentiment.map(([pos, neu, neg], i) => ({ day: day(i), pos, neu, neg })),
      sentiment: { pos: input.sentiment[0][1], neu: input.sentiment[1][1], neg: input.sentiment[2][1] },
      sentimentByMedia: input.media.map((media, j) => ({
        media,
        pos: input.mediaRows[0].counts[j],
        neu: input.mediaRows[1].counts[j],
        neg: input.mediaRows[2].counts[j],
      })),
      themes: [
        { theme: 'apple orchard', share: 0.25, color: '#1FCE6E' },
        { theme: 'river stone', share: 0.125, color: '#F2C100' },
        { theme: 'cloud harbor', share: 0.0625, color: '#E74C3C' },
      ],
    })
    expect(Object.keys(r.data)).not.toContain('uniqueAuthors')
  })

  it('picks the two-word Themes widget', () => {
    const twoWord: [string, number, string][] = [['solar field', 0.5, '#111111']]
    const threeWord: [string, number, string][] = [['one two three', 0.4, '#222222']]
    for (const themes of [[threeWord, twoWord], [twoWord, threeWord]]) {
      const r = parseTalkwalkerExport(build('brand', { themes }), expectFor('brand'))
      if (!r.ok) throw new Error(JSON.stringify(r.failed))
      expect(r.data.themes).toEqual([{ theme: 'solar field', share: 0.5, color: '#111111' }])
    }
  })

  it('the owned-channels widget is optional', () => {
    const r = parseTalkwalkerExport(build('brand', { owned: null }), expectFor('brand'))
    if (!r.ok) throw new Error(JSON.stringify(r.failed))
    expect(r.data.ownedExcluded).toBeUndefined()
  })

  it('reads sentiment rows by label, not by position', () => {
    const input = defaultInput({ topic: 'brand', topicName: BRAND, month: OCT })
    const r = parseTalkwalkerExport(build('brand', { sentiment: [...input.sentiment].reverse() }), expectFor('brand'))
    if (!r.ok) throw new Error(JSON.stringify(r.failed))
    expect(r.data.sentiment).toEqual({ pos: input.sentiment[0][1], neu: input.sentiment[1][1], neg: input.sentiment[2][1] })
  })

  it('February has 28 daily rows', () => {
    const r = parseTalkwalkerExport(build('industry', undefined, '2026-02'), expectFor('industry', '2026-02'))
    if (!r.ok) throw new Error(JSON.stringify(r.failed))
    expect(r.data.daily).toHaveLength(28)
    expect(r.data.daily[27].day).toBe('2026-02-28')
  })
})

describe('parseTalkwalkerExport: V1 the file', () => {
  it('V1 non-OLE2 bytes: a CSV buffer', () => {
    const csv = new TextEncoder().encode('Title: Results\nFilters: x\n\nResults\n5\n')
    const r = parseTalkwalkerExport(csv, expectFor('brand'))
    expect(failures(r)).toEqual([{ rule: 'V1', message: NOT_ORIGINAL }])
  })

  it('re-saved xlsx is refused', () => {
    const input = defaultInput({ topic: 'brand', topicName: BRAND, month: OCT })
    const xlsx = writeWorkbook(buildSheets('brand', input), 'xlsx')
    expect(failures(parseTalkwalkerExport(xlsx, expectFor('brand')))).toEqual([{ rule: 'V1', message: NOT_ORIGINAL }])
  })

  it('a re-saved .xls whose dates became date cells is refused as not the original', () => {
    const input = defaultInput({ topic: 'brand', topicName: BRAND, month: OCT })
    const dates = input.dates.map((_, i) => 46296 + i) // Excel day serials
    const r = parseTalkwalkerExport(build('brand', { dates }), expectFor('brand'))
    expect(rules(r)).toEqual(['V1'])
    expect(messages(r, 'V1')).toEqual([NOT_ORIGINAL])
  })

  it('a file of 2 MB plus 1 byte is refused before it is read', () => {
    const big = new Uint8Array(MAX_EXPORT_BYTES + 1)
    big.set(build('brand'))
    expect(failures(parseTalkwalkerExport(big, expectFor('brand')))).toEqual([{ rule: 'V1', message: 'The file is over 2 MB.' }])
    expect(MAX_EXPORT_BYTES).toBe(2 * 1024 * 1024)
  })

  it('OLE2 bytes that are not a workbook are refused', () => {
    const junk = new Uint8Array(1024)
    junk.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
    expect(failures(parseTalkwalkerExport(junk, expectFor('brand')))).toEqual([{ rule: 'V1', message: NOT_ORIGINAL }])
  })
})

describe('parseTalkwalkerExport: V2 to V9', () => {
  it('V2 a sheet without Title:', () => {
    const r = parseTalkwalkerExport(
      build('brand', editSheets((s) => {
        const i = sheetIndex(s, 'Share of Media Types')
        s[i] = { ...s[i], rows: [['Share of Media Types'], ...s[i].rows.slice(1)] }
        return s
      })),
      expectFor('brand'),
    )
    expect(rules(r)).toEqual(['V2'])
    expect(messages(r, 'V2')[0]).toMatch(/^Sheet \d+ doesn't start with the Title and Filters rows/)
  })

  it('V2 a sheet without Filters:', () => {
    const r = parseTalkwalkerExport(
      build('brand', editSheets((s) => {
        const i = sheetIndex(s, 'Share of Media Types')
        s[i] = { ...s[i], rows: [s[i].rows[0], ['Something else'], ...s[i].rows.slice(2)] }
        return s
      })),
      expectFor('brand'),
    )
    expect(rules(r)).toEqual(['V2'])
  })

  it('V3 brand without Top influencers', () => {
    const r = parseTalkwalkerExport(build('brand', editSheets((s) => s.filter((x) => x.name !== 'Top influencers'))), expectFor('brand'))
    expect(rules(r)).toEqual(['V3'])
    expect(messages(r, 'V3')).toEqual(['The Top influencers widget is missing.'])
  })

  it('V3 two Themes widgets both with three-word entries (ambiguous)', () => {
    const threeWord: [string, number, string][] = [['one two three', 0.4, '#222222']]
    const r = parseTalkwalkerExport(build('brand', { themes: [threeWord, threeWord] }), expectFor('brand'))
    expect(rules(r)).toEqual(['V3'])
    expect(messages(r, 'V3')[0]).toMatch(/two-word Themes widget/)
  })

  it('V3 two two-word Themes widgets are ambiguous too', () => {
    const twoWord: [string, number, string][] = [['solar field', 0.5, '#111111']]
    expect(rules(parseTalkwalkerExport(build('brand', { themes: [twoWord, twoWord] }), expectFor('brand')))).toEqual(['V3'])
  })

  it('V3 a widget with the wrong column count names the widget', () => {
    const r = parseTalkwalkerExport(
      build('brand', editSheets((s) => {
        const i = sheetIndex(s, 'Top influencers')
        s[i] = { ...s[i], rows: s[i].rows.map((row, n) => (n >= 3 ? row.slice(0, 12) : row)) }
        return s
      })),
      expectFor('brand'),
    )
    expect(rules(r)).toEqual(['V3'])
    expect(messages(r, 'V3')).toEqual(["The Top influencers widget doesn't have the expected columns."])
  })

  it('V3 industry without the by-sentiment Results over time', () => {
    const r = parseTalkwalkerExport(build('industry', editSheets((s) => s.filter((x) => x.name !== 'Results over time(1)'))), expectFor('industry'))
    expect(rules(r)).toEqual(['V3'])
    expect(messages(r, 'V3')).toEqual(['The Results over time (by sentiment) widget is missing.'])
  })

  it('V4 September range uploaded for October', () => {
    const r = parseTalkwalkerExport(build('brand', undefined, '2026-09'), expectFor('brand'))
    expect(rules(r)).toContain('V4')
    expect(messages(r, 'V4')).toEqual(['This export covers September 2026, not October 2026.'])
  })

  it('V4 two sheets with different ranges', () => {
    const r = parseTalkwalkerExport(
      build('brand', editSheets((s) => {
        const i = sheetIndex(s, 'Share of Media Types')
        const line = String(s[i].rows[1][0]).replace(monthRange(OCT), '10/01/26 - 10/30/26')
        s[i] = { ...s[i], rows: [s[i].rows[0], [line], ...s[i].rows.slice(2)] }
        return s
      })),
      expectFor('brand'),
    )
    expect(rules(r)).toEqual(['V4'])
    expect(messages(r, 'V4')).toEqual(['The sheets in this export cover different date ranges.'])
  })

  it('V4 a range that is not one whole month', () => {
    const r = parseTalkwalkerExport(build('brand', { range: '10/02/26 - 10/31/26' }), expectFor('brand'))
    expect(messages(r, 'V4')).toEqual(["This export doesn't cover one whole month. Export October 2026 from its first day to its last."])
  })

  it('V4 a filter line without a range', () => {
    const r = parseTalkwalkerExport(build('brand', { range: 'all time' }), expectFor('brand'))
    expect(messages(r, 'V4')).toEqual(["The filter line doesn't end with a date range."])
  })

  it('V5 industry topic name in a brand upload', () => {
    const industryFile = build('industry')
    const r = parseTalkwalkerExport(industryFile, expectFor('brand'))
    expect(rules(r)).toContain('V5')
    expect(messages(r, 'V5')).toEqual(['This is the Industry export, not the brand export.'])
  })

  it('V5 brand topic name in an industry upload', () => {
    const r = parseTalkwalkerExport(build('brand'), expectFor('industry'))
    expect(messages(r, 'V5')).toEqual(['This is the Brand export, not the industry export.'])
  })

  it('V5 another topic of the same shape', () => {
    const r = parseTalkwalkerExport(build('brand', { filterTopic: 'Some Other Topic' }), expectFor('brand'))
    expect(rules(r)).toEqual(['V5'])
    expect(messages(r, 'V5')).toEqual(["This export is for a different Talkwalker topic than this client's brand topic."])
  })

  it('V5 a topic name that only starts with the client topic name', () => {
    const r = parseTalkwalkerExport(build('brand', { filterTopic: `${BRAND} Archive` }), expectFor('brand'))
    expect(rules(r)).toEqual(['V5'])
  })

  it('V6 a negative count', () => {
    const input = defaultInput({ topic: 'brand', topicName: BRAND, month: OCT })
    const influencers = input.influencers.map((p, i) => (i === 0 ? { ...p, neg: -1 } : p))
    const r = parseTalkwalkerExport(build('brand', { influencers }), expectFor('brand'))
    expect(rules(r)).toEqual(['V6'])
    expect(messages(r, 'V6')).toEqual(["The Top influencers widget has a count that isn't a whole number at or above 0."])
  })

  it('V6 3.5 in a count', () => {
    const r = parseTalkwalkerExport(build('brand', { uniqueAuthors: 3.5 }), expectFor('brand'))
    expect(rules(r)).toEqual(['V6'])
    expect(messages(r, 'V6')).toEqual(["The Unique Authors widget has a count that isn't a whole number at or above 0."])
  })

  it('V6 a negative reach and a text engagement', () => {
    const r = parseTalkwalkerExport(build('brand', { potentialReach: -5, engagement: 'lots' }), expectFor('brand'))
    expect(rules(r)).toEqual(['V6'])
    expect(messages(r, 'V6')).toEqual([
      "The Engagement widget has a number below 0 or a cell that isn't a number.",
      "The Potential Reach widget has a number below 0 or a cell that isn't a number.",
    ])
  })

  it('V6 an Overview value that is not a number', () => {
    const input = defaultInput({ topic: 'brand', topicName: BRAND, month: OCT })
    const overview = input.overview.map((c, i) => (i === 1 ? { ...c, value: 'n/a' } : c))
    const r = parseTalkwalkerExport(build('brand', { overview }), expectFor('brand'))
    expect(rules(r)).toEqual(['V6'])
  })

  it('V7 daily sum off by one', () => {
    const input = defaultInput({ topic: 'brand', topicName: BRAND, month: OCT })
    const daily = input.daily.map((v, i) => (i === 0 ? Number(v) + 1 : v))
    const r = parseTalkwalkerExport(build('brand', { daily }), expectFor('brand'))
    expect(rules(r)).toEqual(['V7'])
    expect(messages(r, 'V7')).toEqual(["Results don't add up: the daily results don't sum to the Results total."])
  })

  it('V7 sentiment and sentiment by media type are checked too', () => {
    const input = defaultInput({ topic: 'industry', topicName: INDUSTRY, month: OCT })
    const sentiment = input.sentiment.map(([l, c], i): [string, number] => [l, i === 0 ? Number(c) + 2 : Number(c)])
    const mediaRows = input.mediaRows.map((row, i) => (i === 2 ? { ...row, counts: row.counts.map((c, j) => (j === 0 ? Number(c) + 1 : c)) } : row))
    const r = parseTalkwalkerExport(build('industry', { sentiment, mediaRows }), expectFor('industry'))
    expect(rules(r)).toEqual(['V7'])
    expect(messages(r, 'V7')).toEqual([
      "Results don't add up: the sentiment split doesn't sum to the Results total.",
      "Results don't add up: sentiment by media type doesn't sum to the Results total.",
    ])
  })

  it('V8 30 daily rows for a 31-day month', () => {
    const input = defaultInput({ topic: 'brand', topicName: BRAND, month: OCT })
    const daily = input.daily.slice(0, 30).map((v, i) => (i === 29 ? Number(v) + Number(input.daily[30]) : v))
    const r = parseTalkwalkerExport(build('brand', { daily, dates: input.dates.slice(0, 30) }), expectFor('brand'))
    expect(rules(r)).toEqual(['V8'])
    expect(messages(r, 'V8')).toEqual(['The daily rows in Results over time must list each day of the month once, in order.'])
  })

  it('V8 days out of order', () => {
    const input = defaultInput({ topic: 'brand', topicName: BRAND, month: OCT })
    const dates = [...input.dates]
    ;[dates[3], dates[4]] = [dates[4], dates[3]]
    expect(rules(parseTalkwalkerExport(build('brand', { dates }), expectFor('brand')))).toEqual(['V8'])
  })

  it('V8 the by-sentiment daily rows are checked too', () => {
    const input = defaultInput({ topic: 'industry', topicName: INDUSTRY, month: OCT })
    const r = parseTalkwalkerExport(
      build('industry', editSheets((s) => {
        const i = sheetIndex(s, 'Results over time(1)')
        s[i] = { ...s[i], rows: s[i].rows.slice(0, -1) }
        return s
      })),
      expectFor('industry'),
    )
    expect(input.daily).toHaveLength(31)
    expect(rules(r)).toEqual(['V8'])
  })

  it('V9 a Mixed sentiment label', () => {
    const input = defaultInput({ topic: 'brand', topicName: BRAND, month: OCT })
    const sentiment = input.sentiment.map(([l, c]): [string, typeof c] => [l === 'Neutral' ? 'Mixed' : l, c])
    const r = parseTalkwalkerExport(build('brand', { sentiment }), expectFor('brand'))
    expect(rules(r)).toEqual(['V9'])
    expect(messages(r, 'V9')).toEqual(['The Share of Sentiment widget has a sentiment label other than Positive, Neutral and Negative.'])
  })

  it('V9 on sentiment by media type and the by-sentiment header', () => {
    const input = defaultInput({ topic: 'industry', topicName: INDUSTRY, month: OCT })
    const mediaRows = input.mediaRows.map((row) => (row.label === 'Negative' ? { ...row, label: 'negative' } : row))
    const r = parseTalkwalkerExport(
      build('industry', { mediaRows, dailyBySentimentHeader: ['Positive', 'Mixed', 'Negative'] }),
      expectFor('industry'),
    )
    expect(rules(r)).toEqual(['V9'])
    expect(messages(r, 'V9')).toHaveLength(2)
  })

  it('collects every failed rule rather than stopping at the first', () => {
    const input = defaultInput({ topic: 'brand', topicName: BRAND, month: OCT })
    const daily = input.daily.map((v, i) => (i === 0 ? Number(v) + 1 : v))
    const sentiment = input.sentiment.map(([l, c]): [string, typeof c] => [l === 'Neutral' ? 'Mixed' : l, c])
    const r = parseTalkwalkerExport(build('brand', { daily, sentiment, uniqueAuthors: -1, filterTopic: 'Other' }), expectFor('brand'))
    expect(rules(r).sort()).toEqual(['V5', 'V6', 'V7', 'V9'])
  })

  it('no message carries a value or name from the file', () => {
    const input = defaultInput({ topic: 'brand', topicName: BRAND, month: OCT })
    const influencers = input.influencers.map((p) => ({ ...p, posts: -3 }))
    const r = parseTalkwalkerExport(build('brand', { influencers, filterTopic: 'Secret Topic Name', uniqueAuthors: 777.5 }), expectFor('brand'))
    const text = failures(r).map((f) => f.message).join(' ')
    for (const leak of ['Secret Topic Name', BRAND, 'Test Author', 'instagram:1001', '777', '-3']) expect(text).not.toContain(leak)
  })
})

describe('parseTalkwalkerExport: caller errors', () => {
  it('throws on a malformed month or empty topic name (never from the file)', () => {
    const file = build('brand')
    expect(() => parseTalkwalkerExport(file, { topic: 'brand', topicName: BRAND, month: '2026-13' })).toThrow()
    expect(() => parseTalkwalkerExport(file, { topic: 'brand', topicName: '  ', month: OCT })).toThrow()
  })
})
