import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test, vi, type MockInstance } from 'vitest'
import type { JWT } from 'next-auth/jwt'
import { jwtCallback, WORKSPACE_DOMAIN, type Lookup, type TestAdminEnv } from './jwt-callback'
import { evaluateTestAdminLogin, testAdminAllows } from './test-admin'

// Spec: docs/superpowers/specs/2026-09-30-session-recheck-design.md (J1 to J10, W1). Every value is invented.
const NO_TEST_ADMIN: TestAdminEnv = {}
const row = (role: string, slug: string) => ({ role, slug })
const lookupOf = (answer: { role: string; slug: string } | null) => vi.fn<Lookup>(async () => answer)
const read = (token: JWT, lookup: Lookup, testAdmin: TestAdminEnv = NO_TEST_ADMIN) =>
  jwtCallback({ token }, { lookup, testAdmin })
const signIn = (user: Record<string, unknown>, lookup: Lookup, testAdmin: TestAdminEnv = NO_TEST_ADMIN) =>
  jwtCallback({ token: {}, user }, { lookup, testAdmin })

let err: MockInstance
beforeEach(() => { err = vi.spyOn(console, 'error').mockImplementation(() => {}) })
afterEach(() => { err.mockRestore() })

describe('every later read re-checks the login against the database', () => {
  test('J1 a row gives its role and slug; every other claim is kept; one lookup by email', async () => {
    const lookup = lookupOf(row('CLIENT_VIEWER', 'acme'))
    const token = { sub: 'viewer@acme.test', name: 'viewer', email: 'viewer@acme.test', role: 'CLIENT_VIEWER', clientSlug: 'acme', extra: 1 }
    expect(await read(token, lookup)).toEqual(token)
    expect(lookup).toHaveBeenCalledTimes(1)
    expect(lookup).toHaveBeenCalledWith('viewer@acme.test')
  })

  test('J2 a role changed in the database takes effect', async () => {
    const r = await read({ email: 'a@acme.test', role: 'CLIENT_ADMIN', clientSlug: 'acme' }, lookupOf(row('CLIENT_VIEWER', 'acme')))
    expect(r?.role).toBe('CLIENT_VIEWER')
  })

  test('J3 a user moved to another client carries the new slug', async () => {
    const r = await read({ email: 'a@acme.test', role: 'CLIENT_VIEWER', clientSlug: 'a' }, lookupOf(row('CLIENT_VIEWER', 'b')))
    expect(r?.clientSlug).toBe('b')
  })

  test('J4 a removed client user has no session', async () => {
    expect(await read({ email: 'someone@client.test', role: 'CLIENT_VIEWER', clientSlug: 'acme' }, lookupOf(null))).toBeNull()
  })

  test('J5 staff with no row keep the sign-in default', async () => {
    const r = await read({ email: 'someone@avenuez.com', role: 'INTERNAL_ADMIN', clientSlug: 'avenue-z' }, lookupOf(null))
    expect([r?.role, r?.clientSlug]).toEqual(['INTERNAL_ANALYST', 'avenue-z'])
  })

  test('J6 the minted service cookie is left alone, with no lookup', async () => {
    const lookup = lookupOf(null)
    const token = { email: 'cache-warm@avenuez.com', role: 'INTERNAL_ADMIN', clientSlug: 'avenue-z', service: true as const }
    expect(await read(token, lookup)).toEqual(token)
    expect(lookup).not.toHaveBeenCalled()
  })

  test('J7 the preview test admin is left alone only while its environment still allows it', async () => {
    const token = { email: 'Admin@Example.test', role: 'INTERNAL_ADMIN', clientSlug: 'avenue-z' }
    const env = { email: ' admin@example.test ', password: 'not-a-real-password', vercelEnv: 'preview' }
    const kept = lookupOf(null)
    expect(await read(token, kept, env)).toEqual(token)
    expect(kept).not.toHaveBeenCalled()
    for (const changed of [{ ...env, vercelEnv: 'production' }, { ...env, email: 'other@example.test' }, { ...env, password: undefined }]) {
      const lookup = lookupOf(null)
      expect(await read(token, lookup, changed)).toBeNull()
      expect(lookup).toHaveBeenCalledTimes(1)
    }
  })

  test('J8 a failed lookup throws a fresh error and never logs or rethrows the email', async () => {
    const email = 'private.person@acme.test'
    const lookup = vi.fn<Lookup>(async () => { throw new Error(`Failed query: select ... params: ${email}`) })
    const thrown = await read({ email, role: 'CLIENT_VIEWER', clientSlug: 'acme' }, lookup).then(() => null, (e: unknown) => e)
    expect(thrown).toBeInstanceOf(Error)
    expect((thrown as Error).message).toBe('session recheck failed')
    expect((thrown as Error).cause).toBeUndefined()
    expect(err).toHaveBeenCalledTimes(1)
    expect(String(err.mock.calls[0][0])).toContain('session recheck failed')
    expect(JSON.stringify(err.mock.calls)).not.toContain(email)
    expect(String((thrown as Error).stack)).not.toContain(email)
  })

  test('J8 the same at sign-in: a failed lookup never logs or rethrows the email', async () => {
    const email = 'private.person@acme.test'
    const lookup = vi.fn<Lookup>(async () => { throw new Error(`params: ${email}`) })
    const thrown = await signIn({ email }, lookup).then(() => null, (e: unknown) => e)
    expect((thrown as Error).message).toBe('session recheck failed')
    expect((thrown as Error).cause).toBeUndefined()
    expect(JSON.stringify(err.mock.calls)).not.toContain(email)
  })

  test('J9 a token with no email has no session, with no lookup', async () => {
    const lookup = lookupOf(row('CLIENT_VIEWER', 'acme'))
    expect(await read({ role: 'CLIENT_VIEWER', clientSlug: 'acme' }, lookup)).toBeNull()
    expect(lookup).not.toHaveBeenCalled()
  })
})

