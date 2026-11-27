import { test, expect } from 'vitest'
import { formatDelta, deltaTone, pctChange, type DeltaUnit } from './delta'

test.each([
  [1.23, 'pts', '+1.2 pts'], [-0.44, 'pts', '-0.4 pts'], [0, 'pts', '0.0 pts'],
  [-0.04, 'pts', '0.0 pts'],
  [114.6, 'pct', '+114.6%'], [-3, 'pct', '-3.0%'],
  [0.4, 'places', '0 places'], [-0.4, 'places', '0 places'], [2, 'places', '↑ 2 places'], [-1, 'places', '↓ 1 place'], [0, 'places', '0 places'],
  [null, 'pts', '–'], [undefined, 'pct', '–'], [Number.NaN, 'places', '–'],
])('formatDelta(%j, %s) = %s', (v, unit, want) => expect(formatDelta(v as number, unit as DeltaUnit)).toBe(want))
test('formatDelta isNew wins over value', () => expect(formatDelta(3, 'places', { isNew: true })).toBe('New'))
test('deltaTone', () => {
  expect(deltaTone(1, 'higher')).toBe('good'); expect(deltaTone(-1, 'higher')).toBe('bad')
  expect(deltaTone(1, 'lower')).toBe('bad'); expect(deltaTone(0, 'higher')).toBe('neutral')
  expect(deltaTone(null, 'higher')).toBe('neutral')
})
test('pctChange', () => {
  expect(pctChange(221, 103)).toBeCloseTo(114.56, 1)
  expect(pctChange(5, 0)).toBeNull(); expect(pctChange(5, null)).toBeNull()
})
test('deltaTone with unit uses the displayed rounding', () => {
  expect(deltaTone(0.04, 'higher', 'pts')).toBe('neutral')
  expect(deltaTone(0.04, 'higher')).toBe('good')
  expect(deltaTone(0.4, 'higher', 'places')).toBe('neutral')
  expect(deltaTone(-0.4, 'higher', 'places')).toBe('neutral')
  expect(deltaTone(0.6, 'higher', 'places')).toBe('good')
  expect(deltaTone(-0.04, 'higher', 'pct')).toBe('neutral')
})
test.each([
  [0.5, '↑ 1 place'], [-0.5, '↓ 1 place'], [1.5, '↑ 2 places'], [-1.5, '↓ 2 places'], [-0.49, '0 places'],
])('formatDelta(%s, places) = %s', (v, want) => expect(formatDelta(v, 'places')).toBe(want))
test('deltaTone agrees with the rounded places value', () => {
  expect(deltaTone(-0.5, 'higher', 'places')).toBe('bad')
  expect(deltaTone(0.5, 'higher', 'places')).toBe('good')
  expect(deltaTone(-0.49, 'higher', 'places')).toBe('neutral')
})
