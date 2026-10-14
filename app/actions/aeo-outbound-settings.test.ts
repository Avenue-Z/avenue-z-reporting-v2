import { afterEach, beforeEach, expect, test, vi } from 'vitest'

vi.mock('next/cache', () => ({ refresh: vi.fn() }))
vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers({ host: 'app.example' })) }))
const m = vi.hoisted(() => ({ read: vi.fn(), save: vi.fn() }))
vi.mock('@/lib/aeo-outbound/settings-store', () => ({ readSettingsRow: m.read, saveSettings: m.save }))

import { auth } from '@/auth'
import { headers } from 'next/headers'
import { refresh } from 'next/cache'
import { SETTINGS_DEFAULTS, settingsToInput } from '@/lib/aeo-outbound/settings'
import { saveSettingsAction } from './aeo-outbound-settings'

// Every email is invented.
const AT = '2026-10-10T09:00:00.000Z'
// The stored row equals the defaults apart from the people (Ryan's answers, spec v1.1 §16.1), so a save that changes nothing logs nothing.
const ROW = { id: true, users: ['ana@avenuez.com'], admins: ['boss@avenuez.com'], sectionTitles: ['Category data', 'Competitive visibility'], fixedNextStep: 'A comprehensive AEO audit can validate these patterns across prompt demand, citations, source influence, owned content, earned media, and technical readiness.', rankAmong: null, peecOpportunityRows: 1, methodologyStatesPromptsAndModels: true, sidebarWordmark: 'Avenue Z', series: 'AI Visibility Snapshot', updatedAt: new Date(AT), updatedBy: 'boss@avenuez.com' }
const STORED = { ...SETTINGS_DEFAULTS, users: ['ana@avenuez.com'], admins: ['boss@avenuez.com'] }
const as = (email: string, role = 'INTERNAL_ANALYST') => vi.mocked(auth).mockResolvedValue({ user: { role, email } } as never)

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.stubEnv('AEO_OUTBOUND_USERS', 'ryan@avenuez.com')
  vi.mocked(headers).mockResolvedValue(new Headers({ host: 'app.example' }) as never)
  m.read.mockResolvedValue(ROW)
  m.save.mockResolvedValue(true)
  as('boss@avenuez.com')
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs() })

test('only admins on a same-host request can save: a plain user, non-staff and a foreign Origin are forbidden and write nothing', async () => {
  for (const arrange of [
    () => as('ana@avenuez.com'),
    () => as('boss@avenuez.com', 'CLIENT_ADMIN'),
    () => vi.mocked(headers).mockResolvedValue(new Headers({ host: 'app.example', origin: 'https://evil.example' }) as never),
  ]) {
    arrange()
    expect(await saveSettingsAction(settingsToInput(STORED), AT)).toEqual({ ok: false, error: 'forbidden' })
    as('boss@avenuez.com')
    vi.mocked(headers).mockResolvedValue(new Headers({ host: 'app.example' }) as never)
  }
  expect(m.save).not.toHaveBeenCalled()
})

test('an env admin can save even with no settings row; the save inserts with no expected time', async () => {
  as('ryan@avenuez.com')
  m.read.mockResolvedValue(null)
  const r = await saveSettingsAction({ ...settingsToInput(SETTINGS_DEFAULTS), users: 'ana@avenuez.com' }, null)
  expect(r.ok).toBe(true)
  const [values, changes, by, now, expected] = m.save.mock.calls[0]
  expect(values).toEqual({ ...SETTINGS_DEFAULTS, users: ['ana@avenuez.com'] })
  expect(changes).toEqual([{ field: 'users', oldValue: [], newValue: ['ana@avenuez.com'] }])
  expect([by, expected]).toEqual(['ryan@avenuez.com', null])
  expect(r.ok && r.updatedAt).toBe((now as Date).toISOString())
  expect(refresh).toHaveBeenCalled()
})

test('a save logs each changed field, against the updated_at the page loaded', async () => {
  const r = await saveSettingsAction({ ...settingsToInput(STORED), section1: 'Strengths', rankMode: 'top', rankAmong: '7' }, AT)
  expect(r.ok).toBe(true)
  expect(m.save.mock.calls[0][1]).toEqual([
    { field: 'sectionTitles', oldValue: ['Category data', 'Competitive visibility'], newValue: ['Strengths', 'Competitive visibility'] },
    { field: 'rankAmong', oldValue: null, newValue: 7 },
  ])
  expect(m.save.mock.calls[0][4]).toBe(AT)
})

