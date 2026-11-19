import { afterEach, expect, test, vi } from 'vitest'
import { toPortalSidebarClient } from './sidebar-client'
import { organicSocialSubsections } from '@/lib/constants'
import type { Client } from '@/lib/db/schema'

// A full row with a planted value in every field that must never reach a browser. Made up.
const FULL = {
  id: 'uuid-secret-id', slug: 'a-client', name: 'A Client', logoUrl: 'https://example.com/a.png',
  domain: 'secret-domain.example', ga4PropertyId: 'SECRET-GA4', gscSiteUrl: 'SECRET-GSC',
  hubspotTokenEnvVar: 'SECRET_HUBSPOT_ENV', smApiKeyEnvVar: 'SECRET_SM_ENV',
  paidSearchConfig: { googleAdsAccountId: 'SECRET-ADS' }, metaConfig: { metaAdAccountId: 'SECRET-META' },
  linkedinConfig: { linkedinAdAccountId: 'SECRET-LI' }, salesforceConfig: { salesforceAccountId: 'SECRET-SF' },
  dashSocialConfig: { brandId: 987654321, channels: ['instagram', 'facebook'], influencerSection: { INSTAGRAM: { label: 'Partnership Posts' }, note: 'SECRET-NOTE' } },
  enabledReports: ['organic-social'], hiddenReports: ['organic-x'], hiddenJourneyStages: [],
  sharedPasswordHash: 'SECRET-HASH', users: [{ email: 'secret-user@example.com' }],
  reportSectionConfig: { note: 'SECRET-CONFIG' },
} as unknown as Client

test('only the eight fields the sidebar reads', () => {
  expect(toPortalSidebarClient(FULL)).toEqual({
    slug: 'a-client', name: 'A Client', logoUrl: 'https://example.com/a.png',
    enabledReports: ['organic-social'], hiddenReports: ['organic-x'], lockedMonths: false, aeoInformedTab: false,
    dashSocialConfig: { channels: ['instagram', 'facebook'], influencerSection: { INSTAGRAM: { label: 'Partnership Posts' } } },
  })
})

test('no secret, other identifier or user leaves the server', () => {
  const out = JSON.stringify(toPortalSidebarClient(FULL))
  for (const planted of ['SECRET', '987654321', 'uuid-secret-id', 'secret-user@example.com', 'secret-domain']) {
    expect(out).not.toContain(planted)
  }
})

test('a client with no Dash config sends none', () => {
  expect(toPortalSidebarClient({ ...FULL, dashSocialConfig: null } as unknown as Client).dashSocialConfig).toBeNull()
})

test("a client's Organic Social tabs are the same from the trimmed record as from the full one", () => {
  const shapes = [
    FULL,
    { ...FULL, dashSocialConfig: { brandId: 1 } },
    { ...FULL, hiddenReports: [] },
    { ...FULL, dashSocialConfig: null },
    { ...FULL, dashSocialConfig: { brandId: 1, channels: ['instagram'], influencerSection: { INSTAGRAM: { hidden: true } } } },
    { ...FULL, hiddenReports: ['organic-instagram'] },
  ] as unknown as Client[]
  for (const c of shapes) expect(organicSocialSubsections(toPortalSidebarClient(c))).toEqual(organicSocialSubsections(c))
})

test('lockedMonths says whether the client is on locked months, and the setting itself never leaves the server', () => {
  const locked = { ...FULL, dashSocialConfig: { ...(FULL.dashSocialConfig as object), reportingMonths: { firstMonth: '2026-07', clientMonths: 1, note: 'SECRET-RM' } } } as unknown as Client
  const out = toPortalSidebarClient(locked)
  expect(out.lockedMonths).toBe(true)
  expect(JSON.stringify(out)).not.toContain('reportingMonths')
  expect(JSON.stringify(out)).not.toContain('SECRET-RM')
  expect(toPortalSidebarClient({ ...FULL, dashSocialConfig: null } as unknown as Client).lockedMonths).toBe(false)
})

// The AEO Informed Social tab (spec 2026-11-12 section 1): only the server-computed boolean leaves the server, never the Peec project id
// or the setting itself.
const AEO = { ...FULL, peecCustomerProjectId: 'SECRET-PEEC-PROJECT', dashSocialConfig: { ...(FULL as unknown as { dashSocialConfig: object }).dashSocialConfig, aeoInformedSocial: { enabled: true, allTimeFrom: '2026-01-22', selector: 'SECRET-SELECTOR' } } } as unknown as Client
afterEach(() => vi.restoreAllMocks())

