import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ExportPdfButton } from './export-pdf-button'

const props = { clientName: 'Renaissance', pageTitle: 'Organic Social', periodLabel: 'Sep 1 – Sep 30, 2026' }
const print = (e: 'beforeprint' | 'afterprint') => window.dispatchEvent(new Event(e))

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 9, 5, 15, 14))
  document.title = 'Avenue Z — Marketing Intelligence Platform'
})
afterEach(() => vi.useRealTimers())

test('printing stamps the export time and the reporting period on the page', () => {
  render(<ExportPdfButton {...props} />)
  print('beforeprint')
  expect(screen.getByTestId('export-stamp').textContent)
    .toBe('Exported Oct 5, 2026, 3:14 PM · Reporting period Sep 1 – Sep 30, 2026')
})

test('with no period label the stamp carries just the export time', () => {
  render(<ExportPdfButton {...props} periodLabel={null} />)
  print('beforeprint')
  expect(screen.getByTestId('export-stamp').textContent).toBe('Exported Oct 5, 2026, 3:14 PM')
})

test('the stamp shows only in print', () => {
  render(<ExportPdfButton {...props} />)
  expect(screen.getByTestId('export-stamp').className).toMatch(/\bhidden\b.*\bprint:block\b/)
})

test('printing names the PDF after the client, the page and the export date', () => {
  render(<ExportPdfButton {...props} />)
  print('beforeprint')
  expect(document.title).toBe('Renaissance – Organic Social – 2026-10-05')
})

test('the page title comes back after printing', () => {
  render(<ExportPdfButton {...props} />)
  print('beforeprint')
  print('afterprint')
  expect(document.title).toBe('Avenue Z — Marketing Intelligence Platform')
})

test('a second beforeprint before afterprint still restores the original title', () => {
  render(<ExportPdfButton {...props} />)
  print('beforeprint')
  print('beforeprint')
  print('afterprint')
  expect(document.title).toBe('Avenue Z — Marketing Intelligence Platform')
})

test('after unmount, printing leaves the title alone', () => {
  const { unmount } = render(<ExportPdfButton {...props} />)
  unmount()
  print('beforeprint')
  expect(document.title).toBe('Avenue Z — Marketing Intelligence Platform')
})

describe('server export (Organic Social)', () => {
  const serverExport = { clientSlug: 'renaissance', section: 'organic-social' as const, subsection: null, models: null, dateRange: 'custom:2026-09-01,2026-09-30', compareRange: null }
  const pdfResponse = () => new Response(new Blob(['%PDF-']), { status: 200, headers: {
    'content-type': 'application/pdf',
    'content-disposition': `attachment; filename="Renaissance - Organic Social - 2026-10-05.pdf"; filename*=UTF-8''Renaissance%20%E2%80%93%20Organic%20Social%20%E2%80%93%202026-10-05.pdf`,
  } })
  let clicked: string[]
  beforeEach(() => {
    vi.useRealTimers()
    clicked = []
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:pdf'), revokeObjectURL: vi.fn() }))
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { clicked.push(this.download) })
    vi.spyOn(window, 'print').mockImplementation(() => {})
  })
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

  test('asks the server for the PDF and downloads it under the name the server gives', async () => {
    const fetchMock = vi.fn(async () => pdfResponse())
    vi.stubGlobal('fetch', fetchMock)
    render(<ExportPdfButton {...props} serverExport={serverExport} />)
    fireEvent.click(screen.getByRole('button', { name: /Export PDF/ }))
    await waitFor(() => expect(clicked).toEqual(['Renaissance – Organic Social – 2026-10-05.pdf']))
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/export/pdf')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({ ...serverExport, tz: Intl.DateTimeFormat().resolvedOptions().timeZone })
    expect(window.print).not.toHaveBeenCalled()
  })

  test('shows progress while the server renders, and is not clickable twice', async () => {
    let finish!: (r: Response) => void
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((r) => { finish = r })))
    render(<ExportPdfButton {...props} serverExport={serverExport} />)
    fireEvent.click(screen.getByRole('button', { name: /Export PDF/ }))
    const busy = await screen.findByRole('button', { name: /Preparing PDF/ })
    expect((busy as HTMLButtonElement).disabled).toBe(true)
    finish(pdfResponse())
    await screen.findByRole('button', { name: /Export PDF/ })
  })

  test.each([
    [504, 'still-loading', 'This report is still loading. Try again in a moment.'],
    [403, 'forbidden', "You don't have access to export this page."],
    [500, 'render-failed', "The PDF couldn't be created. Try again."],
    [413, 'too-large', 'This page is too large to export as one PDF.'],
  ])('a %s says why, inline, and nothing downloads', async (status, error, message) => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error }), { status })))
    render(<ExportPdfButton {...props} serverExport={serverExport} />)
    fireEvent.click(screen.getByRole('button', { name: /Export PDF/ }))
    expect((await screen.findByRole('alert')).textContent).toBe(message)
    expect(clicked).toEqual([])
  })

  test('without a server export the button prints the page, as before', () => {
    render(<ExportPdfButton {...props} />)
    fireEvent.click(screen.getByRole('button', { name: /Export PDF/ }))
    expect(window.print).toHaveBeenCalled()
  })
})

