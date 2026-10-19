import { afterEach, beforeEach, expect, test, vi, type MockInstance } from 'vitest'
import { z } from 'zod'
import { CONTRACT_MODES } from './config'
import { checkContract, GENERATE_BODY, GLEAN_SLOTS, PEEC_CONTRACTS, peecContract, SETTINGS_ROW, SLOTS_BODY } from './contracts'
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
  expect(checkContract('peec.brands_report', SCHEMA, BAD, 'observe')).toEqual({ ok: true })
  expect(info.mock.calls.map((c) => String(c[0]))).toEqual([
    '[aeo-outbound] contract boundary=peec.brands_report field=visibility issue=too_big count=2 mode=observe',
    '[aeo-outbound] contract boundary=peec.brands_report field=visibility issue=invalid_type count=1 mode=observe',
  ])
})

test('warn logs at warn and passes; enforce logs at error and fails with each field and issue', () => {
  expect(checkContract('peec.brands_report', SCHEMA, BAD, 'warn')).toEqual({ ok: true })
  expect(warn).toHaveBeenCalledTimes(2)
  expect(checkContract('peec.brands_report', SCHEMA, BAD, 'enforce')).toEqual({
    ok: false, issues: [{ field: 'visibility', issue: 'too_big' }, { field: 'visibility', issue: 'invalid_type' }],
  })
  expect(error).toHaveBeenCalledTimes(2)
})

test('the mode defaults to the boundary mode in config', () => {
  expect(checkContract('peec.projects', SCHEMA, BAD, undefined)).toEqual({ ok: true })
  expect(checkContract('peec.brands_report', SCHEMA, BAD, undefined).ok).toBe(false)
})

test('a valid value logs nothing', () => {
  expect(checkContract('peec.brands_report', SCHEMA, [{ visibility: 0.5 }], 'enforce')).toEqual({ ok: true })
  expect(lines()).toEqual([])
})

test('no log line ever carries a value', () => {
  for (const mode of ['observe', 'warn', 'enforce'] as const) checkContract('peec.brands_report', z.array(z.looseObject({ name: z.number() })), BAD, mode)
  expect(lines().length).toBeGreaterThan(0)
  for (const l of lines()) expect(l).not.toContain(SECRET)
})

test('spec v1.1 §19.6: there is no off switch: CONTRACT_DISABLED set to anything changes nothing', () => {
  for (const v of ['1', 'true', 'yes']) {
    vi.stubEnv('CONTRACT_DISABLED', v)
    expect(checkContract('peec.brands_report', SCHEMA, BAD, 'enforce').ok).toBe(false)
    expect(() => peecContract('peec.brands_report', [{ brand: { id: 'a', name: 'A' } }])).toThrow('peec.brands_report.visibility')
  }
  vi.unstubAllEnvs()
})

const ROW = { brand: { id: 'kw_a', name: 'Alpha' }, visibility: 0.3, share_of_voice: 0.2, position: 2.1, mention_count: 5 }

test('a brands report row with no visibility fails as contract_violation naming the field (the NaN% path)', () => {
  let err: unknown
  try { peecContract('peec.brands_report', [ROW, { ...ROW, visibility: undefined }]) } catch (e) { err = e }
  expect(err).toBeInstanceOf(PeecError)
  expect((err as PeecError).code).toBe('contract_violation')
  expect((err as PeecError).message).toBe('peec.brands_report.visibility')
})

test('NaN and a proportion above 1 are refused; absent or null share of voice and position pass', () => {
  expect(() => peecContract('peec.brands_report', [{ ...ROW, visibility: Number.NaN }])).toThrow('peec.brands_report.visibility')
  expect(() => peecContract('peec.brands_report', [{ ...ROW, visibility: 1.2 }])).toThrow(PeecError)
  const ok = [{ brand: ROW.brand, visibility: 0 }, { ...ROW, share_of_voice: null, position: null }]
  expect(peecContract('peec.brands_report', ok)).toBe(ok)
})

