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
  const keys = [...new Set(resolvedKeyByPostId.values())].sort()
  const retrievalsByKey = new Map<string, number>()
  if (keys.length) {
    const citations = await getPlacementCitations(clientSlug, keys, { startDate: '2015-01-01' })
    for (const c of citations) retrievalsByKey.set(c.urlKey, c.retrievals)
  }
  return computeRetrievals(posts, resolvedKeyByPostId, retrievalsByKey, true)
}

// ── Task 7: owned AI-retrieved content (Surface B) ──────────────────────────
// Every LinkedIn URL Peec cited, filtered to the client's OWN content, ranked
// by retrievals desc.

export type OwnedRetrieval = { url: string; title: string | null; retrievals: number; engines: string[] }

/** Pure owned-ness test for a LinkedIn cited URL. */
export function isOwnedLinkedIn(urlKey: string, authorUrl: string | null, handle: string): boolean {
  const h = handle.trim().toLowerCase()
  if (!h) return false
  if (new RegExp(`^linkedin\\.com/posts/${h}(_|/|$)`, 'i').test(urlKey)) return true
  if (/^linkedin\.com\/pulse\//i.test(urlKey) && authorUrl) {
    const authorKey = urlJoinKey(authorUrl)
    return !!authorKey && new RegExp(`^linkedin\\.com/company/${h}(/|$)`, 'i').test(authorKey)
  }
  return false
}

export async function ownedAiRetrievedContent(clientSlug: string): Promise<OwnedRetrieval[]> {
  const client = await getClientBySlug(clientSlug)
  const handle = client?.ownedLinkedinHandle?.trim().toLowerCase()
  if (!handle || !client?.peecCustomerProjectId) return []

  // coverage: getUrlCitations is capped at 2,000 rows (see lib/peec/url-citations.ts).
  // Owned LinkedIn URLs are few and (per probing) rank well by citation, so this is
  // sufficient today. If coverage proves insufficient in /verify, switch to the
  // all-pages walk (getPlacementCitations-style) filtered to linkedin.com/(posts|pulse).
  const { getUrlCitations } = await import('@/lib/peec/url-citations')
  const citations = await getUrlCitations(clientSlug, { startDate: '2015-01-01' })
  const linkedin = citations.filter((c) => /^linkedin\.com\/(posts|pulse)\//i.test(c.urlKey))

  const out: OwnedRetrieval[] = []
  for (const c of linkedin) {
    // posts: handle is in the path (no fetch). pulse: need the author (resolve, cached).
    let authorUrl: string | null = null
    if (/^linkedin\.com\/pulse\//i.test(c.urlKey)) authorUrl = (await getResolution(c.url)).authorUrl
    if (isOwnedLinkedIn(c.urlKey, authorUrl, handle)) {
      out.push({ url: c.url, title: c.title, retrievals: c.retrievals, engines: c.engines })
    }
  }
  return out.sort((a, b) => b.retrievals - a.retrievals)
}
