import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { NextRequest } from 'next/server'

const m = vi.hoisted(() => ({ getReport: vi.fn(), save: vi.fn(), readSettings: vi.fn(async () => null as unknown) }))
vi.mock('@/lib/aeo-outbound/settings-store', () => ({ readSettingsRow: m.readSettings }))
vi.mock('@/lib/aeo-outbound/store', async (o) => ({ ...(await o<object>()), getReport: m.getReport, saveSlotsQuery: m.save }))

import { PATCH } from './route'
import { auth } from '@/auth'
import { groundingFlags } from '@/lib/aeo-outbound/grounding'
import { dataBlock } from '@/lib/aeo-outbound/prompt'
import type { SnapshotData } from '@/lib/aeo-outbound/metrics'
import { needsValidationPaths, withDefaults, type Slots } from '@/lib/aeo-outbound/slots'
import { V1_DATA, V1_SLOTS } from '@/lib/aeo-outbound/__fixtures__/v1-row'

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

test('200 with the new revision, the notes plus fresh grounding flags, and needsValidation; no slots for a plain save', async () => {
  const value = 'Needs validation: 99% of everything.'
  const res = await patch({ path: 'headline', value, revision: 3 })
  expect(res.status).toBe(200)
  const body = await res.json()
  const patched = withDefaults({ ...SLOTS, headline: value }, DATA)
  expect(body.revision).toBe(4)
  expect(body.notes).toEqual([...DATA.notes, ...groundingFlags(patched, DATA, dataBlock(DATA))])
  expect(body.needsValidation).toEqual(['headline'])
  expect(body).not.toHaveProperty('slots')
  // A body with no writer passes null, so the update clears last_writer and last_seq (spec v1.1 18.4).
  expect(m.save).toHaveBeenCalledWith(ID, 3, patched, body.notes, undefined, null)
})

test('the brand_name write: a brand save also writes brand_name; no other path does', async () => {
  await patch({ path: 'brand', value: ' New  Co ', revision: 3 })
  expect(m.save.mock.calls[0][4]).toBe('New Co')
  await patch({ path: 'page.series', value: 'Snapshot', revision: 3 })
  expect(m.save.mock.calls[1][4]).toBeUndefined()
})

test('a structural add returns the new slots and the new bullet as Needs validation; a remove from 2 is now a 200 with 1 (spec v1.1 18.12)', async () => {
  const res = await patch({ path: 'sources_bullets.add', value: 'structure', revision: 3 })
  expect(res.status).toBe(200)
  const body = await res.json()
  expect(body.slots.sources_bullets).toHaveLength(3)
  expect(body.needsValidation).toEqual(['sources_bullets.2.lead', 'sources_bullets.2.text'])
  const one = await patch({ path: 'sources_bullets.0.remove', value: 'structure', revision: 3 })
  expect(one.status).toBe(200)
  expect((await one.json()).slots.sources_bullets).toEqual([SLOTS.sources_bullets[1]])
  expect(m.save).toHaveBeenCalledTimes(2)
})

test('an add at 3 is a 200 with 4; remove index 5 of 3 is 400 unknown field; remove at 1 and add at 6 are 400 with their limits (spec v1.1 18.12)', async () => {
  const list = (n: number) => Array.from({ length: n }, (_, i) => ({ lead: `G${i}:`, text: `U${i}.` }))
  m.getReport.mockResolvedValue(row({ slots: { ...SLOTS, sources_bullets: list(3) } }))
  const four = await patch({ path: 'sources_bullets.add', value: 'structure', revision: 3 })
  expect(four.status).toBe(200)
  const body = await four.json()
  expect(body.slots.sources_bullets).toEqual([...list(3), { lead: 'Needs validation', text: 'Needs validation' }])
  expect(body.needsValidation).toEqual(['sources_bullets.3.lead', 'sources_bullets.3.text'])
  const past = await patch({ path: 'sources_bullets.5.remove', value: 'structure', revision: 3 })
  expect(past.status).toBe(400)
  expect(await past.json()).toEqual({ error: 'unknown field' })
  m.getReport.mockResolvedValue(row({ slots: { ...SLOTS, sources_bullets: list(1) } }))
  const min = await patch({ path: 'sources_bullets.0.remove', value: 'structure', revision: 3 })
  expect(min.status).toBe(400)
  expect(await min.json()).toEqual({ error: 'A list needs at least one bullet.' })
  m.getReport.mockResolvedValue(row({ slots: { ...SLOTS, sources_bullets: list(6) } }))
  const full = await patch({ path: 'sources_bullets.add', value: 'structure', revision: 3 })
  expect(full.status).toBe(400)
  expect(await full.json()).toEqual({ error: 'A list can have at most six bullets.' })
  expect(m.save).toHaveBeenCalledTimes(1)
})