test('counts are null or non-negative whole numbers; percentages are proportions', () => {
  const r = { domain: 'a.example', classification: 'UGC', retrieved_chat_count: 3, retrieval_count: 4, usage_rate: 4, retrieved_percentage: 0.1, mentioned_brands: [] }
  expect(peecContract('peec.domains_report', [r, { ...r, retrieved_chat_count: null, retrieval_count: undefined, retrieved_percentage: null }])).toHaveLength(2)
  expect(() => peecContract('peec.domains_report', [{ ...r, retrieval_count: -1 }])).toThrow('peec.domains_report.retrieval_count')
  expect(() => peecContract('peec.domains_report', [{ ...r, retrieved_chat_count: 1.5 }])).toThrow('peec.domains_report.retrieved_chat_count')
  expect(() => peecContract('peec.domains_report', [{ ...r, retrieved_percentage: 22.4 }])).toThrow('peec.domains_report.retrieved_percentage')
  expect(() => peecContract('peec.domains_by_date', [{ domain: 'a.example', date: '2026-10-05', retrieved_chat_count: -2 }])).toThrow(PeecError)
  expect(() => peecContract('peec.prompts', { total_count: 2.5 })).toThrow('peec.prompts.total_count')
})

test('spec v1.1 §19.6: the date, classification, mentioned brands and roster fields fail the run naming the field', () => {
  const day = { domain: 'a.example', date: '2026-10-05', retrieved_chat_count: 1 }
  for (const date of ['10/05/2026', 'Oct 5', '', undefined, null]) expect(() => peecContract('peec.domains_by_date', [day, { ...day, date }]), String(date)).toThrow('peec.domains_by_date.date')
  const dom = { domain: 'a.example', classification: 'UGC', retrieved_chat_count: 3, retrieval_count: 4, usage_rate: 4, mentioned_brands: [{ id: 'kw_a' }] }
  for (const classification of [null, undefined, '', 7]) expect(() => peecContract('peec.domains_report', [{ ...dom, classification }]), String(classification)).toThrow('peec.domains_report.classification')
  for (const mentioned_brands of [null, undefined, ['kw_a'], [{ id: 5 }], 'kw_a']) expect(() => peecContract('peec.domains_report', [{ ...dom, mentioned_brands }]), JSON.stringify(mentioned_brands)).toThrow('peec.domains_report.mentioned_brands')
  const brand = { id: 'kw_a', name: 'Alpha', is_own: false, domains: ['alpha.example'] }
  expect(() => peecContract('peec.brands', [{ ...brand, is_own: 'false' }])).toThrow('peec.brands.is_own')
  expect(() => peecContract('peec.brands', [{ ...brand, id: 5 }])).toThrow('peec.brands.id')
  expect(() => peecContract('peec.brands', [{ ...brand, name: null }])).toThrow('peec.brands.name')
  expect(() => peecContract('peec.brands', [{ ...brand, domains: 'alpha.example' }])).toThrow('peec.brands.domains')
  // Final review M2: the names and domains the sentences print are enforced too.
  for (const domain of [null, undefined, '', 7]) expect(() => peecContract('peec.domains_report', [{ ...dom, domain }]), String(domain)).toThrow('peec.domains_report.domain')
  expect(() => peecContract('peec.brands_report', [{ ...ROW, brand: { id: 'kw_a', name: null } }])).toThrow('peec.brands_report.brand.name')
  expect(() => peecContract('peec.brands_report', [{ ...ROW, brand: { id: 5, name: 'Alpha' } }])).toThrow('peec.brands_report.brand.id')
  expect(() => peecContract('peec.brands_report', [{ ...ROW, brand: null }])).toThrow('peec.brands_report.brand')
  let err: unknown
  try { peecContract('peec.domains_report', [{ ...dom, classification: null }]) } catch (e) { err = e }
  expect((err as PeecError).code).toBe('contract_violation')
})

