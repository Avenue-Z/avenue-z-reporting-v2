import { cache } from 'react'
import { fetchTopContentFrozen } from './frozen'
import type { DashChannel } from './metrics'
import type { TopContentPost } from './content-types'

/** The posts behind a tab's graph annotations. React-cached on its three arguments, so the
 *  follower graph and the engagement graph of one tab share a single fetch per render.
 *
 *  It reads a frozen Top Content window when one exists and fetches live otherwise, but it
 *  NEVER writes the snapshot: only Top Content freezes a window. If a graph froze one first,
 *  that window would be captured without post authors, which silently disables the collab
 *  rule top-content@3 depends on. */
export const graphPosts = cache((slug: string, dateRange: string, channel: DashChannel | null): Promise<TopContentPost[]> =>
  fetchTopContentFrozen(slug, dateRange, channel, { writeSnapshot: async () => {} }))
