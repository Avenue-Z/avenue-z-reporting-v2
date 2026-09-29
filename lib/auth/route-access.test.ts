import { describe, expect, test } from 'vitest'
import { routeAccess } from './route-access'

const admin = { role: 'INTERNAL_ADMIN', clientSlug: 'avenue-z' }
const analyst = { role: 'INTERNAL_ANALYST', clientSlug: 'avenue-z' }
const clientAdmin = { role: 'CLIENT_ADMIN', clientSlug: 'acme' }
const viewer = { role: 'CLIENT_VIEWER', clientSlug: 'acme' }

describe('routeAccess', () => {
  test('no session goes to login everywhere', () => {
    for (const p of ['/dashboard', '/dashboard/acme/reports', '/tools/reporting', '/portal/acme/reports']) {
      expect(routeAccess(p, null)).toBe('login')
    }
  })

  test('staff reach every protected area and every client portal', () => {
    for (const s of [admin, analyst]) {
      for (const p of ['/dashboard', '/dashboard/acme/access', '/tools', '/tools/reporting', '/portal/acme/reports', '/portal/other/reports']) {
        expect(routeAccess(p, s)).toBe('allow')
      }
    }
  })

  test('a client reaches its own portal, every page under it', () => {
    for (const s of [clientAdmin, viewer]) {
      for (const p of ['/portal/acme', '/portal/acme/', '/portal/acme/reports', '/portal/acme/reports/organic-social', '/portal/acme/team', '/portal/acme/auth']) {
        expect(routeAccess(p, s)).toBe('allow')
      }
    }
  })

  test("a client never reaches another client's portal", () => {
    for (const s of [clientAdmin, viewer]) {
      for (const p of ['/portal/other', '/portal/other/reports', '/portal/other/reports/organic-social', '/portal/other/team']) {
        expect(routeAccess(p, s)).toBe('unauthorized')
      }
    }
  })

  test('a client never reaches staff areas', () => {
    for (const s of [clientAdmin, viewer]) {
      for (const p of ['/dashboard', '/dashboard/acme', '/dashboard/acme/access', '/dashboard/acme/reports', '/tools', '/tools/reporting']) {
        expect(routeAccess(p, s)).toBe('unauthorized')
      }
    }
  })

  test('near-miss slugs fail closed', () => {
    for (const p of ['/portal', '/portal/', '/portal//reports', '/portal/acme-evil/reports', '/portal/acm/reports', '/portal/ACME/reports', '/portal/%61cme/reports']) {
      expect(routeAccess(p, viewer)).toBe('unauthorized')
    }
  })

  test('a signed-in account with no client, or no role, reaches no portal it is not assigned to', () => {
    expect(routeAccess('/portal/acme/reports', { role: 'CLIENT_VIEWER', clientSlug: null })).toBe('unauthorized')
    expect(routeAccess('/portal/acme/reports', {})).toBe('unauthorized')
    expect(routeAccess('/dashboard', {})).toBe('unauthorized')
  })
})
