import type { TopContentPost } from './content-types'
import { urlJoinKey } from '@/lib/url'
import { getResolution } from '@/lib/linkedin-resolve/resolve'
import { getPlacementCitations } from '@/lib/peec/url-citations'
import { getClientBySlug } from '@/lib/db/queries'

export type RetrievalResult = Map<number, number | null>

/** Pure join. null = no workspace OR unresolved (render —/N/A); number (incl 0) = matched. */
export function computeRetrievals(
  posts: TopContentPost[],
  resolvedKeyByPostId: Map<number, string>,
  retrievalsByKey: Map<string, number>,
  hasWorkspace: boolean,
): RetrievalResult {
  const out: RetrievalResult = new Map()
  for (const p of posts) {
    if (!hasWorkspace) { out.set(p.id, null); continue }
    const key = resolvedKeyByPostId.get(p.id)
    if (!key) { out.set(p.id, null); continue }       // unresolved => —
    out.set(p.id, retrievalsByKey.get(key) ?? 0)      // resolved-but-not-cited => 0
  }
  return out
}

/** Wired version. LinkedIn posts resolve via canonical; other platforms match their url directly. */
export async function retrievalsForPosts(clientSlug: string, posts: TopContentPost[]): Promise<RetrievalResult> {
  const client = await getClientBySlug(clientSlug)
  const hasWorkspace = !!client?.peecCustomerProjectId
  if (!hasWorkspace) return computeRetrievals(posts, new Map(), new Map(), false)

  // Resolve each post's canonical key (LinkedIn: page resolution; others: direct urlJoinKey).
  const resolvedKeyByPostId = new Map<number, string>()
  await Promise.all(posts.map(async (p) => {
    if (!p.url) return
    if (p.channel === 'LINKEDIN') {
      const r = await getResolution(p.url)
      const key = r.canonicalUrl ? urlJoinKey(r.canonicalUrl) : null
      if (key) resolvedKeyByPostId.set(p.id, key)
    } else {
      const key = urlJoinKey(p.url)
      if (key) resolvedKeyByPostId.set(p.id, key)
    }
  }))

  // One all-time Peec fetch for exactly the resolved keys.
  const keys = [...new Set(resolvedKeyByPostId.values())]
  const retrievalsByKey = new Map<string, number>()
  if (keys.length) {
    const citations = await getPlacementCitations(clientSlug, keys, { startDate: '2015-01-01' })
    for (const c of citations) retrievalsByKey.set(c.urlKey, c.retrievals)
  }
  return computeRetrievals(posts, resolvedKeyByPostId, retrievalsByKey, true)
}
