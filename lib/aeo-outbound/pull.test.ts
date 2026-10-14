import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { isPeecDeadline, PeecClient, PeecError } from './peec'
import { listProjects, pullSnapshot } from './pull'

// The client logs each retry; keep the file quiet.
beforeEach(() => { vi.spyOn(console, 'warn').mockImplementation(() => {}) })
afterEach(() => { vi.restoreAllMocks() })

type Route = (url: URL, body: Record<string, unknown> | null) => unknown
function fakePeec(routes: Record<string, Route>, opts: { deadline?: number; now?: () => number; maxRows?: number } = {}) {
  const seen: { path: string; body: Record<string, unknown> | null }[] = []
  const fetch = async (u: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(u)); const path = url.pathname.replace('/customer/v1', '')
    const body = init?.body ? JSON.parse(String(init.body)) : null
    seen.push({ path, body })
    const offset = Number(body?.offset ?? url.searchParams.get('offset') ?? 0)
    let all: unknown
    try { all = routes[path]?.(url, body) } catch (e) {
      const t = e as { status?: number; abort?: boolean }
      if (t.abort) throw Object.assign(new Error('aborted'), { name: 'AbortError' })
      return new Response('nope', { status: t.status ?? 400 })
    }
    const data = Array.isArray(all) ? (offset === 0 ? all : []) : all
    return new Response(JSON.stringify(Array.isArray(all) ? { data } : data), { status: 200 })
  }
  return { client: new PeecClient('skc-x', { fetch: fetch as typeof globalThis.fetch, sleep: async () => {}, ...opts }), seen }
}
const PROJECTS = [
  { id: 'or_b', name: 'Beta', status: 'PITCH_ENDED' },
  { id: 'or_a', name: 'Alpha', status: 'PITCH' },
  { id: 'or_c', name: 'Customer', status: 'CUSTOMER' },
]
const ROSTER = [
  { id: 'kw_own', name: 'Example Co', is_own: true, domains: ['example.com'] },
  { id: 'kw_c1', name: 'Rival', is_own: false, domains: ['rival.com'] },
]
const base: Record<string, Route> = {
  '/projects': () => PROJECTS,
  '/brands': () => ROSTER,
  '/project-profile': () => ({ profile: { industry: 'Fintech', target_markets: [{ location: 'United States', market_size: 'National' }] } }),
  '/reports/domains': (_u, b) => (b?.dimensions
    ? [{ domain: 'example.com', date: '2026-10-05', retrieved_chat_count: 3 }, { domain: 'rival.com', date: '2026-10-07', retrieved_chat_count: 0 }, { domain: 'rival.com', date: '2026-10-06', retrieved_chat_count: 2 }]
    : [{ domain: 'example.com', classification: 'OWN', retrieved_chat_count: 5, retrieval_count: 9, retrieved_percentage: 0.2, mentioned_brands: [{ id: 'kw_own' }] }]),
  '/reports/brands': (_u, b) => (b?.dimensions
    ? [{ brand: { id: 'kw_own' }, model_channel: { id: 'openai-0' }, visibility_total: 10 }, { brand: { id: 'kw_own' }, model_channel: { id: 'google-0' }, visibility_total: 0 }]
    : [{ brand: { id: 'kw_own', name: 'Example Co' }, visibility: 0.15, share_of_voice: 0.2, position: 3.1 }, { brand: { id: 'kw_c1', name: 'Rival' }, visibility: 0.3, share_of_voice: 0.8, position: 2 }]),
  '/model-channels': () => [{ id: 'openai-0', description: 'ChatGPT UI' }, { id: 'google-0', description: 'Google AI Overview' }],
  '/actions/list': () => [{ id: 'a1', title: 'Give this page an H1 heading', impact: 'HIGH', type: 'SEO_ISSUE', status: 'PENDING' }, { id: 'a2', title: 'Done thing', impact: 'LOW', type: 'SEO_ISSUE', status: 'COMPLETED' }],
  '/prompts': () => ({ data: [{ id: 'p1' }], total_count: 100 }),
}
const NOW = Date.parse('2026-10-08T12:00:00Z')
// 30s left on every call, so each per-call timer is capped by the deadline (spec 18.10 row 5).
const CAPPED = { now: () => 0, deadline: 30_000 }
// 150s left on every call, so a per-call timer fires at 45s with budget to spare (spec 18.10 row 4).
const ROOMY = { now: () => 0, deadline: 150_000 }

