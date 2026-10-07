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
  const t = parseKpiGrid(GRID)
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
  expect(() => parseKpiGrid(grid as unknown[][])).toThrow(KpiSheetLayoutError)
  try { parseKpiGrid(grid as unknown[][]) } catch (e) { expect((e as KpiSheetLayoutError).missing).toBe(missing) }
})

test('the period label runs from January 1 to the last day of the row month', () => {
  expect(kpiPeriodLabel('September', '2026')).toBe('1/1/26 to 9/30/26')
  expect(kpiPeriodLabel('February', '2028')).toBe('1/1/28 to 2/29/28')
  expect(() => kpiPeriodLabel('Sometime', '2026')).toThrow(KpiSheetLayoutError)
})