test('spec v1.1 §19.6: the live shapes of 2026-10-14 pass: custom classifications, empty mentioned brands, null or absent roster domains', () => {
  const dom = { domain: 'a.example', classification: 'Vendors & Platforms', retrieved_chat_count: 3, retrieval_count: 4, usage_rate: 4, mentioned_brands: [] }
  expect(peecContract('peec.domains_report', [dom, { ...dom, classification: 'CORPORATE', mentioned_brands: [{ id: 'kw_a' }] }])).toHaveLength(2)
  expect(peecContract('peec.domains_by_date', [{ domain: 'a.example', date: '2026-09-01', retrieved_chat_count: 0 }, { domain: 'b.example', date: '2026-09-01T00:00:00Z', retrieved_chat_count: 2 }])).toHaveLength(2)
  const brand = { id: 'kw_a', name: 'Alpha', is_own: true }
  expect(peecContract('peec.brands', [brand, { ...brand, id: 'kw_b', is_own: false, domains: null }, { ...brand, id: 'kw_c', is_own: false, domains: [] }])).toHaveLength(3)
})

test('fields outside the enforced set are observed only: drift logs one info line and never throws', () => {
  const rows = [{ brand: { id: 'kw_a' }, model_channel: { id: 7 }, visibility_total: 3 }]
  expect(peecContract('peec.brands_by_model', rows)).toBe(rows)
  expect(lines()).toEqual(['[aeo-outbound] contract boundary=peec.brands_by_model field=model_channel.id issue=invalid_type count=1 mode=observe'])
})

test('unused fields pass through untouched: the very same value comes back', () => {
  const rows = [{ ...ROW, extra: { deep: true } }]
  expect(peecContract('peec.brands_report', rows)).toBe(rows)
})

test('every Peec boundary has a contract and starts in the documented mode', () => {
  expect(Object.keys(PEEC_CONTRACTS).sort()).toEqual(Object.keys(CONTRACT_MODES).filter((b) => b.startsWith('peec.')).sort())
  for (const b of ['peec.brands', 'peec.domains_by_date', 'peec.brands_report', 'peec.brands_by_model', 'peec.domains_report', 'peec.prompts'] as const) expect(CONTRACT_MODES[b]).toBe('enforce')
  for (const b of ['peec.projects', 'peec.project_profile', 'peec.model_channels', 'peec.actions'] as const) expect(CONTRACT_MODES[b]).toBe('observe')
})

test('the generate body contract keeps the v1.0 rules: a non-empty projectId, and rerunOf null or a report id', () => {
  const ok = (b: unknown) => checkContract('request.generate', GENERATE_BODY, b, 'enforce').ok
  expect(ok({ projectId: 'or_a' })).toBe(true)
  expect(ok({ projectId: 'or_a', rerunOf: null, start: '2026-09-01', end: '2026-09-30' })).toBe(true)
  expect(ok({ projectId: 'or_a', rerunOf: 'c7d8e0a1-1111-4111-8111-111111111111' })).toBe(true)
  for (const b of [null, 'x', {}, { projectId: '' }, { projectId: 5 }, { projectId: 'or_a', rerunOf: 'nope' }, { projectId: 'or_a', rerunOf: 7 }]) expect(ok(b)).toBe(false)
})
test('the slots body contract: a string path, any value, an integer revision', () => {
  const ok = (b: unknown) => checkContract('request.slots', SLOTS_BODY, b, 'enforce').ok
  expect(ok({ path: 'headline', value: 'x', revision: 3 })).toBe(true)
  for (const b of [null, {}, { path: 5, revision: 3 }, { path: 'headline', value: 'x' }, { path: 'headline', value: 'x', revision: 1.5 }, { path: 'headline', value: 'x', revision: '3' }]) expect(ok(b)).toBe(false)
})
test('the slots body contract: writer and seq are optional, both or neither, a UUID and an integer from 1 to 2^31 - 1 (spec v1.1 18.4)', () => {
  const ok = (b: unknown) => checkContract('request.slots', SLOTS_BODY, b, 'enforce').ok
  const base = { path: 'headline', value: 'x', revision: 3 }
  const W = '0b6f8f9e-3c1a-4d2b-9e8f-1a2b3c4d5e6f'
  expect(ok({ ...base, writer: W, seq: 1 })).toBe(true)
  expect(ok({ ...base, writer: W, seq: 2147483647 })).toBe(true)
  for (const extra of [
    { writer: W }, { seq: 1 }, { writer: 'not-a-uuid', seq: 1 }, { writer: W, seq: 0 }, { writer: W, seq: '1' },
    { writer: W, seq: 1.5 }, { writer: W, seq: 2147483648 }, { writer: null, seq: 1 }, { writer: W, seq: null },
  ]) expect(ok({ ...base, ...extra })).toBe(false)
})
test('the Glean reply contract: every copy key a non-empty string, 2 or 3 bullets, exactly 3 opportunities, next_step optional', () => {
  const reply = { headline: 'H', summary: 'S', context: 'C', competitive_bullets: [{ lead: 'L', text: 'T' }, { lead: 'L', text: 'T' }], sources_bullets: [{ lead: 'L', text: 'T' }, { lead: 'L', text: 'T' }], why: 'W', opportunities: [0, 1, 2].map(() => ({ signal: 's', opportunity: 'o', workstream: 'w' })), methodology: 'M' }
  expect(checkContract('glean.slots', GLEAN_SLOTS, reply, 'enforce').ok).toBe(true)
  expect(checkContract('glean.slots', GLEAN_SLOTS, { ...reply, headline: 5 }, 'enforce')).toEqual({ ok: false, issues: [{ field: 'headline', issue: 'invalid_type' }] })
  expect(checkContract('glean.slots', GLEAN_SLOTS, { ...reply, opportunities: reply.opportunities.slice(0, 2) }, 'enforce').ok).toBe(false)
})