test('lists only pitch projects, sorted by name', async () => {
  const { client } = fakePeec(base)
  expect((await listProjects(client)).map((p) => p.id)).toEqual(['or_a', 'or_b'])
})

test('pulls every step over one window from the days that carry data', async () => {
  const { client, seen } = fakePeec(base)
  const pull = await pullSnapshot(client, 'or_a', NOW)
  expect(pull.window).toEqual({ start: '2026-10-05', end: '2026-10-06' })
  expect(pull.ownBrand.id).toBe('kw_own')
  expect(pull.profile).toEqual({ industry: 'Fintech', markets: ['United States'] })
  expect(pull.models).toEqual(['ChatGPT UI'])
  expect(pull.actions.map((a) => a.title)).toEqual(['Give this page an H1 heading'])
  expect(pull.promptCount).toBe(100)
  expect(pull.requested).toEqual({ start: '2025-09-03', end: '2026-10-08' })
  const discovery = seen.find((s) => s.path === '/reports/domains' && s.body?.dimensions)!
  expect(discovery.body).toMatchObject({ start_date: '2025-09-03', end_date: '2026-10-08' })
  for (const s of seen.filter((s) => s.path.startsWith('/reports/') && !(s.body?.dimensions as string[] | undefined)?.includes('date'))) {
    expect(s.body).toMatchObject({ project_id: 'or_a', start_date: '2026-10-05', end_date: '2026-10-06' })
    expect(s.body).not.toHaveProperty('filters')
  }
})

test('refuses a customer project, an unknown project, and a roster without exactly one own brand', async () => {
  await expect(pullSnapshot(fakePeec(base).client, 'or_c', NOW)).rejects.toThrow('not available to this tool')
  await expect(pullSnapshot(fakePeec(base).client, 'or_zzz', NOW)).rejects.toThrow('not available to this tool')
  const two = fakePeec({ ...base, '/brands': () => ROSTER.map((r) => ({ ...r, is_own: true })) })
  await expect(pullSnapshot(two.client, 'or_a', NOW)).rejects.toThrow('exactly one own brand (found 2)')
})

test('fails loud when no day carries data or retrievals are zero', async () => {
  const noDays = fakePeec({ ...base, '/reports/domains': (_u, b) => (b?.dimensions ? [] : []) })
  await expect(pullSnapshot(noDays.client, 'or_a', NOW)).rejects.toThrow('has any Peec data')
  const zero = fakePeec({ ...base, '/reports/domains': (_u, b) => (b?.dimensions ? [{ domain: 'x.com', date: '2026-10-05', retrieved_chat_count: 1 }] : [{ domain: 'x.com', classification: 'OTHER', retrieved_chat_count: 0, mentioned_brands: [] }]) })
  await expect(pullSnapshot(zero.client, 'or_a', NOW)).rejects.toThrow('zero retrievals')
})

test('a missing profile is null, not an error', async () => {
  const { client } = fakePeec({ ...base, '/project-profile': () => ({ profile: null }) })
  expect((await pullSnapshot(client, 'or_a', NOW)).profile).toBeNull()
})

test('refuses a window where the own brand has no row in the brands report', async () => {
  const { client } = fakePeec({
    ...base,
    '/reports/brands': (_u, b) => (b?.dimensions ? [] : [{ brand: { id: 'kw_c1', name: 'Rival' }, visibility: 0.3, share_of_voice: 0.8, position: 2 }]),
  })
  await expect(pullSnapshot(client, 'or_a', NOW)).rejects.toThrow('The own brand has no row in the Peec brands report for this window')
})

