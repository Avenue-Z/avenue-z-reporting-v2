import { expect, test, vi } from 'vitest'
import { bulkFilename, bulkRequest, runBulkExport, type PageResult } from './bulk'
import type { ExportPage } from './pages'

const page = (section: ExportPage['section'], subsection: string | null = null): ExportPage =>
  ({ key: `${section}:${subsection ?? ''}`, section, subsection, reportTitle: section, label: subsection ?? 'Overview' })
const RANGES = { clientSlug: 'renaissance', dateRange: '2026-09-01:2026-09-30', compareRange: 'previous_period', models: 'ChatGPT,Gemini', fromSection: 'paid-media', lockedMonths: false }
const BODY = { clientSlug: RANGES.clientSlug, dateRange: RANGES.dateRange, compareRange: RANGES.compareRange, models: RANGES.models }

// Spec 2026-10-14 B5: every page takes the current page's raw ranges, except the Executive Overview's fixed window
// (#354), and only AEO pages take the models filter.
test('the Executive Overview always posts its fixed window and no comparison', () => {
  expect(bulkRequest(page('executive-overview'), RANGES)).toEqual({
    clientSlug: 'renaissance', section: 'executive-overview', subsection: null, dateRange: 'last_30_days', compareRange: null, models: null,
  })
})

test('an AEO page posts the ranges and the models filter', () => {
  expect(bulkRequest(page('peec-ai', 'pr-influence'), RANGES)).toEqual({ ...BODY, section: 'peec-ai', subsection: 'pr-influence' })
})

test('a Paid Media or Organic Social page posts the ranges and no models filter', () => {
  expect(bulkRequest(page('paid-media', 'meta'), RANGES)).toEqual({ ...BODY, section: 'paid-media', subsection: 'meta', models: null })
  expect(bulkRequest(page('organic-social'), RANGES)).toMatchObject({ dateRange: RANGES.dateRange, compareRange: RANGES.compareRange, models: null })
})

// B5, as the sidebar carries ranges (carriesRange): for a client with locked Organic Social months, the range does not
// cross between Organic Social and the other reports; the page across takes its default (Organic Social: its month).
test('with locked months, the range does not cross between Organic Social and the other reports', () => {
  const locked = { ...RANGES, lockedMonths: true }
  expect(bulkRequest(page('organic-social'), locked)).toMatchObject({ dateRange: 'last_30_days', compareRange: null })
  expect(bulkRequest(page('paid-media'), locked)).toMatchObject({ dateRange: RANGES.dateRange, compareRange: RANGES.compareRange })
  const fromOrganic = { ...locked, fromSection: 'organic-social', dateRange: 'custom:2026-09-01,2026-09-30' }
  expect(bulkRequest(page('organic-social', 'organic-instagram'), fromOrganic)).toMatchObject({ dateRange: 'custom:2026-09-01,2026-09-30', compareRange: RANGES.compareRange })
  expect(bulkRequest(page('peec-ai'), fromOrganic)).toMatchObject({ dateRange: 'last_30_days', compareRange: null })
})

// B4: dated in the requester's timezone, like the single-page name.
test("the combined file's name says how many pages it holds", () => {
  expect(bulkFilename('Renaissance', 3, new Date('2026-10-14T15:00:00Z'), 'America/New_York')).toBe('Renaissance – Report (3 pages) – 2026-10-14.pdf')
  expect(bulkFilename('Renaissance', 3, new Date('2026-10-15T02:00:00Z'), 'America/New_York')).toBe('Renaissance – Report (3 pages) – 2026-10-14.pdf')
})

const ok = (n: number): PageResult => ({ ok: true, pdf: new ArrayBuffer(n), filename: `${n}.pdf` })

// B6: one page at a time, in order, with progress before each.
test('pages are exported one at a time, in order, with progress before each', async () => {
  const pages = [page('executive-overview'), page('peec-ai'), page('paid-media')]
  const log: string[] = []
  let inFlight = 0
  const exportOne = vi.fn(async (p: ExportPage) => {
    inFlight++
    expect(inFlight).toBe(1)
    log.push(`export ${p.key}`)
    await new Promise((r) => setTimeout(r, 1))
    inFlight--
    return ok(1)
  })
  const results = await runBulkExport(pages, exportOne, { onProgress: (i, p) => log.push(`progress ${i} ${p.key}`) })
  expect(log).toEqual([
    'progress 0 executive-overview:', 'export executive-overview:',
    'progress 1 peec-ai:', 'export peec-ai:',
    'progress 2 paid-media:', 'export paid-media:',
  ])
  expect(results.map((r) => r.page)).toEqual(pages)
})

// B7: a failure is kept and the run carries on.
test('a failed page is recorded and the run carries on', async () => {
  const pages = [page('executive-overview'), page('peec-ai'), page('paid-media')]
  const results = await runBulkExport(pages, async (p) => (p.section === 'peec-ai' ? { ok: false, error: 'This report is still loading.' } : ok(2)), {})
  expect(results.map((r) => r.result.ok)).toEqual([true, false, true])
  expect(results[1].result).toEqual({ ok: false, error: 'This report is still loading.' })
})

test('the signal is passed to each export', async () => {
  const abort = new AbortController()
  const exportOne = vi.fn(async () => ok(1))
  await runBulkExport([page('peec-ai')], exportOne, { signal: abort.signal })
  expect(exportOne).toHaveBeenCalledWith(expect.objectContaining({ section: 'peec-ai' }), abort.signal)
})

// B6: Cancel stops the run: no further page is exported and the run rejects, so nothing downloads.
test('cancelling stops before the next page and rejects with an AbortError', async () => {
  const abort = new AbortController()
  const exportOne = vi.fn(async () => {
    abort.abort()
    return ok(1)
  })
  const run = runBulkExport([page('executive-overview'), page('peec-ai')], exportOne, { signal: abort.signal })
  await expect(run).rejects.toMatchObject({ name: 'AbortError' })
  expect(exportOne).toHaveBeenCalledTimes(1)
})

test('an export that throws on cancel rejects the run', async () => {
  const abort = new AbortController()
  const run = runBulkExport([page('peec-ai'), page('paid-media')], async () => {
    abort.abort()
    throw new DOMException('Aborted', 'AbortError')
  }, { signal: abort.signal })
  await expect(run).rejects.toMatchObject({ name: 'AbortError' })
})
