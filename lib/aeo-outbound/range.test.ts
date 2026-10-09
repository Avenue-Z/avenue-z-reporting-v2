import { expect, test } from 'vitest'
import { checkRange, defaultRange, todayUtc } from './range'

const NOW = Date.parse('2026-10-08T23:59:59Z')

test('today is the UTC calendar day, not the local one', () => {
  expect(todayUtc(NOW)).toBe('2026-10-08')
  expect(todayUtc(Date.parse('2026-10-09T00:00:00Z'))).toBe('2026-10-09')
})

test('the default range is 30 inclusive days ending today (UTC)', () => {
  expect(defaultRange(NOW)).toEqual({ start: '2026-09-09', end: '2026-10-08' })
  expect(defaultRange(Date.parse('2026-03-05T01:00:00Z'))).toEqual({ start: '2026-02-04', end: '2026-03-05' })
})

test('neither date means no range', () => {
  expect(checkRange({}, NOW)).toEqual({ ok: true, range: null })
  expect(checkRange({ start: undefined, end: undefined }, NOW)).toEqual({ ok: true, range: null })
})

test('a valid pair passes', () => {
  expect(checkRange({ start: '2026-08-22', end: '2026-09-20' }, NOW)).toEqual({ ok: true, range: { start: '2026-08-22', end: '2026-09-20' } })
  expect(checkRange({ start: '2026-10-08', end: '2026-10-08' }, NOW)).toEqual({ ok: true, range: { start: '2026-10-08', end: '2026-10-08' } })
})

test('one date, or an empty string, is refused as both-or-neither', () => {
  const msg = 'Pick both a start and an end date, or neither.'
  expect(checkRange({ start: '2026-09-01' }, NOW)).toEqual({ ok: false, error: msg })
  expect(checkRange({ end: '2026-09-01' }, NOW)).toEqual({ ok: false, error: msg })
  expect(checkRange({ start: '', end: '2026-09-01' }, NOW)).toEqual({ ok: false, error: msg })
  expect(checkRange({ start: '2026-09-01', end: '' }, NOW)).toEqual({ ok: false, error: msg })
  expect(checkRange({ start: '', end: '' }, NOW)).toEqual({ ok: false, error: msg })
})

test('bad formats and calendar-invalid days are refused', () => {
  const msg = 'Dates must be real days in YYYY-MM-DD.'
  for (const bad of ['2026-02-30', '2026-13-01', '2026-9-01', '09/01/2026', 'abc', '2026-09-01T00:00:00Z', ' 2026-09-01', '2026-00-10']) {
    expect(checkRange({ start: bad, end: '2026-09-20' }, NOW)).toEqual({ ok: false, error: msg })
    expect(checkRange({ start: '2026-09-01', end: bad }, NOW)).toEqual({ ok: false, error: msg })
  }
  expect(checkRange({ start: 20260901, end: '2026-09-20' }, NOW)).toEqual({ ok: false, error: msg })
  expect(checkRange({ start: null, end: '2026-09-20' }, NOW)).toEqual({ ok: false, error: msg })
  expect(checkRange({ start: '2026-02-29', end: '2026-03-01' }, NOW).ok).toBe(false)
})

test('start after end is refused', () => {
  expect(checkRange({ start: '2026-09-20', end: '2026-09-19' }, NOW)).toEqual({ ok: false, error: 'The start date must be on or before the end date.' })
})

test('an end in the future is refused, today is fine', () => {
  expect(checkRange({ start: '2026-10-01', end: '2026-10-09' }, NOW)).toEqual({ ok: false, error: "The end date can't be in the future." })
  expect(checkRange({ start: '2026-10-01', end: '2026-10-08' }, NOW).ok).toBe(true)
})

test('exactly 400 days back passes, 401 is refused', () => {
  // 2026-10-08 minus 400 days is 2025-09-03.
  expect(checkRange({ start: '2025-09-03', end: '2025-09-10' }, NOW).ok).toBe(true)
  expect(checkRange({ start: '2025-09-02', end: '2025-09-10' }, NOW)).toEqual({ ok: false, error: "The start date can't be more than 400 days ago." })
})

test('exactly 90 days passes, 91 is refused', () => {
  expect(checkRange({ start: '2026-07-01', end: '2026-09-28' }, NOW).ok).toBe(true) // 31+31+28 = 90
  expect(checkRange({ start: '2026-07-01', end: '2026-09-29' }, NOW)).toEqual({ ok: false, error: 'Pick at most 90 days.' })
})
