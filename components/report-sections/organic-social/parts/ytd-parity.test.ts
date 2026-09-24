import { expect, test } from 'vitest'
import { lookup } from '@/lib/report-sections/registry'
import { ORGANIC_SOCIAL_PARTS } from './registry'
import { platformHeadlinesV1 } from './platform-headlines'
import { platformHeadlinesV2, platformHeadlinesV3 } from './outline-data'
import { engagementBreakdownV1 } from './engagement-breakdown'
import { engagementTrendV1 } from './engagement-trend'
import { followerGraphV1 } from './follower-graph'
import { topContentV1, topContentV2 } from './top-content'
import { topContentV3 } from './top-content-outline'

// Pre-change record for YTD Review: adding a part must leave every existing entry in place and the
// same object. Never an exact key list: PR 252 adds v2 of both graphs on its own branch.
test('every part registered today is still there, and still the same object', () => {
  const entries = [
    ['platform-headlines', 1, platformHeadlinesV1], ['platform-headlines', 2, platformHeadlinesV2],
    ['platform-headlines', 3, platformHeadlinesV3], ['engagement-trend', 1, engagementTrendV1],
    ['follower-graph', 1, followerGraphV1], ['top-content', 1, topContentV1],
    ['top-content', 2, topContentV2], ['top-content', 3, topContentV3],
    ['engagement-breakdown', 1, engagementBreakdownV1],
  ] as const
  for (const [id, version, impl] of entries) expect(lookup(ORGANIC_SOCIAL_PARTS, id, version)).toBe(impl)
})

test('the parts a client pins are unpublished, and the shared defaults stay published', () => {
  expect([platformHeadlinesV1.published, engagementTrendV1.published, followerGraphV1.published, topContentV1.published, topContentV2.published]).toEqual([true, true, true, true, true])
  expect([platformHeadlinesV2.published, platformHeadlinesV3.published, engagementBreakdownV1.published, topContentV3.published]).toEqual([false, false, false, false])
})
