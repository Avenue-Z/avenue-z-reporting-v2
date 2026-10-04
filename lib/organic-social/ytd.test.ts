import { expect, test } from 'vitest'
import { monthsNeedingDash, ytdConfig, ytdLiveMonths, ytdMonths, ytdSeries, ytdSheetMonths, ytdSheetSeries } from './ytd'
import { clockFor } from './reporting-months'
import type { YtdCell, YtdTab } from './ytd-sheet'

const CFG = { firstMonth: '2026-08', comparison: 'previous-month' } as const
const keys = (ms: { key: string }[] | null) => ms?.map((m) => m.key)

test('ytdConfig reads firstMonth and comparison; anything malformed is null', () => {
  expect(ytdConfig({ firstMonth: '2026-08' })).toEqual({ firstMonth: '2026-08', comparison: 'previous-month' })
  expect(ytdConfig({ firstMonth: '2026-08', comparison: 'previous-year' })).toEqual({ firstMonth: '2026-08', comparison: 'previous-year' })
  expect(ytdConfig({ firstMonth: '2026-08', comparison: 'yearly' })!.comparison).toBe('previous-month')
  for (const bad of [undefined, null, [], 'x', {}, { firstMonth: '2026-13' }, { firstMonth: 202608 }]) expect(ytdConfig(bad)).toBeNull()
})
test('September on screen: August then September; August is whole and compared with July; September keeps its own request', () => {
  expect(ytdMonths('custom:2026-09-01,2026-09-30', 'custom:2026-08-01,2026-08-31', CFG)).toEqual([
    { key: '2026-08', dateRange: 'custom:2026-08-01,2026-08-31', compareRange: 'custom:2026-07-01,2026-07-31', partial: false },
    { key: '2026-09', dateRange: 'custom:2026-09-01,2026-09-30', compareRange: 'custom:2026-08-01,2026-08-31', partial: false },
  ])
})
test('the live month (the team only) is partial and keeps its month-to-date request', () => {
  const r = ytdMonths('custom:2026-10-01,2026-10-19', 'custom:2026-09-01,2026-09-19', CFG)!
  expect(keys(r)).toEqual(['2026-08', '2026-09', '2026-10'])
  expect(r[2]).toEqual({ key: '2026-10', dateRange: 'custom:2026-10-01,2026-10-19', compareRange: 'custom:2026-09-01,2026-09-19', partial: true })
})
test('August on screen is August only; January resets the year; firstMonth is the floor', () => {
  expect(keys(ytdMonths('custom:2026-08-01,2026-08-31', 'custom:2026-07-01,2026-07-31', CFG))).toEqual(['2026-08'])
  expect(keys(ytdMonths('custom:2027-01-01,2027-01-31', 'custom:2026-12-01,2026-12-31', CFG))).toEqual(['2027-01'])
  expect(keys(ytdMonths('custom:2027-06-01,2027-06-30', 'x', { firstMonth: '2027-03', comparison: 'previous-month' }))).toEqual(['2027-03', '2027-04', '2027-05', '2027-06'])
  expect(keys(ytdMonths('custom:2026-07-01,2026-07-31', 'x', CFG))).toEqual([])
})
test('previous-year compares each earlier month with the same month a year before; a leap February ends on the 29th', () => {
  const r = ytdMonths('custom:2026-10-01,2026-10-31', 'custom:2025-10-01,2025-10-31', { firstMonth: '2026-08', comparison: 'previous-year' })!
  expect(r.map((m) => m.compareRange)).toEqual(['custom:2025-08-01,2025-08-31', 'custom:2025-09-01,2025-09-30', 'custom:2025-10-01,2025-10-31'])
  expect(ytdMonths('custom:2028-03-01,2028-03-31', 'x', { firstMonth: '2028-01', comparison: 'previous-month' })![1].dateRange).toBe('custom:2028-02-01,2028-02-29')
})
test('a range that is not one month starting on the 1st is null (the block shows nothing)', () => {
  for (const r of ['last_30_days', 'custom:2026-09-02,2026-09-30', 'custom:2026-09-01,2026-10-01', 'custom:2026-09-30,2026-09-01', 'custom:2026-02-01,2026-02-30', 'custom:2026-09-01'])
    expect(ytdMonths(r, 'x', CFG)).toBeNull()
})
test('December 2026 on screen (the team in January, after locked months serves the newest finished month) shows August to December', () => {
  expect(keys(ytdMonths('custom:2026-12-01,2026-12-31', 'custom:2026-11-01,2026-11-30', CFG))).toEqual(['2026-08', '2026-09', '2026-10', '2026-11', '2026-12'])
})
test('December on screen gives twelve months, the most there can be', () => {
  expect(ytdMonths('custom:2027-12-01,2027-12-31', 'x', CFG)).toHaveLength(12)
})

