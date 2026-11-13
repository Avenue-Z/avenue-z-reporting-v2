import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AeoInformedInput, AeoInformedResult } from '@/lib/organic-social/aeo-informed'

// cached() is recorded and passed through, so each test sees which cache a call went to and with what arguments.
const { cachedCalls, invoked, pull, afterSpy } = vi.hoisted(() => ({
  cachedCalls: [] as { fn: string; opts: Record<string, unknown> }[],
  invoked: [] as { fn: string; args: unknown[] }[],
  pull: vi.fn(),
  afterSpy: vi.fn(),
}))
// after() is recorded, never run: each test calls the task it was handed, as the platform would once the response has ended (#450).
vi.mock('next/server', async (orig) => ({ ...(await orig<object>()), after: afterSpy }))
vi.mock('@/lib/cache', () => ({
  cached: (_vendor: string, fn: string, impl: (...a: unknown[]) => unknown, opts: Record<string, unknown>) => {
    cachedCalls.push({ fn, opts })
    return (...args: unknown[]) => { invoked.push({ fn, args }); return impl(...args) }
  },
}))
vi.mock('@/lib/organic-social/aeo-informed', async (orig) => ({ ...(await orig<object>()), getAeoInformedSocial: pull }))

import { AeoGateError } from '@/lib/organic-social/aeo-informed'
import { world, input } from '@/lib/organic-social/aeo-informed/test-world'
import { loadAeoTab, toTabResult, cacheTtlFor, AEO_TAB_SELECTOR_VIA } from './load'
import { PeecSelectorError } from '@/lib/organic-social/aeo-informed'

const KEY = 'skc-TEST-KEY-never-logged'
const PROJECT = 'or_TEST_PROJECT_never_logged'
let RESULT: AeoInformedResult
// A real, gate-checked result from the fake Peec server (the module itself is mocked above, so the real adapter comes from importActual).
beforeAll(async () => {
  const actual = await vi.importActual<typeof import('@/lib/organic-social/aeo-informed')>('@/lib/organic-social/aeo-informed')
  RESULT = await actual.getAeoInformedSocial(input(world().reader))
})

const base = {
  slug: 'a-client', projectId: PROJECT, setting: { allTimeFrom: '2026-01-22', selector: 'Organic Social', fourthGraph: 'instagram' as const },
  window: { start: '2026-10-01', end: '2026-10-31' }, asOf: '2026-10-31', min: 2, range: 'month' as const, deadlineMs: 120_000, today: '2026-11-12',
}
beforeEach(() => {
  invoked.length = 0
  afterSpy.mockReset()
  pull.mockReset()
  pull.mockResolvedValue(RESULT)
  vi.stubEnv('PEEC_AI_CUSTOMER_TOKEN', KEY)
})
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); vi.useRealTimers() })

