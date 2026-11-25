import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import projectsFixture from './__fixtures__/ahrefs-projects.json'
import issuesFixture from './__fixtures__/ahrefs-issues.json'
import { pickAhrefsCrawl, parseAhrefsProjects, parseAhrefsIssues, fetchAhrefs } from './ahrefs'

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers })

describe('pickAhrefsCrawl', () => {
  it('accepts a crawl within 7 days before the snapshot', () => {
    expect(pickAhrefsCrawl('2026-11-11T16:55:16Z', '2026-11-12')).toBe(true)
  })
  it('rejects a crawl older than 7 days', () => {
    expect(pickAhrefsCrawl('2026-11-01T00:00:00Z', '2026-11-12')).toBe(false)
  })
  it('rejects a crawl after the snapshot', () => {
    expect(pickAhrefsCrawl('2026-11-13T00:00:00Z', '2026-11-12')).toBe(false)
  })
  it('rejects unparseable dates', () => {
    expect(pickAhrefsCrawl('garbage', '2026-11-12')).toBe(false)
  })
})

describe('parseAhrefsProjects', () => {
  it('reads the latest crawl and health score', () => {
    expect(parseAhrefsProjects(projectsFixture, '2026-11-18')).toEqual({
      ok: true,
      value: { crawlDate: '2026-11-18T16:42:47Z', healthScore: 61 },
    })
  })
  it('fails when the crawl is outside the window', () => {
    const r = parseAhrefsProjects(projectsFixture, '2026-12-01')
    expect(r).toEqual({ ok: false, reason: 'No completed Ahrefs crawl within 7 days before 2026-12-01' })
  })
  it('fails when the crawl is not Completed', () => {
    const j = { healthscores: [{ ...projectsFixture.healthscores[0], status: 'Failed' }] }
    expect(parseAhrefsProjects(j, '2026-11-18').ok).toBe(false)
  })
  it.each([null, {}, { healthscores: [] }, { healthscores: [null] }, { healthscores: [{ status: 'Completed', date: '2026-11-18T00:00:00Z', health_score: null }] }])(
    'fails cleanly on malformed input %#',
    (j) => {
      expect(parseAhrefsProjects(j, '2026-11-18').ok).toBe(false)
    },
  )
})

describe('parseAhrefsIssues', () => {
  it('drops zero-crawled rows and suffixes not-indexable duplicates', () => {
    expect(parseAhrefsIssues(issuesFixture)).toEqual([
      { source: 'ahrefs', nativeName: '404 page', nativeSeverity: 'Error', urlCount: 57 },
      { source: 'ahrefs', nativeName: 'Meta description tag missing or empty', nativeSeverity: 'Warning', urlCount: 721 },
      { source: 'ahrefs', nativeName: 'Meta description tag missing or empty (not indexable)', nativeSeverity: 'Warning', urlCount: 96 },
    ])
  })
  it.each([null, {}, { issues: 'x' }, { issues: [null, 5] }])('returns [] on malformed input %#', (j) => {
    expect(parseAhrefsIssues(j)).toEqual([])
  })
})

describe('fetchAhrefs', () => {
  beforeEach(() => vi.stubEnv('AHREFS_API_KEY', 'secret-key-123'))
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('throws when the key is missing', async () => {
    vi.stubEnv('AHREFS_API_KEY', '')
    await expect(fetchAhrefs('9371114', '2026-11-18')).rejects.toThrow('Missing AHREFS_API_KEY')
  })

  it('calls both endpoints with bearer auth and returns raw + parsed result', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(json(projectsFixture)).mockResolvedValueOnce(json(issuesFixture))
    vi.stubGlobal('fetch', fetchMock)
    const out = await fetchAhrefs('9371114', '2026-11-18')
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api.ahrefs.com/v3/site-audit/projects?project_id=9371114&date=2026-11-18T23%3A59%3A59',
    )
    expect(fetchMock.mock.calls[1][0]).toContain('/site-audit/issues?project_id=9371114')
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer secret-key-123')
    expect(out.result.ok && out.result.value.healthScore).toBe(61)
    expect(out.result.ok && out.result.value.issues).toHaveLength(3)
    const raw = JSON.parse(new TextDecoder().decode(out.raw))
    expect(raw.projects).toEqual(projectsFixture)
    expect(raw.issues).toEqual(issuesFixture)
  })

  it('skips the issues call and returns the reason when no crawl is in window', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(json({ healthscores: [] }))
    vi.stubGlobal('fetch', fetchMock)
    const out = await fetchAhrefs('9371114', '2026-11-18')
    expect(out.result.ok).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('retries once on 429 honoring Retry-After seconds, then succeeds', async () => {
    vi.useFakeTimers()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({}, 429, { 'Retry-After': '2' }))
      .mockResolvedValueOnce(json(projectsFixture))
      .mockResolvedValueOnce(json(issuesFixture))
    vi.stubGlobal('fetch', fetchMock)
    const p = fetchAhrefs('9371114', '2026-11-18')
    await vi.advanceTimersByTimeAsync(1999)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    const out = await p
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(out.result.ok).toBe(true)
  })

  it('honors an HTTP-date Retry-After and caps the wait', async () => {
    vi.useFakeTimers({ now: new Date('2026-11-18T00:00:00Z') })
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({}, 429, { 'Retry-After': 'Wed, 18 Nov 2026 01:00:00 GMT' }))
      .mockResolvedValueOnce(json({ healthscores: [] }))
    vi.stubGlobal('fetch', fetchMock)
    const p = fetchAhrefs('9371114', '2026-11-18')
    await vi.advanceTimersByTimeAsync(30_000)
    await p
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('retries a 5xx once and throws the status if it persists', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn().mockResolvedValue(json({ error: 'secret-key-123' }, 503))
    vi.stubGlobal('fetch', fetchMock)
    const p = fetchAhrefs('9371114', '2026-11-18')
    const assertion = expect(p).rejects.toThrow(/^Ahrefs 503$/)
    await vi.advanceTimersByTimeAsync(30_000)
    await assertion
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('throws Ahrefs 401 without retry', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ error: 'bad' }, 401))
    vi.stubGlobal('fetch', fetchMock)
    await expect(fetchAhrefs('9371114', '2026-11-18')).rejects.toThrow('Ahrefs 401')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('throws a body-free error on a non-JSON response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>secret-key-123</html>', { status: 200 })))
    await expect(fetchAhrefs('9371114', '2026-11-18')).rejects.toThrow(/^Ahrefs invalid JSON response$/)
  })

  it('does not leak the key when the network fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('boom Bearer secret-key-123')))
    const err = await fetchAhrefs('9371114', '2026-11-18').catch((e: Error) => e)
    expect((err as Error).message).toBe('Ahrefs request failed')
  })

  it('aborts after 15 s', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_res, rej) => {
          init.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')))
        }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const p = fetchAhrefs('9371114', '2026-11-18')
    const assertion = expect(p).rejects.toThrow('Ahrefs timeout')
    await vi.advanceTimersByTimeAsync(15_000)
    await assertion
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
