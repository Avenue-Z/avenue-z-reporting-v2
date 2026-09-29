// @vitest-environment node
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const h = vi.hoisted(() => ({ session: null as null | { user: { role?: string; clientSlug?: string | null } } }))
vi.mock('@/auth', () => ({ auth: async () => h.session }))
// redirect() throws in Next, so nothing after it runs; the mock does the same.
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(`REDIRECT ${url}`) } }))

import { requirePortalAccess, requireStaff } from './page-access'

const as = (role: string, clientSlug: string | null) => { h.session = { user: { role, clientSlug } } }
beforeEach(() => { h.session = null; vi.stubEnv('AUTH_SECRET', 'test-secret') })
afterEach(() => { vi.unstubAllEnvs() })

describe('requirePortalAccess', () => {
  test('signed out goes to login', async () => {
    await expect(requirePortalAccess('acme')).rejects.toThrow('REDIRECT /login')
  })

  test("a client's own slug returns the session", async () => {
    as('CLIENT_VIEWER', 'acme')
    await expect(requirePortalAccess('acme')).resolves.toBe(h.session)
  })

  test("another client's slug is turned away, and logged, since the proxy did not stop it", async () => {
    as('CLIENT_ADMIN', 'acme')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(requirePortalAccess('other')).rejects.toThrow('REDIRECT /unauthorized')
    expect(warn).toHaveBeenCalledWith('[access] page refused slug="other" role=CLIENT_ADMIN client=acme who=none')
    warn.mockRestore()
  })

  test('a slug that could forge a log line is written escaped, with the keyed id', async () => {
    h.session = { user: { role: 'CLIENT_VIEWER', clientSlug: 'acme', email: 'a@acme.example' } } as never
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(requirePortalAccess('x\n[access] fake line')).rejects.toThrow('REDIRECT /unauthorized')
    const line = String(warn.mock.calls[0][0])
    expect(line).not.toContain('\n')
    expect(line).toContain('slug="x\\n[access] fake line"')
    expect(line).toMatch(/ who=[0-9a-f]{8}$/)
    await expect(requirePortalAccess('y\u2028z\u2029')).rejects.toThrow('REDIRECT /unauthorized')
    expect(String(warn.mock.calls[1][0])).not.toMatch(/[\u2028\u2029]/)
    expect(String(warn.mock.calls[1][0])).toContain('slug="y\\u2028z\\u2029"')
    warn.mockRestore()
  })

  test('staff open any portal', async () => {
    as('INTERNAL_ANALYST', 'avenue-z')
    await expect(requirePortalAccess('acme')).resolves.toBe(h.session)
  })
})

describe('requireStaff', () => {
  test('signed out goes to login', async () => {
    await expect(requireStaff()).rejects.toThrow('REDIRECT /login')
  })

  test('staff get their session', async () => {
    as('INTERNAL_ADMIN', 'avenue-z')
    await expect(requireStaff()).resolves.toBe(h.session)
  })

  test('a client role, even on its own slug, is turned away and logged', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    for (const role of ['CLIENT_ADMIN', 'CLIENT_VIEWER', 'SOMETHING_ELSE']) {
      as(role, 'acme')
      await expect(requireStaff()).rejects.toThrow('REDIRECT /unauthorized')
    }
    expect(warn).toHaveBeenCalledTimes(3)
    expect(warn).toHaveBeenLastCalledWith('[access] page refused staff-only role=SOMETHING_ELSE client=acme who=none')
    warn.mockRestore()
  })

  test('an allowed page logs nothing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    as('INTERNAL_ADMIN', 'avenue-z'); await requireStaff()
    as('CLIENT_VIEWER', 'acme'); await requirePortalAccess('acme')
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})