test('a picked range is what step 4 sends, and the no-data message names it', async () => {
  const { client, seen } = fakePeec(base)
  const pull = await pullSnapshot(client, 'or_a', NOW, undefined, { start: '2026-10-01', end: '2026-10-07' })
  expect(pull.requested).toEqual({ start: '2026-10-01', end: '2026-10-07' })
  const discovery = seen.find((s) => s.path === '/reports/domains' && s.body?.dimensions)!
  expect(discovery.body).toMatchObject({ start_date: '2026-10-01', end_date: '2026-10-07' })
  const none = fakePeec({ ...base, '/reports/domains': () => [] })
  await expect(pullSnapshot(none.client, 'or_a', NOW, undefined, { start: '2026-10-01', end: '2026-10-07' }))
    .rejects.toThrow('No day between 2026-10-01 and 2026-10-07 has any Peec data for this project')
})

test('a null range falls back to the default', async () => {
  const { client, seen } = fakePeec(base)
  await pullSnapshot(client, 'or_a', NOW, undefined, null)
  expect(seen.find((s) => s.path === '/reports/domains' && s.body?.dimensions)!.body).toMatchObject({ start_date: '2025-09-03', end_date: '2026-10-08' })
})

test('a failing prompt count is non-fatal: null and a warning', async () => {
  const { client } = fakePeec({ ...base, '/prompts': () => { throw { status: 404 } } })
  const pull = await pullSnapshot(client, 'or_a', NOW)
  expect(pull.promptCount).toBeNull()
  expect(pull.warnings).toContain("Peec's prompt count could not be loaded, so the methodology leaves it out.")
})

test('a deadline, or a timer the deadline capped, in an optional call propagates instead of becoming a warning', async () => {
  const now = () => (seen.some((s) => s.path === '/actions/list') ? 100 : 0)
  const { client, seen } = fakePeec(base, { deadline: 50, now })
  await expect(pullSnapshot(client, 'or_a', NOW)).rejects.toThrow(/\/prompts: deadline reached$/)
  const t = fakePeec({ ...base, '/actions/list': () => { throw { abort: true } } }, CAPPED)
  await expect(pullSnapshot(t.client, 'or_a', NOW)).rejects.toThrow(/\/actions\/list: timed out after 30000ms$/)
  const p = fakePeec({ ...base, '/prompts': () => { throw { abort: true } } }, CAPPED)
  await expect(pullSnapshot(p.client, 'or_a', NOW)).rejects.toThrow(/\/prompts: timed out after 30000ms$/)
})

test('a deadline, or a timer the deadline capped, on the model names propagates; any other failure gives the ids and a warning', async () => {
  const now = () => (seen.filter((s) => (s.body?.dimensions as string[] | undefined)?.includes('model_channel_id')).length >= 2 ? 100 : 0)
  const { client, seen } = fakePeec(base, { deadline: 50, now })
  await expect(pullSnapshot(client, 'or_a', NOW)).rejects.toThrow(/\/model-channels: deadline reached$/)
  const t = fakePeec({ ...base, '/model-channels': () => { throw { abort: true } } }, CAPPED)
  await expect(pullSnapshot(t.client, 'or_a', NOW)).rejects.toThrow(/\/model-channels: timed out after 30000ms$/)
  const f = fakePeec({ ...base, '/model-channels': () => { throw { status: 500 } } })
  const pull = await pullSnapshot(f.client, 'or_a', NOW)
  expect(pull.models).toEqual(['openai-0'])
  expect(pull.warnings).toContain("Peec's model names could not be loaded, so models are shown by id.")
})

test('a failing by-model breakdown is non-fatal: no models and a warning; a timer the deadline capped there propagates', async () => {
  const dimBrands = base['/reports/brands']
  const fail: Route = (u, b) => { if (b?.dimensions) throw { status: 500 }; return dimBrands(u, b) }
  const { client } = fakePeec({ ...base, '/reports/brands': fail })
  const pull = await pullSnapshot(client, 'or_a', NOW)
  expect(pull.models).toEqual([])
  expect(pull.warnings).toContain("Peec's model breakdown could not be loaded, so the models covered are not listed.")
  const abort: Route = (u, b) => { if (b?.dimensions) throw { abort: true }; return dimBrands(u, b) }
  const t = fakePeec({ ...base, '/reports/brands': abort }, CAPPED)
  await expect(pullSnapshot(t.client, 'or_a', NOW)).rejects.toThrow(/\/reports\/brands: timed out after 30000ms$/)
  const dup: Route = (u, b) => (b?.dimensions ? [{ brand: { id: 'kw_own' }, visibility_total: 1 }, { brand: { id: 'kw_own' }, visibility_total: 2 }] : dimBrands(u, b))
  const d = fakePeec({ ...base, '/reports/brands': dup })
  expect((await pullSnapshot(d.client, 'or_a', NOW)).models).toEqual([])
})

