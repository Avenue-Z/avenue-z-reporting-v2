// @vitest-environment node
import { decode } from '@auth/core/jwt'
import { expect, test } from 'vitest'
import { mintServiceCookie } from './service-cookie'

// The cache warmer, the hourly lock sweep and the health sweep sign in with this minted cookie
// (lib/cache-warm/run.ts, app/api/health/sweep/route.ts). If a dependency bump ever changed how it
// encodes, every self-fetch would bounce to /login and locked months would capture late. A guard, not
// a proof of next-auth's own auth(): vitest cannot load next-auth (vitest.setup.ts stubs @/auth).
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
