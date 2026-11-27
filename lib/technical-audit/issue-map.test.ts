import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/cache', () => ({ cached: (_v: string, _f: string, impl: unknown) => impl }))
vi.mock('./google', () => ({ googleToken: vi.fn(async () => 'tok') }))

import { loadIssueMap, parseIssueMapCsv } from './issue-map'
import { ISSUE_MAP_FALLBACK } from './issue-map-fallback'
import { googleToken } from './google'

const HEADER = ['source', 'native_issue_name', 'canonical_issue_key', 'canonical_issue_name', 'reviewed']

describe('loadIssueMap', () => {
  beforeEach(() => { vi.stubEnv('TECH_AUDIT_ISSUE_MAP_SHEET_ID', 'sheet123'); vi.spyOn(console, 'error').mockImplementation(() => {}) })
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

  it('falls back to the built-in list when the Sheet fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('boom') }))
    const map = await loadIssueMap()
    expect(map.get('ahrefs:4XX page')?.key).toBe('broken-internal-4xx')
    expect(map.get('gsc_indexing:Not found (404)')?.key).toBe('broken-internal-4xx')
    expect(map.get('sf:Internal Client Error (4xx)')?.key).toBe('broken-internal-4xx')
  })

  it('falls back when the Sheet returns a non-OK status or the id is unset', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('no', { status: 403 })))
    expect((await loadIssueMap()).size).toBeGreaterThan(0)
    vi.unstubAllEnvs()
    expect((await loadIssueMap()).size).toBeGreaterThan(0)
  })

  it('falls back when the Sheet parses to zero valid rows (empty, or every row malformed)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    for (const values of [[HEADER], [HEADER, ['nope', 'A', 'k', 'N', 'TRUE'], ['ahrefs', '', 'k', 'N', 'TRUE']]]) {
      vi.stubGlobal('fetch', vi.fn(async () => Response.json({ values })))
      const map = await loadIssueMap()
      expect(map.get('ahrefs:4XX page')?.key).toBe('broken-internal-4xx')
      expect(map.size).toBe(ISSUE_MAP_FALLBACK.length)
    }
  })

  it('never logs raw Google auth error text (it can echo the service-account key)', async () => {
    vi.mocked(googleToken).mockRejectedValueOnce(new SyntaxError('Unexpected token } in JSON at position 1: "private_key": "-----BEGIN'))
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const map = await loadIssueMap()
    expect(map.size).toBe(ISSUE_MAP_FALLBACK.length)
    const logged = JSON.stringify([vi.mocked(console.error).mock.calls, warn.mock.calls, log.mock.calls])
    expect(logged).not.toContain('private_key')
    expect(logged).not.toContain('Unexpected token')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('reads the Sheet rows when available and never logs the token', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ values: [
      ['source', 'native_issue_name', 'canonical_issue_key', 'canonical_issue_name', 'reviewed'],
      ['ahrefs', 'Foo', 'foo-key', 'Foo issue', 'TRUE'],
    ] })))
    const map = await loadIssueMap()
    expect(map.get('ahrefs:Foo')).toEqual({ key: 'foo-key', name: 'Foo issue' })
    expect(map.size).toBe(1)
  })
})

describe('ISSUE_MAP_FALLBACK', () => {
  it('carries the full seed (183 rows) plus the earlier Screaming Frog rows, base names only, no duplicates', () => {
    const keys = ISSUE_MAP_FALLBACK.map((r) => `${r.source}:${r.native}`)
    expect(new Set(keys).size).toBe(keys.length)
    expect(keys.length).toBeGreaterThanOrEqual(183 + 6)
    expect(keys).toEqual(expect.arrayContaining(['ahrefs:302 redirect', 'gsc_indexing:Soft 404', 'sf:Internal Client Error (4xx)', 'ahrefs:4XX page']))
    expect(ISSUE_MAP_FALLBACK.filter((r) => /^(ahrefs|sf|gsc_indexing|gsc_cwv):/.test(r.key))).toEqual([])
    expect(keys.filter((k) => / \((not indexable|desktop|mobile)\)$/i.test(k))).toEqual([])
  })
})

describe('parseIssueMapCsv / rows', () => {
  it('skips a canonical key shaped like source:native and counts it as malformed', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const map = parseIssueMapCsv([
      ['source', 'native_issue_name', 'canonical_issue_key', 'canonical_issue_name', 'reviewed'],
      ['ahrefs', 'X', 'sf:Y', 'Bad', ''],
      ['sf', 'Y', 'gsc_cwv:Z', 'Bad', ''],
      ['ahrefs', 'W', 'fine-key', 'Fine', ''],
    ])
    expect([...map.keys()]).toEqual(['ahrefs:W'])
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('skipped 2 malformed'))
    warn.mockRestore()
  })

  it('skips malformed rows, bad sources and keeps the first of duplicate mappings', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const map = parseIssueMapCsv([
      ['source', 'native_issue_name', 'canonical_issue_key', 'canonical_issue_name', 'reviewed'],
      ['ahrefs', 'A', 'k1', 'Name 1', 'TRUE'],
      ['ahrefs', 'A', 'k2', 'Name 2', 'TRUE'],
      ['nope', 'B', 'k3', 'Name 3', 'TRUE'],
      ['sf', '', 'k4', 'Name 4', 'TRUE'],
      ['sf'],
      [],
    ])
    expect([...map.keys()]).toEqual(['ahrefs:A'])
    expect(map.get('ahrefs:A')?.key).toBe('k1')
    warn.mockRestore()
  })

  it('throws when required headers are missing', () => {
    expect(() => parseIssueMapCsv([['a', 'b']])).toThrow()
  })
})
