import { expect, test } from 'vitest'
import {
  AEO_SUBSECTIONS, ORGANIC_OVERVIEW_TAB_ID, organicSocialSubsections, resolveOrganicSubsection, visibleSubsections,
} from '@/lib/constants'
import type { Client } from '@/lib/db/schema'

// The three new clients' outlines all begin "[remove] Overview". A client hides Organic
// Social's Overview by listing ORGANIC_OVERVIEW_TAB_ID in its hidden reports.
const client = (channels: string[] | undefined, hidden: string[]): Client =>
  ({ dashSocialConfig: { brandId: 1, channels }, hiddenReports: hidden } as unknown as Client)
const tabs = (c: Client) => organicSocialSubsections(c).map((s) => s.id)
const APFM = client(['instagram', 'facebook', 'linkedin'], ['organic-overview'])

test('the id is organic-overview, namespaced like the platform tabs', () => {
  expect(ORGANIC_OVERVIEW_TAB_ID).toBe('organic-overview')
})

test('a client that hides Overview gets only its platform tabs, in outline order', () => {
  expect(tabs(APFM)).toEqual(['organic-instagram', 'organic-facebook', 'organic-linkedin'])
})

test('with Overview hidden, the report opens on the first platform tab', () => {
  expect(resolveOrganicSubsection(APFM, null).id).toBe('organic-instagram')
  expect(resolveOrganicSubsection(APFM, undefined).channel).toBe('INSTAGRAM')
  expect(resolveOrganicSubsection(APFM, 'nope').id).toBe('organic-instagram')
})

test('with Overview hidden, a named platform tab still opens', () => {
  expect(resolveOrganicSubsection(APFM, 'organic-linkedin').channel).toBe('LINKEDIN')
})

// THE RENAISSANCE GUARD. Its hidden reports (read 2026-09-18) do not list organic-overview
// and it has no channel allowlist, so its Organic Social tabs are exactly today's.
test("Renaissance's settings keep Overview first and every tab as today", () => {
  const ren = client(undefined, ['technical-audit', 'content-impact'])
  expect(tabs(ren)).toEqual([null, 'organic-instagram', 'organic-facebook', 'organic-linkedin', 'organic-x'])
  expect(resolveOrganicSubsection(ren, null).channel).toBeNull()
})

test('hiding Overview never leaves a client with no tabs', () => {
  expect(tabs(client(['youtube'], ['organic-overview']))).toEqual([null])
  expect(tabs(client(['instagram'], ['organic-overview', 'organic-instagram']))).toEqual([null])
})

// organic-overview belongs to Organic Social alone: the shared helper other sections use
// still keeps their Overview.
test("hiding Organic Social's Overview does not hide another section's Overview", () => {
  expect(visibleSubsections(AEO_SUBSECTIONS, ['organic-overview'])[0].id).toBeNull()
})
