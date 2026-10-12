import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { parseEmails, resolveSettings, SETTINGS_DEFAULTS, SETTINGS_ERRORS, settingsChanges, settingsToInput, validateSettingsInput, type SettingsInput } from './settings'

beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => {}) })
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs() })

const INPUT: SettingsInput = {
  users: 'ana@avenuez.com', admins: '', section1: 'Category data', section2: 'Competitive visibility',
  nextStepMode: 'fixed', nextStep: 'A comprehensive AEO audit can validate these patterns across prompt demand, citations, source influence, owned content, earned media, and technical readiness.', rankMode: 'all', rankAmong: '', peecOpportunityRows: '1',
  methodologyStatesPromptsAndModels: true, sidebarWordmark: 'Avenue Z',
}
const ROW = { id: true, users: ['ana@avenuez.com'], admins: ['boss@avenuez.com'], sectionTitles: ['Strengths', 'Gaps'], fixedNextStep: null, rankAmong: 7, peecOpportunityRows: 2, methodologyStatesPromptsAndModels: false, sidebarWordmark: 'Avenue Z', updatedAt: new Date('2026-10-10T09:00:00.000Z'), updatedBy: 'boss@avenuez.com' }

test('the defaults are the config.ts DECISIONS, and no row means the defaults', () => {
  expect(SETTINGS_DEFAULTS).toEqual({ users: [], admins: [], sectionTitles: ['Category data', 'Competitive visibility'], fixedNextStep: 'A comprehensive AEO audit can validate these patterns across prompt demand, citations, source influence, owned content, earned media, and technical readiness.', rankAmong: null, peecOpportunityRows: 1, methodologyStatesPromptsAndModels: true, sidebarWordmark: 'Avenue Z' })
  expect(resolveSettings(null)).toEqual({ settings: SETTINGS_DEFAULTS, updatedAt: null, invalid: false })
  expect(resolveSettings(undefined)).toEqual({ settings: SETTINGS_DEFAULTS, updatedAt: null, invalid: false })
})

test('a valid row becomes the settings with its updated_at', () => {
  expect(resolveSettings(ROW)).toEqual({ settings: { users: ['ana@avenuez.com'], admins: ['boss@avenuez.com'], sectionTitles: ['Strengths', 'Gaps'], fixedNextStep: null, rankAmong: 7, peecOpportunityRows: 2, methodologyStatesPromptsAndModels: false, sidebarWordmark: 'Avenue Z' }, updatedAt: '2026-10-10T09:00:00.000Z', invalid: false })
})

test('a row that breaks its contract falls back to the defaults, keeps its updated_at so a save can replace it, and logs the field', () => {
  expect(resolveSettings({ ...ROW, sectionTitles: ['Only one'] })).toEqual({ settings: SETTINGS_DEFAULTS, updatedAt: '2026-10-10T09:00:00.000Z', invalid: true })
  expect(vi.mocked(console.error).mock.calls.map((c) => String(c[0]))).toEqual(['[aeo-outbound] contract boundary=settings.row field=sectionTitles issue=too_small count=1 mode=enforce'])
})

test('emails are split on commas, semicolons and whitespace, trimmed, lowercased and deduplicated', () => {
  expect(parseEmails(' Ana@AvenueZ.com, bo@avenuez.com;\nana@avenuez.com  ')).toEqual(['ana@avenuez.com', 'bo@avenuez.com'])
  expect(parseEmails('')).toEqual([])
})

test('validation applies the §8 limits field by field', () => {
  expect(validateSettingsInput(INPUT)).toEqual({ ok: true, values: { ...SETTINGS_DEFAULTS, users: ['ana@avenuez.com'] } })
  const bad = (over: Partial<SettingsInput>) => { const r = validateSettingsInput({ ...INPUT, ...over }); return r.ok ? null : r.errors }
  expect(bad({ users: 'ana@gmail.com' })).toEqual({ users: SETTINGS_ERRORS.email })
  expect(bad({ admins: `${'a'.repeat(190)}@avenuez.com` })).toEqual({ admins: SETTINGS_ERRORS.emailLong })
  expect(bad({ users: Array.from({ length: 51 }, (_, i) => `p${i}@avenuez.com`).join(',') })).toEqual({ users: SETTINGS_ERRORS.tooMany })
  expect(bad({ section1: '' })).toEqual({ sectionTitles: SETTINGS_ERRORS.title })
  expect(bad({ section2: 'x'.repeat(61) })).toEqual({ sectionTitles: SETTINGS_ERRORS.title })
  expect(bad({ nextStepMode: 'fixed', nextStep: '  ' })).toEqual({ fixedNextStep: SETTINGS_ERRORS.nextStep })
  expect(bad({ nextStepMode: 'fixed', nextStep: 'x'.repeat(301) })).toEqual({ fixedNextStep: SETTINGS_ERRORS.nextStep })
  for (const n of ['1', '51', '2.5', 'ten', '']) expect(bad({ rankMode: 'top', rankAmong: n })).toEqual({ rankAmong: SETTINGS_ERRORS.rank })
  expect(bad({ peecOpportunityRows: '4' })).toEqual({ peecOpportunityRows: SETTINGS_ERRORS.peecRows })
  expect(bad({ sidebarWordmark: 'AIVX' })).toEqual({ sidebarWordmark: SETTINGS_ERRORS.wordmark })
  const ok = validateSettingsInput({ ...INPUT, nextStepMode: 'fixed', nextStep: '  Book a   working session. ', rankMode: 'top', rankAmong: '7', section1: ' Strengths ' })
  expect(ok.ok && [ok.values.fixedNextStep, ok.values.rankAmong, ok.values.sectionTitles[0]]).toEqual(['Book a working session.', 7, 'Strengths'])
})

