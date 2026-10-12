// @vitest-environment node
import { decode } from '@auth/core/jwt'
import { expect, test } from 'vitest'
import { mintServiceCookie } from './service-cookie'

// The cache warmer, the health sweep and the lock sweep have no user row. The minted cookie is marked so the
// jwt callback leaves it alone instead of re-checking it (lib/auth/jwt-callback.ts). S1 in
// docs/superpowers/specs/2026-09-30-session-recheck-design.md. Every value is invented.
const SECRET = 'test-secret-not-real-0123456789abcdef'

test('S1 a minted service cookie carries the service marker', async () => {
  const salt = 'authjs.session-token'
  const token = await mintServiceCookie(SECRET, salt, { email: 'sweep@example.test', name: 'sweep' })
  expect(await decode({ token, secret: SECRET, salt })).toMatchObject({ service: true, role: 'INTERNAL_ADMIN', clientSlug: 'avenue-z' })
})
