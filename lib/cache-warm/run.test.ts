import { expect, test, vi } from 'vitest'
import { cronAuthError, warmOne, runWarm } from './run'

// The lock sweep moved to its own schedule (Paul, PR 256), which meant two cron routes sharing
// this machinery. These pin the parts that decide whether a cron runs at all, because getting
// them wrong either opens the route or silently stops both crons.

test('the bearer check: a missing secret, a wrong header and a missing auth secret each refuse', () => {
  expect(cronAuthError(undefined, 'auth', 'Bearer s')).toEqual({ body: { error: 'CRON_SECRET not set' }, status: 500 })
  expect(cronAuthError('s', 'auth', 'Bearer wrong')).toEqual({ body: 'Unauthorized', status: 401 })
  expect(cronAuthError('s', 'auth', null)).toEqual({ body: 'Unauthorized', status: 401 })
  // The bearer is checked BEFORE the auth secret, so a stranger cannot tell the two apart.
  expect(cronAuthError('s', undefined, 'Bearer wrong')).toEqual({ body: 'Unauthorized', status: 401 })
  expect(cronAuthError('s', undefined, 'Bearer s')).toEqual({ body: { error: 'AUTH_SECRET not set' }, status: 500 })
})

test('a correct bearer with both secrets present is allowed through', () => {
  expect(cronAuthError('s', 'auth', 'Bearer s')).toBeNull()
})

test('warmOne drains the body, so suspended boundaries finish populating the cache', async () => {
  let drained = false
  vi.stubGlobal('fetch', async () => ({ status: 200, text: async () => { drained = true; return '' } }))
  const r = await warmOne('https://example.test/a', 'c=1')
  expect(drained).toBe(true)
  expect(r).toMatchObject({ url: 'https://example.test/a', status: 200, ok: true })
  vi.unstubAllGlobals()
})

test('a redirect or an error is not counted as warmed', async () => {
  vi.stubGlobal('fetch', async () => ({ status: 302, text: async () => '' }))
  expect((await warmOne('https://example.test/a', 'c=1')).ok).toBe(true) // 3xx is still a render
  vi.stubGlobal('fetch', async () => ({ status: 500, text: async () => '' }))
  expect((await warmOne('https://example.test/a', 'c=1')).ok).toBe(false)
  vi.stubGlobal('fetch', async () => { throw new Error('socket hang up') })
  expect(await warmOne('https://example.test/a', 'c=1')).toMatchObject({ status: null, ok: false, error: 'socket hang up' })
  vi.unstubAllGlobals()
})

test('runWarm summarises the run, and an empty list is a valid no-op run', async () => {
  vi.stubGlobal('fetch', async (u: string) => ({ status: u.endsWith('/bad') ? 500 : 200, text: async () => '' }))
  const r = await runWarm(['https://x.test/a', 'https://x.test/bad'], 'c=1')
  expect({ total: r.total, ok: r.ok, failed: r.failed }).toEqual({ total: 2, ok: 1, failed: 1 })
  // Most hours the lock sweep has nothing to do: that must be a clean run, not an error.
  expect(await runWarm([], 'c=1')).toMatchObject({ total: 0, ok: 0, failed: 0 })
  vi.unstubAllGlobals()
})