test('rangePicked is true only when a range argument was passed', async () => {
  expect((await pullSnapshot(fakePeec(base).client, 'or_a', NOW)).rangePicked).toBe(false)
  expect((await pullSnapshot(fakePeec(base).client, 'or_a', NOW, undefined, null)).rangePicked).toBe(false)
  expect((await pullSnapshot(fakePeec(base).client, 'or_a', NOW, undefined, { start: '2026-10-01', end: '2026-10-07' })).rangePicked).toBe(true)
})

const DISCOVERY_ROWS = Array.from({ length: 4 }, (_, i) => ({ domain: `d${i}.com`, date: '2026-10-05', retrieved_chat_count: 1 }))
const capRoutes: Record<string, Route> = { ...base, '/reports/domains': (_u, b) => (b?.dimensions ? DISCOVERY_ROWS : []) }

test('a default-range row cap at step 4 asks for a picked range', async () => {
  const { client } = fakePeec(capRoutes, { maxRows: 3 })
  const e = await pullSnapshot(client, 'or_a', NOW).catch((x: unknown) => x)
  expect(e).toBeInstanceOf(PeecError)
  expect((e as Error).message).toBe('This project has too much history for one snapshot. Pick a start and end date, at most 90 days.')
  const viaNull = await pullSnapshot(fakePeec(capRoutes, { maxRows: 3 }).client, 'or_a', NOW, undefined, null).catch((x: unknown) => x)
  expect((viaNull as Error).message).toContain('too much history')
})

test('a picked-range row cap at step 4 keeps the client message', async () => {
  const { client } = fakePeec(capRoutes, { maxRows: 3 })
  await expect(pullSnapshot(client, 'or_a', NOW, undefined, { start: '2026-10-01', end: '2026-10-07' })).rejects.toThrow('more than 3 rows')
})

test('a default-range repeated-row or HTTP error at step 4 keeps its message', async () => {
  const repeat = fakePeec({ ...base, '/reports/domains': (_u, b) => (b?.dimensions ? [DISCOVERY_ROWS[0], DISCOVERY_ROWS[0]] : []) })
  await expect(pullSnapshot(repeat.client, 'or_a', NOW)).rejects.toThrow('repeats a row')
  const http = fakePeec({ ...base, '/reports/domains': () => { throw { status: 400 } } })
  await expect(pullSnapshot(http.client, 'or_a', NOW)).rejects.toThrow('HTTP 400')
})

test('a row cap after step 4 keeps the client message even on the default range', async () => {
  const late = fakePeec({ ...base, '/reports/brands': (_u, b) => (b?.dimensions ? [] : [1, 2, 3, 4].map((i) => ({ brand: { id: `kw_${i}`, name: `B${i}` }, visibility: 0.1 }))) }, { maxRows: 3 })
  await expect(pullSnapshot(late.client, 'or_a', NOW)).rejects.toThrow('more than 3 rows')
})

const codeOf = async (p: Promise<unknown>) => { try { await p; return 'resolved' } catch (e) { return (e as PeecError).code } }

