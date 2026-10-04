import { afterEach, expect, test, vi } from 'vitest'
import { DashApiError, DashAuthError, DashRateLimitError, DashTimeoutError } from '@/lib/dash-social/client'
import { logYtdClientReadFailed, logYtdMonthFailed, ytdFailureFields } from './ytd-failure'

// Made-up brand id and URL only.
const URL_MSG = 'https://api.example/brands/123456/reports'

afterEach(() => vi.restoreAllMocks())

test('Dash errors keep exactly kind and status, and the message never appears', () => {
  expect(ytdFailureFields(new DashTimeoutError())).toBe('kind=timeout status=none')
  expect(ytdFailureFields(new DashRateLimitError(`429 persistent at ${URL_MSG}`))).toBe('kind=rate-limit status=429')
  expect(ytdFailureFields(new DashAuthError(`401 from ${URL_MSG}`))).toBe('kind=auth status=401')
  expect(ytdFailureFields(new DashApiError(`500 persistent at ${URL_MSG}`))).toBe('kind=api status=500')
  expect(ytdFailureFields(new DashApiError(`garbled at ${URL_MSG}`))).toBe('kind=api status=none')
})

test('an omitted-metric error names the metrics, digits included', () => {
  expect(ytdFailureFields(new Error('FACEBOOK: Dash omitted requested metric(s): TOTAL_ENGAGEMENTS_POSTS_V2, PROFILE_VIEWS')))
    .toBe('kind=other status=none missing=TOTAL_ENGAGEMENTS_POSTS_V2,PROFILE_VIEWS')
  expect(ytdFailureFields(new Error('INSTAGRAM: Dash omitted requested metric(s): FOLLOWERS')))
    .toBe('kind=other status=none missing=FOLLOWERS')
})

test('a no-metrics error says so', () => {
  expect(ytdFailureFields(new Error('LINKEDIN: Dash returned no metrics for this brand'))).toBe('kind=other status=none reason=no-metrics')
})

test('a near miss that carries a URL or a brand id is logged by class name only', () => {
  for (const msg of [
    `FACEBOOK: Dash omitted requested metric(s): ${URL_MSG}`,
    'FACEBOOK: Dash omitted requested metric(s): FOLLOWERS, brand 123456',
    `INSTAGRAM: Dash returned no metrics for this brand ${URL_MSG}`,
    `instagram: Dash omitted requested metric(s): FOLLOWERS`,
  ]) {
    const f = ytdFailureFields(new Error(msg))
    expect(f).toBe('kind=other status=none error=Error')
    expect(f).not.toContain('123456')
  }
})

test('any other throw logs a safe class name, or "other"', () => {
  expect(ytdFailureFields(new TypeError(URL_MSG))).toBe('kind=other status=none error=TypeError')
  const renamed = new Error('x'); renamed.name = `bad name ${URL_MSG}`
  expect(ytdFailureFields(renamed)).toBe('kind=other status=none error=other')
  expect(ytdFailureFields({ name: 'Sneaky', message: URL_MSG })).toBe('kind=other status=none error=other')
  expect(ytdFailureFields('a string')).toBe('kind=other status=none error=other')
  expect(ytdFailureFields(undefined)).toBe('kind=other status=none error=other')
})

test('the log lines carry the version, slug, channel and month', () => {
  const err = vi.spyOn(console, 'error').mockImplementation(() => {})
  logYtdMonthFailed(2, 'c', 'INSTAGRAM', '2026-09', new DashApiError(`500 at ${URL_MSG}`))
  logYtdClientReadFailed(1, 'c')
  expect(err.mock.calls.map((c) => c.join(' '))).toEqual([
    '[organic-social] ytd-review@2 Dash request failed slug=c channel=INSTAGRAM month=2026-09 kind=api status=500',
    '[organic-social] ytd-review@1 client read failed slug=c',
  ])
})

test('an error whose fields throw, or a hostile proxy, still gives a line and never throws', () => {
  const badMessage = new Error('x'); Object.defineProperty(badMessage, 'message', { get() { throw new Error('boom') } })
  const badName = new Error('x'); Object.defineProperty(badName, 'name', { get() { throw new Error('boom') } })
  const proxy = new Proxy({}, { getPrototypeOf() { throw new Error('boom') } })
  for (const e of [badMessage, badName, proxy]) expect(ytdFailureFields(e)).toBe('kind=other status=none error=other')
})
