import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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
  const serverExport = { clientSlug: 'renaissance', subsection: null, dateRange: 'custom:2026-09-01,2026-09-30', compareRange: null }
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