test('an unreadable stored row is refused like a non-draft, with its own log reason', async () => {
  m.getReport.mockResolvedValue({ ...row(), unreadable: true })
  const res = await patch({ path: 'headline', value: 'x', revision: 3 })
  expect(res.status).toBe(409)
  expect(await res.json()).toEqual({ error: 'not-draft', revision: 3 })
  expect(logged()).toEqual([`[aeo-outbound] slots refused id=${ID} reason=unreadable`])
  expect(m.save).not.toHaveBeenCalled()
})

test('a version 1 row saves with its version 1 flags unchanged', async () => {
  m.getReport.mockResolvedValue({ id: ID, status: 'draft', data: V1_DATA, slots: V1_SLOTS, revision: 3 })
  const body = await (await patch({ path: 'summary', value: V1_SLOTS.summary, revision: 3 })).json()
  const flags = (body.notes as unknown[]).slice(V1_DATA.notes.length) as { path: string; text: string }[]
  expect([...new Set(flags.map((f) => `${f.path.split('.')[0]}: ${f.text}`))]).toEqual(['why: "rival.io" is not a domain in the Peec data', 'why: "42%" is not in the Peec data'])
  expect(body.notes.slice(0, V1_DATA.notes.length)).toEqual(V1_DATA.notes)
})

test('a settings change never alters an existing draft: words and code-set fields come from the row', async () => {
  m.readSettings.mockResolvedValueOnce({ id: true, users: [], admins: [], sectionTitles: ['Live title', 'Other'], fixedNextStep: 'A fixed sentence.', rankAmong: null, peecOpportunityRows: 1, methodologyStatesPromptsAndModels: true, sidebarWordmark: 'AIVx', series: 'AI Visibility Snapshot', updatedAt: new Date('2026-10-10T09:00:00.000Z'), updatedBy: 'ryan@avenuez.com' })
  const dash = String.fromCharCode(0x2014)
  m.getReport.mockResolvedValue(row({ slots: { ...SLOTS, page: { section_1_title: 'Strengths' } } }))
  const body = await (await patch({ path: 'next_step', value: `Book ${dash} now`, revision: 3 })).json()
  expect(body.notes).toContainEqual({ kind: 'long_dash', path: 'next_step', text: 'contains a long dash; use a period or comma' })
  expect(m.save.mock.calls[0][2].page.section_1_title).toBe('Strengths')
})

test('with CONTRACT_DISABLED set (ignored since spec v1.1 §19.6), a null body and a string revision answer 400 and save nothing', async () => {
  vi.stubEnv('CONTRACT_DISABLED', '1')
  for (const b of ['null', { path: 'headline', value: 'x', revision: '3' }]) {
    const res = await patch(b)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'bad-request' })
  }
  expect(m.save).not.toHaveBeenCalled()
})

// Spec v1.1 18.4: a save whose answer was lost is safe to retry. W is this tab's queue, OTHER another tab's.
const W = '0b6f8f9e-3c1a-4d2b-9e8f-1a2b3c4d5e6f'
const OTHER = '7d1e2f3a-4b5c-4d6e-8f70-8192a3b4c5d6'
const THIRD = { lead: 'G3:', text: 'G3.' }
const STORED_NOTES = ['a stored note']
const ours = (over: Record<string, unknown> = {}) => row({ revision: 4, lastWriter: W, lastSeq: 1, notes: STORED_NOTES, ...over })
const edit = (over: Record<string, unknown> = {}) => ({ path: 'headline', value: 'New headline.', revision: 3, writer: W, seq: 2, ...over })

test('the guard: only one of writer and seq, a writer that is not a UUID, or a seq out of range is 400 before the report is read, even with the contract off', async () => {
  const bad = [
    { writer: W }, { seq: 2 }, { writer: 'not-a-uuid', seq: 2 }, { writer: 5, seq: 2 }, { writer: null, seq: 2 },
    { writer: W, seq: 0 }, { writer: W, seq: -1 }, { writer: W, seq: '2' }, { writer: W, seq: 1.5 }, { writer: W, seq: 2147483648 }, { writer: W, seq: null },
  ]
  for (const killSwitch of [false, true]) {
    if (killSwitch) vi.stubEnv('CONTRACT_DISABLED', '1')
    for (const extra of bad) {
      const res = await patch({ path: 'headline', value: 'x', revision: 3, ...extra })
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: 'bad-request' })
    }
  }
  expect(m.getReport).not.toHaveBeenCalled()
  expect(m.save).not.toHaveBeenCalled()
  expect((await patch({ path: 'headline', value: 'x', revision: 3, writer: W, seq: 2147483647 })).status).toBe(200)
})

