import { expect, test } from 'vitest'
import { isLateLock, lockOn, parseLockDay, priorParams, requestKey, requestPeriodEnd, settledThrough } from './lock-day'
import { opensOn } from './reporting-months'

const CFG = { firstMonth: '2026-08' }

test('lock day: the 5th, the Friday before a weekend, never after the opening day', () => {
  // Sep 5 2026 is a Saturday, Oct 5 a Monday, Dec 5 a Saturday.
  expect(lockOn('2026-08', 5, opensOn('2026-08', 12, 'next-monday'))).toBe('2026-09-04')
  expect(lockOn('2026-09', 5, opensOn('2026-09', 12, 'next-monday'))).toBe('2026-10-05')
  expect(lockOn('2026-11', 5, opensOn('2026-11', 12, 'next-monday'))).toBe('2026-12-04')
  // A lock day later than the opening day is clamped to the opening day.
  expect(lockOn('2026-09', 12, '2026-10-09')).toBe('2026-10-09')
})
// A sweep, so it collects and asserts once at the end rather than calling expect 1.5 million times:
// the assertions were the cost, not the rules. Same combinations as before, and the count is asserted
// so the test can never quietly check nothing.
test('lock day is never after the opening day, for every month 2026 to 2030 and every valid pair', () => {
  const bad: string[] = []
  let checked = 0
  for (let y = 2026; y <= 2030; y++) for (let m = 1; m <= 12; m++) {
    const key = `${y}-${String(m).padStart(2, '0')}`
    const monthEnd = `${key}-31`
    for (let open = 4; open <= 28; open++) for (const rule of ['next-monday', 'previous-friday'] as const) {
      const o = opensOn(key, open, rule) // the same for every lock day, so it is resolved once here
      for (let lock = 4; lock <= 28; lock++) {
        const l = lockOn(key, lock, o)
        checked++
        if (l > o) bad.push(`${key} open=${open} ${rule} lock=${lock}: locks ${l} after it opens ${o}`)
        if (l <= monthEnd) bad.push(`${key} open=${open} ${rule} lock=${lock}: locks ${l}, inside the month`)
      }
    }
  }
  expect(bad.slice(0, 5)).toEqual([])
  expect(checked).toBe(5 * 12 * 25 * 2 * 25)
}, 30000) // 156ms alone; the generous limit is headroom for a loaded machine, not an expectation
test('lockDay knob: default 5, integers 4 to 28, anything else is bad and falls back to 5', () => {
  expect(parseLockDay(CFG)).toEqual({ lockDay: 5, bad: false })
  expect(parseLockDay({ ...CFG, lockDay: 7 })).toEqual({ lockDay: 7, bad: false })
  for (const v of [3, 29, 4.5, '5', null]) expect(parseLockDay({ ...CFG, lockDay: v })).toEqual({ lockDay: 5, bad: true })
})
test('the last locked day moves on each lock day, in New York dates', () => {
  expect(settledThrough(CFG, '2026-10-04')).toBe('2026-08-31') // September locks on Oct 5
  expect(settledThrough(CFG, '2026-10-05')).toBe('2026-09-30')
  expect(settledThrough(CFG, '2026-09-04')).toBe('2026-08-31')
  expect(settledThrough(CFG, '2026-09-03')).toBe('2026-07-31')
  expect(settledThrough(null, '2026-10-05')).toBeNull()
  expect(settledThrough({}, '2026-10-05')).toBeNull()
})
test('a request ends on its latest date, including the compare window; no endDate or any impossible date means not lockable', () => {
  expect(requestPeriodEnd({ startDate: '2026-09-01T04:00:00Z', endDate: '2026-09-30T04:00:00Z', contextStartDate: '2026-08-01T04:00:00Z', contextEndDate: '2026-08-31T04:00:00Z' })).toBe('2026-09-30')
  expect(requestPeriodEnd({ startDate: '2026-09-01', endDate: '2026-09-30' })).toBe('2026-09-30')
  for (const p of [{ startDate: 'junk', endDate: '2026-09-30' }, { startDate: '2026-02-30', endDate: '2026-09-30' }, { startDate: '2026-09-01', endDate: '2026-09-99' }, { startDate: '2026-09-01' }, { brandId: 1 }]) {
    expect(requestPeriodEnd(p)).toBeNull()
  }
})
test('the prior request is the same request one comparison step back, for whole-month compare windows only', () => {
  const base = { brandId: 1, metrics: ['A'], reportType: 'TOTAL_GROUPED_METRIC' }
  expect(priorParams({ ...base, startDate: '2026-09-01T04:00:00Z', endDate: '2026-09-30T04:00:00Z', contextStartDate: '2026-08-01T04:00:00Z', contextEndDate: '2026-08-31T04:00:00Z' }))
    .toEqual({ ...base, startDate: '2026-08-01T04:00:00Z', endDate: '2026-08-31T04:00:00Z', contextStartDate: '2026-07-01T04:00:00Z', contextEndDate: '2026-07-31T04:00:00Z' })
  expect(priorParams({ ...base, startDate: '2026-09-01T04:00:00Z', endDate: '2026-09-30T04:00:00Z', contextStartDate: '2025-09-01T04:00:00Z', contextEndDate: '2025-09-30T04:00:00Z' }))
    .toMatchObject({ startDate: '2025-09-01T04:00:00Z', contextStartDate: '2024-09-01T04:00:00Z', contextEndDate: '2024-09-30T04:00:00Z' })
  expect(priorParams({ ...base, startDate: '2026-10-01T04:00:00Z', endDate: '2026-10-19T04:00:00Z', contextStartDate: '2026-09-01T04:00:00Z', contextEndDate: '2026-09-19T04:00:00Z' })).toBeNull()
  expect(priorParams({ ...base, startDate: '2026-09-01', endDate: '2026-09-30' })).toBeNull()
})
test('the request key ignores parameter order and undefined values, and changes with any real difference', () => {
  const a = requestKey('getReportsData', { brandId: 1, metrics: ['A', 'B'], startDate: 's', endDate: 'e', limit: undefined })
  expect(requestKey('getReportsData', { endDate: 'e', startDate: 's', metrics: ['A', 'B'], brandId: 1 })).toBe(a)
  expect(requestKey('getReportsData', { brandId: 1, metrics: ['A', 'C'], startDate: 's', endDate: 'e' })).not.toBe(a)
  expect(requestKey('getContent', { brandId: 1, metrics: ['A', 'B'], startDate: 's', endDate: 'e' })).not.toBe(a)
  expect(a).toMatch(/^[0-9a-f]{64}$/)
})
test("a late lock: captured after its month's lock day (the sweep captures on the day itself)", () => {
  expect(isLateLock('2026-09-30', CFG, '2026-10-05')).toBe(false)
  expect(isLateLock('2026-09-30', CFG, '2026-10-06')).toBe(true)
  expect(isLateLock('2026-08-31', CFG, '2026-10-05')).toBe(true)
})
