import { expect, test } from 'vitest'
import { contentDisposition, exportFilename, exportStamp } from './filename'

// 2026-10-07 02:30 UTC is still Oct 6 in New York.
const now = new Date('2026-10-07T02:30:00Z')

test('the filename names the client, the page and the export day in the requester\'s timezone', () => {
  expect(exportFilename('Renaissance', 'Organic Social', now, 'America/New_York')).toBe('Renaissance – Organic Social – 2026-10-06.pdf')
  expect(exportFilename('Renaissance', 'Organic Social', now, 'UTC')).toBe('Renaissance – Organic Social – 2026-10-07.pdf')
})

test('characters a filesystem rejects are dropped from the filename', () => {
  expect(exportFilename('A/B: "C"*?<>|\\', 'X\nY', now, 'UTC')).toBe('AB C – XY – 2026-10-07.pdf')
})

test('Content-Disposition carries an ASCII fallback and the exact UTF-8 name', () => {
  expect(contentDisposition('Renaissance – Organic Social – 2026-10-06.pdf')).toBe(
    `attachment; filename="Renaissance - Organic Social - 2026-10-06.pdf"; filename*=UTF-8''Renaissance%20%E2%80%93%20Organic%20Social%20%E2%80%93%202026-10-06.pdf`,
  )
})

test('the stamp gives the export time with its zone, and the period when there is one', () => {
  expect(exportStamp(now, 'America/New_York', 'Sep 1 – Sep 30, 2026'))
    .toBe('Exported Oct 6, 2026, 10:30 PM EDT · Reporting period Sep 1 – Sep 30, 2026')
  expect(exportStamp(now, 'UTC', null)).toBe('Exported Oct 7, 2026, 2:30 AM UTC')
})
