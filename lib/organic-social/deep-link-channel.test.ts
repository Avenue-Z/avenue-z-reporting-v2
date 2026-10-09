import { expect, test } from 'vitest'
import { organicSocialSubsections, resolveOrganicSubsection } from '@/lib/constants'
import type { Client } from '@/lib/db/schema'

/**
 * Which tab a deep link (`/reports/organic-social`) resolves to, per client shape. These are pure
 * resolver tests. That both routes actually USE this resolver for the tab they render and the
 * title they show is proven in deep-link-parity.test.tsx, which runs the real route modules.
 *
 * The first version of this file matched the routes' source TEXT instead, on the belief that a
 * page can't be imported under vitest. That was wrong (`include` only selects which test files
 * run), and Paul's re-review of PR 255 showed the text match passing on two broken fixes.
 */
const client = (channels: string[] | undefined, hidden: string[]): Client =>
  ({ dashSocialConfig: { brandId: 1, channels }, hiddenReports: hidden } as unknown as Client)

test('Renaissance still deep-links to Overview, the same null the routes hard-coded', () => {
  const ren = client(undefined, ['technical-audit', 'content-impact'])
  expect(resolveOrganicSubsection(ren, null).channel).toBeNull()
})

test('a client that hides Overview deep-links to its first platform tab', () => {
  expect(resolveOrganicSubsection(client(['instagram', 'facebook', 'linkedin'], ['organic-overview']), null).channel)
    .toBe('INSTAGRAM')
  expect(resolveOrganicSubsection(client(['instagram', 'facebook', 'tiktok'], ['organic-overview']), null).channel)
    .toBe('INSTAGRAM')
})

/**
 * CHARACTERIZATION, and the blast-radius proof. Written against today's `resolveOrganicSubsection`
 * and mutation-proven, not watched to fail. It pins the property the whole change rests on: the
 * deep link's channel moves off null for a client if and only if that client hides Overview and
 * still has a platform tab left. Every other client, today's and any added later, keeps the exact
 * null the routes used to hard-code, so this fix cannot reach them.
 */
const ALL = ['instagram', 'facebook', 'linkedin', 'x']
const HIDES = [[], ['technical-audit'], ['technical-audit', 'content-impact'], ['organic-overview'],
  ['organic-overview', 'technical-audit']]
const CHANS: (string[] | undefined)[] = [undefined, ALL, ['instagram'], ['instagram', 'facebook'], [], ['nonsense']]

test('the deep-link channel leaves null only when the client hides Overview', () => {
  for (const hidden of HIDES) {
    for (const channels of CHANS) {
      const c = client(channels, hidden)
      const resolved = resolveOrganicSubsection(c, null).channel
      const hidesOverview = hidden.includes('organic-overview')
      const hasPlatformTab = organicSocialSubsections(c).some((s) => s.channel != null)
      const shouldMove = hidesOverview && hasPlatformTab
      expect(resolved === null, `hidden=${JSON.stringify(hidden)} channels=${JSON.stringify(channels)}`)
        .toBe(!shouldMove)
    }
  }
})

// An allowlist naming nothing we support leaves no platform tab, so Overview is kept and the deep
// link stays exactly where it was, even though the client asked to hide Overview.
test('a client with no usable platform tab keeps the Overview deep link even when it hides Overview', () => {
  expect(resolveOrganicSubsection(client(['nonsense'], ['organic-overview']), null).channel).toBeNull()
})

// Pinned because it reads backwards and this change now depends on it: an EMPTY channels array is
// "no allowlist" in resolveChannels (lib/organic-social/metrics.ts:38), so it means every channel,
// not none. An empty array and a nonsense array therefore land on opposite tabs.
test('an empty channels array means no allowlist, so the deep link lands on the first platform tab', () => {
  expect(resolveOrganicSubsection(client([], ['organic-overview']), null).channel).toBe('INSTAGRAM')
})
