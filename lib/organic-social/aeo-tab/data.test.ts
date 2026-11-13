import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AeoInformedResult } from '@/lib/organic-social/aeo-informed'

// The lock store, the adapter and the live loader are replaced; the lock rules (lock-day.ts) and the shared helpers in load.ts are real.
const { readLock, writeLock, capture, live, afterSpy } = vi.hoisted(() => ({
  readLock: vi.fn(), writeLock: vi.fn(), capture: vi.fn(), live: vi.fn(), afterSpy: vi.fn(),
}))
// after() is recorded, never run: the test runs the task it was handed, as the platform would once the response has ended (#450).
vi.mock('next/server', async (orig) => ({ ...(await orig<object>()), after: afterSpy }))
vi.mock('@/lib/organic-social/response-lock-store', () => ({ readLock, writeLock }))
vi.mock('@/lib/organic-social/aeo-informed', async (orig) => ({ ...(await orig<object>()), getAeoInformedSocial: capture }))
vi.mock('./load', async (orig) => ({ ...(await orig<object>()), loadAeoTab: live }))

import { AeoGateError } from '@/lib/organic-social/aeo-informed'
import { world, input } from '@/lib/organic-social/aeo-informed/test-world'
import { toTabResult } from './load'
import { getAeoTabData, aeoLockKey } from './data'

const PROJECT = 'or_TEST_PROJECT_never_logged'
let FULL: AeoInformedResult
beforeAll(async () => {
  const actual = await vi.importActual<typeof import('@/lib/organic-social/aeo-informed')>('@/lib/organic-social/aeo-informed')
  FULL = await actual.getAeoInformedSocial(input(world().reader))
})

// September 2026 locks on Monday 2026-10-05 (the default lock day 5); October is in progress on 2026-10-12. firstMonth August.
const LOCKED = { id: 'client-uuid', slug: 'a-client', dashSocialConfig: { brandId: 1, reportingMonths: { firstMonth: '2026-08' } } }
const SEP = { start: '2026-09-01', end: '2026-09-30' }
const base = {
  client: LOCKED, projectId: PROJECT, setting: { allTimeFrom: '2026-01-22', selector: 'Organic Social', fourthGraph: 'instagram' as const },
  window: SEP, asOf: '2026-09-30', min: 2, range: 'month' as const, deadlineMs: 120_000, today: '2026-10-12',
}
const LIVE_OK = { kind: 'ok' as const, result: { live: true } }

beforeEach(() => {
  for (const f of [readLock, writeLock, capture, live, afterSpy]) f.mockReset()
  readLock.mockResolvedValue(null)
  writeLock.mockImplementation(async (_c: string, _k: string, _p: string, response: unknown) => response)
  capture.mockResolvedValue(FULL)
  live.mockResolvedValue(LIVE_OK)
  vi.stubEnv('PEEC_AI_CUSTOMER_TOKEN', 'skc-TEST-KEY')
})
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); vi.useRealTimers() })

describe('which windows lock (the Dash rule, locking-client.ts:79, on the window end)', () => {
  it('a client without reportingMonths never touches the lock store', async () => {
    const r = await getAeoTabData({ ...base, client: { id: 'x', slug: 'b', dashSocialConfig: { brandId: 1 } } })
    expect(r).toEqual({ ...LIVE_OK, locked: false })
    expect(readLock).not.toHaveBeenCalled()
    expect(capture).not.toHaveBeenCalled()
    expect(live).toHaveBeenCalledTimes(1)
  })
  it('a window ending after the last locked day goes through the live loader', async () => {
    await getAeoTabData({ ...base, window: { start: '2026-10-01', end: '2026-10-11' }, asOf: '2026-10-11' })
    expect(readLock).not.toHaveBeenCalled()
    expect(live).toHaveBeenCalledTimes(1)
  })
  it('a window ending before the first locked month goes through the live loader', async () => {
    await getAeoTabData({ ...base, window: { start: '2026-07-01', end: '2026-07-31' }, asOf: '2026-07-31' })
    expect(readLock).not.toHaveBeenCalled()
    expect(live).toHaveBeenCalledTimes(1)
  })
  it('before the lock day, the month just finished is still live', async () => {
    await getAeoTabData({ ...base, today: '2026-10-04' })
    expect(readLock).not.toHaveBeenCalled()
    expect(live).toHaveBeenCalledTimes(1)
  })
  it('a malformed reportingMonths locks nothing, as for Dash', async () => {
    await getAeoTabData({ ...base, client: { ...LOCKED, dashSocialConfig: { brandId: 1, reportingMonths: { firstMonth: 'soon' } } } })
    expect(readLock).not.toHaveBeenCalled()
    expect(live).toHaveBeenCalledTimes(1)
  })
  it('Month, YTD and All time of a settled month all lock, each under its own key, with period_end the month\'s last day', async () => {
    for (const [range, start] of [['month', '2026-09-01'], ['ytd', '2026-01-01'], ['all', '2026-01-22']] as const) {
      expect((await getAeoTabData({ ...base, range, window: { start, end: '2026-09-30' } })).kind).toBe('ok')
    }
    expect(live).not.toHaveBeenCalled()
    expect(new Set(readLock.mock.calls.map((c) => c[1])).size).toBe(3)
    expect(writeLock.mock.calls.map((c) => [c[0], c[2]])).toEqual([['client-uuid', '2026-09-30'], ['client-uuid', '2026-09-30'], ['client-uuid', '2026-09-30']])
  })
})

