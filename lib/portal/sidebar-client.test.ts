import { expect, test } from 'vitest'
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
  dashSocialConfig: { brandId: 987654321, channels: ['instagram', 'facebook'] },
  enabledReports: ['organic-social'], hiddenReports: ['organic-x'], hiddenJourneyStages: [],
  sharedPasswordHash: 'SECRET-HASH', users: [{ email: 'secret-user@example.com' }],
  reportSectionConfig: { note: 'SECRET-CONFIG' },
} as unknown as Client

test('only the six fields the sidebar reads', () => {
  expect(toPortalSidebarClient(FULL)).toEqual({
    slug: 'a-client', name: 'A Client', logoUrl: 'https://example.com/a.png',
    enabledReports: ['organic-social'], hiddenReports: ['organic-x'],
    dashSocialConfig: { channels: ['instagram', 'facebook'] },
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
  ] as unknown as Client[]
  for (const c of shapes) expect(organicSocialSubsections(toPortalSidebarClient(c))).toEqual(organicSocialSubsections(c))
})