test('the Glean reply contract still rejects a missing headline, and accepts any next_step or none', () => {
  const reply = { headline: 'H', summary: 'S', context: 'C', competitive_bullets: [{ lead: 'L', text: 'T' }, { lead: 'L', text: 'T' }], sources_bullets: [{ lead: 'L', text: 'T' }, { lead: 'L', text: 'T' }], why: 'W', opportunities: [0, 1, 2].map(() => ({ signal: 's', opportunity: 'o', workstream: 'w' })), methodology: 'M' }
  const { headline: _h, ...noHeadline } = reply
  expect(checkContract('glean.slots', GLEAN_SLOTS, noHeadline, 'enforce')).toEqual({ ok: false, issues: [{ field: 'headline', issue: 'invalid_type' }] })
  for (const next_step of [undefined, '', null, 'x']) expect(checkContract('glean.slots', GLEAN_SLOTS, { ...reply, next_step }, 'enforce').ok).toBe(true)
})

const PULL: PeecPull = {
  project: { id: 'or_a', name: 'Example pitch', status: 'PITCH' },
  roster: [{ id: 'kw_own', name: 'Example Co', is_own: true, domains: ['example.com'] }, { id: 'kw_a', name: 'Alpha', is_own: false, domains: ['alpha.com'] }],
  ownBrand: { id: 'kw_own', name: 'Example Co', is_own: true, domains: ['example.com'] },
  profile: { industry: 'Fintech', markets: ['United States'] },
  requested: { start: '2026-09-09', end: '2026-10-08' }, rangePicked: true,
  window: { start: '2026-10-01', end: '2026-10-08' }, pulledDay: '2026-10-09',
  brands: [
    { brand: { id: 'kw_own', name: 'Example Co' }, visibility: 0.151, share_of_voice: 0.159, position: 3.06 },
    { brand: { id: 'kw_a', name: 'Alpha' }, visibility: 0.261, share_of_voice: 0.225, position: 2.4 },
  ],
  domains: [
    { domain: 'example.com', classification: 'OWN', retrieved_chat_count: 1989, retrieval_count: 3698, usage_rate: 3698, retrieved_percentage: 0.2236, mentioned_brands: [] },
    { domain: 'alpha.com', classification: 'COMPETITOR', retrieved_chat_count: 1250, retrieval_count: 5902, usage_rate: 5902, mentioned_brands: [{ id: 'kw_a' }] },
  ],
  actions: [{ id: 'x', title: 'Give this page an H1 heading', impact: 'HIGH', type: 'SEO_ISSUE', status: 'PENDING' }],
  promptCount: 100, models: ['ChatGPT UI'], warnings: [],
}

