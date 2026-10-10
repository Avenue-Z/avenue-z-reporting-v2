import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { PeecClient } from './peec'
import { generateSnapshot } from './generate'
import type { GleanReply } from './glean'

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
const GOOD = JSON.stringify({
  headline: 'Example Co ranks #2 of 2', summary: 'Example Co has 15.1% visibility.', context: 'Rival leads at 26.1%.',
  competitive_bullets: [{ lead: 'Position:', text: 'Ranks #2.' }, { lead: 'Own site:', text: 'Retrieved in 5 answers.' }],
  sources_bullets: [{ lead: 'Gap:', text: 'Trails Rival by 11 points.' }, { lead: 'Mix:', text: 'You leads the mix.' }],
  why: 'Why.', opportunities: [0, 1, 2].map(() => ({ signal: 'Signal', opportunity: 'Explore', workstream: 'Content / AEO' })),
  methodology: 'Peec data for the window, directional.', next_step: 'A full AEO audit.',
})
const reply = (text: string, searched = false): GleanReply => ({ text, searched })
const deps = (glean: ReturnType<typeof vi.fn>, now = () => Date.parse('2026-10-08T12:00:00Z')) => ({ peec: fakePeec(base).client, glean, deadline: NOW + 270_000, now })

test('success: a draft with code-set category and market', async () => {
  const r = await generateSnapshot('or_a', deps(vi.fn(async () => reply(GOOD))))
  expect(r.ok && r.slots.category).toBe('Fintech')
  expect(r.ok && r.slots.market).toBe('United States')
  expect(r.ok && r.brandName).toBe('Example Co')
})
test('a searched reply is retried once; a second searched reply fails', async () => {
  const glean = vi.fn(async () => reply(GOOD, true))
  const r = await generateSnapshot('or_a', deps(glean))
  expect(r).toMatchObject({ ok: false, error: 'Copy generation used outside sources. Rerun.' })
  expect(glean).toHaveBeenCalledTimes(2)
})
test('two shape failures fail', async () => {
  const r = await generateSnapshot('or_a', deps(vi.fn(async () => reply('{"headline":5}'))))
  expect(r).toMatchObject({ ok: false, error: 'Copy generation failed. Rerun.' })
})
test('grounding-only problems still save as a draft, with notes', async () => {
  const bad = JSON.parse(GOOD); bad.why = 'Visibility rose 42.0% last year.'
  const r = await generateSnapshot('or_a', deps(vi.fn(async () => reply(JSON.stringify(bad)))))
  expect(r.ok && r.notes.join(' ')).toContain('"42.0%" is not in the Peec data')
})
test('no second Glean attempt with under 60s left', async () => {
  let t = Date.parse('2026-10-08T12:00:00Z')
  const glean = vi.fn(async () => { t += 230_000; return reply('{}') })
  const r = await generateSnapshot('or_a', { ...deps(glean, () => t), deadline: Date.parse('2026-10-08T12:00:00Z') + 270_000 })
  expect(glean).toHaveBeenCalledTimes(1)
  expect(r.ok).toBe(false)
})
test('a grounding-only first answer survives a broken second answer', async () => {
  const bad = JSON.parse(GOOD); bad.why = 'Visibility rose 42.0% last year.'
  const glean = vi.fn().mockResolvedValueOnce(reply(JSON.stringify(bad))).mockResolvedValueOnce(reply('not json'))
  const r = await generateSnapshot('or_a', deps(glean))
  expect(r.ok && r.slots.why).toBe('Visibility rose 42.0% last year.')
})
test('a grounding-only first answer survives a second answer that times out', async () => {
  const bad = JSON.parse(GOOD); bad.why = 'Visibility rose 42.0% last year.'
  const glean = vi.fn()
    .mockResolvedValueOnce(reply(JSON.stringify(bad)))
    .mockRejectedValueOnce(Object.assign(new Error('aborted'), { name: 'AbortError' }))
  const r = await generateSnapshot('or_a', deps(glean))
  expect(r.ok && r.slots.why).toBe('Visibility rose 42.0% last year.')
})
test('a Glean HTTP error is retried, then reported as a copy failure', async () => {
  const glean = vi.fn(async () => { throw new Error('Glean chat error 500') })
  const r = await generateSnapshot('or_a', deps(glean))
  expect(glean).toHaveBeenCalledTimes(2)
  expect(r).toMatchObject({ ok: false, error: 'Copy generation failed. Rerun.' })
})
test('a deadline already passed fails as a timeout at the step it reached', async () => {
  const r = await generateSnapshot('or_a', { peec: new PeecClient('skc-x', { now: () => 10, deadline: 5 }), glean: vi.fn(), deadline: 5, now: () => 10 })
  expect(r).toMatchObject({ ok: false, error: 'Timed out at step 1' })
})
test('no profile: category and market slots say Needs validation', async () => {
  const peec = fakePeec({ ...base, '/project-profile': () => ({ profile: null }) }).client
  const r = await generateSnapshot('or_a', { peec, glean: vi.fn(async () => reply(GOOD)), deadline: NOW + 270_000, now: () => NOW })
  expect(r.ok && [r.slots.category, r.slots.market]).toEqual(['Needs validation', 'Needs validation'])
})
test("an upstream 5xx body that says 'timed out' keeps its scrubbed reason", async () => {
  const peec = new PeecClient('skc-x', { fetch: (async () => new Response('upstream request timed out', { status: 504 })) as typeof globalThis.fetch, sleep: async () => {} })
  const r = await generateSnapshot('or_a', { peec, glean: vi.fn(), deadline: NOW + 270_000, now: () => NOW })
  expect(!r.ok && r.error).toContain('HTTP 504')
})
test('a Peec failure fails with its reason', async () => {
  const r = await generateSnapshot('or_zzz', deps(vi.fn()))
  expect(r).toMatchObject({ ok: false, brandName: null })
  expect(!r.ok && r.error).toContain('not available to this tool')
})

test('a picked range reaches Peec, and a range with no data fails with the pull reason', async () => {
  const f = fakePeec({ ...base, '/reports/domains': () => [] })
  const r = await generateSnapshot('or_a', { peec: f.client, glean: vi.fn(), deadline: NOW + 270_000, now: () => NOW }, { start: '2026-09-01', end: '2026-09-07' })
  expect(r).toMatchObject({ ok: false, brandName: null })
  expect(!r.ok && r.error).toContain('has any Peec data')
  const sent = f.seen.find((s) => s.path === '/reports/domains')!
  expect(sent.body).toMatchObject({ start_date: '2026-09-01', end_date: '2026-09-07' })
})
