import { normalizeEmail } from '@/lib/admin/access'

export interface TestAdminEnv {
  email?: string
  password?: string
  vercelEnv?: string
}

export interface TestAdminUser {
  id: string
  email: string
  name: string
  role: 'INTERNAL_ADMIN'
  clientSlug: string
}

/** Whether the preview test admin may use `email` here: a deployment that is not production, both
 *  settings present, and exactly the configured email (case and spaces ignored). Sign-in
 *  (evaluateTestAdminLogin, below) and every session re-check (lib/auth/jwt-callback.ts) call this one
 *  rule, so tightening it can never leave an existing test-admin session that sign-in would now refuse. */
export function testAdminAllows(email: string, env: TestAdminEnv): boolean {
  if (env.vercelEnv === 'production') return false
  if (!env.email || !env.password) return false
  const normalized = normalizeEmail(email ?? '')
  return normalized !== '' && normalized === normalizeEmail(env.email)
}

/**
 * Preview/testing-only admin login. Lets an internal admin sign in through the
 * credentials form on deployments where Google OAuth is unavailable (Vercel
 * preview URLs aren't whitelisted in Google Cloud Console).
 *
 * Enabled ONLY when both TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD are set AND
 * the deployment is not production. Set the two env vars on the Vercel Preview
 * environment only — never Production. The vercelEnv === 'production' guard is a
 * second line of defence in case they leak there.
 *
 * Pure: all config is injected. Returns an INTERNAL_ADMIN user on an exact
 * match, or null otherwise (fails closed).
 */
export function evaluateTestAdminLogin(
  input: { email: string; password: string },
  env: TestAdminEnv,
): TestAdminUser | null {
  if (!testAdminAllows(input.email ?? '', env)) return null
  if (!input.password || input.password !== env.password) return null
  const email = normalizeEmail(input.email)
  return { id: email, email, name: 'Test Admin', role: 'INTERNAL_ADMIN', clientSlug: 'avenue-z' }
}
