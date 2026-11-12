import { expect, test } from 'vitest'
import { ORGANIC_SOCIAL_SUBSECTIONS, organicSocialSubsections, resolveOrganicSubsection, type OrganicTabsClient } from '@/lib/constants'
import { toPortalSidebarClient } from '@/lib/portal/sidebar-client'
import type { Client } from '@/lib/db/schema'

const ON = { enabled: true, allTimeFrom: '2026-01-22' }
const client = (o: { channels?: string[]; hidden?: string[]; aeo?: unknown; project?: string | null } = {}): Client =>
  ({
    slug: 'a-client', name: 'A', logoUrl: null, enabledReports: ['organic-social'], hiddenReports: o.hidden ?? [],
    dashSocialConfig: { brandId: 1, channels: o.channels ?? ['instagram', 'facebook', 'linkedin'], ...(o.aeo === undefined ? {} : { aeoInformedSocial: o.aeo }) },
    peecCustomerProjectId: o.project === undefined ? 'or_project' : o.project,
  } as unknown as Client)
const ids = (c: OrganicTabsClient) => organicSocialSubsections(c).map((s) => s.id)

test('the AEO Informed Social tab is last in the list, with no channel and its own view', () => {
  expect(ORGANIC_SOCIAL_SUBSECTIONS.at(-1)).toEqual({ id: 'organic-aeo-informed', label: 'AEO Informed Social', channel: null, view: 'aeo-informed' })
})

test('a client with the setting and a Peec project gets the tab last; the report still opens on Overview', () => {
  const c = client({ aeo: ON })
  expect(ids(c)).toEqual([null, 'organic-influencer', 'organic-instagram', 'organic-facebook', 'organic-linkedin', 'organic-aeo-informed'])
  expect(resolveOrganicSubsection(c).id).toBeNull()
  expect(resolveOrganicSubsection(c, 'organic-aeo-informed')).toMatchObject({ id: 'organic-aeo-informed', label: 'AEO Informed Social', channel: null, view: 'aeo-informed' })
})

test('with Overview hidden the report still opens on a platform tab, and the AEO tab stays last', () => {
  const c = client({ aeo: ON, hidden: ['organic-overview'] })
  expect(ids(c)).toEqual(['organic-instagram', 'organic-influencer', 'organic-facebook', 'organic-linkedin', 'organic-aeo-informed'])
  expect(resolveOrganicSubsection(c).id).toBe('organic-instagram')
})

test.each([
  ['with the setting and a project', client({ aeo: ON }), true],
  ['without the setting', client(), false],
  ['with a malformed setting', client({ aeo: { ...ON, fourthGraph: 'reddit' } }), false],
  ['with the setting but no Peec project', client({ aeo: ON, project: null }), false],
  ['with the setting, the tab hidden', client({ aeo: ON, hidden: ['organic-aeo-informed'] }), false],
])('a full row and its trimmed portal record give the same tab ids: %s', (_, c, expected) => {
  expect(ids(c).includes('organic-aeo-informed')).toBe(expected)
  expect(ids(toPortalSidebarClient(c))).toEqual(ids(c))
})

test('a hand-typed AEO subsection on a client without the tab resolves to the first tab, as any unknown tab does', () => {
  expect(resolveOrganicSubsection(client(), 'organic-aeo-informed').id).toBeNull()
})

test('no client without the setting changes its tab list (today\'s lists, written out)', () => {
  expect(ids(client())).toEqual([null, 'organic-influencer', 'organic-instagram', 'organic-facebook', 'organic-linkedin'])
  expect(ids(client({ channels: ['linkedin'], hidden: ['organic-overview'] }))).toEqual(['organic-linkedin'])
  expect(ids(client({ channels: ['instagram', 'facebook', 'twitter', 'linkedin', 'tiktok'] }))).toEqual([null, 'organic-influencer', 'organic-instagram', 'organic-facebook', 'organic-linkedin', 'organic-x', 'organic-tiktok'])
})
