import { expect, test } from 'vitest'
import { exportPagePath, parseExportRequest } from './request'

const ok = { clientSlug: 'renaissance', subsection: null, dateRange: 'custom:2026-09-01,2026-09-30', compareRange: null, tz: 'America/New_York' }

test('a well-formed body parses', () => {
  expect(parseExportRequest(ok)).toEqual(ok)
  expect(parseExportRequest({ ...ok, subsection: 'instagram', compareRange: 'previous_period' }))
    .toEqual({ ...ok, subsection: 'instagram', compareRange: 'previous_period' })
})

test('role and any other field in the body are ignored, never carried', () => {
  const r = parseExportRequest({ ...ok, role: 'INTERNAL_ADMIN', sessionClient: 'other' })
  expect(r).toEqual(ok)
})

test.each([
  ['not an object', 'x'],
  ['missing slug', { ...ok, clientSlug: undefined }],
  ['slug with a slash', { ...ok, clientSlug: '../dashboard' }],
  ['slug too long', { ...ok, clientSlug: 'a'.repeat(65) }],
  ['subsection with a space', { ...ok, subsection: 'insta gram' }],
  ['missing range', { ...ok, dateRange: undefined }],
  ['range with a query', { ...ok, dateRange: 'last_30_days&x=1' }],
  ['range too long', { ...ok, dateRange: 'a'.repeat(65) }],
])('rejects %s', (_, body) => {
  expect(parseExportRequest(body)).toBeNull()
})

test('an unknown timezone falls back to UTC rather than failing the export', () => {
  expect(parseExportRequest({ ...ok, tz: 'Mars/Olympus' })?.tz).toBe('UTC')
  expect(parseExportRequest({ ...ok, tz: undefined })?.tz).toBe('UTC')
})

test('the export page path carries only the view parameters, encoded', () => {
  expect(exportPagePath(ok)).toBe('/export/renaissance/organic-social?dateRange=custom%3A2026-09-01%2C2026-09-30&tz=America%2FNew_York')
  expect(exportPagePath({ ...ok, subsection: 'linkedin', compareRange: 'previous_period' }))
    .toBe('/export/renaissance/organic-social?dateRange=custom%3A2026-09-01%2C2026-09-30&compareRange=previous_period&subsection=linkedin&tz=America%2FNew_York')
})