describe('sign-in keeps today\'s rules (auth.ts:54-77 before this change), except anyone else with no row', () => {
  test('J10 the test admin, a row, staff with no row, anyone else with no row (no session), and a user with no email', async () => {
    const admin = lookupOf(null)
    const t1 = await signIn({ email: 'admin@example.test', role: 'INTERNAL_ADMIN', clientSlug: 'avenue-z' }, admin)
    expect([t1?.role, t1?.clientSlug]).toEqual(['INTERNAL_ADMIN', 'avenue-z'])
    expect(admin).not.toHaveBeenCalled()
    const t2 = await signIn({ email: 'viewer@acme.test' }, lookupOf(row('CLIENT_VIEWER', 'acme')))
    expect([t2?.role, t2?.clientSlug]).toEqual(['CLIENT_VIEWER', 'acme'])
    const t3 = await signIn({ email: 'someone@avenuez.com' }, lookupOf(null))
    expect([t3?.role, t3?.clientSlug]).toEqual(['INTERNAL_ANALYST', 'avenue-z'])
    // Anyone else with no row gets no session, the same answer the re-check gives (it was a CLIENT_VIEWER with
    // no client that the very next request turned away). Unreachable today: Credentials needs a row and Google
    // needs the workspace domain (auth.ts). Auth.js clears the cookie when the callback returns null.
    expect(await signIn({ email: 'someone@client.test' }, lookupOf(null))).toBeNull()
    const none = lookupOf(null)
    expect(await jwtCallback({ token: { sub: 'x' }, user: { email: null } }, { lookup: none, testAdmin: NO_TEST_ADMIN })).toEqual({ sub: 'x' })
    expect(none).not.toHaveBeenCalled()
  })
})

// auth.ts cannot be imported here (vitest.setup.ts stubs @/auth), so this reads it as text.
test('W1 auth.ts hands its jwt callback to jwtCallback and no longer looks users up itself', () => {
  const src = readFileSync(join(process.cwd(), 'auth.ts'), 'utf8')
  expect(src).toContain('jwtCallback(')
  expect(src).not.toContain('getClientByEmail(user.email)')
})

describe('one rule for the preview test admin, at sign-in and on every re-check (lib/auth/test-admin.ts)', () => {
  const env = { email: ' Admin@Example.test ', password: 'not-a-real-password', vercelEnv: 'preview' }
  test('testAdminAllows: the configured email in a non-production deployment with a password set', () => {
    expect(testAdminAllows('admin@example.test', env)).toBe(true)
    expect(testAdminAllows('ADMIN@example.test ', env)).toBe(true)
    expect(testAdminAllows('other@example.test', env)).toBe(false)
    expect(testAdminAllows('admin@example.test', { ...env, vercelEnv: 'production' })).toBe(false)
    expect(testAdminAllows('admin@example.test', { ...env, email: undefined })).toBe(false)
    expect(testAdminAllows('admin@example.test', { ...env, password: undefined })).toBe(false)
    expect(testAdminAllows('', env)).toBe(false)
  })
  test('sign-in uses the same rule, then checks the password', () => {
    expect(evaluateTestAdminLogin({ email: 'admin@example.test', password: 'not-a-real-password' }, env)?.role).toBe('INTERNAL_ADMIN')
    expect(evaluateTestAdminLogin({ email: 'admin@example.test', password: 'wrong' }, env)).toBeNull()
    expect(evaluateTestAdminLogin({ email: 'admin@example.test', password: 'not-a-real-password' }, { ...env, vercelEnv: 'production' })).toBeNull()
  })
  test('the re-check calls that rule instead of a copy of it', () => {
    const src = readFileSync(join(process.cwd(), 'lib/auth/jwt-callback.ts'), 'utf8')
    expect(src).toMatch(/import \{[^}]*\btestAdminAllows\b[^}]*\} from '\.\/test-admin'/)
    expect(src).not.toContain("vercelEnv === 'production'")
  })
})

test('W2 the workspace domain is defined once, in jwt-callback.ts, and auth.ts imports it', () => {
  expect(WORKSPACE_DOMAIN).toBe('avenuez.com')
  const src = readFileSync(join(process.cwd(), 'auth.ts'), 'utf8')
  expect(src).not.toMatch(/const WORKSPACE_DOMAIN\s*=/)
  expect(src).toMatch(/import \{[^}]*\bWORKSPACE_DOMAIN\b[^}]*\} from '@\/lib\/auth\/jwt-callback'/)
})
