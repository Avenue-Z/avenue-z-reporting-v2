import { expect, test } from 'vitest'
import { ytdConfig, ytdMonths, ytdSeries } from './ytd'

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
