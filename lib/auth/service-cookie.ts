import { encode } from '@auth/core/jwt'

/**
 * Mint a short-lived (1h) INTERNAL_ADMIN session cookie value for server-to-
 * server self-fetches (cache warming, health sweeps). The principal email/name
 * identifies the run in logs. Shared by app/api/cache-warm and app/api/health/sweep.
 */
export async function mintServiceCookie(
  secret: string,
  salt: string,
  principal: { email: string; name: string },
): Promise<string> {
  const maxAge = 60 * 60
  const now = Math.floor(Date.now() / 1000)
  return encode({
    secret,
    salt,
    maxAge,
    token: {
      sub: principal.email,
      email: principal.email,
      name: principal.name,
      role: 'INTERNAL_ADMIN',
      clientSlug: 'avenue-z',
      iat: now,
      exp: now + maxAge,
      jti: crypto.randomUUID(),
    },
  })
}