const built = (followers: number, views: number, noData = false) =>
  ({ noData, kpis: { followers: { key: 'followers', label: 'F', format: 'number', value: followers }, exposure: { key: 'exposure', label: 'V', format: 'number', value: views } } }) as never

test("the series takes each month's Total Followers and Views tiles; the live month is labelled live", () => {
  const months = ytdMonths('custom:2026-10-01,2026-10-19', 'custom:2026-09-01,2026-09-19', CFG)!
  const b = Object.fromEntries(months.map((m, i) => [m.key, built(100 + i, 10 * (i + 1))]))
  expect(ytdSeries(months, b)).toEqual({ noData: [], points: [
    { key: '2026-08', label: 'Aug', followers: 100, views: 10 },
    { key: '2026-09', label: 'Sep', followers: 101, views: 20 },
    { key: '2026-10', label: 'Oct (live)', followers: 102, views: 30 },
  ] })
})
test('a no-data month is never plotted as zero; it is named instead', () => {
  const months = ytdMonths('custom:2026-09-01,2026-09-30', 'custom:2026-08-01,2026-08-31', CFG)!
  expect(ytdSeries(months, { '2026-08': built(0, 0, true), '2026-09': built(5, 7) })).toEqual({ noData: ['Aug'], points: [{ key: '2026-09', label: 'Sep', followers: 5, views: 7 }] })
})
test('a month with no built tiles at all throws (a wiring error, never a zero)', () => {
  const months = ytdMonths('custom:2026-09-01,2026-09-30', 'custom:2026-08-01,2026-08-31', CFG)!
  expect(() => ytdSeries(months, { '2026-08': built(1, 1) })).toThrow('YTD: no tiles for 2026-09')
})

const n = (value: number): YtdCell => ({ kind: 'number', value })
const B: YtdCell = { kind: 'blank' }
const NA: YtdCell = { kind: 'na' }
const BAD: YtdCell = { kind: 'invalid' }
const col = (cells: Record<number, YtdCell>, fill: YtdCell = B) => Array.from({ length: 12 }, (_, i) => cells[i + 1] ?? fill)
const tabOf = (f: YtdCell[] | undefined, v: YtdCell[] | undefined): YtdTab => ({ followers: f ? { INSTAGRAM: f } : {}, views: v ? { INSTAGRAM: v } : {} })
const tile = (followers: number, views: number, noData = false) => ({ noData, kpis: { followers: { key: 'followers', label: 'Total Followers', format: 'number', value: followers }, exposure: { key: 'exposure', label: 'Views', format: 'number', value: views } } }) as never

