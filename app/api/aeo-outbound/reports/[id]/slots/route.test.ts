import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { NextRequest } from 'next/server'

const m = vi.hoisted(() => ({ getReport: vi.fn(), save: vi.fn() }))
vi.mock('@/lib/aeo-outbound/store', async (o) => ({ ...(await o<object>()), getReport: m.getReport, saveSlotsQuery: m.save }))

import { PATCH } from './route'
import { auth } from '@/auth'
import { groundingFlags } from '@/lib/aeo-outbound/grounding'
import { dataBlock } from '@/lib/aeo-outbound/prompt'
import type { SnapshotData } from '@/lib/aeo-outbound/metrics'
import type { Slots } from '@/lib/aeo-outbound/slots'

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
  promptCount: 100, models: ['ChatGPT UI'], notes: ['an existing note'],
} as SnapshotData
const SLOTS: Slots = {
  category: 'Fintech', market: 'United States', headline: 'Headline.', summary: 'Summary.',
  context: 'Context.', competitive_bullets: [{ lead: 'Lead:', text: 'Text.' }, { lead: 'L2:', text: 'T2.' }],
  sources_bullets: [{ lead: 'Gap:', text: 'G.' }, { lead: 'G2:', text: 'G2.' }], why: 'Why.',
  opportunities: [0, 1, 2].map((i) => ({ signal: `s${i}`, opportunity: `o${i}`, workstream: 'Content / AEO' })),
  methodology: 'Method.', next_step: 'Next.',
}
const row = (over: Record<string, unknown> = {}) => ({ id: ID, status: 'draft', data: DATA, slots: SLOTS, revision: 3, ...over })
const patch = (b: unknown, id = ID, headers: Record<string, string> = {}) =>
  PATCH(new NextRequest(`https://app.example/api/aeo-outbound/reports/${id}/slots`, { method: 'PATCH', body: typeof b === 'string' ? b : JSON.stringify(b), headers: { 'content-type': 'application/json', host: 'app.example', ...headers } }), { params: Promise.resolve({ id }) })
const as = (email: string) => vi.mocked(auth).mockResolvedValue({ user: { role: 'INTERNAL_ANALYST', email, clientSlug: null } } as never)

const logged = () => [...vi.mocked(console.error).mock.calls, ...vi.mocked(console.warn).mock.calls].map((c) => c.join(' '))

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.stubEnv('AEO_OUTBOUND_USERS', 'ryan@avenuez.com')
  as('ryan@avenuez.com')
  m.getReport.mockResolvedValue(row())
  m.save.mockResolvedValue([{ revision: 4 }])
})
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); vi.clearAllMocks() })

test('403 for no session, non-allowlisted staff and a foreign Origin; nothing is read or written', async () => {
  vi.mocked(auth).mockResolvedValue(null as never)
  expect((await patch({ path: 'headline', value: 'x', revision: 3 })).status).toBe(403)
  as('other@avenuez.com')
  expect((await patch({ path: 'headline', value: 'x', revision: 3 })).status).toBe(403)
  as('ryan@avenuez.com')
  expect((await patch({ path: 'headline', value: 'x', revision: 3 }, ID, { origin: 'https://evil.example' })).status).toBe(403)
  expect(m.getReport).not.toHaveBeenCalled()
  expect(m.save).not.toHaveBeenCalled()
})

test('400 for a malformed body', async () => {
  for (const b of ['not json', 'null', {}, { path: 5, revision: 3 }, { path: 'headline', value: 'x' }, { path: 'headline', value: 'x', revision: 1.5 }, { path: 'headline', value: 'x', revision: '3' }]) {
    expect((await patch(b)).status).toBe(400)
  }
  expect(m.save).not.toHaveBeenCalled()
})

test('404 for a malformed, unknown or discarded id', async () => {
  expect((await patch({ path: 'headline', value: 'x', revision: 3 }, 'nope')).status).toBe(404)
  m.getReport.mockResolvedValue(undefined)
  expect((await patch({ path: 'headline', value: 'x', revision: 3 })).status).toBe(404)
  expect(m.save).not.toHaveBeenCalled()
})

