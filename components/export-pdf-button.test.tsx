import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
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
