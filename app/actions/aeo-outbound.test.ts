import { beforeEach, expect, test, vi } from 'vitest'

vi.mock('next/cache', () => ({ updateTag: vi.fn() }))
vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers({ host: 'app.example' })) }))
vi.mock('@/lib/aeo-outbound/store', async () => {
  const actual = await vi.importActual<typeof import('@/lib/aeo-outbound/store')>('@/lib/aeo-outbound/store')
  return {
    ...actual,
    getReport: vi.fn(), approveQuery: vi.fn(), revokeQuery: vi.fn(), discardQuery: vi.fn(), copyAsDraft: vi.fn(),
  }
})

import { auth } from '@/auth'
import { headers } from 'next/headers'
import { updateTag } from 'next/cache'
import * as store from '@/lib/aeo-outbound/store'
import { DECISIONS } from '@/lib/aeo-outbound/config'
import { RECIPIENT_ERROR } from '@/lib/aeo-outbound/recipient'
import type { SnapshotData } from '@/lib/aeo-outbound/metrics'
import type { Slots } from '@/lib/aeo-outbound/slots'
import { approveSnapshotAction, copySnapshotAsDraftAction, discardSnapshotAction, revokeSnapshotAction } from './aeo-outbound'

// Every id, email, name and number is invented.
const ID = 'c7d8e0a1-1111-4111-8111-111111111111'
const BRANDS = [
  { id: 'a', name: 'Alpha', isOwn: false, visibilityPct: 26.1, sovPct: 22.5, position: 2.4, rank: 1 },
  { id: 'o', name: 'Example Co', isOwn: true, visibilityPct: 15.1, sovPct: 15.9, position: 3.1, rank: 2 },
]
const DATA = {
  projectId: 'or_a', projectName: 'p', brand: 'Example Co', generatedAt: '2026-10-08T15:00:00Z',
  window: { start: '2026-10-01', end: '2026-10-08' }, windowLabel: 'Oct 1, 2026 to Oct 8, 2026',
  category: 'Fintech', market: 'United States', brands: BRANDS, own: BRANDS[1],
  kpis: [{ label: 'AI visibility', value: '15.1%' }, { label: 'AI share of voice', value: '15.9%' }, { label: 'Average answer position', value: '#3.1' }, { label: 'Competitive rank', value: '#2 of 2 brands' }],
  competitorsTracked: 1, rankN: 2, leaderGaps: [], ownDomains: ['example.com'], ownRetrievedChats: 10, ownRetrievedPct: 22.4,
  sourceMix: [{ label: 'Corporate', weight: 5, pct: 50 }, { label: 'You', weight: 5, pct: 50 }], gapDomains: [], actions: [],
  promptCount: 100, models: ['ChatGPT UI'], notes: [],
} as SnapshotData
const SLOTS: Slots = {
  category: 'Fintech', market: 'United States', headline: 'Headline', summary: 'Summary.',
  context: 'Context.', competitive_bullets: [{ lead: 'Lead:', text: 'Text.' }, { lead: 'L2:', text: 'T2.' }],
  sources_bullets: [{ lead: 'Gap:', text: 'G.' }, { lead: 'G2:', text: 'G2.' }], why: 'Why.',
  opportunities: [0, 1, 2].map((i) => ({ signal: `s${i}`, opportunity: `o${i}`, workstream: 'Content / AEO' })),
  methodology: 'Method.', next_step: 'Next.',
}
const DRAFT = { id: ID, status: 'draft', data: DATA, slots: SLOTS }
const FORBIDDEN = { ok: false, error: 'forbidden' }
const NOT_FOUND = { ok: false, error: 'not found' }
const TOKEN = 'AAAAAAAAAAAAAAAAAAAAAAAA'
const as = (role: string, email: string | null = 'writer@avenuez.com') =>
  (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { role, email } })
const writes = () => [store.approveQuery, store.revokeQuery, store.discardQuery, store.copyAsDraft]
const noWrites = () => { for (const w of writes()) expect(w).not.toHaveBeenCalled(); expect(updateTag).not.toHaveBeenCalled() }
const setHost = (origin?: string) =>
  vi.mocked(headers).mockResolvedValue(new Headers({ host: 'app.example', ...(origin ? { origin } : {}) }) as never)