test('ytdSheetMonths: January to the month on screen; months from firstMonth are ytdMonths entries unchanged', () => {
  const m = ytdSheetMonths('custom:2026-09-01,2026-09-30', 'custom:2026-08-01,2026-08-31', CFG)!
  expect(keys(m)).toEqual(['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'])
  expect(m.slice(7)).toEqual(ytdMonths('custom:2026-09-01,2026-09-30', 'custom:2026-08-01,2026-08-31', CFG))
  expect(m[0]).toEqual({ key: '2026-01', dateRange: 'custom:2026-01-01,2026-01-31', compareRange: 'custom:2025-12-01,2025-12-31', partial: false })
  expect(ytdSheetMonths('custom:2026-10-01,2026-10-19', 'custom:2026-09-01,2026-09-19', CFG)!.at(-1)).toEqual({ key: '2026-10', dateRange: 'custom:2026-10-01,2026-10-19', compareRange: 'custom:2026-09-01,2026-09-19', partial: true })
})
test('ytdSheetMonths is null wherever ytdMonths draws nothing', () => {
  for (const r of ['last_30_days', 'custom:2026-09-01,2026-10-31', 'custom:2026-09-02,2026-09-30']) expect(ytdSheetMonths(r, 'x', CFG)).toBeNull()
  expect(ytdSheetMonths('custom:2026-07-01,2026-07-31', 'x', CFG)).toBeNull() // before firstMonth: ytdMonths is []
  expect(keys(ytdSheetMonths('custom:2027-02-01,2027-02-28', 'x', CFG))).toEqual(['2027-01', '2027-02'])
})
test('monthsNeedingDash: only blank months on or after firstMonth, and every such month when a column is missing', () => {
  const months = ytdSheetMonths('custom:2026-10-01,2026-10-31', 'custom:2026-09-01,2026-09-30', CFG)!
  const t = tabOf(col({ 1: n(1), 8: n(8), 9: n(9) }), col({ 1: n(1), 8: n(8) }))
  expect(keys(monthsNeedingDash(months, t, 'INSTAGRAM', '2026-08'))).toEqual(['2026-09', '2026-10'])
  expect(keys(monthsNeedingDash(months, tabOf(col({}, n(1)), undefined), 'INSTAGRAM', '2026-08'))).toEqual(['2026-08', '2026-09', '2026-10'])
  expect(keys(monthsNeedingDash(months, tabOf(col({}, NA), col({}, BAD)), 'INSTAGRAM', '2026-08'))).toEqual([])
})
test('ytdSheetSeries: the sheet wins; blank from firstMonth uses our value; N/A, invalid and early blanks are gaps', () => {
  const months = ytdSheetMonths('custom:2026-09-01,2026-09-30', 'custom:2026-08-01,2026-08-31', CFG)!
  const t = tabOf(col({ 1: NA, 2: n(20), 3: BAD, 8: n(80) }), col({ 2: n(2), 8: n(8), 9: n(9) }))
  const s = ytdSheetSeries(months, t, 'INSTAGRAM', '2026-08', { '2026-09': tile(900, 999) })
  expect(s.followers.points).toEqual([{ key: '2026-02', label: 'Feb', value: 20 }, { key: '2026-08', label: 'Aug', value: 80 }, { key: '2026-09', label: 'Sep', value: 900 }])
  // Jan is N/A before the first point (Feb): not listed (S7). Mar is invalid: always named.
  expect(s.followers.gaps).toEqual(['Mar', 'Apr', 'May', 'Jun', 'Jul'])
  expect(s.views.points.map((p) => [p.label, p.value])).toEqual([['Feb', 2], ['Aug', 8], ['Sep', 9]])
  expect(s.invalid).toEqual([{ month: '2026-03', graph: 'followers' }])
  expect(s.missingColumn).toEqual([])
})
test('a blank month whose Data block is noData is a gap after the first point; before it, it is not listed', () => {
  const months = ytdSheetMonths('custom:2026-09-01,2026-09-30', 'x', CFG)!
  const t = tabOf(col({}), col({}))
  const s = ytdSheetSeries(months, t, 'INSTAGRAM', '2026-08', { '2026-08': tile(1, 1, true), '2026-09': tile(5, 6) })
  expect(s.followers.points.map((p) => p.label)).toEqual(['Sep'])
  // Jan to Jul blank before firstMonth and Aug noData all come before the first point (Sep): none is listed (S7).
  expect(s.followers.gaps).toEqual([])
  expect(() => ytdSheetSeries(months, t, 'INSTAGRAM', '2026-08', {})).toThrow('YTD: no tiles for 2026-08')
})
test('a sheet number on the live month keeps (live); a missing column is reported per graph', () => {
  const months = ytdSheetMonths('custom:2026-10-01,2026-10-19', 'x', CFG)!
  const s = ytdSheetSeries(months, tabOf(col({}, n(7)), undefined), 'INSTAGRAM', '2026-08', { '2026-08': tile(1, 1), '2026-09': tile(1, 2), '2026-10': tile(1, 3) })
  expect(s.followers.points.at(-1)).toEqual({ key: '2026-10', label: 'Oct (live)', value: 7 })
  expect(s.missingColumn).toEqual(['views'])
  expect(s.views.points.map((p) => [p.label, p.value])).toEqual([['Aug', 1], ['Sep', 2], ['Oct (live)', 3]])
  // A missing column reads as blank: Jan to Jul come before the first point (Aug) and are not listed (S7).
  expect(s.views.gaps).toEqual([])
})
test('N/A from firstMonth on is never filled from Dash, even when our own value exists', () => {
  const months = ytdSheetMonths('custom:2026-09-01,2026-09-30', 'x', CFG)!
  const s = ytdSheetSeries(months, tabOf(col({ 8: NA, 9: n(9) }), col({ 8: n(8), 9: n(9) })), 'INSTAGRAM', '2026-08', { '2026-08': tile(800, 80) })
  expect(s.followers.points.map((p) => p.label)).toEqual(['Sep']) // Aug's Dash value is not used
  expect(s.followers.gaps).toEqual([]) // Jan to Aug come before the first point: not listed (S7)
})
test('S7: a leading run of blank and N/A months is not listed; a gap after the first point is named', () => {
  const months = ytdSheetMonths('custom:2026-09-01,2026-09-30', 'x', CFG)!
  const t = tabOf(col({ 1: NA, 2: B, 3: n(30), 4: NA, 5: B, 6: n(60), 7: n(70), 8: n(80), 9: n(90) }), col({}, n(1)))
  const s = ytdSheetSeries(months, t, 'INSTAGRAM', '2026-08', {})
  expect(s.followers.points.map((p) => p.label)).toEqual(['Mar', 'Jun', 'Jul', 'Aug', 'Sep'])
  expect(s.followers.gaps).toEqual(['Apr', 'May'])
  expect(s.views.gaps).toEqual([])
})
test('S7: an invalid cell is always named and ends the leading run', () => {
  const months = ytdSheetMonths('custom:2026-09-01,2026-09-30', 'x', CFG)!
  const t = tabOf(col({ 1: B, 2: BAD, 3: B, 4: n(40), 5: n(50), 6: n(60), 7: n(70), 8: n(80), 9: n(90) }), col({}, n(1)))
  const s = ytdSheetSeries(months, t, 'INSTAGRAM', '2026-08', {})
  expect(s.followers.gaps).toEqual(['Feb', 'Mar'])
  expect(s.invalid).toEqual([{ month: '2026-02', graph: 'followers' }])
})
test('S7: a graph with no point at all lists no gaps (the card shows No data)', () => {
  const months = ytdSheetMonths('custom:2026-09-01,2026-09-30', 'x', CFG)!
  const s = ytdSheetSeries(months, tabOf(col({}, NA), col({}, n(1))), 'INSTAGRAM', '2026-08', {})
  expect(s.followers.points).toEqual([])
  expect(s.followers.gaps).toEqual([])
})
test('S7: after the first point, a blank month whose Data block is noData is named', () => {
  const months = ytdSheetMonths('custom:2026-09-01,2026-09-30', 'x', CFG)!
  const s = ytdSheetSeries(months, tabOf(col({ 2: n(20) }), col({ 2: n(2) })), 'INSTAGRAM', '2026-08', { '2026-08': tile(1, 1, true), '2026-09': tile(5, 6) })
  expect(s.followers.points.map((p) => p.label)).toEqual(['Feb', 'Sep'])
  expect(s.followers.gaps).toEqual(['Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'])
})
test('S7: after the first point, an N/A from firstMonth is named and never filled from Dash', () => {
  const months = ytdSheetMonths('custom:2026-09-01,2026-09-30', 'x', CFG)!
  const s = ytdSheetSeries(months, tabOf(col({ 2: n(20), 8: NA, 9: n(9) }), col({}, n(1))), 'INSTAGRAM', '2026-08', { '2026-08': tile(800, 80) })
  expect(s.followers.points.map((p) => p.label)).toEqual(['Feb', 'Sep'])
  expect(s.followers.gaps).toContain('Aug')
})

