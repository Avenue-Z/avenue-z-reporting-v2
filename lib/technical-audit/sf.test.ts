import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('./google', () => ({ googleToken: vi.fn(async () => 'tok-secret') }))

import { fetchIssuesOverview, listSfRuns, parseRunFolderName, parseSfIssuesOverview } from './sf'

const fixture = readFileSync(join(__dirname, '__fixtures__', 'sf-issues-overview.csv'), 'utf-8')

describe('parseRunFolderName', () => {
  it('extracts the date from a run folder name', () => {
    expect(parseRunFolderName('2026-11-01_030106')).toBe('2026-11-01')
  })
  it('returns null for anything else', () => {
    expect(parseRunFolderName('Renaissance')).toBeNull()
    expect(parseRunFolderName('2026-11-01')).toBeNull()
    expect(parseRunFolderName('2026-13-45_030106')).toBeNull()
  })
})

describe('parseSfIssuesOverview', () => {
  it('counts issue types and sums URLs per bucket', () => {
    const r = parseSfIssuesOverview(fixture, '2026-11-01')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.crawlDate).toBe('2026-11-01')
    expect(r.value.issueTypes).toEqual({ issue: 2, warning: 2, opportunity: 2 })
    expect(r.value.urls).toEqual({ issue: 17, warning: 1078, opportunity: 96 })
    expect(r.value.issues).toHaveLength(6)
    expect(r.value.issues[0]).toEqual({ source: 'sf', nativeName: 'Page Titles: Missing', nativeSeverity: 'High', urlCount: 12 })
  })
  it('refuses a file missing Issue Priority', () => {
    const csv = 'Issue Name,Issue Type,URLs\nX,Issue,3\n'
    expect(parseSfIssuesOverview(csv, '2026-11-01')).toEqual({ ok: false, reason: "Missing column 'Issue Priority'" })
  })
  it('refuses an Internal: All export', () => {
    const r = parseSfIssuesOverview('Address,Content Type,Status Code,Status\nhttps://a.com/,text/html,200,OK\n', '2026-11-01')
    expect(r.ok).toBe(false)
  })
  it('tolerates a BOM, blank rows and CRLF', () => {
    const csv = '﻿Issue Name,Issue Type,Issue Priority,URLs\r\n\r\nA,Issue,High,3\r\n,,,\r\nB,Warning,Low,4\r\n'
    const r = parseSfIssuesOverview(csv, '2026-11-01')
    expect(r.ok && r.value.urls).toEqual({ issue: 3, warning: 4, opportunity: 0 })
  })
  it('refuses a non-numeric URLs cell without echoing it', () => {
    const r = parseSfIssuesOverview('Issue Name,Issue Type,Issue Priority,URLs\nA,Issue,High,SECRET-VALUE\n', '2026-11-01')
    expect(r).toEqual({ ok: false, reason: "Non-numeric value in column 'URLs'" })
  })
  it('skips rows with an unknown Issue Type', () => {
    const r = parseSfIssuesOverview('Issue Name,Issue Type,Issue Priority,URLs\nA,Info,High,3\nB,Issue,High,2\n', '2026-11-01')
    expect(r.ok && r.value.issues).toHaveLength(1)
  })
})

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

describe('Drive calls', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

  it('listSfRuns paginates, keeps the latest folder per date, newest first', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonRes({ files: [{ id: 'a', name: '2026-05-22_010000' }, { id: 'b', name: 'junk' }], nextPageToken: 'p2' }))
      .mockResolvedValueOnce(jsonRes({ files: [{ id: 'c', name: '2026-05-22_090000' }, { id: 'd', name: '2026-11-01_030106' }] }))
    vi.stubGlobal('fetch', fetchMock)
    const runs = await listSfRuns('folder1')
    expect(runs).toEqual([{ date: '2026-11-01', folderId: 'd' }, { date: '2026-05-22', folderId: 'c' }])
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const u1 = new URL(fetchMock.mock.calls[0][0] as string)
    expect(u1.searchParams.get('supportsAllDrives')).toBe('true')
    expect(u1.searchParams.get('includeItemsFromAllDrives')).toBe('true')
    expect(u1.searchParams.get('pageSize')).toBe('1000')
    expect(new URL(fetchMock.mock.calls[1][0] as string).searchParams.get('pageToken')).toBe('p2')
  })

  it('rejects a folder id that could break out of the query', async () => {
    vi.stubGlobal('fetch', vi.fn())
    await expect(listSfRuns("x' or '1'='1")).rejects.toThrow('Invalid folder id')
  })

  it('throws a body-free error on non-2xx', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('leaky body tok-secret', { status: 403 })))
    await expect(listSfRuns('f1')).rejects.toThrow(/^Drive 403$/)
  })

  it('throws on a non-JSON 200', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>', { status: 200 })))
    await expect(listSfRuns('f1')).rejects.toThrow('Drive invalid response')
  })

  it('aborts a hung request after 15s', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn((_u: string, init: RequestInit) => new Promise((_res, rej) => {
      init.signal?.addEventListener('abort', () => rej(new Error('aborted')))
    })))
    const p = listSfRuns('f1')
    const assertion = expect(p).rejects.toThrow('Drive timeout')
    await vi.advanceTimersByTimeAsync(15_001)
    await assertion
  })

  it('fetchIssuesOverview returns null when no matching file', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonRes({ files: [{ id: 'x', name: 'internal_all.csv' }] })))
    expect(await fetchIssuesOverview('run1')).toBeNull()
  })

  it('fetchIssuesOverview downloads the matching file bytes', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonRes({ files: [{ id: 'x', name: 'internal_all.csv' }, { id: 'y', name: 'Issues_Overview.CSV' }] }))
      .mockResolvedValueOnce(new Response('a,b', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const r = await fetchIssuesOverview('run1')
    expect(r && new TextDecoder().decode(r.bytes)).toBe('a,b')
    const u = new URL(fetchMock.mock.calls[1][0] as string)
    expect(u.pathname).toContain('/files/y')
    expect(u.searchParams.get('alt')).toBe('media')
  })
})