test('the stored contracts accept what metrics and slots write today, version 1 and version 2', () => {
  const v2 = buildSnapshotData(PULL, '2026-10-08T15:00:00Z')
  const v2NoProfile = buildSnapshotData({ ...PULL, profile: null }, '2026-10-08T15:00:00Z')
  for (const d of [V1_DATA, v2, v2NoProfile]) expect(checkContract('stored.data', STORED_DATA, JSON.parse(JSON.stringify(d)), 'enforce')).toEqual({ ok: true })
  expect(checkContract('stored.slots', STORED_SLOTS, V1_SLOTS, 'enforce')).toEqual({ ok: true })
  expect(checkContract('stored.slots', STORED_SLOTS, withDefaults(V1_SLOTS, v2), 'enforce')).toEqual({ ok: true })
})

test('stored data declares the spec v1.1 §19.5 fields: optional, and refused when the wrong shape', () => {
  const v2 = JSON.parse(JSON.stringify(buildSnapshotData(PULL, '2026-10-08T15:00:00Z')))
  expect([v2.sentences, v2.ownSiteRank, v2.noDataBrands]).toEqual([1, 1, []])
  const { sentences: _s, ownSiteRank: _r, noDataBrands: _n, ...older } = v2
  expect(checkContract('stored.data', STORED_DATA, older, 'enforce')).toEqual({ ok: true })
  expect(checkContract('stored.data', STORED_DATA, { ...v2, ownSiteRank: null }, 'enforce')).toEqual({ ok: true })
  for (const bad of [{ sentences: 0 }, { sentences: 1.5 }, { ownSiteRank: 0 }, { ownSiteRank: 1.5 }, { noDataBrands: [3] }]) {
    expect(checkContract('stored.data', STORED_DATA, { ...v2, ...bad }, 'enforce').ok).toBe(false)
  }
})

test('the settings row refuses a whitespace-only or long-dash name, and accepts ordinary free text', () => {
  const row = { users: [], admins: [], sectionTitles: ['A', 'B'], fixedNextStep: null, rankAmong: null, peecOpportunityRows: 1, methodologyStatesPromptsAndModels: true, sidebarWordmark: 'AEO Lens', series: 'AEO Lens Report', updatedAt: new Date('2026-10-10T09:00:00.000Z') }
  expect(SETTINGS_ROW.safeParse(row).success).toBe(true)
  for (const f of ['sidebarWordmark', 'series'] as const) {
    for (const v of ['   ', '\t', 'A\u2014B', 'A\u2013B']) expect(SETTINGS_ROW.safeParse({ ...row, [f]: v }).success).toBe(false)
    expect(SETTINGS_ROW.safeParse({ ...row, [f]: ' Padded 2 ' }).success).toBe(true)
  }
})

test('a stored row from before method_title still passes the stored slots contract, and one that has it passes too (v1.1 §17.14)', () => {
  const before = { ...V1_SLOTS, page: { series: 'Snapshot', method_nav: 'Methodology' } }
  expect(checkContract('stored.slots', STORED_SLOTS, before, 'enforce')).toEqual({ ok: true })
  expect(checkContract('stored.slots', STORED_SLOTS, { ...before, page: { ...before.page, method_title: 'How we measured' } }, 'enforce')).toEqual({ ok: true })
  expect(checkContract('stored.slots', STORED_SLOTS, { ...before, page: { method_title: 5 } }, 'enforce').ok).toBe(false)
})

test('the stored slots contract reads a box of 1 to 6 bullets, and refuses 0 or 7, in either list (spec v1.1 18.12)', () => {
  const list = (n: number) => Array.from({ length: n }, (_, i) => ({ lead: `L${i}`, text: `T${i}` }))
  for (const key of ['competitive_bullets', 'sources_bullets'] as const) {
    for (const n of [1, 2, 3, 6]) expect(checkContract('stored.slots', STORED_SLOTS, { ...V1_SLOTS, [key]: list(n) }, 'enforce'), `${key} ${n}`).toEqual({ ok: true })
    for (const n of [0, 7]) expect(checkContract('stored.slots', STORED_SLOTS, { ...V1_SLOTS, [key]: list(n) }, 'enforce').ok, `${key} ${n}`).toBe(false)
  }
})