const live = (iso: string) => ytdLiveMonths(clockFor(new Date(iso)))

test('ytdLiveMonths: January through the last complete UTC day\'s month; the last month is live and runs to that day; no comparison', () => {
  const r = live('2026-10-15T12:00:00Z')
  expect(keys(r)).toEqual(['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'])
  expect(r[8]).toEqual({ key: '2026-09', dateRange: 'custom:2026-09-01,2026-09-30', compareRange: null, partial: false })
  expect(r[9]).toEqual({ key: '2026-10', dateRange: 'custom:2026-10-01,2026-10-14', compareRange: null, partial: true })
})
test('ytdLiveMonths: on the 1st after 04:00 UTC the previous month is whole and no longer live', () => {
  const r = live('2026-11-01T12:00:00Z')
  expect(r.at(-1)).toEqual({ key: '2026-10', dateRange: 'custom:2026-10-01,2026-10-31', compareRange: null, partial: false })
})
// Paul's review of #306 (finding 1): while the newest UTC day's Dash window is still open (before 04:00 UTC), the live
// month ends on the day before, the last day whose window has closed. So a partial month never sends the finished
// month's request, and Dash's partial answer is never cached under the finished month's key.
test('ytdLiveMonths: on the 1st before 04:00 UTC the previous month is live through the day before its last day', () => {
  expect(live('2026-11-01T02:00:00Z').at(-1)).toEqual({ key: '2026-10', dateRange: 'custom:2026-10-01,2026-10-30', compareRange: null, partial: true })
})
test('ytdLiveMonths: on the 2nd before 04:00 UTC the previous month is whole and the new month has not started', () => {
  const r = live('2026-10-02T02:00:00Z')
  expect(r.at(-1)).toEqual({ key: '2026-09', dateRange: 'custom:2026-09-01,2026-09-30', compareRange: null, partial: false })
  expect(keys(r)).not.toContain('2026-10')
  expect(live('2027-01-02T02:00:00Z').at(-1)).toEqual({ key: '2026-12', dateRange: 'custom:2026-12-01,2026-12-31', compareRange: null, partial: false })
})
test('ytdLiveMonths: at every hour across two month ends, a live month never sends the whole month\'s request', () => {
  for (const start of ['2026-09-29T00:00:00Z', '2026-12-30T00:00:00Z']) {
    for (let h = 0; h < 96; h++) {
      const at = new Date(Date.parse(start) + h * 3600_000)
      for (const m of ytdLiveMonths(clockFor(at))) {
        const whole = `custom:${m.key}-01,${m.key}-${String(new Date(Date.UTC(+m.key.slice(0, 4), +m.key.slice(5, 7), 0)).getUTCDate()).padStart(2, '0')}`
        if (m.partial) expect(m.dateRange, `${at.toISOString()} ${m.key}`).not.toBe(whole)
        else expect(m.dateRange, `${at.toISOString()} ${m.key}`).toBe(whole)
      }
    }
  }
})
test('ytdLiveMonths: on January 1 the block shows the previous year, January to December', () => {
  const r = live('2027-01-01T12:00:00Z')
  expect(keys(r)).toHaveLength(12)
  expect(r[0].key).toBe('2026-01')
  expect(r.at(-1)).toEqual({ key: '2026-12', dateRange: 'custom:2026-12-01,2026-12-31', compareRange: null, partial: false })
  expect(keys(live('2027-01-02T12:00:00Z'))).toEqual(['2027-01'])
})
test('ytdLiveMonths: the New York evening of the last day is still that month (UTC is ahead)', () => {
  // 2026-09-30 22:00 New York = 2026-10-01 02:00 UTC: Sep 30's Dash window is still open, so the live month runs to Sep 29.
  expect(live('2026-10-01T02:00:00Z').at(-1)).toEqual({ key: '2026-09', dateRange: 'custom:2026-09-01,2026-09-29', compareRange: null, partial: true })
})
test('ytdLiveMonths: a leap February, a December date, and January 1 before 04:00 UTC', () => {
  expect(live('2028-03-01T12:00:00Z').at(-1)).toEqual({ key: '2028-02', dateRange: 'custom:2028-02-01,2028-02-29', compareRange: null, partial: false })
  const dec = live('2026-12-15T12:00:00Z')
  expect(dec).toHaveLength(12)
  expect(dec.at(-1)).toEqual({ key: '2026-12', dateRange: 'custom:2026-12-01,2026-12-14', compareRange: null, partial: true })
  expect(live('2027-01-01T02:00:00Z').at(-1)).toEqual({ key: '2026-12', dateRange: 'custom:2026-12-01,2026-12-30', compareRange: null, partial: true })
})