test('each guard fails with its code on the error object', async () => {
  expect(await codeOf(pullSnapshot(fakePeec(base).client, 'or_zzz', NOW))).toBe('no_project')
  expect(await codeOf(pullSnapshot(fakePeec({ ...base, '/brands': () => ROSTER.map((r) => ({ ...r, is_own: true })) }).client, 'or_a', NOW))).toBe('own_brand_count')
  expect(await codeOf(pullSnapshot(fakePeec({ ...base, '/reports/domains': () => [] }).client, 'or_a', NOW))).toBe('no_data')
  expect(await codeOf(pullSnapshot(fakePeec({ ...base, '/reports/brands': (_u, b) => (b?.dimensions ? [] : [{ brand: { id: 'kw_c1', name: 'Rival' }, visibility: 0.3, share_of_voice: 0.8, position: 2 }]) }).client, 'or_a', NOW))).toBe('own_brand_no_row')
  const zero = fakePeec({ ...base, '/reports/domains': (_u, b) => (b?.dimensions ? [{ domain: 'x.com', date: '2026-10-05', retrieved_chat_count: 1 }] : [{ domain: 'x.com', classification: 'OTHER', retrieved_chat_count: 0, mentioned_brands: [] }]) })
  expect(await codeOf(pullSnapshot(zero.client, 'or_a', NOW))).toBe('zero_retrievals')
  const rows = [1, 2, 3, 4].map((i) => ({ domain: `d${i}.com`, date: '2026-10-05', retrieved_chat_count: 1 }))
  const cap = fakePeec({ ...base, '/reports/domains': (_u, b) => (b?.dimensions ? rows : []) }, { maxRows: 3 })
  expect(await codeOf(pullSnapshot(cap.client, 'or_a', NOW))).toBe('history_too_long')
  const http = fakePeec({ ...base, '/brands': () => { throw { status: 500 } } })
  expect(await codeOf(pullSnapshot(http.client, 'or_a', NOW))).toBeNull()
})

test('a brands report row missing visibility fails with contract_violation naming the field, never a NaN%', async () => {
  const f = fakePeec({ ...base, '/reports/brands': (_u, b) => (b?.dimensions ? [] : [{ brand: { id: 'kw_own', name: 'Example Co' }, share_of_voice: 0.2 }]) })
  await expect(pullSnapshot(f.client, 'or_a', NOW)).rejects.toMatchObject({ code: 'contract_violation', message: 'peec.brands_report.visibility' })
})

test('a broken contract in an optional call propagates instead of becoming a warning', async () => {
  const f = fakePeec({ ...base, '/prompts': () => ({ total_count: 2.5 }) })
  await expect(pullSnapshot(f.client, 'or_a', NOW)).rejects.toMatchObject({ code: 'contract_violation', message: 'peec.prompts.total_count' })
})

/** /actions/list answering page by page from body.offset, so the fake's offset-0 rule does not apply. */
const actionPages = (all: { id: string; status: string; title: string }[]) => (_u: URL, b: Record<string, unknown> | null) => {
  const offset = Number(b?.offset ?? 0); const limit = Number(b?.limit ?? 50)
  return { data: all.slice(offset, offset + limit) }
}
const act = (i: number, pending: boolean) => ({ id: `a${i}`, status: pending ? 'PENDING' : 'COMPLETED', title: `Action ${i}`, impact: 'HIGH', type: 'SEO_ISSUE' })

test('/actions/list pages until it has 10 pending actions', async () => {
  const all = Array.from({ length: 300 }, (_, i) => act(i, i % 10 === 0))
  const f = fakePeec({ ...base, '/actions/list': actionPages(all) })
  const pull = await pullSnapshot(f.client, 'or_a', NOW)
  expect(pull.actions.map((a) => a.id)).toEqual(['a0', 'a10', 'a20', 'a30', 'a40', 'a50', 'a60', 'a70', 'a80', 'a90'])
  expect(f.seen.filter((s) => s.path === '/actions/list').map((s) => s.body?.offset)).toEqual([0, 50])
})

test('/actions/list stops at 5 pages, and on a short page', async () => {
  const sparse = Array.from({ length: 400 }, (_, i) => act(i, i === 7))
  const f = fakePeec({ ...base, '/actions/list': actionPages(sparse) })
  expect((await pullSnapshot(f.client, 'or_a', NOW)).actions.map((a) => a.id)).toEqual(['a7'])
  expect(f.seen.filter((s) => s.path === '/actions/list').map((s) => s.body?.offset)).toEqual([0, 50, 100, 150, 200])
  const short = fakePeec({ ...base, '/actions/list': actionPages(Array.from({ length: 60 }, (_, i) => act(i, false))) })
  await pullSnapshot(short.client, 'or_a', NOW)
  expect(short.seen.filter((s) => s.path === '/actions/list').map((s) => s.body?.offset)).toEqual([0, 50])
})

