import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { outboundAccess } from './access'
import { SETTINGS_DEFAULTS } from './settings'

beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => {}) })
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs() })
const staff = (email: string | null, role = 'INTERNAL_ANALYST') => ({ role, email })
const row = (over: Record<string, unknown> = {}) => ({ id: true, users: ['ana@avenuez.com'], admins: ['boss@avenuez.com'], sectionTitles: ['Strengths', 'Gaps'], fixedNextStep: null, rankAmong: null, peecOpportunityRows: 1, methodologyStatesPromptsAndModels: true, sidebarWordmark: 'AIVx', series: 'AI Visibility Snapshot', updatedAt: new Date('2026-10-10T09:00:00.000Z'), updatedBy: 'boss@avenuez.com', ...over })
const ENV = 'ryan@avenuez.com'

test('the env list is the floor: always a user and an admin, whatever the settings say', async () => {
  const a = await outboundAccess(staff('Ryan@AvenueZ.com'), ENV, async () => row({ users: [], admins: [] }))
  expect(a).toMatchObject({ ok: true, email: 'ryan@avenuez.com', admin: true, admins: ['ryan@avenuez.com'] })
})

test('settings users are users; settings admins are users and admins; the settings travel with the access', async () => {
  const read = async () => row()
  expect(await outboundAccess(staff('ana@avenuez.com'), ENV, read)).toMatchObject({ ok: true, admin: false, settings: { sectionTitles: ['Strengths', 'Gaps'] }, settingsUpdatedAt: '2026-10-10T09:00:00.000Z' })
  expect(await outboundAccess(staff('boss@avenuez.com'), ENV, read)).toMatchObject({ ok: true, admin: true, admins: ['boss@avenuez.com', 'ryan@avenuez.com'] })
})

test('staff on no list, other domains and client roles are refused, and the refusal names the admins', async () => {
  const read = async () => row()
  expect(await outboundAccess(staff('other@avenuez.com'), ENV, read)).toEqual({ ok: false, admins: ['boss@avenuez.com', 'ryan@avenuez.com'] })
  expect(await outboundAccess(staff('ryan@gmail.com'), 'ryan@gmail.com', read)).toMatchObject({ ok: false })
  expect(await outboundAccess(staff('ana@avenuez.com', 'CLIENT_ADMIN'), ENV, read)).toEqual({ ok: false, admins: [] })
  expect(await outboundAccess(staff(null), ENV, read)).toMatchObject({ ok: false })
  expect(await outboundAccess(null, ENV, read)).toEqual({ ok: false, admins: [] })
})

test('no settings row means the config.ts defaults and env users only', async () => {
  expect(await outboundAccess(staff('ana@avenuez.com'), ENV, async () => null)).toEqual({ ok: false, admins: ['ryan@avenuez.com'] })
  expect(await outboundAccess(staff('ryan@avenuez.com'), ENV, async () => null)).toMatchObject({ ok: true, settings: SETTINGS_DEFAULTS, settingsUpdatedAt: null, settingsReadFailed: false })
})

test('a settings read failure falls back to the env list only and the defaults, with one log line', async () => {
  const fail = async () => { throw Object.assign(new Error('params ana@avenuez.com'), { code: '57P01' }) }
  // Spec v1.1 §19.7 (A3): with the settings unreadable, a refusal may be wrong, so it says unavailable and routes answer 503.
  expect(await outboundAccess(staff('ana@avenuez.com'), ENV, fail)).toEqual({ ok: false, admins: ['ryan@avenuez.com'], unavailable: true })
  expect(await outboundAccess(staff('ryan@avenuez.com'), ENV, fail)).toMatchObject({ ok: true, admin: true, settings: SETTINGS_DEFAULTS, settingsReadFailed: true })
  const lines = vi.mocked(console.error).mock.calls.map((c) => c.map(String).join(' '))
  expect(lines).toEqual(['[aeo-outbound] settings read failed reason=57P01', '[aeo-outbound] settings read failed reason=57P01'])
  for (const l of lines) expect(l).not.toContain('@')
})

test('a client role never triggers a settings read', async () => {
  const read = vi.fn(async () => row())
  await outboundAccess(staff('ana@avenuez.com', 'CLIENT_VIEWER'), ENV, read)
  expect(read).not.toHaveBeenCalled()
})

test('with CONTRACT_DISABLED set (ignored since spec v1.1 §19.6), a string users list grants nothing by substring and the env floor holds', async () => {
  vi.stubEnv('CONTRACT_DISABLED', '1')
  const read = async () => row({ users: 'bob@avenuez.com', admins: { 0: 'x@avenuez.com' } })
  expect(await outboundAccess(staff('ob@avenuez.com'), ENV, read)).toEqual({ ok: false, admins: ['ryan@avenuez.com'] })
  expect(await outboundAccess(staff('ryan@avenuez.com'), ENV, read)).toMatchObject({ ok: true, admin: true, settings: SETTINGS_DEFAULTS, settingsInvalid: true })
})

test('with contracts on, a contract-breaking row listing a person does not let them in', async () => {
  const read = async () => row({ sectionTitles: ['Only one'] })
  expect(await outboundAccess(staff('ana@avenuez.com'), ENV, read)).toEqual({ ok: false, admins: ['ryan@avenuez.com'] })
})

test('spec v1.1 §19.7: a refusal with readable settings, or of a non-staff caller, is never unavailable', async () => {
  expect(await outboundAccess(staff('ana@avenuez.com'), ENV, async () => row({ users: [] }))).toEqual({ ok: false, admins: ['boss@avenuez.com', 'ryan@avenuez.com'] })
  expect(await outboundAccess(staff('ana@avenuez.com', 'CLIENT_VIEWER'), ENV, async () => { throw new Error('x') })).toEqual({ ok: false, admins: [] })
})