describe('a locked window', () => {
  it('a lock hit is served without calling Peec, with locked true', async () => {
    const stored = toTabResult(FULL)
    readLock.mockResolvedValue({ response: stored })
    expect(await getAeoTabData(base)).toEqual({ kind: 'ok', result: stored, locked: true })
    expect(capture).not.toHaveBeenCalled()
    expect(writeLock).not.toHaveBeenCalled()
  })
  it('a miss captures from the adapter directly, never through the cache, and writes once: the tab result, no socialsAll', async () => {
    const r = await getAeoTabData(base)
    expect(live).not.toHaveBeenCalled()
    expect(capture).toHaveBeenCalledTimes(1)
    expect(capture.mock.calls[0][0]).toMatchObject({ projectId: PROJECT, asOf: '2026-09-30', minCompetitors: 2, fourthGraph: 'instagram', views: { socials: SEP, gaps: SEP } })
    expect(writeLock).toHaveBeenCalledTimes(1)
    const [clientId, key, periodEnd, stored] = writeLock.mock.calls[0]
    expect([clientId, periodEnd]).toEqual(['client-uuid', '2026-09-30'])
    expect(key).toBe(readLock.mock.calls[0][1])
    expect(stored).toEqual(toTabResult(FULL))
    expect(Object.keys(stored as object)).not.toContain('socialsAll')
    expect(r).toEqual({ kind: 'ok', result: toTabResult(FULL), locked: true })
  })
  it('the completeness check reads the capture\'s socialsAll before it is dropped: an empty own table still locks', async () => {
    capture.mockResolvedValue({ ...FULL, socialsOwn: [] })
    await getAeoTabData(base)
    expect(writeLock).toHaveBeenCalledTimes(1)
  })
  it('a result whose socialsAll is empty is served but not stored, and logs lock skipped (incomplete answer)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    capture.mockResolvedValue({ ...FULL, socialsAll: [], socialsOwn: [], socialsCompetitor: [] })
    const r = await getAeoTabData(base)
    expect(writeLock).not.toHaveBeenCalled()
    expect(r).toMatchObject({ kind: 'ok', locked: false })
    const key = String(readLock.mock.calls[0][1])
    expect(warn.mock.calls.map((c) => c[0])).toContain(`[aeo-informed] lock skipped (incomplete answer) slug=a-client period_end=2026-09-30 key=${key.slice(0, 12)}`)
  })
  it('a no-chats gate error is not stored and gives kind no-chats', async () => {
    capture.mockRejectedValue(new AeoGateError({ rulesChecked: 1, errors: [{ code: 'view.no-chats', severity: 'error', where: 'x', message: 'm' }], warnings: [] }))
    expect(await getAeoTabData(base)).toEqual({ kind: 'no-chats' })
    expect(writeLock).not.toHaveBeenCalled()
  })
  it('a capture after the month\'s lock day logs late lock; one on the lock day does not', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await getAeoTabData(base)
    const key = String(readLock.mock.calls[0][1])
    expect(warn.mock.calls.map((c) => c[0])).toContain(`[aeo-informed] late lock slug=a-client period_end=2026-09-30 key=${key.slice(0, 12)}`)
    warn.mockClear()
    await getAeoTabData({ ...base, today: '2026-10-05' })
    expect(warn.mock.calls.filter((c) => String(c[0]).includes('late lock'))).toEqual([])
  })
  it('a lock store read failure gives kind error and logs it, with no project id, and never falls back to live numbers', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    readLock.mockRejectedValue(new Error(`neon down ${PROJECT}`))
    expect(await getAeoTabData(base)).toEqual({ kind: 'error', reason: 'error' })
    expect(capture).not.toHaveBeenCalled()
    expect(live).not.toHaveBeenCalled()
    const line = String(err.mock.calls[0][0])
    expect(line).toMatch(/^\[aeo-informed\] lock store read failed slug=a-client period_end=2026-09-30 key=[0-9a-f]{12}$/)
    expect(line).not.toContain(PROJECT)
  })
  it('a lock store write failure gives kind error and logs it', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    writeLock.mockRejectedValue(new Error('neon down'))
    expect(await getAeoTabData(base)).toEqual({ kind: 'error', reason: 'error' })
    expect(String(err.mock.calls[0][0])).toMatch(/^\[aeo-informed\] lock store write failed slug=a-client period_end=2026-09-30 key=[0-9a-f]{12}$/)
  })
  it('two captures racing store one answer and both return it (writeLock returns the stored one)', async () => {
    const first = { ...toTabResult(FULL), stored: 'first' }
    writeLock.mockResolvedValue(first)
    const [a, b] = await Promise.all([getAeoTabData(base), getAeoTabData(base)])
    expect(a).toEqual({ kind: 'ok', result: first, locked: true })
    expect(b).toEqual({ kind: 'ok', result: first, locked: true })
  })
  it('a capture that fails logs lock capture failed with the error name, and gives kind error', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const boom = new Error(`peec 500 for ${PROJECT}`); boom.name = 'PeecHttpError'
    capture.mockRejectedValue(boom)
    expect(await getAeoTabData(base)).toEqual({ kind: 'error', reason: 'error' })
    expect(String(err.mock.calls[0][0])).toMatch(/^\[aeo-informed\] lock capture failed slug=a-client period_end=2026-09-30 key=[0-9a-f]{12} error=PeecHttpError$/)
    expect(String(err.mock.calls[0][0])).not.toContain(PROJECT)
  })
  it('a capture past the deadline is a timeout for the viewer, and still stores its answer when it lands', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    let land!: (r: AeoInformedResult) => void
    capture.mockImplementation(() => new Promise((res) => { land = res }))
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const p = getAeoTabData({ ...base, deadlineMs: 30_000 })
    await vi.advanceTimersByTimeAsync(30_000)
    expect(await p).toEqual({ kind: 'error', reason: 'timeout' })
    expect(writeLock).not.toHaveBeenCalled()
    // The capture and its write are handed to after() (#450), so the platform keeps them running once the response has ended.
    expect(afterSpy).toHaveBeenCalledTimes(1)
    const task = (afterSpy.mock.calls[0][0] as () => Promise<unknown>)()
    land(FULL)
    await task
    expect(writeLock).toHaveBeenCalledTimes(1)
  })
  it('missing PEEC_AI_CUSTOMER_TOKEN on a miss is an error, logged, and nothing is captured', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubEnv('PEEC_AI_CUSTOMER_TOKEN', '')
    expect(await getAeoTabData(base)).toEqual({ kind: 'error', reason: 'error' })
    expect(capture).not.toHaveBeenCalled()
    expect(String(err.mock.calls[0][0])).toMatch(/error=PeecKeyMissing$/)
  })
})

