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
  const old: Partial<ExportRequest> = { ...ok }
  delete old.section
  expect(parseExportRequest(old)).toEqual(ok)
})

// Only sections switched on for the server export (lib/export/sections.ts). AEO and Paid Media are
// enabled by their own PRs; until then their button prints in the browser and the route refuses them.
test.each(['ga4', 'inbound-funnel', '../dashboard', 3])('a section not switched on (%s) is refused', (section) => {
  expect(parseExportRequest({ ...ok, section })).toBeNull()
})

test('Paid Media is switched on', () => {
  expect(parseExportRequest({ ...ok, section: 'paid-media' })?.section).toBe('paid-media')
})

test('AEO is switched on', () => {
  expect(parseExportRequest({ ...ok, section: 'peec-ai' })?.section).toBe('peec-ai')
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

// The AEO Informed Social tab (spec 2026-11-12, plan Task 10): its range and min competitors, validated as strictly as models. Absent on
// every other request, so those bodies and paths are exactly what they were.
test('the AEO tab\'s range and min pass through, and the export path carries them', () => {
  const r = parseExportRequest({ ...ok, subsection: 'organic-aeo-informed', aeo: 'ytd', aeoMin: 3 })
  expect(r).toEqual({ ...ok, subsection: 'organic-aeo-informed', aeo: 'ytd', aeoMin: 3 })
  expect(exportPagePath(r!)).toBe('/export/renaissance/organic-social?dateRange=custom%3A2026-09-01%2C2026-09-30&subsection=organic-aeo-informed&aeo=ytd&aeomin=3&tz=America%2FNew_York')
})
test('without them a request has no aeo keys and its path is unchanged', () => {
  const r = parseExportRequest(ok)!
  expect('aeo' in r || 'aeoMin' in r).toBe(false)
  expect(exportPagePath(r)).toBe('/export/renaissance/organic-social?dateRange=custom%3A2026-09-01%2C2026-09-30&tz=America%2FNew_York')
  expect(parseExportRequest({ ...ok, aeo: null, aeoMin: null })).toEqual(ok)
})
test.each([['YTD'], ['year'], [3], [['ytd']], ['']])('an aeo of %j is refused', (aeo) => {
  expect(parseExportRequest({ ...ok, aeo })).toBeNull()
})
test.each([[0], [6], [2.5], ['3'], [Number.NaN]])('an aeoMin of %j is refused', (aeoMin) => {
  expect(parseExportRequest({ ...ok, aeoMin })).toBeNull()
})
