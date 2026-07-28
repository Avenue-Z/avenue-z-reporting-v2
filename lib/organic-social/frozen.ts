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
 *  the caller re-resolves them live (partitionPosts).
 *
 *  Snapshot persistence is BEST-EFFORT: a read/write failure (e.g. the migration hasn't been
 *  applied, or a transient DB error) degrades to a plain live fetch rather than blanking the
 *  section — it just isn't frozen. Failures are logged so a missed migration stays visible. */
export async function fetchTopContentFrozen(
  slug: string, dateRange: string, channel: DashChannel | null, injected?: Partial<Deps>,
): Promise<TopContentPost[]> {
  const d = { ...defaultDeps(), ...injected }
  const { start, end } = d.isoRange(dateRange)
  const key = channel ?? 'ALL'
  let clientId: string | null = null
  try { clientId = await d.clientId(slug) } catch { clientId = null }

  const open = isPeriodOpen(end, d.today)

  // Closed period with a stored snapshot → serve it (no live query). Any read failure falls
  // through to the live fetch below.
  if (!open && clientId) {
    try {
      const snap = await d.readSnapshot(clientId, key, start, end)
      if (snap.length > 0) return snap
    } catch (e) {
      console.warn('[organic-social] snapshot read failed; serving live:', (e as Error).message)
    }
  }

  // OPEN, or closed-and-not-yet-snapshotted, or a failed read → live + best-effort persist.
  const posts = await d.fetchLive(slug, dateRange, channel)
  if (clientId) {
    try {
      await d.writeSnapshot(clientId, key, start, end, posts)
    } catch (e) {
      console.warn('[organic-social] snapshot write failed; served live (not frozen):', (e as Error).message)
    }
  }
  return posts
}
