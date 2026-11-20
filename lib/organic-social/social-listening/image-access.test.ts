import { describe, expect, test } from 'vitest'
import { clockFor } from '../reporting-months'
import { imageAccess, type ImageForAccess } from './image-access'

// Made-up client. On 2026-11-19 a client can open October (opened 2026-11-12) and earlier months back to August.
const CLOCK = clockFor(new Date('2026-11-19T15:00:00Z'))
const CLIENT = {
  id: 'c1', slug: 'a-client', hiddenReports: [] as string[], enabledReports: ['organic-social'],
  dashSocialConfig: { brandId: 1, reportingMonths: { firstMonth: '2026-08' }, socialListening: { enabled: true, brandTopic: 'Made Up Brand' } } as unknown,
}
const img = (post: Partial<ImageForAccess['post']> = {}, client: Partial<typeof CLIENT> = {}): ImageForAccess => ({
  post: { id: 'p1', clientId: 'c1', month: '2026-10', status: 'approved', replacedAt: null, deletedAt: null, ...post },
  client: { ...CLIENT, ...client },
})
const VIEWER = { role: 'CLIENT_VIEWER', clientSlug: 'a-client' }

describe('staff', () => {
  test('see every image, drafts and other months included', () => {
    for (const role of ['INTERNAL_ADMIN', 'INTERNAL_ANALYST']) {
      expect(imageAccess({ role }, img({ status: 'draft', month: '2026-11' }), CLOCK)).toBe(true)
    }
  })
})

describe('a client role', () => {
  test('sees an approved, current post of a month it may open, for its own client', () => {
    expect(imageAccess(VIEWER, img(), CLOCK)).toBe(true)
    expect(imageAccess({ role: 'CLIENT_ADMIN', clientSlug: 'a-client' }, img({ month: '2026-08' }), CLOCK)).toBe(true)
  })
  test('never another client', () => {
    expect(imageAccess({ role: 'CLIENT_VIEWER', clientSlug: 'other-client' }, img(), CLOCK)).toBe(false)
    expect(imageAccess({ role: 'CLIENT_VIEWER', clientSlug: null }, img(), CLOCK)).toBe(false)
  })
  test('never a draft, a replaced or a deleted post', () => {
    expect(imageAccess(VIEWER, img({ status: 'draft' }), CLOCK)).toBe(false)
    expect(imageAccess(VIEWER, img({ replacedAt: new Date('2026-11-15T00:00:00Z') }), CLOCK)).toBe(false)
    expect(imageAccess(VIEWER, img({ status: 'draft', deletedAt: new Date('2026-11-15T00:00:00Z') }), CLOCK)).toBe(false)
  })
  test('never a month it may not open: the live month, one not yet open, one before the first month', () => {
    expect(imageAccess(VIEWER, img({ month: '2026-11' }), CLOCK)).toBe(false)
    expect(imageAccess(VIEWER, img(), clockFor(new Date('2026-11-11T15:00:00Z')))).toBe(false)
    expect(imageAccess(VIEWER, img({ month: '2026-07' }), CLOCK)).toBe(false)
  })
  test('never when the tab is off for the client, hidden, or Organic Social is not enabled', () => {
    expect(imageAccess(VIEWER, img({}, { dashSocialConfig: { brandId: 1, reportingMonths: { firstMonth: '2026-08' } } }), CLOCK)).toBe(false)
    expect(imageAccess(VIEWER, img({}, { hiddenReports: ['organic-social-listening'] }), CLOCK)).toBe(false)
    expect(imageAccess(VIEWER, img({}, { enabledReports: ['ga4'] }), CLOCK)).toBe(false)
  })
  test('an unknown role sees nothing', () => {
    expect(imageAccess({ role: 'SOMETHING', clientSlug: 'a-client' }, img(), CLOCK)).toBe(false)
    expect(imageAccess({}, img(), CLOCK)).toBe(false)
  })
})
