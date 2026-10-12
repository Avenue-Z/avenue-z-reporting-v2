import { expect, test } from 'vitest'
import { outlineSpecsFor, OUTLINE_DATA_ROWS, OUTLINE_BREAKDOWN_ROWS } from './outline-layout'
import { metricFor, PLATFORM_KPIS } from './metrics'

// Pre-change record for the outline fixes: what IG, FB and LI request in the outline Data block,
// the shared tiles of the channels that exist today (TikTok is added by PR 247, so it is left out
// on purpose to keep this record true in any merge order), Kenect's variant, FB, LI and the breakdown.
test('requests, shared tiles and rows that must not move', () => {
  const channels = ['INSTAGRAM', 'FACEBOOK', 'LINKEDIN'] as const
  expect({
    requests: Object.fromEntries(channels.map((c) => [c, outlineSpecsFor(c).map(metricFor)])),
    shared: Object.fromEntries((['INSTAGRAM', 'FACEBOOK', 'TWITTER', 'LINKEDIN'] as const).map((c) => [c, PLATFORM_KPIS[c]])),
    kenect: OUTLINE_DATA_ROWS.profileClicks.INSTAGRAM,
    facebook: OUTLINE_DATA_ROWS.standard.FACEBOOK,
    linkedin: OUTLINE_DATA_ROWS.standard.LINKEDIN,
    breakdown: OUTLINE_BREAKDOWN_ROWS,
  }).toMatchSnapshot()
})
