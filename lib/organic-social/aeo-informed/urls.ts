// lib/organic-social/aeo-informed/urls.ts
// Sum Peec's URL rows per URL. The URL string is the key exactly as Peec returns it (Peec already normalizes it): do not use
// lib/url.ts urlJoinKey here, it drops the query string and would merge every YouTube watch?v= video into one row.
// Peec's row order is not defined, so the display fields (title, channel, classification) come from the row with the most retrievals
// that has a value, ties broken by the smallest value. The answer never depends on row order.
import type { PeecUrlRow, UrlAgg } from './types'

type Best = { weight: number; value: string }
const better = (cur: Best | undefined, weight: number, value: string): Best =>
  !cur || weight > cur.weight || (weight === cur.weight && value < cur.value) ? { weight, value } : cur

export function aggregateByUrl(rows: PeecUrlRow[]): UrlAgg[] {
  const byUrl = new Map<string, UrlAgg>()
  const picks = new Map<string, { title?: Best; channel?: Best; classification?: Best }>()
  for (const r of rows) {
    let a = byUrl.get(r.url)
    if (!a) {
      a = { url: r.url, title: null, channelTitle: null, classification: null, retrievals: 0, citations: 0, positionSum: 0, positionCount: 0, brandIds: [] }
      byUrl.set(r.url, a)
      picks.set(r.url, {})
    }
    const p = picks.get(r.url)!
    if (r.title !== null) p.title = better(p.title, r.retrieval_count, r.title)
    if (r.channel_title !== null) p.channel = better(p.channel, r.retrieval_count, r.channel_title)
    if (r.classification !== null) p.classification = better(p.classification, r.retrieval_count, r.classification)
    a.retrievals += r.retrieval_count
    a.citations += r.citation_count
    a.positionSum += r.citation_position_sum
    a.positionCount += r.citation_position_count
    for (const b of r.mentioned_brands) if (!a.brandIds.includes(b.id)) a.brandIds.push(b.id)
  }
  const out = [...byUrl.values()]
  for (const a of out) {
    const p = picks.get(a.url)!
    a.title = p.title?.value ?? null
    a.channelTitle = p.channel?.value ?? null
    a.classification = p.classification?.value ?? null
    a.brandIds.sort()
  }
  return out
}

/** Average rank among the chats that cited the URL inline. Null when none did: Peec only ranks inline citations, so a URL can have citations and no position. */
export function citationPosition(a: Pick<UrlAgg, 'positionSum' | 'positionCount'>): number | null {
  return a.positionCount > 0 ? a.positionSum / a.positionCount : null
}
