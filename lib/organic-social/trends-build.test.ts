import { expect, test } from 'vitest'
import { buildTrendSeries } from './trend-series'

const series = buildTrendSeries([
  { label: 'Instagram', daily: { '2026-06-02': 10, '2026-06-01': 5 } },
  { label: 'Facebook', daily: null },                       // dropped (no data)
  { label: 'X', daily: { '2026-06-01': 7, '2026-06-02': null } }, // null -> 0
])

test('drops channels with null daily, keeps order', () => {
  expect(series.channels).toEqual(['Instagram', 'X'])
})

test('points sorted ascending by date', () => {
  expect(series.points.map((p) => p.date)).toEqual(['2026-06-01', '2026-06-02'])
})

test('fills value', () => {
  expect(series.points[0].Instagram).toBe(5)
})

test('null becomes 0', () => {
  expect(series.points[1].X).toBe(0)
})
