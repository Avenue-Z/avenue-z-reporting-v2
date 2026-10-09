import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { PeecClient } from './peec'
import { listProjects, pullSnapshot } from './pull'

// The client logs each retry; keep the file quiet.
beforeEach(() => { vi.spyOn(console, 'warn').mockImplementation(() => {}) })
afterEach(() => { vi.restoreAllMocks() })

type Route = (url: URL, body: Record<string, unknown> | null) => unknown
function fakePeec(routes: Record<string, Route>, opts: { deadline?: number; now?: () => number } = {}) {
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
  expect(pull.requested).toEqual({ start: '2026-09-09', end: '2026-10-08' })
  const discovery = seen.find((s) => s.path === '/reports/domains' && s.body?.dimensions)!
  expect(discovery.body).toMatchObject({ start_date: '2026-09-09', end_date: '2026-10-08' })
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
  const zero = fakePeec({ ...base, '/reports/domains': (_u, b) => (b?.dimensions ? [{ domain: 'x.com', date: '2026-10-05', retrieved_chat_count: 1 }] : [{ domain: 'x.com', retrieved_chat_count: 0 }]) })
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
  expect(seen.find((s) => s.path === '/reports/domains' && s.body?.dimensions)!.body).toMatchObject({ start_date: '2026-09-09', end_date: '2026-10-08' })
})

test('a failing prompt count is non-fatal: null and a warning', async () => {
  const { client } = fakePeec({ ...base, '/prompts': () => { throw { status: 404 } } })
  const pull = await pullSnapshot(client, 'or_a', NOW)
  expect(pull.promptCount).toBeNull()
  expect(pull.warnings).toContain("Peec's prompt count could not be loaded, so the methodology leaves it out.")
})

test('a deadline or timeout in an optional call propagates instead of becoming a warning', async () => {
  const now = () => (seen.some((s) => s.path === '/actions/list') ? 100 : 0)
  const { client, seen } = fakePeec(base, { deadline: 50, now })
  await expect(pullSnapshot(client, 'or_a', NOW)).rejects.toThrow(/\/prompts: deadline reached$/)
  const t = fakePeec({ ...base, '/actions/list': () => { throw { abort: true } } })
  await expect(pullSnapshot(t.client, 'or_a', NOW)).rejects.toThrow(/\/actions\/list: timed out after \d+ms$/)
  const p = fakePeec({ ...base, '/prompts': () => { throw { abort: true } } })
  await expect(pullSnapshot(p.client, 'or_a', NOW)).rejects.toThrow(/\/prompts: timed out after \d+ms$/)
})

test('a deadline or timeout on the model names propagates; any other failure gives the ids and a warning', async () => {
  const now = () => (seen.filter((s) => (s.body?.dimensions as string[] | undefined)?.includes('model_channel_id')).length >= 2 ? 100 : 0)
  const { client, seen } = fakePeec(base, { deadline: 50, now })
  await expect(pullSnapshot(client, 'or_a', NOW)).rejects.toThrow(/\/model-channels: deadline reached$/)
  const t = fakePeec({ ...base, '/model-channels': () => { throw { abort: true } } })
  await expect(pullSnapshot(t.client, 'or_a', NOW)).rejects.toThrow(/\/model-channels: timed out after \d+ms$/)
  const f = fakePeec({ ...base, '/model-channels': () => { throw { status: 500 } } })
  const pull = await pullSnapshot(f.client, 'or_a', NOW)
  expect(pull.models).toEqual(['openai-0'])
  expect(pull.warnings).toContain("Peec's model names could not be loaded, so models are shown by id.")
})

test('a failing by-model breakdown is non-fatal: no models and a warning; a timeout there propagates', async () => {
  const dimBrands = base['/reports/brands']
  const fail: Route = (u, b) => { if (b?.dimensions) throw { status: 500 }; return dimBrands(u, b) }
  const { client } = fakePeec({ ...base, '/reports/brands': fail })
  const pull = await pullSnapshot(client, 'or_a', NOW)
  expect(pull.models).toEqual([])
  expect(pull.warnings).toContain("Peec's model breakdown could not be loaded, so the models covered are not listed.")
  const abort: Route = (u, b) => { if (b?.dimensions) throw { abort: true }; return dimBrands(u, b) }
  const t = fakePeec({ ...base, '/reports/brands': abort })
  await expect(pullSnapshot(t.client, 'or_a', NOW)).rejects.toThrow(/\/reports\/brands: timed out after \d+ms$/)
  const dup: Route = (u, b) => (b?.dimensions ? [{ brand: { id: 'kw_own' }, visibility_total: 1 }, { brand: { id: 'kw_own' }, visibility_total: 2 }] : dimBrands(u, b))
  const d = fakePeec({ ...base, '/reports/brands': dup })
  expect((await pullSnapshot(d.client, 'or_a', NOW)).models).toEqual([])
})

test('rangePicked is true only when a range argument was passed', async () => {
  expect((await pullSnapshot(fakePeec(base).client, 'or_a', NOW)).rangePicked).toBe(false)
  expect((await pullSnapshot(fakePeec(base).client, 'or_a', NOW, undefined, null)).rangePicked).toBe(false)
  expect((await pullSnapshot(fakePeec(base).client, 'or_a', NOW, undefined, { start: '2026-10-01', end: '2026-10-07' })).rangePicked).toBe(true)
})
