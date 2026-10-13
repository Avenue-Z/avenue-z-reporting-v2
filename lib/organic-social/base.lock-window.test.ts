import { expect, test, vi } from 'vitest'

const { lockingClient, getClientBySlug } = vi.hoisted(() => ({ lockingClient: vi.fn(() => ({})), getClientBySlug: vi.fn() }))
vi.mock('./locking-client', async () => ({ ...(await vi.importActual<typeof import('./locking-client')>('./locking-client')), lockingClient }))
vi.mock('@/lib/db/queries', () => ({ getClientBySlug }))
vi.mock('./locked-range', async () => ({
  ...(await vi.importActual<typeof import('./locked-range')>('./locked-range')),
  requestClock: () => ({ today: '2026-10-13', lastCompleteUtcDay: '2026-10-12', liveDayInProgress: false }),
}))

import { dashClientFor } from './base'

test('a client on locked months gets the lower bound from its firstMonth, next to its settled day', async () => {
  process.env.DASH_API_TOKEN = 'test-token'
  getClientBySlug.mockResolvedValue({ id: 'c1', dashSocialConfig: { brandId: 1, reportingMonths: { firstMonth: '2026-07', clientMonths: 1 } } })
  await dashClientFor('locked-co')
  expect(lockingClient).toHaveBeenCalledTimes(1)
  const opts = (lockingClient.mock.calls[0] as unknown[])[1] as { settled: string | null; from: string | null }
  expect(opts.from).toBe('2026-07-01')
  expect(opts.settled).toBe('2026-09-30')
})
