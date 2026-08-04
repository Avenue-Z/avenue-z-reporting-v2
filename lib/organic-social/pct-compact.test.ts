import { expect, test } from 'vitest'
import { pctCompact } from './format'

// pctCompact is non-negative-only (rate KPIs). Guards the 1% threshold, the sub-1% floor,
// and the intentional [0.96%,1%) -> "1.0%" boundary. All inputs are clean decimals so no
// assertion pins a floating-point artifact.
test('pctCompact: whole at/above 1%, one decimal below', () => {
  // >= 1% -> whole number
  expect(pctCompact(3.47)).toBe('3%')
  expect(pctCompact(12.6)).toBe('13%')
  expect(pctCompact(2.5)).toBe('3%')  // half up
  expect(pctCompact(1)).toBe('1%')    // boundary is whole

  // < 1% -> one decimal, so a real sub-1% rate never collapses to "0%"
  expect(pctCompact(0.4)).toBe('0.4%')
  expect(pctCompact(0.1)).toBe('0.1%')
  expect(pctCompact(0.9)).toBe('0.9%')
  expect(pctCompact(0)).toBe('0.0%')

  // [0.96%,1%) is shown as its true one-decimal value "1.0%" — deliberate. Rounding it to a
  // whole "1%" would drag 0.6%/0.7%/0.9% up to "1%" too, inflating the sub-1% rates this exists
  // to preserve.
  expect(pctCompact(0.97)).toBe('1.0%')
})
