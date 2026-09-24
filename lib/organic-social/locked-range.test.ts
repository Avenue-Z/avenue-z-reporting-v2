import { afterEach, expect, test, vi } from 'vitest'
import { lockedRangeFor, logHiddenMonthAttempt, logMalformedConfig, requestClock } from './locked-range'

const CLOCK = { today: '2026-10-20', lastCompleteUtcDay: '2026-10-19', liveDayInProgress: false }
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })

test('a client without the key gets null, which every caller treats as today', () => {
  for (const c of [{ dashSocialConfig: { brandId: 1 } }, null, undefined, { dashSocialConfig: null }]) {
    expect(lockedRangeFor(c, 'CLIENT_VIEWER', 'custom:2026-10-01,2026-10-19', CLOCK)).toBeNull()
  }
})

test('an opted-in client resolves with the role and the clock it is given', () => {
  const c = { dashSocialConfig: { brandId: 1, reportingMonths: { firstMonth: '2026-08' } } }
  expect(lockedRangeFor(c, 'CLIENT_VIEWER', undefined, CLOCK)?.month?.key).toBe('2026-09')
  expect(lockedRangeFor(c, 'INTERNAL_ADMIN', undefined, CLOCK)?.months[0].live).toBe(true)
  expect(lockedRangeFor(c, undefined, undefined, CLOCK)?.months[0].live).toBe(false)
})

test('requestClock builds the clock from the current time', () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-21T01:00:00Z'))
  expect(requestClock()).toEqual({ today: '2026-10-20', lastCompleteUtcDay: '2026-10-20', liveDayInProgress: true })
})

test('a hidden-month attempt logs one line: slug, served range, the request cut to 64 and escaped', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const raw = `\u2028custom:2026-10-01,2026-10-19\u2029${'x'.repeat(100)}`
  logHiddenMonthAttempt('c', raw, 'custom:2026-09-01,2026-09-30')
  expect(warn).toHaveBeenCalledTimes(1)
  const line = String(warn.mock.calls[0][0])
  expect(line.startsWith('[organic-social] hidden month attempt slug=c served=custom:2026-09-01,2026-09-30 requested=')).toBe(true)
  expect(line).not.toMatch(/[\u2028\u2029]/)
  expect(line.split('requested=')[1]).toBe(JSON.stringify(raw.slice(0, 64)).replace('\u2028', '\\u2028').replace('\u2029', '\\u2029'))
  logHiddenMonthAttempt('c', ['a', 'b'], 'x')
  expect(String(warn.mock.calls[1][0]).endsWith('requested="a,b"')).toBe(true)
})

test('a malformed config logs the slug and the key, never the config', () => {
  const err = vi.spyOn(console, 'error').mockImplementation(() => {})
  logMalformedConfig('c', 'opensOnDay')
  logMalformedConfig('c', null)
  expect(err.mock.calls).toEqual([
    ['[organic-social] reportingMonths setting is invalid slug=c key=opensOnDay'],
    ['[organic-social] reportingMonths setting is invalid slug=c key=reportingMonths'],
  ])
})