describe('the downloaded file', () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
  test('the blob URL outlives the click, so a slower browser can still start the download', async () => {
    vi.useRealTimers()
    const revoke = vi.fn()
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:pdf'), revokeObjectURL: revoke }))
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Blob(['%PDF-']), { status: 200, headers: { 'content-disposition': 'attachment; filename="a.pdf"' } })))
    render(<ExportPdfButton {...props} serverExport={{ clientSlug: 'c', section: 'organic-social', subsection: null, models: null, dateRange: 'last_30_days', compareRange: null }} />)
    vi.useFakeTimers()
    fireEvent.click(screen.getByRole('button', { name: /Export PDF/ }))
    await vi.waitFor(() => expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled())
    expect(revoke).not.toHaveBeenCalled()
    vi.advanceTimersByTime(60_000)
    expect(revoke).toHaveBeenCalledWith('blob:pdf')
  })
})

describe("the button's own failure paths (Thomas, #332)", () => {
  const serverExport = { clientSlug: 'c', section: 'organic-social' as const, subsection: null, models: null, dateRange: 'last_30_days', compareRange: null }
  let anchors: { download: string; attached: boolean }[]
  beforeEach(() => {
    vi.useRealTimers()
    anchors = []
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:pdf'), revokeObjectURL: vi.fn() }))
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      anchors.push({ download: this.download, attached: document.body.contains(this) })
    })
  })
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

  test('a request that never answers gives up after 70 s instead of spinning forever', async () => {
    vi.stubGlobal('fetch', vi.fn((_: string, init: RequestInit) => new Promise((_r, reject) => {
      init.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))
    })))
    vi.useFakeTimers()
    render(<ExportPdfButton {...props} serverExport={serverExport} />)
    fireEvent.click(screen.getByRole('button', { name: /Export PDF/ }))
    await act(async () => { await vi.advanceTimersByTimeAsync(69_000) })
    expect(screen.queryByRole('alert')).toBeNull()
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000) })
    expect(screen.getByRole('alert').textContent).toBe("The PDF couldn't be created. Try again.")
    expect(screen.getByRole('button', { name: /Export PDF/ })).toBeTruthy()
  })

  test('a filename that will not decode falls back to the ASCII name; the PDF still downloads', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Blob(['%PDF-']), { status: 200,
      headers: { 'content-disposition': `attachment; filename="Renaissance - Organic Social - 2026-10-07.pdf"; filename*=UTF-8''bad%E2%8` } })))
    render(<ExportPdfButton {...props} serverExport={serverExport} />)
    fireEvent.click(screen.getByRole('button', { name: /Export PDF/ }))
    await vi.waitFor(() => expect(anchors.map((a) => a.download)).toEqual(['Renaissance - Organic Social - 2026-10-07.pdf']))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  test('the download link is in the page when clicked (Firefox), and removed after', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Blob(['%PDF-']), { status: 200, headers: { 'content-disposition': 'attachment; filename="a.pdf"' } })))
    render(<ExportPdfButton {...props} serverExport={serverExport} />)
    fireEvent.click(screen.getByRole('button', { name: /Export PDF/ }))
    await vi.waitFor(() => expect(anchors).toHaveLength(1))
    expect(anchors[0].attached).toBe(true)
    expect(document.querySelectorAll('a[download]')).toHaveLength(0)
  })
})
