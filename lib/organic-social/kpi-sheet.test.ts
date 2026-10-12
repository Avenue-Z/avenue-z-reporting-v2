import { expect, test } from 'vitest'
import { KpiSheetLayoutError, kpiPeriodLabel, parseKpiGrid } from './kpi-sheet'

// The tracker's layout, verbatim (the trailing space on the title is real); the numbers are made up.
const GRID: unknown[][] = [
  ['Test Co 2026 KPI Tracker '],
  [],
  ['', '', 'Total Followers', 'Impressions', 'Engagements'],
  ['Instagram', 'End of September', '1,100', '20,000', '300'],
  ['', 'H2 2026 Target', '2,000', '50,500', '1,250'],
  ['Facebook', 'End of September', '30,000', '80,000', '400'],
  ['', 'H2 2026 Target', '31,000', '100,000', '550'],
  ['LinkedIn', 'End of September', '9,000', '47,000', '6,300'],
  ['', 'H2 2026 Target', '9,400', '80,000', '10,000'],
]

test('the tracker layout parses, cells trimmed, thousands separators accepted', () => {
  const t = parseKpiGrid(GRID, '2026')
  expect(t.platforms.map((p) => [p.channel, p.monthLabel])).toEqual([['INSTAGRAM', 'September'], ['FACEBOOK', 'September'], ['LINKEDIN', 'September']])
  expect(t.platforms[0].actual).toEqual({ followers: 1100, impressions: 20000, engagements: 300 })
  expect(t.platforms[0].target).toEqual({ followers: 2000, impressions: 50500, engagements: 1250 })
})

test.each([
  ['missing header', GRID.map((r, i) => (i === 2 ? ['', '', 'Followers', 'Impressions', 'Engagements'] : r)), 'header'],
  ['a platform row missing its target', [...GRID.slice(0, 4), ...GRID.slice(5)], 'Instagram target'],
  ['a target before its actual', GRID.map((r, i) => (i === 3 ? GRID[4] : i === 4 ? GRID[3] : r)), 'platform name'],
  ['a non-number', GRID.map((r, i) => (i === 5 ? ['Facebook', 'End of September', 'n/a', '80,000', '400'] : r)), 'Facebook followers'],
  ['an unknown platform', GRID.map((r, i) => (i === 7 ? ['Threads', 'End of September', '1', '1', '1'] : r)), 'platform name'],
  ['no platforms at all', GRID.slice(0, 3), 'platform name'],
])('%s is a layout error for the whole block', (_, grid, missing) => {
  expect(() => parseKpiGrid(grid as unknown[][], '2026')).toThrow(KpiSheetLayoutError)
  try { parseKpiGrid(grid as unknown[][], '2026') } catch (e) { expect((e as KpiSheetLayoutError).missing).toBe(missing) }
})

test('the period label runs from January 1 to the last day of the row month', () => {
  expect(kpiPeriodLabel('September', '2026')).toBe('1/1/26 to 9/30/26')
  expect(kpiPeriodLabel('February', '2028')).toBe('1/1/28 to 2/29/28')
  expect(() => kpiPeriodLabel('Sometime', '2026')).toThrow(KpiSheetLayoutError)
})

// Paul, #334 review item 7: parsing stopped at the first blank name and silently dropped every platform after it.
test('a blank separator row followed by more rows is a layout error; rows that are entirely empty after the last block are fine', () => {
  const withSeparator = [...GRID.slice(0, 5), [], ...GRID.slice(5)]
  expect(() => parseKpiGrid(withSeparator, '2026')).toThrow(KpiSheetLayoutError)
  try { parseKpiGrid(withSeparator, '2026') } catch (e) { expect((e as KpiSheetLayoutError).missing).toBe('trailing rows') }
  const sheetsPadding = [...GRID, [], ['', ''], []]
  expect(parseKpiGrid(sheetsPadding, '2026').platforms.length).toBe(3)
})

// Paul, #334 round 2 (non-blocker 3): the parser let a target row for another year and a platform listed twice through.
test.each([
  ['a target row for another year', GRID.map((r, i) => (i === 4 ? ['', 'H2 2025 Target', '2,000', '50,500', '1,250'] : r)), 'Instagram target year'],
  ['a platform listed twice', [...GRID, GRID[3], GRID[4]], 'Instagram duplicate'],
])('%s is a layout error', (_, grid, missing) => {
  expect(() => parseKpiGrid(grid as unknown[][], '2026')).toThrow(KpiSheetLayoutError)
  try { parseKpiGrid(grid as unknown[][], '2026') } catch (e) { expect((e as KpiSheetLayoutError).missing).toBe(missing) }
})

// Paul, #334 round 3: nothing paired the half with the row's month, and this test used to pin "End of September" with
// an H1 target as valid. A year-to-date figure over a half-year goal overstates progress, so H1 pairs only with a
// January to June row; H2 is accepted with any month.
test('an H1 target is accepted with a January to June row', () => {
  const march = GRID.map((r, i) => (i === 3 ? ['Instagram', 'End of March', '1,100', '20,000', '300'] : i === 4 ? ['', 'H1 2026 Target', '2,000', '50,500', '1,250'] : r))
  expect(parseKpiGrid(march, '2026').platforms[0].monthLabel).toBe('March')
})

test('an H1 target next to a July to December row is a layout error', () => {
  const september = GRID.map((r, i) => (i === 4 ? ['', 'H1 2026 Target', '2,000', '50,500', '1,250'] : r))
  expect(() => parseKpiGrid(september, '2026')).toThrow(KpiSheetLayoutError)
  try { parseKpiGrid(september, '2026') } catch (e) { expect((e as KpiSheetLayoutError).missing).toBe('Instagram target half') }
})
