import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { organicSocialSubsections, resolveOrganicSubsection } from '@/lib/constants'
import type { Client } from '@/lib/db/schema'

/**
 * The deep-link routes (`/reports/organic-social`) used to hard-code `channel={null}`, which is
 * Overview. A client that hides Overview has no Overview to show, so the deep link rendered a tab
 * nobody can navigate to, and the health sweep and cache warmer fetch exactly those URLs
 * (`app/api/health/sweep/route.ts`, `app/api/cache-warm/route.ts`). Paul's review of PR 255.
 *
 * Read as text because a Next page module can't be imported here: `app/` is outside this repo's
 * vitest `include` (only `app/actions/**`), and a page file exports only its default.
 * `process.cwd()` is the repo root under vitest, whose config sits there.
 */
const ROUTES = {
  portal: 'app/portal/[clientSlug]/reports/[reportSlug]/page.tsx',
  dashboard: 'app/dashboard/[clientSlug]/reports/[reportSlug]/page.tsx',
}

const source = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

/** The `case 'organic-social':` arm only, so an unrelated `channel={null}` elsewhere can't mask a
 *  regression here and can't fail this test either. */
function organicArm(src: string): string {
  const CASE = "case 'organic-social':"
  const start = src.indexOf(CASE)
  expect(start, 'no organic-social case arm in this route').toBeGreaterThan(-1)
  const rest = src.slice(start + CASE.length)
  // Whichever bound comes FIRST ends the arm. Taking the next `case ` unconditionally would run
  // past `default:` and swallow the rest of the file, which is what this helper exists to prevent.
  const bounds = ['case ', 'default:'].map((b) => rest.indexOf(b)).filter((i) => i > -1)
  return bounds.length ? rest.slice(0, Math.min(...bounds)) : rest
}

test('the arm extractor stops at the next case or default, whichever comes first', () => {
  const arm = organicArm("case 'x':\n  case 'organic-social':\n    A\n    default:\n    B\n    case 'y':\n    C")
  expect(arm).toContain('A')
  expect(arm).not.toContain('B')
  expect(arm).not.toContain('C')
})

test.each(Object.entries(ROUTES))(
  'the %s deep link passes the landing tab, not a hard-coded Overview',
  (_name, rel) => {
    const src = source(rel)
    expect(organicArm(src)).not.toContain('channel={null}')
    expect(src).toContain('resolveOrganicSubsection(client, null).channel')
  },
)

// What that resolved channel actually is, per client. This is the behaviour the wiring above
// buys: Renaissance is unchanged (Overview, exactly today's hard-coded null), and a client that
// hides Overview lands on its first platform tab instead of a hidden one.
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
