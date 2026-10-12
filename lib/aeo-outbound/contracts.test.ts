import { afterEach, beforeEach, expect, test, vi, type MockInstance } from 'vitest'
import { z } from 'zod'
import { CONTRACT_MODES } from './config'
import { checkContract, contractsDisabled, GENERATE_BODY, GLEAN_SLOTS, PEEC_CONTRACTS, peecContract, SLOTS_BODY } from './contracts'
import { PeecError } from './peec'
import { STORED_DATA, STORED_SLOTS } from './contracts'
import { V1_DATA, V1_SLOTS } from './__fixtures__/v1-row'
import { buildSnapshotData } from './metrics'
import type { PeecPull } from './pull'
import { withDefaults } from './slots'

// Every value here is invented. SECRET stands for a prospect's data that must never reach a log line.
const SECRET = 'Secret Prospect Name'
let info: MockInstance<typeof console.info>, warn: MockInstance<typeof console.warn>, error: MockInstance<typeof console.error>
beforeEach(() => {
  info = vi.spyOn(console, 'info').mockImplementation(() => {})
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  error = vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => { vi.restoreAllMocks() })
const lines = () => [...info.mock.calls, ...warn.mock.calls, ...error.mock.calls].map((c) => c.map(String).join(' '))
const SCHEMA = z.array(z.looseObject({ visibility: z.number().min(0).max(1) }))
const BAD = [{ visibility: 2, name: SECRET }, { visibility: 3, name: SECRET }, { name: SECRET }]

test('observe logs one info line per field and issue, with a count, and passes', () => {
  expect(checkContract('peec.brands_report', SCHEMA, BAD, 'observe', {})).toEqual({ ok: true })
  expect(info.mock.calls.map((c) => String(c[0]))).toEqual([
    '[aeo-outbound] contract boundary=peec.brands_report field=visibility issue=too_big count=2 mode=observe',
    '[aeo-outbound] contract boundary=peec.brands_report field=visibility issue=invalid_type count=1 mode=observe',
  ])
})

test('warn logs at warn and passes; enforce logs at error and fails with each field and issue', () => {
  expect(checkContract('peec.brands_report', SCHEMA, BAD, 'warn', {})).toEqual({ ok: true })
  expect(warn).toHaveBeenCalledTimes(2)
  expect(checkContract('peec.brands_report', SCHEMA, BAD, 'enforce', {})).toEqual({
    ok: false, issues: [{ field: 'visibility', issue: 'too_big' }, { field: 'visibility', issue: 'invalid_type' }],
  })
  expect(error).toHaveBeenCalledTimes(2)
})

test('the mode defaults to the boundary mode in config', () => {
  expect(checkContract('peec.projects', SCHEMA, BAD, undefined, {})).toEqual({ ok: true })
  expect(checkContract('peec.brands_report', SCHEMA, BAD, undefined, {}).ok).toBe(false)
})

test('a valid value logs nothing', () => {
  expect(checkContract('peec.brands_report', SCHEMA, [{ visibility: 0.5 }], 'enforce', {})).toEqual({ ok: true })
  expect(lines()).toEqual([])
})

test('no log line ever carries a value', () => {
  for (const mode of ['observe', 'warn', 'enforce'] as const) checkContract('peec.brands_report', z.array(z.looseObject({ name: z.number() })), BAD, mode, {})
  expect(lines().length).toBeGreaterThan(0)
  for (const l of lines()) expect(l).not.toContain(SECRET)
})

test('CONTRACT_DISABLED turns every check off; empty, 0 and false do not', () => {
  for (const v of ['1', 'true', 'yes']) expect(contractsDisabled({ CONTRACT_DISABLED: v })).toBe(true)
  for (const v of [undefined, '', '0', 'false', ' FALSE ']) expect(contractsDisabled({ CONTRACT_DISABLED: v })).toBe(false)
  expect(checkContract('peec.brands_report', SCHEMA, BAD, 'enforce', { CONTRACT_DISABLED: '1' })).toEqual({ ok: true })
  expect(() => peecContract('peec.brands_report', [{ brand: { id: 'a', name: 'A' } }], { CONTRACT_DISABLED: '1' })).not.toThrow()
  expect(lines()).toEqual([])
})

const ROW = { brand: { id: 'kw_a', name: 'Alpha' }, visibility: 0.3, share_of_voice: 0.2, position: 2.1, mention_count: 5 }

test('a brands report row with no visibility fails as contract_violation naming the field (the NaN% path)', () => {
  let err: unknown
  try { peecContract('peec.brands_report', [ROW, { ...ROW, visibility: undefined }], {}) } catch (e) { err = e }
  expect(err).toBeInstanceOf(PeecError)
  expect((err as PeecError).code).toBe('contract_violation')
  expect((err as PeecError).message).toBe('peec.brands_report.visibility')
})

test('NaN and a proportion above 1 are refused; absent or null share of voice and position pass', () => {
  expect(() => peecContract('peec.brands_report', [{ ...ROW, visibility: Number.NaN }], {})).toThrow('peec.brands_report.visibility')
  expect(() => peecContract('peec.brands_report', [{ ...ROW, visibility: 1.2 }], {})).toThrow(PeecError)
  const ok = [{ brand: ROW.brand, visibility: 0 }, { ...ROW, share_of_voice: null, position: null }]
  expect(peecContract('peec.brands_report', ok, {})).toBe(ok)
})

test('counts are null or non-negative whole numbers; percentages are proportions', () => {
  const r = { domain: 'a.example', classification: 'UGC', retrieved_chat_count: 3, retrieval_count: 4, retrieved_percentage: 0.1 }
  expect(peecContract('peec.domains_report', [r, { ...r, retrieved_chat_count: null, retrieval_count: undefined, retrieved_percentage: null }], {})).toHaveLength(2)
  expect(() => peecContract('peec.domains_report', [{ ...r, retrieval_count: -1 }], {})).toThrow('peec.domains_report.retrieval_count')
  expect(() => peecContract('peec.domains_report', [{ ...r, retrieved_chat_count: 1.5 }], {})).toThrow('peec.domains_report.retrieved_chat_count')
  expect(() => peecContract('peec.domains_report', [{ ...r, retrieved_percentage: 22.4 }], {})).toThrow('peec.domains_report.retrieved_percentage')
  expect(() => peecContract('peec.domains_by_date', [{ domain: 'a.example', date: '2026-10-05', retrieved_chat_count: -2 }], {})).toThrow(PeecError)
  expect(() => peecContract('peec.prompts', { total_count: 2.5 }, {})).toThrow('peec.prompts.total_count')
})

test('fields outside the enforced set are observed only: drift logs one info line and never throws', () => {
  const rows = [{ ...ROW, brand: { id: 'kw_a', name: 7 } }]
  expect(peecContract('peec.brands_report', rows, {})).toBe(rows)
  expect(lines()).toEqual(['[aeo-outbound] contract boundary=peec.brands_report field=brand.name issue=invalid_type count=1 mode=observe'])
})

test('unused fields pass through untouched: the very same value comes back', () => {
  const rows = [{ ...ROW, extra: { deep: true } }]
  expect(peecContract('peec.brands_report', rows, {})).toBe(rows)
})

test('every Peec boundary has a contract and starts in the documented mode', () => {
  expect(Object.keys(PEEC_CONTRACTS).sort()).toEqual(Object.keys(CONTRACT_MODES).filter((b) => b.startsWith('peec.')).sort())
  for (const b of ['peec.domains_by_date', 'peec.brands_report', 'peec.brands_by_model', 'peec.domains_report', 'peec.prompts'] as const) expect(CONTRACT_MODES[b]).toBe('enforce')
  for (const b of ['peec.projects', 'peec.brands', 'peec.project_profile', 'peec.model_channels', 'peec.actions'] as const) expect(CONTRACT_MODES[b]).toBe('observe')
})

test('the generate body contract keeps the v1.0 rules: a non-empty projectId, and rerunOf null or a report id', () => {
  const ok = (b: unknown) => checkContract('request.generate', GENERATE_BODY, b, 'enforce', {}).ok
  expect(ok({ projectId: 'or_a' })).toBe(true)
  expect(ok({ projectId: 'or_a', rerunOf: null, start: '2026-09-01', end: '2026-09-30' })).toBe(true)
  expect(ok({ projectId: 'or_a', rerunOf: 'c7d8e0a1-1111-4111-8111-111111111111' })).toBe(true)
  for (const b of [null, 'x', {}, { projectId: '' }, { projectId: 5 }, { projectId: 'or_a', rerunOf: 'nope' }, { projectId: 'or_a', rerunOf: 7 }]) expect(ok(b)).toBe(false)
})
test('the slots body contract: a string path, any value, an integer revision', () => {
  const ok = (b: unknown) => checkContract('request.slots', SLOTS_BODY, b, 'enforce', {}).ok
  expect(ok({ path: 'headline', value: 'x', revision: 3 })).toBe(true)
  for (const b of [null, {}, { path: 5, revision: 3 }, { path: 'headline', value: 'x' }, { path: 'headline', value: 'x', revision: 1.5 }, { path: 'headline', value: 'x', revision: '3' }]) expect(ok(b)).toBe(false)
})
test('the Glean reply contract: every copy key a non-empty string, 2 or 3 bullets, exactly 3 opportunities, next_step optional', () => {
  const reply = { headline: 'H', summary: 'S', context: 'C', competitive_bullets: [{ lead: 'L', text: 'T' }, { lead: 'L', text: 'T' }], sources_bullets: [{ lead: 'L', text: 'T' }, { lead: 'L', text: 'T' }], why: 'W', opportunities: [0, 1, 2].map(() => ({ signal: 's', opportunity: 'o', workstream: 'w' })), methodology: 'M' }
  expect(checkContract('glean.slots', GLEAN_SLOTS, reply, 'enforce', {}).ok).toBe(true)
  expect(checkContract('glean.slots', GLEAN_SLOTS, { ...reply, headline: 5 }, 'enforce', {})).toEqual({ ok: false, issues: [{ field: 'headline', issue: 'invalid_type' }] })
  expect(checkContract('glean.slots', GLEAN_SLOTS, { ...reply, opportunities: reply.opportunities.slice(0, 2) }, 'enforce', {}).ok).toBe(false)
})

test('the Glean reply contract still rejects a missing headline, and accepts any next_step or none', () => {
  const reply = { headline: 'H', summary: 'S', context: 'C', competitive_bullets: [{ lead: 'L', text: 'T' }, { lead: 'L', text: 'T' }], sources_bullets: [{ lead: 'L', text: 'T' }, { lead: 'L', text: 'T' }], why: 'W', opportunities: [0, 1, 2].map(() => ({ signal: 's', opportunity: 'o', workstream: 'w' })), methodology: 'M' }
  const { headline: _h, ...noHeadline } = reply
  expect(checkContract('glean.slots', GLEAN_SLOTS, noHeadline, 'enforce', {})).toEqual({ ok: false, issues: [{ field: 'headline', issue: 'invalid_type' }] })
  for (const next_step of [undefined, '', null, 'x']) expect(checkContract('glean.slots', GLEAN_SLOTS, { ...reply, next_step }, 'enforce', {}).ok).toBe(true)
})

const PULL: PeecPull = {
  project: { id: 'or_a', name: 'Example pitch', status: 'PITCH' },
  roster: [{ id: 'kw_own', name: 'Example Co', is_own: true, domains: ['example.com'] }, { id: 'kw_a', name: 'Alpha', is_own: false, domains: ['alpha.com'] }],
  ownBrand: { id: 'kw_own', name: 'Example Co', is_own: true, domains: ['example.com'] },
  profile: { industry: 'Fintech', markets: ['United States'] },
  requested: { start: '2026-09-09', end: '2026-10-08' }, rangePicked: true,
  window: { start: '2026-10-01', end: '2026-10-08' },
  brands: [
    { brand: { id: 'kw_own', name: 'Example Co' }, visibility: 0.151, share_of_voice: 0.159, position: 3.06 },
    { brand: { id: 'kw_a', name: 'Alpha' }, visibility: 0.261, share_of_voice: 0.225, position: 2.4 },
  ],
  domains: [
    { domain: 'example.com', classification: 'OWN', retrieved_chat_count: 1989, retrieval_count: 3698, retrieved_percentage: 0.2236 },
    { domain: 'alpha.com', classification: 'COMPETITOR', retrieved_chat_count: 1250, retrieval_count: 5902, mentioned_brands: [{ id: 'kw_a' }] },
  ],
  actions: [{ id: 'x', title: 'Give this page an H1 heading', impact: 'HIGH', type: 'SEO_ISSUE', status: 'PENDING' }],
  promptCount: 100, models: ['ChatGPT UI'], warnings: [],
}

test('the stored contracts accept what metrics and slots write today, version 1 and version 2', () => {
  const v2 = buildSnapshotData(PULL, '2026-10-08T15:00:00Z')
  const v2NoProfile = buildSnapshotData({ ...PULL, profile: null }, '2026-10-08T15:00:00Z')
  for (const d of [V1_DATA, v2, v2NoProfile]) expect(checkContract('stored.data', STORED_DATA, JSON.parse(JSON.stringify(d)), 'enforce', {})).toEqual({ ok: true })
  expect(checkContract('stored.slots', STORED_SLOTS, V1_SLOTS, 'enforce', {})).toEqual({ ok: true })
  expect(checkContract('stored.slots', STORED_SLOTS, withDefaults(V1_SLOTS, v2), 'enforce', {})).toEqual({ ok: true })
})