describe('what is cached', () => {
  it('the cached value has no socialsAll and keeps socialsOwn, socialsCompetitor, urlGaps, graphs, totals and meta exactly as the adapter returned them', async () => {
    const r = await loadAeoTab(base)
    expect(r.kind).toBe('ok')
    const result = (r as { result: Record<string, unknown> }).result
    expect(Object.keys(result).sort()).toEqual(['graphs', 'meta', 'socialsCompetitor', 'socialsOwn', 'totals', 'urlGaps'])
    expect(result).toEqual(toTabResult(RESULT))
    expect(toTabResult(RESULT)).toEqual({ socialsOwn: RESULT.socialsOwn, socialsCompetitor: RESULT.socialsCompetitor, urlGaps: RESULT.urlGaps, graphs: RESULT.graphs, totals: RESULT.totals, meta: RESULT.meta })
  })
  it('two caches: 6 hours for a window that ended before this UTC month, 1 hour for one in this month', async () => {
    expect(cachedCalls.map((c) => [c.fn, c.opts.ttlSeconds, c.opts.healthCritical])).toEqual([['aeoInformedSocial:6h', 21_600, true], ['aeoInformedSocial:1h', 3_600, true]])
    expect(cacheTtlFor('2026-10-31', '2026-11-12')).toBe('6h')
    expect(cacheTtlFor('2026-11-11', '2026-11-12')).toBe('1h')
    expect(cacheTtlFor('2026-10-31', '2026-11-01')).toBe('6h')
    await loadAeoTab(base)
    await loadAeoTab({ ...base, window: { start: '2026-11-01', end: '2026-11-11' }, asOf: '2026-11-11' })
    expect(invoked.map((i) => i.fn)).toEqual(['aeoInformedSocial:6h', 'aeoInformedSocial:1h'])
  })
  it('the cached call\'s arguments never contain the API key, and hold every input that changes the answer', async () => {
    await loadAeoTab(base)
    expect(JSON.stringify(invoked[0].args)).not.toContain(KEY)
    expect(invoked[0].args).toEqual([{ slug: 'a-client', range: 'month', projectId: PROJECT, selector: 'Organic Social', window: base.window, asOf: '2026-10-31', min: 2, fourthGraph: 'instagram' }])
  })
  it('a different min or fourth graph is a different cache argument list', async () => {
    await loadAeoTab(base)
    await loadAeoTab({ ...base, min: 3 })
    await loadAeoTab({ ...base, setting: { ...base.setting, fourthGraph: 'tiktok' } })
    const keys = invoked.map((i) => JSON.stringify(i.args))
    expect(new Set(keys).size).toBe(3)
  })
  it('the adapter gets the key from the environment, the window for both tables, the four graphs for the fourth graph, and its own 240 s budget', async () => {
    await loadAeoTab({ ...base, setting: { ...base.setting, fourthGraph: 'tiktok', selector: 'Social' } })
    const call = pull.mock.calls[0][0] as AeoInformedInput
    expect(call).toMatchObject({ apiKey: KEY, projectId: PROJECT, asOf: '2026-10-31', minCompetitors: 2, fourthGraph: 'tiktok', deadlineMs: 240_000, selector: { name: 'Social', via: 'tag' } })
    expect(call.views.socials).toEqual(base.window)
    expect(call.views.gaps).toEqual(base.window)
    expect(call.views.graphs).toEqual({ used_as_source_all: { from: '2026-10-01', weeks: 5 }, citations_all: { from: '2026-10-01', weeks: 5 }, citations_linkedin: { from: '2026-10-01', weeks: 5 }, citations_tiktok: { from: '2026-10-01', weeks: 5 } })
  })
  // Spec 2026-11-13 (C1, C4): the tab filters on Jasmine's source tag, through one constant, and the caches start over (v2).
  it('the tab filters on the source tag, through the one constant the lock key also uses', async () => {
    expect(AEO_TAB_SELECTOR_VIA).toBe('tag')
    await loadAeoTab(base)
    expect((pull.mock.calls[0][0] as AeoInformedInput).selector).toEqual({ name: 'Organic Social', via: AEO_TAB_SELECTOR_VIA })
  })
  it('both live caches are version v2, so an answer cached before the tag change is never served', () => {
    for (const fn of ['aeoInformedSocial:6h', 'aeoInformedSocial:1h']) expect(cachedCalls.find((c) => c.fn === fn)?.opts.version).toBe('v2')
  })
  it('only MoM asks the adapter to compare: YTD and All time show no change, so nothing before their window is pulled (issue 451)', async () => {
    for (const [range, compare] of [['month', true], ['ytd', false], ['all', false]] as const) {
      pull.mockClear()
      await loadAeoTab({ ...base, range })
      expect((pull.mock.calls[0][0] as AeoInformedInput).compare).toBe(compare)
    }
  })
  it('a stored value over 1.5 MB logs a warning naming the slug, range, min and its size in KB, never the project or the key', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const big = { ...RESULT, urlGaps: Array.from({ length: 4000 }, (_, i) => ({ ...RESULT.urlGaps[0], url: `https://example.com/${'x'.repeat(300)}/${i}` })) }
    pull.mockResolvedValue(big)
    await loadAeoTab({ ...base, range: 'ytd' })
    expect(warn).toHaveBeenCalledTimes(1)
    const line = String(warn.mock.calls[0][0])
    expect(line).toMatch(/^\[aeo-informed\] result near the 2 MB cache limit slug=a-client range=ytd min=2 size_kb=\d+$/)
    expect(line).not.toContain(PROJECT)
    expect(line).not.toContain(KEY)
    warn.mockClear()
    pull.mockResolvedValue(RESULT)
    await loadAeoTab(base)
    expect(warn).not.toHaveBeenCalled()
  })
})

