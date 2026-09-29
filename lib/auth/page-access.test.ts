// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from 'vitest'

const h = vi.hoisted(() => ({ session: null as null | { user: { role?: string; clientSlug?: string | null } } }))
vi.mock('@/auth', () => ({ auth: async () => h.session }))
// redirect() throws in Next, so nothing after it runs; the mock does the same.
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(`REDIRECT ${url}`) } }))

import { requirePortalAccess, requireStaff } from './page-access'

const as = (role: string, clientSlug: string | null) => { h.session = { user: { role, clientSlug } } }
beforeEach(() => { h.session = null })

describe('requirePortalAccess', () => {
  test('signed out goes to login', async () => {
    await expect(requirePortalAccess('acme')).rejects.toThrow('REDIRECT /login')
  })

  test("a client's own slug returns the session", async () => {
    as('CLIENT_VIEWER', 'acme')
    await expect(requirePortalAccess('acme')).resolves.toBe(h.session)
  })

  test("another client's slug is turned away", async () => {
    as('CLIENT_ADMIN', 'acme')
    await expect(requirePortalAccess('other')).rejects.toThrow('REDIRECT /unauthorized')
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

  test('a client role, even on its own slug, is turned away', async () => {
    for (const role of ['CLIENT_ADMIN', 'CLIENT_VIEWER', 'SOMETHING_ELSE']) {
      as(role, 'acme')
      await expect(requireStaff()).rejects.toThrow('REDIRECT /unauthorized')
    }
  })
})
