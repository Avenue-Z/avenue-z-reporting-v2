// The one Top Content request that carries post authors and UGC marks (Paul, #358 review). The Instagram tab
// (top-content@3, or @2 with the author rule), Overview and the Influencer tab all use it, so a post is read the same
// way, under the same snapshot key, on every page. Separate from frozen.ts so tests that mock frozen.ts still see
// fetchTopContentFrozen called with this injection.
import { fetchTopContentFrozen } from './frozen'
import { fetchTopContent } from './top-content'
import type { DashChannel } from './metrics'

export function fetchTopContentFrozenWithAuthors(slug: string, dateRange: string, channel: DashChannel | null) {
  return fetchTopContentFrozen(slug, dateRange, channel, { fetchLive: (s, d, c) => fetchTopContent(s, d, c, { withAuthor: true, markUgc: true }) })
}
