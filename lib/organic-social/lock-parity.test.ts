import { expect, test, vi } from 'vitest'
const { getClientBySlug } = vi.hoisted(() => ({ getClientBySlug: vi.fn() }))
vi.mock('@/lib/db/queries', () => ({ getClientBySlug }))
import { dashClientFor } from './base'
import { DashSocialClient } from '@/lib/dash-social/client'

// Pre-change record for lock every number: a client without reportingMonths gets a plain
// DashSocialClient and the same brand and channels as today.
test('a client without reportingMonths gets a plain DashSocialClient', async () => {
  process.env.DASH_API_TOKEN = 'test-token'
  getClientBySlug.mockResolvedValue({ id: 'c1', slug: 'r', dashSocialConfig: { brandId: 7, channels: ['instagram'] } })
  const r = await dashClientFor('r')
  expect(r.client).toBeInstanceOf(DashSocialClient)
  expect(Object.getPrototypeOf(r.client)).toBe(DashSocialClient.prototype)
  expect({ brandId: r.brandId, channels: r.channels }).toEqual({ brandId: 7, channels: ['INSTAGRAM'] })
})