beforeEach(() => {
  vi.resetAllMocks()
  process.env.AEO_OUTBOUND_USERS = 'writer@avenuez.com'
  setHost()
  as('INTERNAL_ANALYST')
  vi.mocked(store.getReport).mockResolvedValue(DRAFT as never)
  vi.mocked(store.approveQuery).mockResolvedValue([{ id: ID, shareToken: TOKEN }] as never)
  vi.mocked(store.revokeQuery).mockResolvedValue([{ id: ID }] as never)
  vi.mocked(store.discardQuery).mockResolvedValue([{ id: ID }] as never)
  vi.mocked(store.copyAsDraft).mockResolvedValue('c7d8e0a1-2222-4222-8222-222222222222')
})

const callAll = async () => [
  await approveSnapshotAction(ID, 1, 'Ada'),
  await revokeSnapshotAction(ID),
  await discardSnapshotAction(ID),
  await copySnapshotAsDraftAction(ID),
]

test.each([
  ['no session', () => (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null)],
  ['a client role', () => as('CLIENT_ADMIN', 'writer@avenuez.com')],
  ['staff off the allowlist', () => as('INTERNAL_ADMIN', 'other@avenuez.com')],
  ['a foreign Origin', () => setHost('https://evil.example')],
])('%s: every action returns forbidden and writes nothing', async (_n, arrange) => {
  arrange()
  for (const r of await callAll()) expect(r).toEqual(FORBIDDEN)
  noWrites()
  expect(store.getReport).not.toHaveBeenCalled()
})

test('a malformed id or a non-integer revision is not found, with no query', async () => {
  expect(await approveSnapshotAction('nope', 1, 'Ada')).toEqual(NOT_FOUND)
  expect(await approveSnapshotAction(ID, 1.5, 'Ada')).toEqual(NOT_FOUND)
  expect(await revokeSnapshotAction('nope')).toEqual(NOT_FOUND)
  expect(await discardSnapshotAction('nope')).toEqual(NOT_FOUND)
  expect(await copySnapshotAsDraftAction('nope')).toEqual(NOT_FOUND)
  noWrites()
  expect(store.getReport).not.toHaveBeenCalled()
})

test('approve: no row, not a draft, or no data or slots is not found', async () => {
  for (const row of [undefined, { ...DRAFT, status: 'approved' }, { ...DRAFT, data: null }, { ...DRAFT, slots: null }]) {
    vi.mocked(store.getReport).mockResolvedValueOnce(row as never)
    expect(await approveSnapshotAction(ID, 1, 'Ada')).toEqual(NOT_FOUND)
  }
  noWrites()
})

test.each([['empty', ''], ['blank', '   '], ['201 characters', 'x'.repeat(201)], ['not a string', 7]])('approve: recipient %s is refused and writes nothing', async (_n, r) => {
  expect(await approveSnapshotAction(ID, 1, r as never)).toEqual({ ok: false, error: RECIPIENT_ERROR })
  noWrites()
})

test('approve: a Needs validation slot is refused when the decision blocks, and writes nothing', async () => {
  expect(DECISIONS.needsValidationBlocksApprove).toBe(true)
  vi.mocked(store.getReport).mockResolvedValue({ ...DRAFT, slots: { ...SLOTS, summary: 'Needs validation' } } as never)
  expect(await approveSnapshotAction(ID, 1, 'Ada')).toEqual({ ok: false, error: 'Fill in every "Needs validation" first.' })
  noWrites()
})

test('approve: a stale revision (no rows) gives stale and no cache tag', async () => {
  vi.mocked(store.approveQuery).mockResolvedValue([] as never)
  expect(await approveSnapshotAction(ID, 1, 'Ada')).toEqual({ ok: false, error: 'stale' })
  expect(updateTag).not.toHaveBeenCalled()
})