// Spec 18.3: each optional call, timing out after 45s with budget left, gives its warning and the pull completes;
// the same timeout with the timer capped by the deadline is rethrown as a deadline.
const dimBrandsRoute = base['/reports/brands']
const OPTIONAL: { name: string; routes: Record<string, Route>; path: string; warning: string }[] = [
  {
    name: 'model breakdown',
    routes: { '/reports/brands': (u, b) => { if (b?.dimensions) throw { abort: true }; return dimBrandsRoute(u, b) } },
    path: '/reports/brands',
    warning: "Peec's model breakdown could not be loaded, so the models covered are not listed.",
  },
  { name: '/model-channels', routes: { '/model-channels': () => { throw { abort: true } } }, path: '/model-channels', warning: "Peec's model names could not be loaded, so models are shown by id." },
  { name: '/actions/list', routes: { '/actions/list': () => { throw { abort: true } } }, path: '/actions/list', warning: 'Peec actions could not be loaded, so opportunities come from the data only.' },
  { name: '/prompts', routes: { '/prompts': () => { throw { abort: true } } }, path: '/prompts', warning: "Peec's prompt count could not be loaded, so the methodology leaves it out." },
]

for (const c of OPTIONAL) {
  test(`${c.name}: a per-call timeout with budget left becomes its warning and the pull completes`, async () => {
    const { client, seen } = fakePeec({ ...base, ...c.routes }, ROOMY)
    const pull = await pullSnapshot(client, 'or_a', NOW)
    expect(pull.warnings).toEqual([c.warning])
    expect(pull.domains.length).toBe(1)
    expect(seen.some((s) => s.path === '/prompts')).toBe(true)
  })

  test(`${c.name}: a timeout whose timer the deadline capped is rethrown as a deadline`, async () => {
    const { client } = fakePeec({ ...base, ...c.routes }, CAPPED)
    const err = await pullSnapshot(client, 'or_a', NOW).catch((e: unknown) => e)
    expect((err as Error).message).toBe(`[PEEC API] ${c.path}: timed out after 30000ms`)
    expect(isPeecDeadline(err)).toBe(true)
  })
}

// A per-call timeout on a later /actions/list page drops the pending actions already read and gives the warning.
// Page 1 is a full page with 3 pending rows: with 10 or more pending the paging stops after page 1 and never asks
// for page 2.
test('/actions/list: a per-call timeout on page 2 with budget left gives no actions and the warning', async () => {
  const page1 = Array.from({ length: 50 }, (_, i) => act(i, i < 3))
  const f = fakePeec({ ...base, '/actions/list': (u, b) => { if (Number(b?.offset ?? 0) > 0) throw { abort: true }; return actionPages(page1)(u, b) } }, ROOMY)
  const pull = await pullSnapshot(f.client, 'or_a', NOW)
  expect(f.seen.filter((s) => s.path === '/actions/list').map((s) => s.body?.offset)).toEqual([0, 50])
  expect(pull.actions).toEqual([])
  expect(pull.warnings).toEqual(['Peec actions could not be loaded, so opportunities come from the data only.'])
  expect(f.seen.some((s) => s.path === '/prompts')).toBe(true)
})

// Paul's review of #388 (C6): the paging key must not crash on a row the contract should name.
test('a brands report row with no brand, or domain rows with no domain, fail as contract_violation naming the field', async () => {
  const own = { brand: { id: 'kw_own', name: 'Example Co' }, visibility: 0.2, share_of_voice: 0.2 }
  const b = fakePeec({ ...base, '/reports/brands': (_u, x) => (x?.dimensions ? [] : [own, { visibility: 0.1, share_of_voice: 0.1 }]) })
  await expect(pullSnapshot(b.client, 'or_a', NOW)).rejects.toMatchObject({ code: 'contract_violation', message: 'peec.brands_report.brand' })
  const noDomain = { classification: 'OTHER', retrieved_chat_count: 3, retrieval_count: 3, mentioned_brands: [] }
  const d = fakePeec({ ...base, '/reports/domains': (_u, x) => (x?.dimensions ? [{ domain: 'x.com', date: '2026-10-05', retrieved_chat_count: 1 }] : [noDomain, noDomain]) })
  await expect(pullSnapshot(d.client, 'or_a', NOW)).rejects.toMatchObject({ code: 'contract_violation', message: 'peec.domains_report.domain' })
})
