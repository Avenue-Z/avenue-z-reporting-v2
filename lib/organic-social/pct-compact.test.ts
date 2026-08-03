import { expect, test } from 'vitest'
import { pctCompact } from './base'

// pctCompact lives in lib/supermetrics/format but that path isn't in vitest's include
// allowlist, so its boundary cases are pinned here (organic-social IS globbed) via the same
// re-export the section consumes. Guards the 1% threshold, the sub-1% floor, and sign symmetry.
test('pctCompact: whole at/above 1%, one decimal below, sign-symmetric', () => {
  // >= 1% -> whole, half away from zero
  expect(pctCompact(3.47)).toBe('3%')
  expect(pctCompact(12.6)).toBe('13%')
  expect(pctCompact(2.5)).toBe('3%')
  expect(pctCompact(1)).toBe('1%')     // boundary is whole
  // < 1% -> one decimal, never collapses a real rate to "0%"
  expect(pctCompact(0.4)).toBe('0.4%')
  expect(pctCompact(0.95)).toBe('0.9%') // JS toFixed on the 0.95 double
  expect(pctCompact(0)).toBe('0.0%')
  // signed input (a delta) rounds symmetrically, not toward +∞
  expect(pctCompact(-3.5)).toBe('-4%')
  expect(pctCompact(-2.5)).toBe('-3%')
  expect(pctCompact(-0.4)).toBe('-0.4%')
})