// #450 (Paul, PR 444): once the timeout card ends the response, only work registered with after() is sure to keep running on Vercel.
describe('a pull that loses its deadline is kept alive with after()', () => {
  const timedOut = async (deadlineMs = 30_000) => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const p = loadAeoTab({ ...base, deadlineMs })
    await vi.advanceTimersByTimeAsync(deadlineMs)
    return p
  }
  it('hands the losing pull to after(), and the task it hands over settles when the pull does', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    let land!: (r: AeoInformedResult) => void
    pull.mockImplementation(() => new Promise((res) => { land = res }))
    expect(await timedOut()).toEqual({ kind: 'error', reason: 'timeout' })
    expect(afterSpy).toHaveBeenCalledTimes(1)
    let settled = false
    const task = (afterSpy.mock.calls[0][0] as () => Promise<unknown>)().then(() => { settled = true })
    await Promise.resolve()
    expect(settled).toBe(false)
    land(RESULT)
    await task
    expect(settled).toBe(true)
  })
  it('the task never rejects, so Next never logs the pull\'s error, whose message can name the project', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    let fail!: (e: Error) => void
    pull.mockImplementation(() => new Promise((_, rej) => { fail = rej }))
    await timedOut()
    const task = (afterSpy.mock.calls[0][0] as () => Promise<unknown>)()
    fail(new Error(`Peec said no for ${PROJECT}`))
    await expect(task).resolves.toBeUndefined()
  })
  it('a pull that finishes in time is never handed to after()', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    expect((await loadAeoTab(base)).kind).toBe('ok')
    expect(afterSpy).not.toHaveBeenCalled()
  })
  it('outside a request, where after() throws, the viewer still gets the timeout card', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    afterSpy.mockImplementation(() => { throw new Error('`after` was called outside a request scope.') })
    pull.mockImplementation(() => new Promise(() => {}))
    expect(await timedOut()).toEqual({ kind: 'error', reason: 'timeout' })
  })
})

describe('what the section gets on a failure', () => {
  const gateError = (codes: string[]) => new AeoGateError({ rulesChecked: 1, errors: codes.map((code) => ({ code, severity: 'error' as const, where: 'x', message: 'm' })), warnings: [] })
  it('AeoGateError with an error coded view.no-chats gives kind no-chats, and logs nothing', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    pull.mockRejectedValue(gateError(['view.no-chats', 'socials-all.retrieved-pct']))
    expect(await loadAeoTab(base)).toEqual({ kind: 'no-chats' })
    expect(err).not.toHaveBeenCalled()
  })
  it('a pull slower than deadlineMs gives kind error, reason timeout', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    pull.mockImplementation(() => new Promise(() => {}))
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const p = loadAeoTab({ ...base, deadlineMs: 30_000 })
    await vi.advanceTimersByTimeAsync(30_000)
    expect(await p).toEqual({ kind: 'error', reason: 'timeout' })
    expect(String(err.mock.calls[0][0])).toBe('[aeo-informed] load failed slug=a-client range=month min=2 error=AeoDeadlineError')
  })
  it('a pull that finishes first is returned and its timer is cleared', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    expect((await loadAeoTab(base)).kind).toBe('ok')
    expect(vi.getTimerCount()).toBe(0)
  })
  it('any other throw gives kind error, reason error, and the log line names slug, range, min and the error name only', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const boom = new Error(`Peec said no for ${PROJECT} with ${KEY}`)
    boom.name = 'PeecHttpError'
    pull.mockRejectedValue(boom)
    expect(await loadAeoTab({ ...base, range: 'all', min: 4 })).toEqual({ kind: 'error', reason: 'error' })
    expect(err).toHaveBeenCalledTimes(1)
    const line = String(err.mock.calls[0][0])
    expect(line).toBe('[aeo-informed] load failed slug=a-client range=all min=4 error=PeecHttpError')
    expect(err.mock.calls[0].length).toBe(1)
  })
  it('a missing or duplicated source tag is the error card and one log line naming PeecSelectorError, never a number', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    pull.mockRejectedValue(new PeecSelectorError('expected exactly one source tag named "Organic Social", found 2'))
    expect(await loadAeoTab(base)).toEqual({ kind: 'error', reason: 'error' })
    expect(String(err.mock.calls[0][0])).toBe('[aeo-informed] load failed slug=a-client range=month min=2 error=PeecSelectorError')
  })
  it('a gate error without view.no-chats is an error, and the log names the rule codes', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    pull.mockRejectedValue(gateError(['totals.recount', 'graphs.complete']))
    expect(await loadAeoTab(base)).toEqual({ kind: 'error', reason: 'error' })
    expect(String(err.mock.calls[0][0])).toBe('[aeo-informed] load failed slug=a-client range=month min=2 error=AeoGateError codes=totals.recount,graphs.complete')
  })
  it('missing PEEC_AI_CUSTOMER_TOKEN gives kind error and a log line, and calls nothing', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubEnv('PEEC_AI_CUSTOMER_TOKEN', '')
    expect(await loadAeoTab(base)).toEqual({ kind: 'error', reason: 'error' })
    expect(pull).not.toHaveBeenCalled()
    expect(invoked).toEqual([])
    expect(String(err.mock.calls[0][0])).toBe('[aeo-informed] load failed slug=a-client range=month min=2 error=PeecKeyMissing')
  })
})