test('503 unavailable, with one safe log line, when the read or the save rejects', async () => {
  const secret = 'secret-slot-value@example.com'
  const dbErr = () => Object.assign(new Error(`query params ${secret}`), { code: '57P01' })
  m.getReport.mockRejectedValue(dbErr())
  let res = await patch({ path: 'headline', value: secret, revision: 3 })
  expect(res.status).toBe(503)
  expect(await res.json()).toEqual({ error: 'unavailable' })
  expect(logged()).toEqual([`[aeo-outbound] slots read failed id=${ID} reason=57P01`])
  vi.mocked(console.error).mockClear()
  m.getReport.mockResolvedValue(row())
  m.save.mockRejectedValue(new Error('boom'))
  res = await patch({ path: 'headline', value: secret, revision: 3 })
  expect(res.status).toBe(503)
  expect(logged()).toEqual([`[aeo-outbound] slots save failed id=${ID} reason=Error`])
  vi.mocked(console.error).mockClear()
  m.save.mockResolvedValue([])
  m.getReport.mockResolvedValueOnce(row()).mockRejectedValueOnce(dbErr())
  res = await patch({ path: 'headline', value: secret, revision: 3 })
  expect(res.status).toBe(503)
  for (const line of logged()) { expect(line).not.toContain(secret); expect(line).not.toContain('@') }
})

test('409 not-draft for an approved row, with its revision', async () => {
  m.getReport.mockResolvedValue(row({ status: 'approved', revision: 7 }))
  const res = await patch({ path: 'headline', value: 'x', revision: 7 })
  expect(res.status).toBe(409)
  expect(await res.json()).toEqual({ error: 'not-draft', revision: 7 })
  expect(m.save).not.toHaveBeenCalled()
  expect(logged()).toEqual([`[aeo-outbound] slots refused id=${ID} reason=not-draft`])
})

test('409 not-draft for a draft row with null slots or null data', async () => {
  for (const over of [{ slots: null }, { data: null }]) {
    m.getReport.mockResolvedValue(row(over))
    const res = await patch({ path: 'headline', value: 'x', revision: 3 })
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'not-draft', revision: 3 })
  }
  expect(m.save).not.toHaveBeenCalled()
})

test('400 for a bad path, an empty value and an 81-character lead', async () => {
  for (const b of [
    { path: 'nope', value: 'x', revision: 3 },
    { path: 'headline', value: '   ', revision: 3 },
    { path: 'headline', value: 5, revision: 3 },
    { path: 'competitive_bullets.0.lead', value: 'a'.repeat(81), revision: 3 },
    { path: 'competitive_bullets.9.text', value: 'x', revision: 3 },
  ]) {
    expect((await patch(b)).status).toBe(400)
  }
  expect(m.save).not.toHaveBeenCalled()
})

test('409 stale with the current revision when nothing matched', async () => {
  m.save.mockResolvedValue([])
  m.getReport.mockResolvedValueOnce(row()).mockResolvedValueOnce(row({ revision: 5 }))
  const res = await patch({ path: 'headline', value: 'New headline.', revision: 3 })
  expect(res.status).toBe(409)
  expect(await res.json()).toEqual({ error: 'stale', revision: 5 })
  expect(logged()).toEqual([`[aeo-outbound] slots refused id=${ID} reason=stale`])
})

test('409 stale with a null revision when the row is gone on the second read', async () => {
  m.save.mockResolvedValue([])
  m.getReport.mockResolvedValueOnce(row()).mockResolvedValueOnce(undefined)
  const res = await patch({ path: 'headline', value: 'New headline.', revision: 3 })
  expect(res.status).toBe(409)
  expect(await res.json()).toEqual({ error: 'stale', revision: null })
})

test('200 with the new revision, the notes plus fresh grounding flags, and needsValidation', async () => {
  const value = 'Needs validation: 99% of everything.'
  const res = await patch({ path: 'headline', value, revision: 3 })
  expect(res.status).toBe(200)
  const body = await res.json()
  const patched = { ...SLOTS, headline: value }
  expect(body.revision).toBe(4)
  expect(body.notes).toEqual([...DATA.notes, ...groundingFlags(patched, DATA, dataBlock(DATA))])
  expect(body.needsValidation).toEqual(['headline'])
  expect(m.save).toHaveBeenCalledWith(ID, 3, patched, body.notes)
})