test('the trimmed record carries the AEO tab boolean and never the Peec project id or the setting', () => {
  const out = toPortalSidebarClient(AEO)
  expect(out.aeoInformedTab).toBe(true)
  expect(Object.keys(out)).not.toContain('peecCustomerProjectId')
  expect(Object.keys(out.dashSocialConfig ?? {})).not.toContain('aeoInformedSocial')
  expect(JSON.stringify(out)).not.toContain('SECRET')
})

test('a malformed AEO setting, or the setting without a Peec project, is no tab and one warning naming the client', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const bad = { ...AEO, dashSocialConfig: { brandId: 1, aeoInformedSocial: { enabled: true, allTimeFrom: 'soon' } } } as unknown as Client
  expect(toPortalSidebarClient(bad).aeoInformedTab).toBe(false)
  const noProject = { ...AEO, peecCustomerProjectId: null } as unknown as Client
  expect(toPortalSidebarClient(noProject).aeoInformedTab).toBe(false)
  expect(warn).toHaveBeenCalledTimes(2)
  expect(warn.mock.calls[0][0]).toMatch(/^\[aeo-informed\] .*slug=a-client: allTimeFrom/)
  expect(warn.mock.calls[1][0]).toMatch(/^\[aeo-informed\] .*slug=a-client: .*peec_customer_project_id/)
  for (const [m] of warn.mock.calls) expect(String(m)).not.toContain('SECRET')
})

test('a client without the AEO setting logs nothing', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  toPortalSidebarClient(FULL)
  expect(warn).not.toHaveBeenCalled()
})

// The Social Listening tab (spec 2026-11-19 section 4): only the server-computed boolean leaves the server, never the setting (its topic
// names). The field is sent only when true, so the record of every client without the tab is exactly as before.
const RM = { firstMonth: '2026-07', clientMonths: 2 }
const SL = { ...FULL, dashSocialConfig: { ...(FULL as unknown as { dashSocialConfig: object }).dashSocialConfig, reportingMonths: RM, socialListening: { enabled: true, brandTopic: 'SECRET-TOPIC', industryTopic: 'SECRET-INDUSTRY', industrySample: 10 } } } as unknown as Client

test('the trimmed record carries the Social Listening boolean and never the setting', () => {
  const out = toPortalSidebarClient(SL)
  expect(out.socialListeningTab).toBe(true)
  expect(Object.keys(out.dashSocialConfig ?? {})).not.toContain('socialListening')
  expect(JSON.stringify(out)).not.toContain('SECRET')
  expect(JSON.stringify(out)).not.toContain('industrySample')
})

test('a client without the tab gets no socialListeningTab field, so its record is unchanged', () => {
  expect(toPortalSidebarClient(FULL)).not.toHaveProperty('socialListeningTab')
  const hidden = { ...SL, hiddenReports: ['organic-social-listening'] } as unknown as Client
  expect(toPortalSidebarClient(hidden)).not.toHaveProperty('socialListeningTab')
})

test('a malformed Social Listening setting, or the setting without reporting months, is no tab and one warning naming the client', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const bad = { ...SL, dashSocialConfig: { brandId: 1, reportingMonths: RM, socialListening: { enabled: true, brandTopic: 'SECRET-TOPIC', paidSheet: 'SECRET-SHEET' } } } as unknown as Client
  expect(toPortalSidebarClient(bad)).not.toHaveProperty('socialListeningTab')
  const noMonths = { ...SL, dashSocialConfig: { brandId: 1, socialListening: { enabled: true, brandTopic: 'SECRET-TOPIC' } } } as unknown as Client
  expect(toPortalSidebarClient(noMonths)).not.toHaveProperty('socialListeningTab')
  expect(warn).toHaveBeenCalledTimes(2)
  expect(warn.mock.calls[0][0]).toMatch(/^\[social-listening\] .*slug=a-client: .*paidSheet/)
  expect(warn.mock.calls[1][0]).toMatch(/^\[social-listening\] .*slug=a-client: .*reportingMonths/)
  for (const [m] of warn.mock.calls) expect(String(m)).not.toContain('SECRET')
})
