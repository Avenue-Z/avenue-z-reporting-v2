import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

// Each part is one byte naming its page, so the merge's input order is readable.
const mergePdfs = vi.hoisted(() => vi.fn(async (parts: ArrayBuffer[]) => new Uint8Array(parts.flatMap((p) => [...new Uint8Array(p)]))))
vi.mock('@/lib/export/merge-pdfs', () => ({ mergePdfs }))

import { ExportPdfButton } from './export-pdf-button'
import type { ExportPage } from '@/lib/export/pages'

// Spec 2026-10-14-bulk-pdf-export-design: Export PDF opens a page picker; the selected pages download as one PDF.
const PAGES: ExportPage[] = [
  { key: 'executive-overview:', section: 'executive-overview', subsection: null, reportTitle: 'Executive Overview', label: 'Executive Overview' },
  { key: 'peec-ai:', section: 'peec-ai', subsection: null, reportTitle: 'Answer Engine Optimization', label: 'Overview' },
  { key: 'peec-ai:pr-influence', section: 'peec-ai', subsection: 'pr-influence', reportTitle: 'Answer Engine Optimization', label: 'PR Influence' },
]
const ID: Record<string, number> = { 'executive-overview:': 1, 'peec-ai:': 2, 'peec-ai:pr-influence': 3 }
const RANGES = { clientSlug: 'renaissance', dateRange: 'custom:2026-09-01,2026-09-30', compareRange: null, models: 'ChatGPT' }
const props = { clientName: 'Renaissance', pageTitle: 'Answer Engine Optimization', periodLabel: null }
const serverExport = { ...RANGES, section: 'peec-ai' as const, subsection: null }
const bulk = (over: Partial<{ pages: ExportPage[]; currentKey: string | null }> = {}) => ({ pages: PAGES, currentKey: 'peec-ai:', ...RANGES, ...over })

const keyOf = (init: RequestInit) => {
  const b = JSON.parse(String(init.body)) as { section: string; subsection: string | null }
  return `${b.section}:${b.subsection ?? ''}`
}
const pdfFor = (key: string) => new Response(new Uint8Array([ID[key]]), { status: 200, headers: {
  'content-disposition': `attachment; filename="page-${ID[key]}.pdf"; filename*=UTF-8''Renaissance%20%E2%80%93%20page%20${ID[key]}.pdf`,
} })
const loading = () => new Response(JSON.stringify({ error: 'still-loading' }), { status: 504 })

let downloads: { name: string; bytes: number[] }[]
let fetchMock: ReturnType<typeof vi.fn>
const posted = () => fetchMock.mock.calls.map(([, init]) => keyOf(init as RequestInit))
/** fetch answers `still-loading` for the keys in `failing` (each once if `once`), else the page's one-byte PDF. */
function answer(failing: string[] = [], once = false) {
  const left = new Set(failing)
  fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
    const key = keyOf(init)
    if (left.has(key)) { if (once) left.delete(key); return loading() }
    return pdfFor(key)
  })
  vi.stubGlobal('fetch', fetchMock)
}

beforeEach(() => {
  downloads = []
  mergePdfs.mockClear()
  const blobs = new Map<string, Blob>()
  vi.stubGlobal('URL', Object.assign(URL, {
    createObjectURL: vi.fn((b: Blob) => { const u = `blob:${blobs.size}`; blobs.set(u, b); return u }),
    revokeObjectURL: vi.fn(),
  }))
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    const blob = blobs.get(this.href)!
    const name = this.download
    // jsdom's Blob has no arrayBuffer(); FileReader reads it.
    const reader = new FileReader()
    reader.onload = () => downloads.push({ name, bytes: [...new Uint8Array(reader.result as ArrayBuffer)] })
    reader.readAsArrayBuffer(blob)
  })
  vi.spyOn(window, 'print').mockImplementation(() => {})
  answer()
})
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

const open = () => {
  fireEvent.click(screen.getByRole('button', { name: /Export PDF/ }))
  return screen.getByRole('dialog')
}
const box = (name: string) => screen.getByRole('checkbox', { name }) as HTMLInputElement

test('Export PDF opens the page picker, grouped by report, with the current page checked', () => {
  render(<ExportPdfButton {...props} serverExport={serverExport} bulk={bulk()} />)
  const dialog = open()
  expect(within(dialog).getByText('Answer Engine Optimization')).toBeTruthy()
  expect(box('Overview').checked).toBe(true)
  expect(box('Executive Overview').checked).toBe(false)
  expect(box('PR Influence').checked).toBe(false)
  expect(box('All pages').checked).toBe(false)
  expect(fetchMock).not.toHaveBeenCalled()
})

test('All pages checks every page; a report checkbox toggles its tabs', () => {
  render(<ExportPdfButton {...props} serverExport={serverExport} bulk={bulk()} />)
  open()
  fireEvent.click(box('All pages'))
  expect(PAGES.every((p) => box(p.label).checked)).toBe(true)
  fireEvent.click(box('Answer Engine Optimization'))
  expect([box('Overview').checked, box('PR Influence').checked, box('Executive Overview').checked]).toEqual([false, false, true])
  fireEvent.click(box('Answer Engine Optimization'))
  expect([box('Overview').checked, box('PR Influence').checked]).toEqual([true, true])
})

