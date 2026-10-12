import { expect, test } from 'vitest'
import { applySheetToTiles, comparisonMonth, finishedMonthOnScreen } from './tiles-from-sheet'
import { buildOutlineKpis, selectOutlineRows } from './outline-headlines'
import { outlineSpecsFor, OUTLINE_DATA_ROWS } from './outline-layout'
import { metricFor, type DashChannel } from './metrics'
import type { YtdCell, YtdTab } from './ytd-sheet'
import { clockFor, resolveLockedRange } from './reporting-months'

// Made-up numbers only.
const n = (value: number): YtdCell => ({ kind: 'number', value })
const B: YtdCell = { kind: 'blank' }
const col = (cells: Record<number, YtdCell>) => Array.from({ length: 12 }, (_, i) => cells[i + 1] ?? B)
const tab = (ch: DashChannel, f: Record<number, YtdCell>, v: Record<number, YtdCell>): YtdTab => ({ followers: { [ch]: col(f) }, views: { [ch]: col(v) } })
const built = (ch: DashChannel, value: number | null = 10, context: number | null = 8) => buildOutlineKpis(ch,
  Object.fromEntries(outlineSpecsFor(ch).map((s) => [metricFor(s), { value, context, context_change: null }])), outlineSpecsFor(ch))

const at = (lastCompleteUtcDay: string, today = '2026-10-15') => ({ lastCompleteUtcDay, today })

test('finishedMonthOnScreen: a whole month that has ended; anything else is null', () => {
  expect(finishedMonthOnScreen('custom:2026-09-01,2026-09-30', at('2026-10-01'))).toBe('2026-09')
  expect(finishedMonthOnScreen('custom:2026-02-01,2026-02-28', at('2026-03-05'))).toBe('2026-02')
  expect(finishedMonthOnScreen('custom:2026-09-01,2026-09-30', at('2026-09-30'))).toBe('2026-09') // its last day is complete
  expect(finishedMonthOnScreen('custom:2026-09-01,2026-09-30', at('2026-09-29'))).toBeNull() // not over yet
  expect(finishedMonthOnScreen('custom:2026-10-01,2026-10-14', at('2026-10-14'))).toBeNull() // the live month
  expect(finishedMonthOnScreen('custom:2026-09-02,2026-09-30', at('2026-10-05'))).toBeNull()
  expect(finishedMonthOnScreen('custom:2026-08-01,2026-09-30', at('2026-10-05'))).toBeNull()
  expect(finishedMonthOnScreen('last_30_days', at('2026-10-05'))).toBeNull()
})

test('finishedMonthOnScreen: while New York is still on the last day, the team\'s live month reads as a whole month but is still live', () => {
  // monthsFor offers New York's current month as live, ending at lastCompleteUtcDay (reporting-months.ts:168-172). From
  // 00:00 UTC on the 1st until New York's midnight (04:00 or 05:00 UTC by season) that range is the whole month.
  expect(finishedMonthOnScreen('custom:2026-09-01,2026-09-30', at('2026-09-30', '2026-09-30'))).toBeNull()
  expect(finishedMonthOnScreen('custom:2026-11-01,2026-11-30', at('2026-11-30', '2026-11-30'))).toBeNull() // winter, 04:30 UTC
  expect(finishedMonthOnScreen('custom:2026-08-01,2026-08-31', at('2026-09-30', '2026-09-30'))).toBe('2026-08')
})

test('comparisonMonth: the month before, or the same month a year back', () => {
  expect(comparisonMonth('2026-09', 'previous-month')).toBe('2026-08')
  expect(comparisonMonth('2026-01', 'previous-month')).toBe('2025-12')
  expect(comparisonMonth('2026-09', 'previous-year')).toBe('2025-09')
})

test('the sheet has the month and the month before: both tiles take it, arrows are sheet against sheet, nothing else moves', () => {
  const b = built('INSTAGRAM')
  const out = applySheetToTiles(b, 'INSTAGRAM', '2026-09', '2026-08', { current: tab('INSTAGRAM', { 8: n(1000), 9: n(1100) }, { 8: n(200), 9: n(300) }), prior: null })
  expect(out.kpis.followers).toEqual({ ...b.kpis.followers, value: 1100, delta: 10 })
  expect(out.kpis.exposure).toEqual({ ...b.kpis.exposure, value: 300, delta: 50 })
  for (const k of Object.keys(b.kpis).filter((k) => k !== 'followers' && k !== 'exposure')) expect(out.kpis[k]).toBe(b.kpis[k])
  expect(out.noData).toBe(false)
})

test('each tile separately: a blank, N/A or invalid cell, or a missing column, keeps Dash\'s tile and arrow exactly', () => {
  const b = built('INSTAGRAM')
  for (const cell of [B, { kind: 'na' } as YtdCell, { kind: 'invalid' } as YtdCell]) {
    const out = applySheetToTiles(b, 'INSTAGRAM', '2026-09', '2026-08', { current: tab('INSTAGRAM', { 9: cell }, { 9: n(300) }), prior: null })
    expect(out.kpis.followers).toBe(b.kpis.followers)
    expect(out.kpis.exposure.value).toBe(300)
  }
  const noColumn = applySheetToTiles(b, 'INSTAGRAM', '2026-09', '2026-08', { current: tab('FACEBOOK', { 9: n(1) }, { 9: n(1) }), prior: null })
  expect(noColumn).toBe(b) // nothing changed: the same object back
})

