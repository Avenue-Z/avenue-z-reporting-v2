// @vitest-environment node
import { decode } from '@auth/core/jwt'
import { expect, test } from 'vitest'
import { mintServiceCookie } from './service-cookie'

// The cache warmer, the hourly lock sweep and the health sweep sign in with this minted cookie
// (lib/cache-warm/run.ts, app/api/health/sweep/route.ts). If it stopped decoding, every self-fetch would
// bounce to /login and locked months would capture late. This guards the mint's call and its claims under
// the installed @auth/core; both sides use that one copy, so it cannot catch a change between versions
// (that was tried separately before the next-auth upgrade: docs/findings/2026-09-28-next-16-3-upgrade.md).
// Nor is it a proof of next-auth's own auth(): vitest cannot load next-auth (vitest.setup.ts stubs @/auth).
const SECRET = 'test-secret-not-real-0123456789abcdef'

test.each(['__Secure-authjs.session-token', 'authjs.session-token'])('a minted service cookie decodes with the same secret and salt (%s)', async (salt) => {
  const token = await mintServiceCookie(SECRET, salt, { email: 'sweep@example.test', name: 'sweep' })
  expect(await decode({ token, secret: SECRET, salt })).toMatchObject({
    sub: 'sweep@example.test', email: 'sweep@example.test', name: 'sweep', role: 'INTERNAL_ADMIN', clientSlug: 'avenue-z',
  })
})

test('a service cookie minted with another secret does not decode', async () => {
  const salt = 'authjs.session-token'
  const token = await mintServiceCookie(SECRET, salt, { email: 'sweep@example.test', name: 'sweep' })
  await expect(decode({ token, secret: 'another-secret-not-real-0123456789ab', salt })).rejects.toThrow()
})

// The session cookie format is @auth/core's, and a cookie written by one version was checked to decode under
// the next only for 0.41.0 and 0.41.3 (the findings note above). So both are pinned exactly: a later beta is a
// deliberate bump that gets the same check. @auth/core is declared because this mint imports it directly,
// at the version next-auth itself requires, so there is one copy.
test('next-auth and @auth/core are pinned exactly, @auth/core at the version next-auth requires', async () => {
  const { readFileSync } = await import('node:fs')
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
  const nextAuth = JSON.parse(readFileSync('node_modules/next-auth/package.json', 'utf8'))
  expect(pkg.dependencies['next-auth']).toBe('5.0.0-beta.32')
  expect(pkg.dependencies['@auth/core']).toBe(nextAuth.dependencies['@auth/core'])
})
