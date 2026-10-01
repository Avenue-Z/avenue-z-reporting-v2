import { describe, expect, test } from 'vitest'
import { canOpenPortal, isStaff, routeAccess } from './route-access'

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

  test('the RSC file forms of a portal root are refused, even for its own client (fail closed)', () => {
    // The slug is the raw second segment, so these read as slug "acme.rsc" / "acme.segments". The app never
    // requests them: Next's router fetches the page path with headers and a _rsc query, and adds a segment
    // suffix only in output: 'export' mode (next/dist/client/components/segment-cache/cache.js,
    // addSegmentPathToUrlInOutputExportMode), which next.config.ts does not set. Nothing links to the portal
    // root either (app/page.tsx sends a client to /reports). So only a hand-made request is refused.
    for (const p of ['/portal/acme.rsc', '/portal/acme.prefetch.rsc', '/portal/acme.segments/_tree.segment.rsc']) {
      expect(routeAccess(p, viewer), p).toBe('unauthorized')
    }
  })

  test('a signed-in account with no client, or no role, reaches no portal it is not assigned to', () => {
    expect(routeAccess('/portal/acme/reports', { role: 'CLIENT_VIEWER', clientSlug: null })).toBe('unauthorized')
    expect(routeAccess('/portal/acme/reports', {})).toBe('unauthorized')
    expect(routeAccess('/dashboard', {})).toBe('unauthorized')
  })

  test('a matching slug is not enough: only a client role opens a portal (fail closed on any other role)', () => {
    expect(routeAccess('/portal/acme/reports', { clientSlug: 'acme' })).toBe('unauthorized')
    expect(routeAccess('/portal/acme/reports', { role: 'SOMETHING_ELSE', clientSlug: 'acme' })).toBe('unauthorized')
    expect(routeAccess('/portal/acme/reports', { role: 'client_viewer', clientSlug: 'acme' })).toBe('unauthorized')
  })
})

describe('canOpenPortal (the page-level check)', () => {
  test('staff open any portal; a client role opens only its own slug, compared exactly', () => {
    expect(canOpenPortal('other', admin)).toBe(true)
    expect(canOpenPortal('other', analyst)).toBe(true)
    expect(canOpenPortal('acme', viewer)).toBe(true)
    expect(canOpenPortal('acme', clientAdmin)).toBe(true)
    for (const slug of ['other', '', 'ACME', 'acme/other', 'acme ']) expect(canOpenPortal(slug, viewer)).toBe(false)
  })

  test('no role, an unknown role, or no client opens nothing', () => {
    expect(canOpenPortal('acme', { clientSlug: 'acme' })).toBe(false)
    expect(canOpenPortal('acme', { role: 'SOMETHING_ELSE', clientSlug: 'acme' })).toBe(false)
    expect(canOpenPortal('acme', { role: 'CLIENT_VIEWER', clientSlug: null })).toBe(false)
    expect(canOpenPortal('', { role: 'CLIENT_VIEWER', clientSlug: '' })).toBe(false)
  })
})

describe('isStaff', () => {
  test('only the two internal roles', () => {
    expect([admin, analyst, clientAdmin, viewer, {}].map(isStaff)).toEqual([true, true, false, false, false])
  })
})