test('no writer behaves as today: last_writer is ignored, the request revision must match, and the store gets null', async () => {
  m.getReport.mockResolvedValue(row({ lastWriter: W, lastSeq: 9 }))
  const res = await patch({ path: 'headline', value: 'New headline.', revision: 3 })
  expect(res.status).toBe(200)
  expect(m.save.mock.calls[0][1]).toBe(3)
  expect(m.save.mock.calls[0][5]).toBeNull()
  m.save.mockClear()
  m.getReport.mockResolvedValue(ours())
  const stale = await patch({ path: 'headline', value: 'New headline.', revision: 3 })
  expect(stale.status).toBe(409)
  expect(await stale.json()).toEqual({ error: 'stale', revision: 4 })
  expect(m.save).not.toHaveBeenCalled()
})

test('step 2: an edit that already landed answers 200 with the row\'s revision and stored notes, writing nothing', async () => {
  m.getReport.mockResolvedValue(ours({ lastSeq: 2, slots: { ...SLOTS, headline: 'New headline.' } }))
  const res = await patch(edit())
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ revision: 4, notes: STORED_NOTES, needsValidation: needsValidationPaths(withDefaults({ ...SLOTS, headline: 'New headline.' }, DATA)) })
  expect(m.save).not.toHaveBeenCalled()
  expect(m.getReport).toHaveBeenCalledTimes(1)
})

test('step 2: a retried add that landed on a list of 3 answers 200 with the stored 3 bullets and makes no update call', async () => {
  const stored = { ...SLOTS, sources_bullets: [...SLOTS.sources_bullets, THIRD] }
  for (const revision of [3, 4]) {
    m.getReport.mockResolvedValue(ours({ lastSeq: 2, slots: stored }))
    const res = await patch(edit({ path: 'sources_bullets.add', value: 'structure', revision }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.slots.sources_bullets).toEqual(stored.sources_bullets)
    expect(body).toEqual({ revision: 4, notes: STORED_NOTES, needsValidation: needsValidationPaths(withDefaults(stored, DATA)), slots: withDefaults(stored, DATA) })
  }
  expect(m.save).not.toHaveBeenCalled()
})

test('step 2: a retried remove that landed on a list of 2 answers 200 with the stored 2 bullets and makes no update call', async () => {
  m.getReport.mockResolvedValue(ours({ lastSeq: 2 }))
  const res = await patch(edit({ path: 'sources_bullets.0.remove', value: 'structure' }))
  expect(res.status).toBe(200)
  const body = await res.json()
  expect(body.slots.sources_bullets).toEqual(SLOTS.sources_bullets)
  expect(body.revision).toBe(4)
  expect(m.save).not.toHaveBeenCalled()
})

test('step 2: a late attempt (a later item of ours already landed) is 409 stale and writes nothing, even at the row\'s revision', async () => {
  for (const revision of [3, 5]) {
    m.getReport.mockResolvedValue(ours({ revision: 5, lastSeq: 3 }))
    const res = await patch(edit({ revision }))
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'stale', revision: 5 })
  }
  expect(m.save).not.toHaveBeenCalled()
})

test('step 4: when an earlier item of ours is the last write, the save goes on top of the row\'s revision, once', async () => {
  m.save.mockResolvedValue([{ revision: 5 }])
  for (const lastSeq of [1, null]) {
    m.save.mockClear()
    m.getReport.mockResolvedValue(ours({ lastSeq }))
    const res = await patch(edit())
    expect(res.status).toBe(200)
    expect((await res.json()).revision).toBe(5)
    expect(m.save).toHaveBeenCalledTimes(1)
    const patched = withDefaults({ ...SLOTS, headline: 'New headline.' }, DATA)
    expect(m.save).toHaveBeenCalledWith(ID, 4, patched, [...DATA.notes, ...groundingFlags(patched, DATA, dataBlock(DATA))], undefined, { writer: W, seq: 2 })
  }
})

