import { expect, test } from 'vitest'
import { roundDelta } from './delta-rounding'

// Jasmine, 2026-09-29: "6% but if it was 6.57 it should show as 7%".
test('her two examples', () => {
  expect(roundDelta(6.3)).toBe(6)
  expect(roundDelta(6.57)).toBe(7)
})

test('nearest by size, half up, sign kept', () => {
  expect([6.5, 1.5, -6.3, -6.57, -6.5, 0].map(roundDelta)).toEqual([7, 2, -6, -7, -7, 0])
})

// Thomas, 2026-10-01 (Paul's review of #285): a change under 1% keeps one decimal, so a small real move on a
// large account (120,000 to 119,500 followers is -0.42%) is not shown as a flat 0%.
test('under 1% the change keeps one decimal, half up by size; from 1% it is whole', () => {
  expect([0.42, 0.35, 0.05, 0.94, -0.42, -0.35].map(roundDelta)).toEqual([0.4, 0.4, 0.1, 0.9, -0.4, -0.4])
  expect([0.95, 0.99, 1, 1.4].map(roundDelta)).toEqual([1, 1, 1, 1])
  expect(roundDelta(((119500 - 120000) / 120000) * 100)).toBe(-0.4)
})

test('the real value is rounded, not the one-decimal display', () => {
  expect(roundDelta(6.45)).toBe(6)
  expect(roundDelta(-6.45)).toBe(-6)
})

test('float noise never moves a half across the line', () => {
  expect(roundDelta(6.4999999999)).toBe(7)
  expect(roundDelta(5.0000000001)).toBe(5)
})

test('a change that rounds to zero is plain 0, never -0', () => {
  expect(Object.is(roundDelta(-0.04), 0)).toBe(true)
  expect(roundDelta(0.04)).toBe(0)
})

test('large changes round the same way', () => {
  expect(roundDelta(123.5)).toBe(124)
  expect(roundDelta(-1000.4)).toBe(-1000)
})

test('only float noise is snapped: a real change just under a half on a large account still rounds down', () => {
  // 200,000,001 to 213,000,001 is a real 6.4999999675%, which a six-decimal snap would have shown as 7%.
  // The snap still fixes float-noise halves: with priors up to 2,000, every true half rounds up (Paul, #285).
  expect(roundDelta(((213000001 - 200000001) / 200000001) * 100)).toBe(6)
  // 40 to 63 is exactly 57.5%, which floating point computes as 57.49999999999999: the snap still rounds it up.
  expect(roundDelta(((63 - 40) / 40) * 100)).toBe(58)
})
