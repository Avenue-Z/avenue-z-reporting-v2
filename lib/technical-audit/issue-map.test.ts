import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/cache', () => ({ cached: (_v: string, _f: string, impl: unknown) => impl }))
vi.mock('./google', () => ({ googleToken: vi.fn(async () => 'tok') }))

import { loadIssueMap, parseIssueMapCsv } from './issue-map'

describe('loadIssueMap', () => {
  beforeEach(() => { vi.stubEnv('TECH_AUDIT_ISSUE_MAP_SHEET_ID', 'sheet123'); vi.spyOn(console, 'error').mockImplementation(() => {}) })
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

  it('falls back to the fixture when the Sheet fetch throws', async () => {
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

describe('parseIssueMapCsv / rows', () => {
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