test('step 4: the request\'s revision is used when it matches, and the writer and seq reach the store', async () => {
  m.getReport.mockResolvedValue(row({ lastWriter: OTHER, lastSeq: 40 }))
  const res = await patch(edit())
  expect(res.status).toBe(200)
  expect(m.save.mock.calls[0][1]).toBe(3)
  expect(m.save.mock.calls[0][5]).toEqual({ writer: W, seq: 2 })
})

test('step 4: another tab\'s write, or an old tab\'s with no writer, after our lost attempt is 409 stale, nothing written', async () => {
  for (const over of [{ lastWriter: OTHER, lastSeq: 9 }, { lastWriter: null, lastSeq: null }]) {
    m.getReport.mockResolvedValue(ours(over))
    const res = await patch(edit())
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'stale', revision: 4 })
  }
  expect(m.save).not.toHaveBeenCalled()
  expect(logged()).toEqual([`[aeo-outbound] slots refused id=${ID} reason=stale`, `[aeo-outbound] slots refused id=${ID} reason=stale`])
})

test('step 5: a miss reads the row again, and an attempt of ours that landed meanwhile is answered by step 2', async () => {
  m.save.mockResolvedValue([])
  m.getReport.mockResolvedValueOnce(row({ lastWriter: W, lastSeq: 1 })).mockResolvedValueOnce(ours({ lastSeq: 2 }))
  const res = await patch(edit())
  expect(res.status).toBe(200)
  expect(await res.json()).toMatchObject({ revision: 4, notes: STORED_NOTES })
  expect(m.save).toHaveBeenCalledTimes(1)
  expect(m.getReport).toHaveBeenCalledTimes(2)
  expect(logged()).toEqual([])
})

test('step 5: three reads that all miss answer 503 unavailable, with one log line that names no writer or text', async () => {
  m.save.mockResolvedValue([])
  m.getReport.mockResolvedValueOnce(ours({ revision: 4 })).mockResolvedValueOnce(ours({ revision: 5 })).mockResolvedValueOnce(ours({ revision: 6 }))
  const res = await patch(edit({ value: 'secret-slot-value@example.com' }))
  expect(res.status).toBe(503)
  expect(await res.json()).toEqual({ error: 'unavailable' })
  expect(m.getReport).toHaveBeenCalledTimes(3)
  expect(m.save.mock.calls.map((c) => c[1])).toEqual([4, 5, 6])
  const lines = logged()
  expect(lines).toHaveLength(1)
  expect(lines[0]).toMatch(new RegExp(`^\\[aeo-outbound\\] slots .* id=${ID}`))
  for (const line of lines) { expect(line).not.toContain(W); expect(line).not.toContain('secret'); expect(line).not.toContain('@') }
})

test('step 1: a row approved or unreadable between attempts is 409 not-draft before step 2, on the first read or a re-read', async () => {
  m.getReport.mockResolvedValue(ours({ status: 'approved', lastSeq: 2 }))
  let res = await patch(edit())
  expect(res.status).toBe(409)
  expect(await res.json()).toEqual({ error: 'not-draft', revision: 4 })
  expect(m.save).not.toHaveBeenCalled()
  m.save.mockResolvedValue([])
  m.getReport.mockResolvedValueOnce(row({ lastWriter: W, lastSeq: 1 })).mockResolvedValueOnce(ours({ status: 'approved', revision: 4 }))
  res = await patch(edit())
  expect(res.status).toBe(409)
  expect(await res.json()).toEqual({ error: 'not-draft', revision: 4 })
  expect(m.save).toHaveBeenCalledTimes(1)
  m.save.mockClear()
  m.getReport.mockResolvedValueOnce(row()).mockResolvedValueOnce({ ...ours({ lastSeq: 2 }), unreadable: true })
  res = await patch(edit())
  expect(res.status).toBe(409)
  expect(m.save).toHaveBeenCalledTimes(1)
})

test('an uppercase writer matches its own row: the route compares and stores the lowercase form', async () => {
  m.getReport.mockResolvedValue(ours({ lastSeq: 2 }))
  const res = await patch(edit({ writer: W.toUpperCase() }))
  expect(res.status).toBe(200)
  expect((await res.json()).revision).toBe(4)
  expect(m.save).not.toHaveBeenCalled()
  m.getReport.mockResolvedValue(ours({ lastSeq: 1 }))
  m.save.mockResolvedValue([{ revision: 5 }])
  expect((await patch(edit({ writer: W.toUpperCase() }))).status).toBe(200)
  expect(m.save.mock.calls[0][1]).toBe(4)
  expect(m.save.mock.calls[0][5]).toEqual({ writer: W, seq: 2 })
})