describe('aeoLockKey', () => {
  it('changes with every input that changes the answer', () => {
    const k = { projectId: 'p', selector: 'Organic Social', window: SEP, asOf: '2026-09-30', min: 2, fourthGraph: 'instagram' as const, range: 'month' as const }
    const keys = [k, { ...k, projectId: 'q' }, { ...k, selector: 'Social' }, { ...k, window: { start: '2026-01-01', end: '2026-09-30' } }, { ...k, asOf: '2026-09-29' }, { ...k, min: 3 }, { ...k, fourthGraph: 'tiktok' as const }, { ...k, range: 'ytd' as const }].map(aeoLockKey)
    expect(new Set(keys).size).toBe(keys.length)
    for (const key of keys) expect(key).toMatch(/^[0-9a-f]{64}$/)
  })
  it('in January MoM and YTD are the same window, and still two keys, because only MoM compares (issue 451)', () => {
    const jan = { projectId: 'p', selector: 'Organic Social', window: { start: '2027-01-01', end: '2027-01-31' }, asOf: '2027-01-31', min: 2, fourthGraph: 'instagram' as const }
    expect(aeoLockKey({ ...jan, range: 'month' })).not.toBe(aeoLockKey({ ...jan, range: 'ytd' }))
    expect(aeoLockKey({ ...jan, range: 'ytd' })).toBe(aeoLockKey({ ...jan, range: 'all' }))
  })
  it('a lock capture for YTD asks the adapter not to compare, exactly as the live read does', async () => {
    await getAeoTabData({ ...base, range: 'ytd', window: { start: '2026-01-01', end: '2026-09-30' } })
    expect((capture.mock.calls[0][0] as { compare?: boolean }).compare).toBe(false)
  })
})