test('concurrent saves: a page loaded before another save, or a write that matched nothing, gets the reload message', async () => {
  const conflict = { ok: false, error: 'Someone else changed these settings. Reload to see their changes.' }
  expect(await saveSettingsAction(settingsToInput(STORED), '2026-10-01T00:00:00.000Z')).toEqual(conflict)
  expect(m.save).not.toHaveBeenCalled()
  m.save.mockResolvedValue(false)
  expect(await saveSettingsAction({ ...settingsToInput(STORED), section2: 'Gaps' }, AT)).toEqual(conflict)
  expect(refresh).not.toHaveBeenCalled()
})

test('validation errors come back per field and nothing is written', async () => {
  const r = await saveSettingsAction({ ...settingsToInput(STORED), users: 'ana@gmail.com', section1: '' }, AT)
  expect(r).toEqual({ ok: false, error: 'invalid', fieldErrors: { users: 'Each email must end in @avenuez.com.', sectionTitles: 'Section titles need 1 to 60 characters.' } })
  expect(m.save).not.toHaveBeenCalled()
})

test('the last admin: with no env admins the settings must keep one; with env admins an admin may remove themself', async () => {
  vi.stubEnv('AEO_OUTBOUND_USERS', '')
  expect(await saveSettingsAction({ ...settingsToInput(STORED), admins: '' }, AT)).toEqual({ ok: false, error: 'invalid', fieldErrors: { admins: 'Keep at least one admin.' } })
  expect(m.save).not.toHaveBeenCalled()
  vi.stubEnv('AEO_OUTBOUND_USERS', 'ryan@avenuez.com')
  expect((await saveSettingsAction({ ...settingsToInput(STORED), admins: '' }, AT)).ok).toBe(true)
})

test('nothing changed: ok, with no write and no log', async () => {
  expect(await saveSettingsAction(settingsToInput(STORED), AT)).toEqual({ ok: true, updatedAt: AT })
  expect(m.save).not.toHaveBeenCalled()
})

test('a settings read failure refuses the save; a row that broke its contract is replaced field by field', async () => {
  as('ryan@avenuez.com')
  m.read.mockRejectedValue(Object.assign(new Error('x'), { code: '57P01' }))
  expect(await saveSettingsAction(settingsToInput(STORED), null)).toEqual({ ok: false, error: "The settings couldn't be loaded, so they can't be saved now. Reload and try again." })
  m.read.mockResolvedValue({ ...ROW, sectionTitles: ['Only one'] })
  expect((await saveSettingsAction(settingsToInput(SETTINGS_DEFAULTS), AT)).ok).toBe(true)
  expect(m.save.mock.calls[0][1].map((c: { field: string }) => c.field)).toEqual(['users', 'admins', 'sectionTitles', 'fixedNextStep', 'rankAmong', 'peecOpportunityRows', 'methodologyStatesPromptsAndModels', 'sidebarWordmark', 'series'])
})

test('a failed write is unavailable, with one log line and no value in it', async () => {
  m.save.mockRejectedValue(Object.assign(new Error('params boss@avenuez.com'), { code: '57P01' }))
  expect(await saveSettingsAction({ ...settingsToInput(STORED), section2: 'Gaps' }, AT)).toEqual({ ok: false, error: 'unavailable' })
  const lines = vi.mocked(console.error).mock.calls.map((c) => c.map(String).join(' '))
  expect(lines).toEqual(['[aeo-outbound] settings save failed reason=57P01'])
})

test('a malformed input (null, a string) is invalid with no field errors and writes nothing', async () => {
  for (const bad of [null, 'users', 7, [1]]) {
    expect(await saveSettingsAction(bad as never, AT)).toEqual({ ok: false, error: 'invalid', fieldErrors: {} })
  }
  expect(m.save).not.toHaveBeenCalled()
})

test('the last-admin floor counts only env entries that can sign in (@avenuez.com)', async () => {
  vi.stubEnv('AEO_OUTBOUND_USERS', 'someone@gmail.com')
  expect(await saveSettingsAction({ ...settingsToInput(STORED), admins: '' }, AT)).toEqual({ ok: false, error: 'invalid', fieldErrors: { admins: 'Keep at least one admin.' } })
  expect(m.save).not.toHaveBeenCalled()
  vi.stubEnv('AEO_OUTBOUND_USERS', 'ryan@avenuez.com')
  expect((await saveSettingsAction({ ...settingsToInput(STORED), admins: '' }, AT)).ok).toBe(true)
})