test('approve success: final HTML, a 24-character token, the cleaned recipient, the caller, and updateTag', async () => {
  vi.mocked(store.approveQuery).mockImplementation(((_id: string, _rev: number, v: { token: string }) => Promise.resolve([{ id: ID, shareToken: v.token }])) as never)
  const r = await approveSnapshotAction(ID, 3, '  Ada   Lovelace ')
  expect(r.ok).toBe(true)
  if (!r.ok) return
  expect(r.token).toHaveLength(24)
  const [id, rev, v] = vi.mocked(store.approveQuery).mock.calls[0]
  expect([id, rev]).toEqual([ID, 3])
  expect(v.html).toContain('class="share-btn"')
  expect(v.html).not.toContain('data-slot')
  expect(v.recipient).toBe('Ada Lovelace')
  expect(v.by).toBe('writer@avenuez.com')
  expect(v.token).toBe(r.token)
  expect(updateTag).toHaveBeenCalledWith('db')
})

const collision = () => Object.assign(new Error('dup'), { code: '23505', constraint: store.SHARE_TOKEN_UNIQUE })

test('approve: a share-token collision retries once with a new token', async () => {
  vi.mocked(store.approveQuery)
    .mockRejectedValueOnce(collision())
    .mockImplementationOnce(((_i: string, _r: number, v: { token: string }) => Promise.resolve([{ id: ID, shareToken: v.token }])) as never)
  const r = await approveSnapshotAction(ID, 1, 'Ada')
  expect(r.ok).toBe(true)
  const calls = vi.mocked(store.approveQuery).mock.calls
  expect(calls).toHaveLength(2)
  expect(calls[0][2].token).not.toBe(calls[1][2].token)
})

test('approve: a second collision propagates, and a 23505 on another constraint is not retried', async () => {
  vi.mocked(store.approveQuery).mockRejectedValue(collision())
  await expect(approveSnapshotAction(ID, 1, 'Ada')).rejects.toThrow('dup')
  expect(store.approveQuery).toHaveBeenCalledTimes(2)
  vi.mocked(store.approveQuery).mockReset()
  vi.mocked(store.approveQuery).mockRejectedValue(Object.assign(new Error('other'), { code: '23505', constraint: 'something_else' }))
  await expect(approveSnapshotAction(ID, 1, 'Ada')).rejects.toThrow('other')
  expect(store.approveQuery).toHaveBeenCalledTimes(1)
  expect(updateTag).not.toHaveBeenCalled()
})

test('revoke and discard call their queries, tag the cache and return ok; no rows is not found', async () => {
  expect(await revokeSnapshotAction(ID)).toEqual({ ok: true })
  expect(await discardSnapshotAction(ID)).toEqual({ ok: true })
  expect(store.revokeQuery).toHaveBeenCalledWith(ID, 'writer@avenuez.com', expect.any(Date))
  expect(store.discardQuery).toHaveBeenCalledWith(ID, 'writer@avenuez.com', expect.any(Date))
  expect(updateTag).toHaveBeenCalledTimes(2)
  vi.mocked(updateTag).mockClear()
  vi.mocked(store.revokeQuery).mockResolvedValue([] as never)
  vi.mocked(store.discardQuery).mockResolvedValue([] as never)
  expect(await revokeSnapshotAction(ID)).toEqual(NOT_FOUND)
  expect(await discardSnapshotAction(ID)).toEqual(NOT_FOUND)
  expect(updateTag).not.toHaveBeenCalled()
})

test('copy as draft returns the new id and tags the cache; an undefined result is not found', async () => {
  expect(await copySnapshotAsDraftAction(ID)).toEqual({ ok: true, id: 'c7d8e0a1-2222-4222-8222-222222222222' })
  expect(store.copyAsDraft).toHaveBeenCalledWith(ID, 'writer@avenuez.com', expect.any(Date))
  expect(updateTag).toHaveBeenCalledWith('db')
  vi.mocked(updateTag).mockClear()
  vi.mocked(store.copyAsDraft).mockResolvedValue(undefined)
  expect(await copySnapshotAsDraftAction(ID)).toEqual(NOT_FOUND)
  expect(updateTag).not.toHaveBeenCalled()
})
