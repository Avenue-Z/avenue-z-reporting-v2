import { test, expect } from 'vitest'
import {
  MAX_COMPETITOR_LINES,
  TREND_PARAM,
  defaultTrendSelection,
  parseTrendParam,
  serializeTrend,
} from './trend-selection'

const KEYS = ['unum', 'aflac', 'guardian', 'cigna', 'humana', 'anthem', 'kaiser', 'oscar', 'molina', 'centene']

test('constants', () => {
  expect(TREND_PARAM).toBe('aeoTrend')
  expect(MAX_COMPETITOR_LINES).toBe(7)
})

test('defaultTrendSelection turns competitors on with the first four keys', () => {
  expect(defaultTrendSelection(KEYS)).toEqual({ competitors: true, selected: KEYS.slice(0, 4) })
})

test('parseTrendParam: missing or empty gives the default', () => {
  const want = defaultTrendSelection(KEYS)
  expect(parseTrendParam(undefined, KEYS)).toEqual(want)
  expect(parseTrendParam(null, KEYS)).toEqual(want)
  expect(parseTrendParam('', KEYS)).toEqual(want)
})

test('parseTrendParam: "off" turns competitors off', () => {
  expect(parseTrendParam('off', KEYS)).toEqual({ competitors: false, selected: [] })
})

test('parseTrendParam drops unknown keys, empties and duplicates; keeps param order; case-sensitive', () => {
  expect(parseTrendParam('nope,guardian,,guardian,GUARDIAN', KEYS)).toEqual({
    competitors: true,
    selected: ['guardian'],
  })
})

test('parseTrendParam keeps the order the keys appear in the param', () => {
  expect(parseTrendParam('cigna,unum,aflac', KEYS).selected).toEqual(['cigna', 'unum', 'aflac'])
})

test('parseTrendParam caps at seven keys, first seven kept', () => {
  const nine = KEYS.slice(0, 9)
  expect(parseTrendParam(nine.join(','), KEYS).selected).toEqual(nine.slice(0, 7))
})

test('parseTrendParam: nothing known gives the default', () => {
  expect(parseTrendParam('nope', KEYS)).toEqual(defaultTrendSelection(KEYS))
})

test('serializeTrend of the default is null', () => {
  expect(serializeTrend(defaultTrendSelection(KEYS), KEYS)).toBeNull()
})

test('serializeTrend of competitors off is "off"', () => {
  expect(serializeTrend({ competitors: false, selected: [] }, KEYS)).toBe('off')
})

test('serializeTrend: competitors on with nothing selected is "off"', () => {
  expect(serializeTrend({ competitors: true, selected: [] }, KEYS)).toBe('off')
})

test('serializeTrend round-trips a custom selection', () => {
  const sel = { competitors: true, selected: ['cigna', 'unum'] }
  const text = serializeTrend(sel, KEYS)
  expect(text).toBe('cigna,unum')
  expect(parseTrendParam(text, KEYS)).toEqual(sel)
})

test('serializeTrend: same keys in a different order is not the default', () => {
  const reordered = { competitors: true, selected: [...KEYS.slice(0, 4)].reverse() }
  expect(serializeTrend(reordered, KEYS)).toBe(KEYS.slice(0, 4).reverse().join(','))
})
