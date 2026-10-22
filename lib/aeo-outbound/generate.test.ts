import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { PeecClient } from './peec'
import { codeSetPath, generateSnapshot } from './generate'
import { dataSentences } from './sentences'
import type { GleanReply } from './glean'
import { DECISIONS } from './config'
import { SETTINGS_DEFAULTS } from './settings'

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
    : [{ domain: 'example.com', classification: 'OWN', retrieved_chat_count: 5, retrieval_count: 9, usage_rate: 9, retrieved_percentage: 0.2, mentioned_brands: [{ id: 'kw_own' }] }]),
  '/reports/brands': (_u, b) => (b?.dimensions
    ? [{ brand: { id: 'kw_own' }, model_channel: { id: 'openai-0' }, visibility_total: 10 }, { brand: { id: 'kw_own' }, model_channel: { id: 'google-0' }, visibility_total: 0 }]
    : [{ brand: { id: 'kw_own', name: 'Example Co' }, visibility: 0.15, share_of_voice: 0.2, position: 3.1 }, { brand: { id: 'kw_c1', name: 'Rival' }, visibility: 0.3, share_of_voice: 0.8, position: 2 }]),
  '/model-channels': () => [{ id: 'openai-0', description: 'ChatGPT UI' }, { id: 'google-0', description: 'Google AI Overview' }],
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
  const glean = vi.fn(async () => reply('{"headline":5}'))
  const r = await generateSnapshot('or_a', deps(glean))
  expect(glean).toHaveBeenCalledTimes(2)
  expect(r).toMatchObject({ ok: false, error: 'Copy generation failed. Rerun.' })
})
test('grounding-only problems still save as a draft, with notes', async () => {
  const bad = JSON.parse(GOOD); bad.why = 'Visibility rose 42.0% last year.'
  const glean = vi.fn(async (_prompt: string) => reply(JSON.stringify(bad)))
  const r = await generateSnapshot('or_a', deps(glean))
  // Spec v1.1 §19.3: a number in a field Glean wrote is an unchecked_number item, and still worth one retry.
  expect(r.ok && r.notes.map((n) => (typeof n === 'string' ? n : n.text)).join(' ')).toContain('"42.0%": check this number against Peec\'s numbers on the page.')
  expect(glean).toHaveBeenCalledTimes(2)
  expect(String(glean.mock.calls[1][0])).toContain('"42.0%": check this number')
})
test('no second Glean attempt with under 60s left', async () => {
  let t = Date.parse('2026-10-08T12:00:00Z')
  const glean = vi.fn(async () => { t += 230_000; return reply('{}') })
  const r = await generateSnapshot('or_a', { ...deps(glean, () => t), deadline: Date.parse('2026-10-08T12:00:00Z') + 270_000 })
  expect(glean).toHaveBeenCalledTimes(1)
  expect(r).toMatchObject({ ok: false, error: 'Copy generation failed. Rerun.' })
})
test('a searched first reply with under 60s left reports the outside-sources reason', async () => {
  let t = NOW
  const glean = vi.fn(async () => { t += 230_000; return reply(GOOD, true) })
  const r = await generateSnapshot('or_a', { ...deps(glean, () => t), deadline: NOW + 270_000 })
  expect(glean).toHaveBeenCalledTimes(1)
  expect(r).toMatchObject({ ok: false, error: 'Copy generation used outside sources. Rerun.' })
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

const timeoutRoutes: Record<string, Route> = { ...base, '/reports/domains': () => { throw { abort: true } } }
const ADVICE = 'Timed out at step 4. Pick a start and end date, at most 90 days.'

test('a default-range step-4 timeout asks for a picked range, and a picked range keeps the plain message', async () => {
  const mk = () => ({ peec: fakePeec(timeoutRoutes).client, glean: vi.fn(), deadline: NOW + 270_000, now: () => NOW })
  expect(await generateSnapshot('or_a', mk())).toMatchObject({ ok: false, error: ADVICE })
  expect(await generateSnapshot('or_a', mk(), null)).toMatchObject({ ok: false, error: ADVICE })
  expect(await generateSnapshot('or_a', mk(), { start: '2026-09-01', end: '2026-09-07' })).toMatchObject({ ok: false, error: 'Timed out at step 4' })
})

test('a default-range timeout before step 4 keeps the plain message', async () => {
  const r = await generateSnapshot('or_a', { peec: new PeecClient('skc-x', { now: () => 10, deadline: 5 }), glean: vi.fn(), deadline: 5, now: () => 10 })
  expect(r).toMatchObject({ ok: false, error: 'Timed out at step 1' })
})

test('a default-range row cap at step 4 reaches the report as the pick-a-range message', async () => {
  const rows = [1, 2, 3, 4].map((i) => ({ domain: `d${i}.com`, date: '2026-10-05', retrieved_chat_count: 1 }))
  const peec = fakePeec({ ...base, '/reports/domains': (_u, b) => (b?.dimensions ? rows : []) }, { maxRows: 3 }).client
  const r = await generateSnapshot('or_a', { peec, glean: vi.fn(), deadline: NOW + 270_000, now: () => NOW })
  expect(r).toMatchObject({ ok: false, error: 'This project has too much history for one snapshot. Pick a start and end date, at most 90 days.' })
})

test('Q3: a written category of 1 to 80 characters is used; a long, blank or non-string one keeps the code value, with no extra Glean call and no failure', async () => {
  const baseline = vi.fn(async () => reply(GOOD))
  await generateSnapshot('or_a', deps(baseline))
  const used = await generateSnapshot('or_a', deps(vi.fn(async () => reply(JSON.stringify({ ...JSON.parse(GOOD), category: '  Consumer  lending ' })))))
  expect(used.ok && used.slots.category).toBe('Consumer lending')
  for (const category of ['x'.repeat(81), '   ', 42, null]) {
    const glean = vi.fn(async () => reply(JSON.stringify({ ...JSON.parse(GOOD), category })))
    const r = await generateSnapshot('or_a', deps(glean))
    expect(r.ok && r.slots.category).toBe('Fintech')
    expect(glean).toHaveBeenCalledTimes(baseline.mock.calls.length)
  }
})

test('Q7: the fixed next step is written into next_step', async () => {
  const r = await generateSnapshot('or_a', deps(vi.fn(async () => reply(GOOD))))
  expect(r.ok && r.slots.next_step).toBe(DECISIONS.fixedNextStep)
})

test('progress: pull reports steps 1 to 6, then generate reports 9 before the first Glean call (no step 8 since Paul\'s #415 review)', async () => {
  const steps: number[] = []
  const glean = vi.fn(async () => { steps.push(-1); return reply(GOOD) })
  await generateSnapshot('or_a', { ...deps(glean), onStep: (s) => steps.push(s) })
  // GOOD has numbers the fixture's Data block lacks, so a second attempt may follow; only the order up to the first call matters.
  expect(steps.slice(0, 8)).toEqual([1, 2, 3, 4, 5, 6, 9, -1])
})

test('progress: step 10 is reported before a second Glean attempt, and never when the second attempt is skipped (spec v1.1 §16.3)', async () => {
  const steps: number[] = []
  let calls = 0
  const glean = vi.fn(async () => { steps.push(-1); return calls++ === 0 ? reply('not json') : reply(GOOD) })
  await generateSnapshot('or_a', { ...deps(glean), onStep: (s) => steps.push(s) })
  expect(steps.slice(6, 10)).toEqual([9, -1, 10, -1])
  const skipped: number[] = []
  let t = NOW
  const slow = vi.fn(async () => { t += 230_000; skipped.push(-1); return reply('not json') })
  await generateSnapshot('or_a', { ...deps(slow, () => t), onStep: (s) => skipped.push(s) })
  expect(skipped).not.toContain(10)
  expect(skipped.filter((s) => s === -1)).toHaveLength(1)
})

test('a reply that breaks its contract is retried once with the fields named', async () => {
  const glean = vi.fn().mockResolvedValueOnce(reply('{"headline":5}')).mockResolvedValueOnce(reply(GOOD))
  const r = await generateSnapshot('or_a', deps(glean))
  expect(r.ok).toBe(true)
  expect(String(glean.mock.calls[1][0])).toContain('headline: invalid_type')
})

test('every failure carries its code', async () => {
  const run = (routes: Record<string, Route>, range: { start: string; end: string } | null = null, opts: { maxRows?: number } = {}, glean = vi.fn(), project = 'or_a') =>
    generateSnapshot(project, { peec: fakePeec(routes, opts).client, glean, deadline: NOW + 270_000, now: () => NOW }, range)
  const codeOf = async (p: Promise<{ ok: boolean }>) => ((await p) as { code?: string }).code
  expect(await codeOf(run(base, null, {}, vi.fn(), 'or_zzz'))).toBe('no_project')
  expect(await codeOf(run({ ...base, '/brands': () => ROSTER.map((r) => ({ ...r, is_own: true })) }))).toBe('own_brand_count')
  expect(await codeOf(run({ ...base, '/reports/domains': () => [] }, { start: '2026-09-01', end: '2026-09-07' }))).toBe('no_data')
  expect(await codeOf(run({ ...base, '/reports/brands': (_u, b) => (b?.dimensions ? [] : [{ brand: { id: 'kw_c1', name: 'Rival' }, visibility: 0.3 }]) }))).toBe('own_brand_no_row')
  expect(await codeOf(run({ ...base, '/reports/domains': (_u, b) => (b?.dimensions ? [{ domain: 'x.com', date: '2026-10-05', retrieved_chat_count: 1 }] : [{ domain: 'x.com', classification: 'OTHER', retrieved_chat_count: 0, usage_rate: 0, mentioned_brands: [] }]) }))).toBe('zero_retrievals')
  const rows = [1, 2, 3, 4].map((i) => ({ domain: `d${i}.com`, date: '2026-10-05', retrieved_chat_count: 1 }))
  expect(await codeOf(run({ ...base, '/reports/domains': (_u, b) => (b?.dimensions ? rows : []) }, null, { maxRows: 3 }))).toBe('history_too_long')
  expect(await codeOf(run(timeoutRoutes))).toBe('history_too_long')
  expect(await codeOf(run(timeoutRoutes, { start: '2026-09-01', end: '2026-09-07' }))).toBe('timeout')
  expect(await codeOf(run({ ...base, '/brands': () => { throw { status: 404 } } }))).toBe('peec_error')
  const noVisibility = await run({ ...base, '/reports/brands': (_u, b) => (b?.dimensions ? [] : [{ brand: { id: 'kw_own', name: 'Example Co' } }]) })
  expect(noVisibility).toMatchObject({ ok: false, code: 'contract_violation', error: 'peec.brands_report.visibility' })
  expect(await codeOf(run(base, null, {}, vi.fn(async () => reply('{"headline":5}'))))).toBe('copy_failed')
  expect(await codeOf(run(base, null, {}, vi.fn(async () => reply(GOOD, true))))).toBe('copy_outside_sources')
  const clockBroken = await generateSnapshot('or_a', { peec: fakePeec(base).client, glean: vi.fn(), deadline: NOW + 270_000, now: () => { throw new Error('clock') } })
  expect(clockBroken).toMatchObject({ ok: false, code: 'internal', error: 'Generation failed at step 0: clock' })
  expect(await generateSnapshot('or_a', { peec: new PeecClient('skc-x', { now: () => 10, deadline: 5 }), glean: vi.fn(), deadline: 5, now: () => 10 })).toMatchObject({ code: 'timeout', error: 'Timed out at step 1' })
})

test('a Glean next_step of "" or null is ignored when a fixed next step is set, with no extra Glean call', async () => {
  const baseline = vi.fn(async () => reply(GOOD))
  await generateSnapshot('or_a', deps(baseline))
  for (const next_step of ['', null]) {
    const glean = vi.fn(async () => reply(JSON.stringify({ ...JSON.parse(GOOD), next_step })))
    const r = await generateSnapshot('or_a', deps(glean))
    expect(r.ok && r.slots.next_step).toBe(DECISIONS.fixedNextStep)
    expect(glean).toHaveBeenCalledTimes(baseline.mock.calls.length)
  }
})

test('the settings passed in shape the data, the prompt and the fixed next step', async () => {
  const glean = vi.fn(async (_p: string) => reply(GOOD))
  const r = await generateSnapshot('or_a', deps(glean), null, { ...SETTINGS_DEFAULTS, rankAmong: 2, peecOpportunityRows: 0, methodologyStatesPromptsAndModels: false, fixedNextStep: 'Book a working session.' })
  expect(r.ok && r.data.settingsUsed).toEqual({ rankAmong: 2, peecOpportunityRows: 0, methodologyStatesPromptsAndModels: false, fixedNextStep: 'Book a working session.' })
  expect(r.ok && r.slots.next_step).toBe('Book a working session.')
  expect(String(glean.mock.calls[0][0])).not.toContain('Prompts tracked')
})

test('with the default settings, settingsUsed records the fixed next step the row carries', async () => {
  const r = await generateSnapshot('or_a', deps(vi.fn(async () => reply(GOOD))))
  expect(r.ok && r.data.settingsUsed?.fixedNextStep).toBe(DECISIONS.fixedNextStep)
  expect(r.ok && r.slots.next_step).toBe(DECISIONS.fixedNextStep)
})

test('a generated row stores every key: brand, window label and KPIs from its data, page words from the settings', async () => {
  const r = await generateSnapshot('or_a', deps(vi.fn(async () => reply(GOOD))), null, { ...SETTINGS_DEFAULTS, sectionTitles: ['Strengths', 'Gaps'], sidebarWordmark: 'Avenue Z', series: 'AEO Lens Report' })
  if (!r.ok) throw new Error(r.error)
  expect(r.slots.brand).toBe('Example Co')
  expect(r.slots.window_label).toBe(r.data.windowLabel)
  expect(r.slots.kpis).toEqual(r.data.kpis)
  expect(r.slots.page).toMatchObject({ section_1_title: 'Strengths', section_2_title: 'Gaps', sidebar_wordmark: 'Avenue Z', series: 'AEO Lens Report' })
})

test('a flag on a page word Glean cannot fix costs no second attempt, and is still a stored note', async () => {
  const dash = String.fromCharCode(0x2014)
  const baseline = vi.fn(async (_prompt: string) => reply(GOOD))
  await generateSnapshot('or_a', deps(baseline))
  const glean = vi.fn(async (_prompt: string) => reply(GOOD))
  const r = await generateSnapshot('or_a', deps(glean), null, { ...SETTINGS_DEFAULTS, sectionTitles: [`Strengths ${dash} 1`, 'Gaps'] })
  expect(glean).toHaveBeenCalledTimes(baseline.mock.calls.length)
  expect(r.ok && r.notes).toContainEqual({ kind: 'long_dash', path: 'page.section_1_title', text: 'contains a long dash; use a period or comma' })
})

test('A1: a fixed next step with a number in it is a note, not a reason to retry Glean', async () => {
  const grounded = JSON.stringify({ ...JSON.parse(GOOD), headline: 'Example Co trails Rival', summary: 'Example Co has solid visibility.' })
  const baseline = vi.fn(async () => reply(grounded))
  await generateSnapshot('or_a', deps(baseline))
  expect(baseline).toHaveBeenCalledTimes(1)
  const glean = vi.fn(async () => reply(grounded))
  const r = await generateSnapshot('or_a', deps(glean), null, { ...SETTINGS_DEFAULTS, fixedNextStep: 'Book a 30-minute AEO audit with us.' })
  expect(r.ok && r.slots.next_step).toBe('Book a 30-minute AEO audit with us.')
  expect(glean).toHaveBeenCalledTimes(baseline.mock.calls.length)
  expect(r.ok && r.notes.some((n) => typeof n !== 'string' && n.kind === 'number_not_in_data' && n.path === 'next_step' && /"30"/.test(n.text))).toBe(true)
})

// Spec v1.1 §18.7: a worse second Glean attempt never replaces a better first one; a tie takes the second.
const GROUNDED = { ...JSON.parse(GOOD), headline: 'Example Co trails Rival', summary: 'Example Co has solid visibility.' }
// Flags on the fields Glean writes: the code-written sentences carry the same flags in both attempts (spec v1.1 §19.2).
const numberFlags = (r: Awaited<ReturnType<typeof generateSnapshot>>) =>
  r.ok ? r.notes.filter((n) => typeof n !== 'string' && n.kind === 'unchecked_number' && !codeSetPath(n.path ?? '', null)) : []

test('§18.7: attempt 1 with one fixable flag beats attempt 2 with three: attempt 1 copy and its one flag are saved', async () => {
  const first = { ...GROUNDED, why: 'Visibility rose 42.0% last year.' }
  // Code writes the context now (spec v1.1 §19.2), so attempt 2's flags are its headline, summary and why.
  const second = { ...GROUNDED, why: 'Visibility rose 37.0% last year.', summary: 'Example Co has 61.0% reach.', headline: 'Up 19.0% this year' }
  const glean = vi.fn().mockResolvedValueOnce(reply(JSON.stringify(first))).mockResolvedValueOnce(reply(JSON.stringify(second)))
  const r = await generateSnapshot('or_a', deps(glean))
  expect(glean).toHaveBeenCalledTimes(2)
  expect(r.ok && r.slots.why).toBe('Visibility rose 42.0% last year.')
  expect(r.ok && r.slots.summary).toBe('Example Co has solid visibility.')
  const flags = numberFlags(r)
  expect(flags).toHaveLength(1)
  expect(flags[0]).toMatchObject({ path: 'why' })
  expect(JSON.stringify(flags[0])).toContain('42.0%')
  // The same second reply, kept on its own (attempt 1 unreadable), carries three flags.
  const alone = vi.fn().mockResolvedValueOnce(reply('not json')).mockResolvedValueOnce(reply(JSON.stringify(second)))
  expect(numberFlags(await generateSnapshot('or_a', deps(alone)))).toHaveLength(3)
})

test('§18.7: a tie in flag count keeps attempt 2', async () => {
  const first = { ...GROUNDED, why: 'Visibility rose 42.0% last year.' }
  const second = { ...GROUNDED, why: 'Visibility rose 37.0% last year.' }
  const glean = vi.fn().mockResolvedValueOnce(reply(JSON.stringify(first))).mockResolvedValueOnce(reply(JSON.stringify(second)))
  const r = await generateSnapshot('or_a', deps(glean))
  expect(glean).toHaveBeenCalledTimes(2)
  expect(r.ok && r.slots.why).toBe('Visibility rose 37.0% last year.')
  const flags = numberFlags(r)
  expect(flags).toHaveLength(1)
  expect(JSON.stringify(flags[0])).toContain('37.0%')
})

test('spec v1.1 §19.2: the context, both boxes and the methodology are the data sentences, whatever Glean sends', async () => {
  const r = await generateSnapshot('or_a', deps(vi.fn(async () => reply(GOOD))))
  if (!r.ok) throw new Error(r.error)
  const s = dataSentences(r.data)
  expect(r.slots.context).toBe(s.context)
  expect(r.slots.competitive_bullets).toEqual(s.competitive_bullets)
  expect(r.slots.sources_bullets).toEqual(s.sources_bullets)
  expect(r.slots.methodology).toBe(s.methodology)
  expect(r.slots.context).not.toContain('26.1%')
  expect(r.slots.context).toBe('Competitive context: Rival leads at 30% visibility / 80% share of voice, followed by Example Co at 15% / 20%. Example Co ranks last of the two brands tracked.')
})

test('spec v1.1 §19.2: a reply with only the opinion fields makes a draft', async () => {
  const opinion = { headline: 'Example Co trails Rival', summary: 'Example Co trails Rival in AI visibility.', why: 'Why.', opportunities: JSON.parse(GOOD).opportunities }
  const glean = vi.fn(async () => reply(JSON.stringify(opinion)))
  const r = await generateSnapshot('or_a', deps(glean))
  expect(r.ok).toBe(true)
  expect(glean).toHaveBeenCalledTimes(1)
})

test('a project with no competitors gives 1 to 3 bullets per box and a draft', async () => {
  const solo: Record<string, Route> = {
    ...base,
    '/brands': () => [ROSTER[0]],
    '/reports/brands': (_u, b) => (b?.dimensions ? [] : [{ brand: { id: 'kw_own', name: 'Example Co' }, visibility: 0.15, share_of_voice: 1, position: 3.1 }]),
  }
  const r = await generateSnapshot('or_a', { peec: fakePeec(solo).client, glean: vi.fn(async () => reply(GOOD)), deadline: NOW + 270_000, now: () => NOW })
  if (!r.ok) throw new Error(r.error)
  for (const box of [r.slots.competitive_bullets, r.slots.sources_bullets]) expect(box.length >= 1 && box.length <= 3).toBe(true)
  expect(r.slots.context).toBe('No competitors are tracked in this Peec project.')
})

test('codeSetPath: code-written and settings-set paths never ask Glean for another attempt', () => {
  for (const p of ['context', 'methodology', 'competitive_bullets.0.lead', 'sources_bullets.2.text', 'brand', 'window_label', 'market', 'page.series', 'kpis.1.value', 'opportunities.0.signal', 'opportunities.2.workstream']) expect(codeSetPath(p, null), p).toBe(true)
  expect(codeSetPath('next_step', 'Fixed.')).toBe(true)
  for (const p of ['headline', 'summary', 'why', 'category', 'next_step']) expect(codeSetPath(p, null), p).toBe(false)
})

test('pillars (Ryan, round 3): a generated row carries the marker, the code-written pillars and the pillar title, whatever Glean sends', async () => {
  const r = await generateSnapshot('or_a', deps(vi.fn(async () => reply(GOOD))))
  if (!r.ok) throw new Error(r.error)
  expect(r.slots.opportunities_layout).toBe('pillars')
  expect(r.slots.opportunities).toEqual(dataSentences(r.data).opportunities)
  expect(r.slots.opportunities.map((o) => o.workstream)).toEqual(['Earned & Affiliate Media', 'Content and Creative', 'Technical Optimizations'])
  expect(r.slots.page.opps_title).toBe('The Pillars of AI Search')
  const noOpps = JSON.parse(GOOD)
  delete noOpps.opportunities
  const r2 = await generateSnapshot('or_a', deps(vi.fn(async () => reply(JSON.stringify(noOpps)))))
  expect(r2.ok).toBe(true)
})
