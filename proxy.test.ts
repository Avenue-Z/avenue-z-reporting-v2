// @vitest-environment node
import { afterEach, describe, expect, test, vi } from 'vitest'
import { NextRequest } from 'next/server'

const session = vi.hoisted(() => ({ current: null as null | { user: { role?: string; clientSlug?: string | null } } }))
vi.mock('@/auth', () => ({ auth: async () => session.current }))

import proxy, { config } from './proxy'

const as = (role: string, clientSlug: string | null) => { session.current = { user: { role, clientSlug } } }
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

  test("a client asking for another client's portal is turned away", async () => {
    as('CLIENT_VIEWER', 'acme')
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    for (const p of ['/portal/other', '/portal/other/reports', '/portal/other/reports/organic-social']) {
      expect(location(await proxy(new NextRequest(`https://example.test${p}`)))).toBe('https://example.test/unauthorized')
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

  test('a refusal is logged with the path, role, client and a short id, never the email', async () => {
    session.current = { user: { role: 'CLIENT_VIEWER', clientSlug: 'acme', email: 'person@acme.example' } as never }
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await proxy(new NextRequest('https://example.test/portal/other/reports?x=1'))
    expect(warn).toHaveBeenCalledTimes(1)
    const line = String(warn.mock.calls[0][0])
    expect(line).toContain('path=/portal/other/reports')
    expect(line).toContain('role=CLIENT_VIEWER')
    expect(line).toContain('client=acme')
    expect(line).toMatch(/ who=[0-9a-f]{8}$/)
    expect(line).not.toContain('person@acme.example')
    expect(line).not.toContain('x=1')
  })

  test('the short id tells two people at the same client apart, and is the same for the same person', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const who = async (email: string) => {
      session.current = { user: { role: 'CLIENT_VIEWER', clientSlug: 'acme', email } as never }
      await proxy(new NextRequest('https://example.test/portal/other/reports'))
      return String(warn.mock.calls.at(-1)![0]).match(/who=([0-9a-f]{8})/)![1]
    }
    const a = await who('a@acme.example')
    expect(await who('b@acme.example')).not.toBe(a)
    expect(await who('a@acme.example')).toBe(a)
  })

  test('a long path is cut to 120 characters in the log', async () => {
    as('CLIENT_VIEWER', 'acme')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await proxy(new NextRequest(`https://example.test/portal/other/${'x'.repeat(500)}`))
    const path = String(warn.mock.calls[0][0]).match(/path=(\S*)/)![1]
    expect(path).toHaveLength(120)
  })

  test('a session with no email logs who=none', async () => {
    as('CLIENT_VIEWER', 'acme')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await proxy(new NextRequest('https://example.test/dashboard'))
    expect(String(warn.mock.calls[0][0])).toMatch(/ who=none$/)
  })
})

describe('the matcher: which requests reach the proxy at all', () => {
  const matches = async (url: string) => {
    // Next's test helper expects the server's AsyncLocalStorage global, which a plain test process lacks.
    ;(globalThis as { AsyncLocalStorage?: unknown }).AsyncLocalStorage ??= (await import('node:async_hooks')).AsyncLocalStorage
    const { unstable_doesMiddlewareMatch } = await import('next/experimental/testing/server')
    return unstable_doesMiddlewareMatch({ config, url })
  }

  test('every protected area, in every form a page is fetched in', async () => {
    for (const url of [
      '/portal/acme', '/portal/acme/reports', '/portal/acme/reports?_rsc=1', '/portal/acme/reports.rsc',
      '/portal/acme/reports.prefetch.rsc', '/portal/acme/reports.segments/_tree.segment.rsc',
      '/dashboard', '/dashboard/acme/access', '/tools', '/tools/reporting',
    ]) expect(await matches(url), url).toBe(true)
  })

  test('the public pages stay outside it', async () => {
    for (const url of ['/login', '/unauthorized', '/share/abc']) expect(await matches(url), url).toBe(false)
  })
})