test('spec v1.1 §19.2: the Glean reply needs only headline, summary, why and opportunities; code writes the rest', () => {
  const reply = { headline: 'H', summary: 'S', why: 'W', opportunities: [0, 1, 2].map(() => ({ signal: 's', opportunity: 'o', workstream: 'w' })) }
  expect(checkContract('glean.slots', GLEAN_SLOTS, reply, 'enforce').ok).toBe(true)
  // Old keys Glean may still send are ignored, whatever their shape.
  expect(checkContract('glean.slots', GLEAN_SLOTS, { ...reply, context: 5, competitive_bullets: [], sources_bullets: 'x', methodology: null }, 'enforce').ok).toBe(true)
  for (const key of ['headline', 'summary', 'why', 'opportunities'] as const) {
    const { [key]: _gone, ...missing } = reply
    expect(checkContract('glean.slots', GLEAN_SLOTS, missing, 'enforce').ok, key).toBe(false)
  }
})

// Paul's review of #388 (C2): an environment that still sets the removed switch hears about it, once per process.
test('spec v1.1 §19.6: CONTRACT_DISABLED still set logs one warning that it is ignored, and the checks still run', async () => {
  vi.resetModules()
  vi.stubEnv('CONTRACT_DISABLED', '1')
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const fresh = await import('./contracts')
  const schema = z.object({ n: z.number() })
  expect(fresh.checkContract('peec.brands_report', schema, { n: 'x' }, 'enforce').ok).toBe(false)
  expect(fresh.checkContract('peec.brands_report', schema, { n: 'x' }, 'enforce').ok).toBe(false)
  expect(warn.mock.calls.map((c) => c.join(' ')).filter((l) => l.includes('CONTRACT_DISABLED'))).toEqual([
    '[aeo-outbound] CONTRACT_DISABLED is set but ignored: AEO Outbound contracts have no off switch (spec v1.1 §19.6). Remove it from this environment.',
  ])
  vi.unstubAllEnvs()
  warn.mockRestore()
})

test('2026-10-19 Peec parity: usage_rate is enforced, a non-negative number that may exceed 1', () => {
  const dom = { domain: 'a.example', classification: 'UGC', retrieved_chat_count: 3, retrieval_count: 4, usage_rate: 0.3, mentioned_brands: [] }
  expect(peecContract('peec.domains_report', [dom, { ...dom, domain: 'b.example', usage_rate: 1.4 }, { ...dom, domain: 'c.example', usage_rate: 0 }])).toHaveLength(3)
  for (const usage_rate of [undefined, null, -0.1, '0.3', NaN, Infinity]) {
    expect(() => peecContract('peec.domains_report', [{ ...dom, usage_rate }]), String(usage_rate)).toThrow('peec.domains_report.usage_rate')
  }
})

test('2026-10-19 Peec parity: stored data records the source-mix weighting; absent on older rows, refused when unknown', () => {
  const v2 = JSON.parse(JSON.stringify(buildSnapshotData(PULL, '2026-10-08T15:00:00Z')))
  expect(v2.sourceMixWeight).toBe('usage_rate')
  const { sourceMixWeight: _w, ...older } = v2
  expect(checkContract('stored.data', STORED_DATA, older, 'enforce')).toEqual({ ok: true })
  for (const w of ['retrieval_count', 'retrieved_chat_count', 'usage_rate']) expect(checkContract('stored.data', STORED_DATA, { ...v2, sourceMixWeight: w }, 'enforce')).toEqual({ ok: true })
  for (const w of ['bogus', null, 3]) expect(checkContract('stored.data', STORED_DATA, { ...v2, sourceMixWeight: w }, 'enforce').ok).toBe(false)
})