// B4: one page downloads exactly as the single-page export did, and nothing is merged.
test('one page downloads as today, under the name the server gives', async () => {
  render(<ExportPdfButton {...props} serverExport={serverExport} bulk={bulk()} />)
  open()
  fireEvent.click(screen.getByRole('button', { name: 'Export 1 page' }))
  await waitFor(() => expect(downloads).toEqual([{ name: 'Renaissance – page 2.pdf', bytes: [2] }]))
  expect(posted()).toEqual(['peec-ai:'])
  const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))
  expect(body).toEqual({ ...serverExport, tz: Intl.DateTimeFormat().resolvedOptions().timeZone })
  expect(mergePdfs).not.toHaveBeenCalled()
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
})

// B3, B6: one request per page in list order (not click order), merged in that order.
test('several pages are exported one at a time in list order and download as one PDF', async () => {
  render(<ExportPdfButton {...props} serverExport={serverExport} bulk={bulk()} />)
  open()
  fireEvent.click(box('PR Influence'))
  fireEvent.click(box('Executive Overview'))
  fireEvent.click(screen.getByRole('button', { name: 'Export 3 pages' }))
  await waitFor(() => expect(downloads).toHaveLength(1))
  expect(posted()).toEqual(['executive-overview:', 'peec-ai:', 'peec-ai:pr-influence'])
  expect(downloads[0]).toEqual({ name: expect.stringMatching(/^Renaissance – Report \(3 pages\) – \d{4}-\d{2}-\d{2}\.pdf$/), bytes: [1, 2, 3] })
  // B5: the Executive Overview posts its fixed window; only AEO pages carry the models filter.
  const bodies = fetchMock.mock.calls.map(([, init]) => JSON.parse(String((init as RequestInit).body)))
  expect(bodies[0]).toMatchObject({ dateRange: 'last_30_days', compareRange: null, models: null })
  expect(bodies[2]).toMatchObject({ dateRange: RANGES.dateRange, models: 'ChatGPT' })
})

// B7: a failure doesn't stop the run, and nothing downloads until the person decides.
test('a failed page is listed with its reason; Try again re-exports only that page', async () => {
  answer(['peec-ai:pr-influence'], true)
  render(<ExportPdfButton {...props} serverExport={serverExport} bulk={bulk()} />)
  open()
  fireEvent.click(box('All pages'))
  fireEvent.click(screen.getByRole('button', { name: 'Export 3 pages' }))
  const alert = await screen.findByRole('alert')
  expect(alert.textContent).toContain('Answer Engine Optimization – PR Influence')
  expect(alert.textContent).toContain('This report is still loading. Try again in a moment.')
  expect(downloads).toEqual([])
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
  await waitFor(() => expect(downloads).toHaveLength(1))
  expect(posted()).toEqual(['executive-overview:', 'peec-ai:', 'peec-ai:pr-influence', 'peec-ai:pr-influence'])
  expect(downloads[0].bytes).toEqual([1, 2, 3])
})

test('Download the ones that worked merges only the successes, in order', async () => {
  answer(['peec-ai:'])
  render(<ExportPdfButton {...props} serverExport={serverExport} bulk={bulk()} />)
  open()
  fireEvent.click(box('All pages'))
  fireEvent.click(screen.getByRole('button', { name: 'Export 3 pages' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Download the 2 that worked' }))
  await waitFor(() => expect(downloads).toHaveLength(1))
  expect(downloads[0]).toEqual({ name: expect.stringMatching(/Report \(2 pages\)/), bytes: [1, 3] })
})

test("a merge that fails says so, and nothing downloads", async () => {
  mergePdfs.mockRejectedValueOnce(new Error('bad part'))
  render(<ExportPdfButton {...props} serverExport={serverExport} bulk={bulk()} />)
  open()
  fireEvent.click(box('All pages'))
  fireEvent.click(screen.getByRole('button', { name: 'Export 3 pages' }))
  expect((await screen.findByRole('alert')).textContent).toContain("The PDF couldn't be combined. Try again.")
  expect(downloads).toEqual([])
})

// B6: Cancel aborts the request in flight; nothing downloads and the selection is back.
test('Cancel aborts the request in flight, downloads nothing and returns to the selection', async () => {
  let signal: AbortSignal | undefined
  fetchMock = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_r, reject) => {
    signal = init.signal ?? undefined
    signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
  }))
  vi.stubGlobal('fetch', fetchMock)
  render(<ExportPdfButton {...props} serverExport={serverExport} bulk={bulk()} />)
  open()
  fireEvent.click(box('Executive Overview'))
  fireEvent.click(screen.getByRole('button', { name: 'Export 2 pages' }))
  expect(await screen.findByText('Exporting 1 of 2: Executive Overview')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  await screen.findByRole('button', { name: 'Export 2 pages' })
  expect(signal?.aborted).toBe(true)
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(box('Executive Overview').checked).toBe(true)
  expect(screen.queryByRole('alert')).toBeNull()
  expect(downloads).toEqual([])
})

// B8: nothing to pick from, the button prints as before.
test('a client with no exportable page: the button prints, with no picker', () => {
  render(<ExportPdfButton {...props} bulk={bulk({ pages: [], currentKey: null })} />)
  fireEvent.click(screen.getByRole('button', { name: /Export PDF/ }))
  expect(window.print).toHaveBeenCalled()
  expect(screen.queryByRole('dialog')).toBeNull()
})

test('on a page that is not exported on the server, nothing is checked and Print this page prints it', () => {
  render(<ExportPdfButton {...props} bulk={bulk({ currentKey: null })} />)
  open()
  expect(PAGES.some((p) => box(p.label).checked)).toBe(false)
  expect((screen.getByRole('button', { name: 'Export 0 pages' }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Print this page' }))
  expect(window.print).toHaveBeenCalled()
})
