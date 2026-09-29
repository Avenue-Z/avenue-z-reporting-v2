// @vitest-environment node
import { afterEach, describe, expect, test, vi } from 'vitest'
import { NextRequest } from 'next/server'

const session = vi.hoisted(() => ({ current: null as null | { user: { role?: string; clientSlug?: string | null } } }))
vi.mock('@/auth', () => ({ auth: async () => session.current }))

import proxy from './proxy'

const as = (role: string, clientSlug: string | null) => { session.current = { user: { role, clientSlug } } }
// What the browser sends on a client-side navigation: an RSC fetch that says which layouts it
// already holds. Next skips rendering any layout the header claims, so a layout alone cannot
// guard a page; the proxy runs on every request whatever the header says.
const rsc = (path: string, tree: string) => new NextRequest(`https://example.test${path}`, {
  headers: { RSC: '1', 'Next-Router-State-Tree': encodeURIComponent(tree) },
})
const location = (res: Response) => res.headers.get('location')

afterEach(() => { session.current = null; vi.restoreAllMocks() })

describe('proxy', () => {
  test('signed out goes to login', async () => {
    const res = await proxy(new NextRequest('https://example.test/portal/acme/reports'))
    expect(location(res)).toBe('https://example.test/login')
  })

  test('a client on its own portal passes through', async () => {
    as('CLIENT_VIEWER', 'acme')
    const res = await proxy(new NextRequest('https://example.test/portal/acme/reports?section=organic-social'))
    expect(location(res)).toBeNull()
  })

  test("a client asking for another client's portal is turned away, even claiming that portal's layout", async () => {
    as('CLIENT_VIEWER', 'acme')
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const tree = JSON.stringify(['', { children: ['portal', { children: [['clientSlug', 'other', 'd'], { children: ['reports', { children: ['__PAGE__', {}] }] }] }] }, null, null, true])
    for (const req of [new NextRequest('https://example.test/portal/other/reports'), rsc('/portal/other/reports?_rsc=1', tree)]) {
      expect(location(await proxy(req))).toBe('https://example.test/unauthorized')
    }
  })

  test('a client asking for a staff page is turned away', async () => {
    as('CLIENT_ADMIN', 'acme')
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    for (const p of ['/dashboard', '/dashboard/acme/access', '/tools/reporting']) {
      expect(location(await proxy(new NextRequest(`https://example.test${p}`)))).toBe('https://example.test/unauthorized')
    }
  })

  test('staff pass through everywhere', async () => {
    as('INTERNAL_ANALYST', 'avenue-z')
    for (const p of ['/dashboard/acme/reports', '/tools/reporting', '/portal/acme/reports']) {
      expect(location(await proxy(new NextRequest(`https://example.test${p}`)))).toBeNull()
    }
  })

  test('a refusal is logged with the path, role and client, never the email', async () => {
    session.current = { user: { role: 'CLIENT_VIEWER', clientSlug: 'acme', email: 'person@acme.example' } as never }
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await proxy(new NextRequest('https://example.test/portal/other/reports?x=1'))
    expect(warn).toHaveBeenCalledTimes(1)
    const line = String(warn.mock.calls[0][0])
    expect(line).toContain('path=/portal/other/reports')
    expect(line).toContain('role=CLIENT_VIEWER')
    expect(line).toContain('client=acme')
    expect(line).not.toContain('person@acme.example')
    expect(line).not.toContain('x=1')
  })
})
