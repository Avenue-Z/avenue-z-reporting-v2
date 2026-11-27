// loadIssueMap through the real cache helper (lib/cache.ts): a successful Sheet read is cached, a failed or empty one
// is not cached as a map and is replayed as a failure for 5 minutes, so an outage costs one timeout per window.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

// unstable_cache stand-in that, like the real one, stores fulfilled results only.
vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...a: unknown[]) => Promise<unknown>) => {
    const store = new Map<string, unknown>()
    return async (...args: unknown[]) => {
      const k = JSON.stringify(args)
      if (store.has(k)) return store.get(k)
      const v = await fn(...args)
      store.set(k, v)
      return v
    }
  },
}))
vi.mock('./google', () => ({ googleToken: vi.fn(async () => 'tok') }))

const HEADER = ['source', 'native_issue_name', 'canonical_issue_key', 'canonical_issue_name', 'reviewed']
const GOOD = { values: [HEADER, ['ahrefs', 'Foo', 'foo-key', 'Foo issue', 'TRUE']] }
let loadIssueMap: typeof import('./issue-map').loadIssueMap

beforeEach(async () => {
  vi.resetModules()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-25T12:00:00Z'))
  vi.stubEnv('TECH_AUDIT_ISSUE_MAP_SHEET_ID', 'sheet123')
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  ;({ loadIssueMap } = await import('./issue-map'))
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('loadIssueMap caching', () => {
  test('a failed Sheet load is remembered for 5 minutes, then retried', async () => {
    const fetchSpy = vi.fn(async () => new Response('no', { status: 503 }))
    vi.stubGlobal('fetch', fetchSpy)
    expect((await loadIssueMap()).get('ahrefs:Foo')).toBeUndefined()
    await loadIssueMap()
    vi.setSystemTime(new Date('2026-11-25T12:04:59Z'))
    await loadIssueMap()
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    fetchSpy.mockImplementation(async () => Response.json(GOOD))
    vi.setSystemTime(new Date('2026-11-25T12:05:01Z'))
    expect((await loadIssueMap()).get('ahrefs:Foo')?.key).toBe('foo-key')
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  test('an empty Sheet is not cached as an empty map', async () => {
    const fetchSpy = vi.fn(async () => Response.json({ values: [HEADER] }))
    vi.stubGlobal('fetch', fetchSpy)
    expect((await loadIssueMap()).get('ahrefs:4XX page')?.key).toBe('broken-internal-4xx')
    fetchSpy.mockImplementation(async () => Response.json(GOOD))
    vi.setSystemTime(new Date('2026-11-25T12:06:00Z'))
    expect((await loadIssueMap()).get('ahrefs:Foo')?.key).toBe('foo-key')
  })

  test('a good Sheet load is served from cache', async () => {
    const fetchSpy = vi.fn(async () => Response.json(GOOD))
    vi.stubGlobal('fetch', fetchSpy)
    await loadIssueMap()
    await loadIssueMap()
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })
})
