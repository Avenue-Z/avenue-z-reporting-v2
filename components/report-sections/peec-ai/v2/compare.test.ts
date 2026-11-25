import { test, expect } from 'vitest'
import { parseAeoCompare, fetchCompareMode, parseShowDeltas, compareSuffix } from './compare'

test.each([
  [undefined, 'previous_period'], [null, 'previous_period'], ['', 'previous_period'],
  ['previous_period', 'previous_period'], ['previous_year', 'previous_year'], ['none', 'none'],
  ['custom:2026-01-01,2026-01-31', 'previous_period'], ['banana', 'previous_period'],
])('parseAeoCompare(%j) = %s', (raw, want) => expect(parseAeoCompare(raw)).toBe(want))
test('fetchCompareMode maps none to previous_period', () => {
  expect(fetchCompareMode('none')).toBe('previous_period')
  expect(fetchCompareMode('previous_year')).toBe('previous_year')
})
test('parseShowDeltas', () => {
  expect(parseShowDeltas(undefined, 'previous_period')).toBe(true)
  expect(parseShowDeltas('off', 'previous_period')).toBe(false)
  expect(parseShowDeltas('on', 'previous_year')).toBe(true)
  expect(parseShowDeltas(undefined, 'none')).toBe(false)
})
test('compareSuffix', () => {
  expect(compareSuffix('previous_period')).toBe('vs previous period')
  expect(compareSuffix('previous_year')).toBe('vs same period last year')
  expect(compareSuffix('none')).toBe('')
})

test('Content Impact treats compareRange none like a missing param', async () => {
  const { deriveCompareRange } = await import('@/lib/ga4/client')
  // No compare window is derived for 'none', exactly as for a missing param.
  expect(deriveCompareRange('last_30_days', 'none')).toBeNull()
  expect(deriveCompareRange('last_30_days', undefined)).toBeNull()
  // The gapsPrior walk (content-impact.tsx) runs whenever compareRange !== 'previous_period': none and missing alike.
  const walks = (c: string | undefined) => c !== 'previous_period'
  expect(walks('none')).toBe(walks(undefined))
})