test('the comparison month is not in the sheet: the sheet value with no arrow, never sheet against Dash', () => {
  const out = applySheetToTiles(built('INSTAGRAM'), 'INSTAGRAM', '2026-09', '2026-08', { current: tab('INSTAGRAM', { 9: n(1100) }, { 8: { kind: 'na' }, 9: n(300) }), prior: null })
  expect(out.kpis.followers.value).toBe(1100)
  expect(out.kpis.followers.delta).toBeUndefined()
  expect(out.kpis.exposure.delta).toBeUndefined()
})

test('January with no prior-year tab: no arrow; with one, the arrow reads the prior year\'s December', () => {
  const current = tab('INSTAGRAM', { 1: n(110) }, { 1: n(30) })
  expect(applySheetToTiles(built('INSTAGRAM'), 'INSTAGRAM', '2026-01', '2025-12', { current, prior: null }).kpis.followers.delta).toBeUndefined()
  const prior = tab('INSTAGRAM', { 12: n(100) }, { 12: n(20) })
  const out = applySheetToTiles(built('INSTAGRAM'), 'INSTAGRAM', '2026-01', '2025-12', { current, prior })
  expect(out.kpis.followers.delta).toBe(10)
  expect(out.kpis.exposure.delta).toBe(50)
})

test('previous-year: the arrow reads the same month of the prior year\'s tab', () => {
  const out = applySheetToTiles(built('LINKEDIN'), 'LINKEDIN', '2026-09', '2025-09', {
    current: tab('LINKEDIN', { 9: n(150) }, { 9: n(10) }), prior: tab('LINKEDIN', { 9: n(100) }, { 9: n(20) }),
  })
  expect(out.kpis.followers.delta).toBe(50)
  expect(out.kpis.exposure.delta).toBe(-50)
})

test('noData stays No data: a month Dash returned all null is returned untouched', () => {
  const b = built('INSTAGRAM', null, null)
  expect(b.noData).toBe(true)
  expect(applySheetToTiles(b, 'INSTAGRAM', '2026-09', '2026-08', { current: tab('INSTAGRAM', { 9: n(1) }, { 9: n(1) }), prior: null })).toBe(b)
})

test('TikTok Video Views reads Views, so it follows the sheet too', () => {
  const out = applySheetToTiles(built('TIKTOK'), 'TIKTOK', '2026-09', '2026-08', { current: tab('TIKTOK', {}, { 9: n(4321) }), prior: null })
  const rows = selectOutlineRows('TIKTOK', out, OUTLINE_DATA_ROWS.standard.TIKTOK!)
  expect(rows.kpis.find((k) => k.key === 'videoViews')?.value).toBe(4321)
  expect(rows.kpis.find((k) => k.key === 'exposure')?.value).toBe(4321)
})

test('finishedMonthOnScreen with real clocks: the live month stays live until New York\'s midnight, summer and winter', () => {
  const sep = 'custom:2026-09-01,2026-09-30'
  expect(finishedMonthOnScreen(sep, clockFor(new Date('2026-10-01T03:59:00Z')))).toBeNull() // 23:59 New York, Sep 30
  expect(finishedMonthOnScreen(sep, clockFor(new Date('2026-10-01T04:30:00Z')))).toBe('2026-09') // 00:30 New York, Oct 1
  const nov = 'custom:2026-11-01,2026-11-30'
  expect(finishedMonthOnScreen(nov, clockFor(new Date('2026-12-01T04:30:00Z')))).toBeNull() // 23:30 New York, Nov 30
  expect(finishedMonthOnScreen(nov, clockFor(new Date('2026-12-01T05:30:00Z')))).toBe('2026-11') // 00:30 New York, Dec 1
})

test('a comparison month of 0 in the sheet gives no arrow, as outlineDelta does for any zero prior', () => {
  const out = applySheetToTiles(built('INSTAGRAM'), 'INSTAGRAM', '2026-09', '2026-08', { current: tab('INSTAGRAM', { 8: n(0), 9: n(5) }, {}), prior: null })
  expect(out.kpis.followers.value).toBe(5)
  expect(out.kpis.followers.delta).toBeUndefined()
})

test('comparisonMonth is the month locked months compares a finished month with, for both settings', () => {
  const clock = clockFor(new Date('2026-10-20T12:00:00Z'))
  for (const comparison of ['previous-month', 'previous-year'] as const) {
    const r = resolveLockedRange({ firstMonth: '2026-01', comparison }, 'team', clock, 'custom:2026-09-01,2026-09-30')
    expect(r.month?.key).toBe('2026-09')
    expect(String(r.month?.compareRange).slice(7, 14)).toBe(comparisonMonth('2026-09', comparison))
  }
})
