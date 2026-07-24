import { fetchTopContent } from './top-content'
import { readSnapshot, writeSnapshot } from './snapshot'
import { isoRange } from './base'
import { getClientBySlug } from '@/lib/db/queries'
import type { DashChannel } from './metrics'
import type { TopContentPost } from './content-types'

/** A window is OPEN while range_end is today or in the future (snapshot §3 edge:
 *  a straddling window is open and freezes on the first render after range_end passes). */
export function isPeriodOpen(rangeEnd: string, today: string): boolean {
  return rangeEnd >= today
}

interface Deps {
  today: string
  isoRange: (dateRange: string) => { start: string; end: string }
  clientId: (slug: string) => Promise<string | null>
  fetchLive: (slug: string, dateRange: string, channel: DashChannel | null) => Promise<TopContentPost[]>
  readSnapshot: typeof readSnapshot
  writeSnapshot: typeof writeSnapshot
}

function defaultDeps(): Deps {
  return {
    today: new Date().toISOString().slice(0, 10),
    isoRange,
    clientId: async (slug) => (await getClientBySlug(slug))?.id ?? null,
    fetchLive: fetchTopContent,
    readSnapshot,
    writeSnapshot,
  }
}

/** Snapshot-aware Top Content. OPEN ⇒ live + overwrite; CLOSED + snapshot ⇒ read (no live
 *  data query); CLOSED + absent ⇒ fetch once + insert. `channel` scopes the snapshot key —
 *  Overview (channel null) snapshots under the sentinel 'ALL'. Designations are NOT frozen —
 *  the caller re-resolves them live (partitionPosts). */
export async function fetchTopContentFrozen(
  slug: string, dateRange: string, channel: DashChannel | null, injected?: Partial<Deps>,
): Promise<TopContentPost[]> {
  const d = { ...defaultDeps(), ...injected }
  const { start, end } = d.isoRange(dateRange)
  const clientId = await d.clientId(slug)
  const key = channel ?? 'ALL'

  if (isPeriodOpen(end, d.today)) {
    const posts = await d.fetchLive(slug, dateRange, channel)
    if (clientId) await d.writeSnapshot(clientId, key, start, end, posts)
    return posts
  }
  if (clientId) {
    const snap = await d.readSnapshot(clientId, key, start, end)
    if (snap.length > 0) return snap
  }
  const posts = await d.fetchLive(slug, dateRange, channel)
  if (clientId) await d.writeSnapshot(clientId, key, start, end, posts)
  return posts
}
