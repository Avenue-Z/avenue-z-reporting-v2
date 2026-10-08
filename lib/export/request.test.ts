import { expect, test } from 'vitest'
import { exportPagePath, parseExportRequest, type ExportRequest } from './request'

const ok: ExportRequest = { clientSlug: 'renaissance', section: 'organic-social', subsection: null, dateRange: 'custom:2026-09-01,2026-09-30', compareRange: null, models: null, tz: 'America/New_York' }

test('a well-formed body parses', () => {
  expect(parseExportRequest(ok)).toEqual(ok)
  expect(parseExportRequest({ ...ok, subsection: 'instagram', compareRange: 'previous_period' }))
    .toEqual({ ...ok, subsection: 'instagram', compareRange: 'previous_period' })
})

// A page loaded before the export took a section posts none; its button was Organic Social's.
test('a body with no section is Organic Social', () => {
  const { section: _, ...old } = ok
  expect(parseExportRequest(old)).toEqual(ok)
})

// Only sections switched on for the server export (lib/export/sections.ts). AEO and Paid Media are
// enabled by their own PRs; until then their button prints in the browser and the route refuses them.
test.each(['peec-ai', 'paid-media', 'ga4', '../dashboard', 3])('a section not switched on (%s) is refused', (section) => {
  expect(parseExportRequest({ ...ok, section })).toBeNull()
})

test('the model filter passes through as the page wrote it', () => {
  expect(parseExportRequest({ ...ok, models: 'ChatGPT,Claude' })?.models).toBe('ChatGPT,Claude')
})

test.each([
  ['a query in it', 'ChatGPT&x=1'],
  ['a space', 'Chat GPT'],
  ['too long', 'a'.repeat(129)],
  ['not a string', ['ChatGPT']],
])('a model filter with %s is refused', (_, models) => {
  expect(parseExportRequest({ ...ok, models })).toBeNull()
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

test('the export page path is the section, then only the view parameters, encoded', () => {
  expect(exportPagePath(ok)).toBe('/export/renaissance/organic-social?dateRange=custom%3A2026-09-01%2C2026-09-30&tz=America%2FNew_York')
  expect(exportPagePath({ ...ok, subsection: 'linkedin', compareRange: 'previous_period' }))
    .toBe('/export/renaissance/organic-social?dateRange=custom%3A2026-09-01%2C2026-09-30&compareRange=previous_period&subsection=linkedin&tz=America%2FNew_York')
  expect(exportPagePath({ ...ok, section: 'peec-ai', subsection: 'pr-influence', models: 'ChatGPT,Claude' }))
    .toBe('/export/renaissance/peec-ai?dateRange=custom%3A2026-09-01%2C2026-09-30&subsection=pr-influence&models=ChatGPT%2CClaude&tz=America%2FNew_York')
})
