import type { JWT } from 'next-auth/jwt'
import { normalizeEmail } from '@/lib/admin/access'

// The Auth.js `jwt` callback, kept out of auth.ts so it can be tested (vitest.setup.ts stubs @/auth).
// Spec: docs/superpowers/specs/2026-09-30-session-recheck-design.md.

const WORKSPACE_DOMAIN = 'avenuez.com'
const WORKSPACE_DEFAULT_ROLE = 'INTERNAL_ANALYST'
const WORKSPACE_DEFAULT_SLUG = 'avenue-z'

/** A user's role and client slug by email, or null when there is no row (getClientByEmail). */
export type Lookup = (email: string) => Promise<{ role: string; slug: string } | null>
/** The preview-only test admin's settings, as sign-in reads them (lib/auth/test-admin.ts). */
export type TestAdminEnv = { email?: string; password?: string; vercelEnv?: string }
type SignInUser = { email?: string | null; role?: string; clientSlug?: string | null }

/** Never lets the original error out: a failed query's message can carry the email, and Auth.js logs
 *  a thrown error's stack and cause. One line, the error's name only, then a fresh error. */
async function lookupOrFail(lookup: Lookup, email: string) {
  try {
    return await lookup(email)
  } catch (e) {
    console.error(`[auth] session recheck failed: ${e instanceof Error ? e.name : typeof e}`)
    throw new Error('session recheck failed')
  }
}

/** The same conditions sign-in applies (lib/auth/test-admin.ts), re-read on every request. */
function isTestAdmin(email: string, env: TestAdminEnv): boolean {
  if (env.vercelEnv === 'production' || !env.email || !env.password) return false
  return normalizeEmail(email) === normalizeEmail(env.email)
}

/** Sign-in (`user` present) sets the role and slug as it always has. Every later session read re-reads
 *  them from the database, so a removed or moved client user loses the old access on the next request.
 *  The minted service cookie and the preview test admin have no user row and are left as they are. */
export async function jwtCallback(
  { token, user }: { token: JWT; user?: SignInUser | null },
  deps: { lookup: Lookup; testAdmin: TestAdminEnv },
): Promise<JWT | null> {
  if (user) {
    if (!user.email) return token
    // The preview-only test admin carries its own role/slug: trust it directly.
    if (user.role) {
      token.role = user.role
      token.clientSlug = user.clientSlug ?? null
      return token
    }
    const found = await lookupOrFail(deps.lookup, user.email)
    if (found) {
      token.role = found.role
      token.clientSlug = found.slug
    } else if (user.email.endsWith(`@${WORKSPACE_DOMAIN}`)) {
      token.role = WORKSPACE_DEFAULT_ROLE
      token.clientSlug = WORKSPACE_DEFAULT_SLUG
    } else {
      token.role = 'CLIENT_VIEWER'
      token.clientSlug = null
    }
    return token
  }

  if (token.service === true) return token
  const email = token.email
  if (typeof email !== 'string' || !email) return null
  if (isTestAdmin(email, deps.testAdmin)) return token
  const found = await lookupOrFail(deps.lookup, email)
  if (found) return { ...token, role: found.role, clientSlug: found.slug }
  // Staff with no row get what sign-in gives them; a client user with no row has been removed.
  if (email.endsWith(`@${WORKSPACE_DOMAIN}`)) return { ...token, role: WORKSPACE_DEFAULT_ROLE, clientSlug: WORKSPACE_DEFAULT_SLUG }
  return null
}
