import { afterEach, beforeEach, expect, test, vi } from 'vitest'
const m = vi.hoisted(() => ({ rows: vi.fn(), args: vi.fn(), dbNow: vi.fn() }))
vi.mock('@/lib/aeo-outbound/settings-store', () => ({ readSettingsRow: vi.fn(async () => null) }))
vi.mock('@/lib/aeo-outbound/store', async (o) => ({
  ...(await o<object>()),
  generationProgressQuery: (by: unknown, now: Date) => { m.args(by, now); return { then: (r: (v: unknown) => void, j: (e: unknown) => void) => { try { r(m.rows()) } catch (e) { j(e) } } } },
  databaseNow: () => m.dbNow(),
}))
import { GET } from './route'
import { auth } from '@/auth'

// Every id and email is invented.
const ID = 'c7d8e0a1-1111-4111-8111-111111111111'
const AT = new Date('2026-10-08T15:00:03.000Z')
// Postgres's clock, a minute behind any browser clock in these tests.
const DB_NOW = new Date('2026-10-08T15:00:07.250Z')
const get = (qs: string) => GET(new Request(`https://app.example/api/aeo-outbound/progress${qs}`))
const as = (email: string | null) => vi.mocked(auth).mockResolvedValue((email ? { user: { role: 'INTERNAL_ANALYST', email } } : null) as never)
let error: ReturnType<typeof vi.spyOn>

beforeEach(() => { vi.stubEnv('AEO_OUTBOUND_USERS', 'ryan@avenuez.com'); m.rows.mockReturnValue([]); m.dbNow.mockResolvedValue(DB_NOW); error = vi.spyOn(console, 'error').mockImplementation(() => {}) })
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); error.mockRestore() })

test('403 without a session or access, checked before the query string', async () => {
  as(null)
  expect((await get('?id=nope')).status).toBe(403)
  as('someone@avenuez.com')
  const r = await get(`?id=${ID}`)
  expect(r.status).toBe(403)
  expect(await r.json()).toEqual({ error: 'forbidden' })
  expect(m.args).not.toHaveBeenCalled()
})

test('400 for both, neither or a malformed value', async () => {
  as('ryan@avenuez.com')
  for (const qs of ['', `?id=${ID}&projectId=or_a`, '?id=not-a-uuid', '?projectId=', `?projectId=${'x'.repeat(201)}`]) {
    const r = await get(qs)
    expect(r.status).toBe(400)
    expect(await r.json()).toEqual({ error: 'bad-request' })
  }
  expect(m.args).not.toHaveBeenCalled()
})

test("200 with the row by id or by project, or step null, each with Postgres's now (spec v1.1 §18.9); never cached", async () => {
  as('ryan@avenuez.com')
  m.rows.mockReturnValue([{ id: ID, step: 5, createdAt: AT, now: DB_NOW }])
  const byId = await get(`?id=${ID}`)
  expect(byId.status).toBe(200)
  expect(byId.headers.get('cache-control')).toBe('no-store')
  expect(await byId.json()).toEqual({ id: ID, step: 5, createdAt: '2026-10-08T15:00:03.000Z', now: '2026-10-08T15:00:07.250Z' })
  expect(m.args).toHaveBeenLastCalledWith({ id: ID }, expect.any(Date))
  // The row body takes now from the same query: no second read.
  expect(m.dbNow).not.toHaveBeenCalled()
  m.rows.mockReturnValue([])
  const none = await get('?projectId=or_a')
  expect(none.headers.get('cache-control')).toBe('no-store')
  expect(await none.json()).toEqual({ step: null, now: '2026-10-08T15:00:07.250Z' })
  expect(m.args).toHaveBeenLastCalledWith({ projectId: 'or_a' }, expect.any(Date))
  expect(m.dbNow).toHaveBeenCalledTimes(1)
})

test('§18.9: a failed clock read on the no-row path is the same 503 and one log line', async () => {
  as('ryan@avenuez.com')
  m.dbNow.mockRejectedValue(Object.assign(new Error(`params ${ID}`), { code: '57P01' }))
  const r = await get('?projectId=or_a')
  expect(r.status).toBe(503)
  expect(await r.json()).toEqual({ error: 'unavailable' })
  expect(error.mock.calls.map((c) => String(c[0]))).toEqual(['[aeo-outbound] progress read failed reason=57P01'])
})

test('503 on a database error, logging one line with no ids or emails', async () => {
  as('ryan@avenuez.com')
  m.rows.mockImplementation(() => { throw Object.assign(new Error(`params ${ID} ryan@avenuez.com`), { code: '57P01' }) })
  const r = await get(`?id=${ID}`)
  expect(r.status).toBe(503)
  expect(await r.json()).toEqual({ error: 'unavailable' })
  expect(error.mock.calls.map((c) => String(c[0]))).toEqual(['[aeo-outbound] progress read failed reason=57P01'])
})
