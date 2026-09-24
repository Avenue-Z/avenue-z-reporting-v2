import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { auth } from '@/auth'
import { OrganicRangeControl } from './range-control'
import { MonthPicker } from './month-picker'

const OPTED = { dashSocialConfig: { brandId: 1, reportingMonths: { firstMonth: '2026-08' } } }
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-20T14:00:00Z')); vi.mocked(auth).mockReset() })
afterEach(() => vi.useRealTimers())

async function pickerProps(a: Parameters<typeof OrganicRangeControl>[0]) {
  const el = await OrganicRangeControl(a)
  expect(el?.type).toBe(MonthPicker)
  return el!.props as { months: { key: string }[]; value: string | null; emptyText: string | null }
}

test('a passed role is used and the session is not read', async () => {
  const p = await pickerProps({ client: OPTED, requested: undefined, role: 'CLIENT_VIEWER' })
  expect([p.months.map((m) => m.key), p.value, p.emptyText]).toEqual([['2026-09', '2026-08'], '2026-09', null])
  expect(auth).not.toHaveBeenCalled()
})

test('with no role passed it reads the session; the team sees the live month', async () => {
  vi.mocked(auth).mockResolvedValue({ user: { role: 'INTERNAL_ADMIN' } } as never)
  expect((await pickerProps({ client: OPTED, requested: undefined })).months[0].key).toBe('2026-10')
})

test('a session read that throws or rejects means client rules (edge 1)', async () => {
  vi.mocked(auth).mockImplementation(() => { throw new Error('sync') })
  expect((await pickerProps({ client: OPTED, requested: undefined })).months.map((m) => m.key)).toEqual(['2026-09', '2026-08'])
  vi.mocked(auth).mockRejectedValue(new Error('async'))
  expect((await pickerProps({ client: OPTED, requested: undefined })).months.map((m) => m.key)).toEqual(['2026-09', '2026-08'])
})

test('the requested month is selected when it is in the list', async () => {
  expect((await pickerProps({ client: OPTED, requested: 'custom:2026-08-01,2026-08-31', role: 'CLIENT_VIEWER' })).value).toBe('2026-08')
})

test('no months: the picker gets the spec 3.8 text; a client without the key gets nothing', async () => {
  const later = { dashSocialConfig: { brandId: 1, reportingMonths: { firstMonth: '2027-01' } } }
  expect((await pickerProps({ client: later, requested: undefined, role: 'CLIENT_VIEWER' })).emptyText).toBe('Your first report opens on Feb 12')
  expect(await OrganicRangeControl({ client: { dashSocialConfig: { brandId: 1 } }, requested: undefined, role: null })).toBeNull()
})
