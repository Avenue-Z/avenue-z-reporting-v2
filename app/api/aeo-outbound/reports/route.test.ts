import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { NextRequest } from 'next/server'

const m = vi.hoisted(() => ({ list: vi.fn() }))
vi.mock('@/lib/aeo-outbound/store', async (o) => ({ ...(await o<object>()), listReportSummaries: m.list }))
vi.mock('@/lib/aeo-outbound/settings-store', () => ({ readSettingsRow: vi.fn(async () => null) }))

import { GET } from './route'
import { auth } from '@/auth'

const ID = 'c7d8e0a1-1111-4111-8111-111111111111'
const get = (qs: string) => GET(new NextRequest(`https://app.example/api/aeo-outbound/reports${qs}`))
const as = (email: string) => vi.mocked(auth).mockResolvedValue({ user: { role: 'INTERNAL_ANALYST', email, clientSlug: null } } as never)
const summary = { id: ID, peecProjectId: 'or_a', peecProjectName: 'Acme pitch', brandName: 'Acme', status: 'draft', error: null, errorCode: null, progressStep: 0, shareToken: null, shareRecipient: null, openCount: 0, firstOpenedAt: null, lastOpenedAt: null, createdAt: new Date('2026-08-01T00:00:00Z'), createdBy: 'ryan@avenuez.com', approvedAt: null, approvedBy: null, shareRevokedAt: null, requestedStart: null, requestedEnd: null, opensPerson: 0, opensAutomated: 0 }

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.stubEnv('AEO_OUTBOUND_USERS', 'ryan@avenuez.com')
  as('ryan@avenuez.com')
})
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); vi.clearAllMocks() })

test('403 without access, before any read', async () => {
  as('other@avenuez.com')
  expect((await get(`?before=2026-09-01T00:00:00.000Z&beforeId=${ID}`)).status).toBe(403)
  expect(m.list).not.toHaveBeenCalled()
})

test('400 for a missing or malformed cursor', async () => {
  for (const qs of ['', `?beforeId=${ID}`, '?before=2026-09-01T00:00:00.000Z', `?before=yesterday&beforeId=${ID}`, '?before=2026-09-01T00:00:00.000Z&beforeId=nope']) {
    const res = await get(qs)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'bad-request' })
  }
  expect(m.list).not.toHaveBeenCalled()
})

test('Show older: the rows below the cursor for the same search, as hub rows, with the next cursor', async () => {
  m.list.mockResolvedValue({ rows: [summary], cursor: { before: '2026-07-01T00:00:00.000Z', beforeId: ID } })
  const res = await get(`?before=2026-09-01T00:00:00.000Z&beforeId=${ID}&q=%20acme%20`)
  expect(res.status).toBe(200)
  expect(res.headers.get('Cache-Control')).toBe('no-store')
  expect(m.list).toHaveBeenCalledWith({ q: 'acme', before: { createdAt: new Date('2026-09-01T00:00:00.000Z'), id: ID } })
  const body = await res.json()
  expect(body.cursor).toEqual({ before: '2026-07-01T00:00:00.000Z', beforeId: ID })
  expect(body.rows).toHaveLength(1)
  expect(body.rows[0]).toMatchObject({ id: ID, brand: 'Acme', status: 'draft', createdAt: '2026-08-01T00:00:00.000Z', createdBy: 'ryan@avenuez.com' })
})

test('503 with one safe log line when the read fails', async () => {
  m.list.mockRejectedValue(Object.assign(new Error('params ryan@avenuez.com'), { code: '57P01' }))
  const res = await get(`?before=2026-09-01T00:00:00.000Z&beforeId=${ID}`)
  expect(res.status).toBe(503)
  expect(vi.mocked(console.error).mock.calls.map((c) => c.map(String).join(' '))).toEqual(['[aeo-outbound] hub older read failed reason=57P01'])
})

// Paul's review of #388 (C1).
test('spec v1.1 §19.7 (A3): a settings read failure answers 503 to a settings-only user, never 403', async () => {
  const { readSettingsRow } = await import('@/lib/aeo-outbound/settings-store')
  vi.mocked(readSettingsRow).mockRejectedValueOnce(new Error('connection reset'))
  as('ana@avenuez.com')
  const r = await get('')
  expect(r.status).toBe(503)
  expect(await r.json()).toEqual({ error: 'unavailable' })
})
