import { beforeEach, describe, expect, test, vi } from 'vitest'

const h = vi.hoisted(() => ({
  session: null as null | { user: { role: string; clientSlug: string | null; email?: string } },
  cfg: {} as Record<string, unknown>,
  set: vi.fn(),
}))
vi.mock('next/cache', async (orig) => ({ ...(await orig<object>()), updateTag: vi.fn() }))
vi.mock('@/auth', () => ({ auth: async () => h.session }))
vi.mock('@/lib/db/client', () => ({
  db: { update: () => ({ set: (v: unknown) => { h.set(v); return { where: async () => undefined } } }) },
}))
vi.mock('@/lib/db/queries', () => ({
  getClientBySlug: async (slug: string) => (slug === 'acme' ? { slug: 'acme', reportSectionConfig: h.cfg } : null),
}))

import { setAeoKpis } from './aeo-kpis'

const asRole = (role: string, clientSlug: string | null = null) => {
  h.session = { user: { role, clientSlug } }
}

describe('setAeoKpis', () => {
  beforeEach(() => {
    h.set.mockClear()
    h.cfg = {}
    asRole('INTERNAL_ADMIN')
  })

  test.each(['INTERNAL_ADMIN', 'INTERNAL_ANALYST'])('setAeoKpis saves for staff %s', async (role) => {
    asRole(role)
    const r = await setAeoKpis('acme', ['ai-leads', 'visibility'])
    expect(r).toEqual({ ok: true })
    expect(h.set).toHaveBeenCalledTimes(1)
    expect(h.set.mock.calls[0][0].reportSectionConfig['peec-ai'].kpis).toEqual(['visibility', 'ai-leads'])
  })

  test.each([['CLIENT_ADMIN', 'acme'], ['CLIENT_VIEWER', 'acme']])('setAeoKpis forbidden for %s of their own client', async (role, slug) => {
    asRole(role, slug)
    expect(await setAeoKpis('acme', ['visibility'])).toEqual({ ok: false, error: 'forbidden' })
    expect(h.set).not.toHaveBeenCalled()
  })

  test('setAeoKpis with no session', async () => {
    h.session = null
    expect(await setAeoKpis('acme', ['visibility'])).toEqual({ ok: false, error: 'unauthenticated' })
    expect(h.set).not.toHaveBeenCalled()
  })

  test('setAeoKpis rejects a bad payload', async () => {
    const six = ['visibility', 'share-of-voice', 'used-as-source', 'ai-sessions', 'ai-leads', 'sentiment']
    expect(await setAeoKpis('acme', six)).toEqual({ ok: false, error: 'at most 5 kpis' })
    expect(await setAeoKpis('acme', ['bogus'])).toEqual({ ok: false, error: 'unknown kpi bogus' })
    expect(await setAeoKpis('acme', 'visibility')).toEqual({ ok: false, error: 'invalid kpis' })
    expect(h.set).not.toHaveBeenCalled()
  })

  test('setAeoKpis keeps the rest of the override', async () => {
    h.cfg = { 'peec-ai': { hidden: ['footer'], clientVisible: ['x'] }, other: { hidden: ['a'] } }
    const r = await setAeoKpis('acme', ['visibility'])
    expect(r.ok).toBe(true)
    const saved = h.set.mock.calls[0][0].reportSectionConfig
    expect(saved['peec-ai']).toEqual({ hidden: ['footer'], clientVisible: ['x'], kpis: ['visibility'] })
    expect(saved.other).toEqual({ hidden: ['a'] })
  })

  test('setAeoKpis for an unknown client', async () => {
    expect(await setAeoKpis('nope', ['visibility'])).toEqual({ ok: false, error: 'client not found' })
    expect(h.set).not.toHaveBeenCalled()
  })
})