test('the change list names each changed field with its old and new value', () => {
  const after = { ...SETTINGS_DEFAULTS, users: ['ana@avenuez.com'], rankAmong: 7 }
  expect(settingsChanges(SETTINGS_DEFAULTS, after)).toEqual([
    { field: 'users', oldValue: [], newValue: ['ana@avenuez.com'] },
    { field: 'rankAmong', oldValue: null, newValue: 7 },
  ])
  expect(settingsChanges(SETTINGS_DEFAULTS, SETTINGS_DEFAULTS)).toEqual([])
  expect(settingsChanges(null, SETTINGS_DEFAULTS).map((c) => c.field)).toEqual(['users', 'admins', 'sectionTitles', 'fixedNextStep', 'rankAmong', 'peecOpportunityRows', 'methodologyStatesPromptsAndModels', 'sidebarWordmark'])
})

test('the form starts from the settings, and validating that input gives the same settings back', () => {
  const s = { ...SETTINGS_DEFAULTS, users: ['ana@avenuez.com', 'bo@avenuez.com'], fixedNextStep: 'Book a working session.', rankAmong: 7 }
  const input = settingsToInput(s)
  expect(input).toMatchObject({ users: 'ana@avenuez.com\nbo@avenuez.com', nextStepMode: 'fixed', rankMode: 'top', rankAmong: '7', peecOpportunityRows: '1' })
  expect(validateSettingsInput(input)).toEqual({ ok: true, values: s })
})

test('under the contract kill switch a malformed users or admins list still makes the row invalid, because it decides access', () => {
  vi.stubEnv('CONTRACT_DISABLED', '1')
  const bad = (over: Record<string, unknown>) => resolveSettings({ ...ROW, ...over })
  const expected = { settings: SETTINGS_DEFAULTS, updatedAt: '2026-10-10T09:00:00.000Z', invalid: true }
  expect(bad({ users: 'bob@avenuez.com' })).toEqual(expected)
  expect(bad({ admins: { 0: 'boss@avenuez.com' } })).toEqual(expected)
  expect(bad({ users: ['ana@gmail.com'] })).toEqual(expected)
  expect(bad({ users: [5] })).toEqual(expected)
  expect(bad({ users: Array.from({ length: 51 }, (_, i) => `p${i}@avenuez.com`) })).toEqual(expected)
  expect(bad({ admins: [`${'a'.repeat(190)}@avenuez.com`] })).toEqual(expected)
  expect(bad({}).invalid).toBe(false)
})

test('a refused users or admins list logs one line naming the field and never a value', () => {
  resolveSettings({ ...ROW, users: 'bob@avenuez.com' })
  expect(vi.mocked(console.error).mock.calls.map((c) => String(c[0]))).toEqual(['[aeo-outbound] settings row refused field=users'])
  vi.mocked(console.error).mockClear()
  resolveSettings({ ...ROW, users: ['x@gmail.com'], admins: 'y@avenuez.com' })
  expect(vi.mocked(console.error).mock.calls.map((c) => String(c[0]))).toEqual(['[aeo-outbound] settings row refused field=users,admins'])
  vi.mocked(console.error).mockClear()
  resolveSettings({ ...ROW, admins: {} })
  expect(vi.mocked(console.error).mock.calls.map((c) => String(c[0]))).toEqual(['[aeo-outbound] settings row refused field=admins'])
  for (const c of vi.mocked(console.error).mock.calls) expect(String(c[0])).not.toContain('@')
})

test('A2: a long dash in a section title or the next-step sentence is refused; a comma passes', () => {
  const dash = String.fromCharCode(0x2014), en = String.fromCharCode(0x2013)
  const bad = (over: Partial<SettingsInput>) => { const r = validateSettingsInput({ ...INPUT, ...over }); return r.ok ? null : r.errors }
  expect(bad({ section1: `Strengths ${dash} gaps` })).toEqual({ sectionTitles: SETTINGS_ERRORS.longDash })
  expect(bad({ section2: `Gaps ${en} more` })).toEqual({ sectionTitles: SETTINGS_ERRORS.longDash })
  expect(bad({ nextStep: `Book a call ${dash} soon.` })).toEqual({ fixedNextStep: SETTINGS_ERRORS.longDash })
  expect(SETTINGS_ERRORS.longDash).toBe('Use a period or comma instead of a long dash.')
  expect(validateSettingsInput({ ...INPUT, section1: 'Strengths, gaps', nextStep: 'Book a call, soon.' }).ok).toBe(true)
})
