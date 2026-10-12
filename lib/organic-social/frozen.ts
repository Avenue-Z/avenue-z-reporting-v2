import { fetchTopContent } from './top-content'
import { readSnapshot, writeSnapshot } from './snapshot'
import { isoRange } from './base'
import { resolveDateRange } from '@/lib/date-range'
import { getClientBySlug } from '@/lib/db/queries'
import { hasReportingMonths } from './reporting-months'
import type { DashChannel } from './metrics'
import type { TopContentPost } from './content-types'

/** The newest day a rolling range can end on: resolveDateRange's own last_1_days end, so yesterday on the
 *  clock every preset is resolved on (lib/date-range.ts). Asking the range code itself, rather than redoing its
 *  arithmetic, keeps the freeze and the range on one clock in every time zone, through daylight-saving changes,
 *  and through any later change to how ranges pick today (#278; Paul, #282). On a machine set to UTC this is
 *  the UTC date minus one day, exactly the boundary the freeze used before. */
export function rollingRangeEnd(): string {
  return resolveDateRange('last_1_days').endDate
}

/** A window is OPEN while it ends on or after `rollingEnd` (rollingRangeEnd above): every rolling preset
 *  (last_N_days, incl. the default last_30_days) ends exactly there, since today's partial day is excluded, and
 *  must stay live as it advances daily. A settled past window (a named month, last_month) ends before it ->
 *  CLOSED and frozen. (snapshot §3 edge: a straddling window is open and freezes on the first render after it
 *  settles.) */
export function isPeriodOpen(rangeEnd: string, rollingEnd: string): boolean {
  return rangeEnd >= rollingEnd
}

interface Deps {
  /** rollingRangeEnd() unless a test injects it. */
  rollingEnd: string
  isoRange: (dateRange: string) => { start: string; end: string }
  clientId: (slug: string) => Promise<string | null>
  fetchLive: (slug: string, dateRange: string, channel: DashChannel | null) => Promise<TopContentPost[]>
  readSnapshot: typeof readSnapshot
  writeSnapshot: typeof writeSnapshot
  /** Lock every number (D27): true for a client on locked months, whose Top Content answer is
   *  locked with every other number instead of frozen here. */
  responseLocked: (slug: string) => Promise<boolean>
}

function defaultDeps(): Deps {
  return {
    rollingEnd: rollingRangeEnd(),
    isoRange,
    clientId: async (slug) => (await getClientBySlug(slug))?.id ?? null,
    fetchLive: fetchTopContent,
    readSnapshot,
    writeSnapshot,
    responseLocked: async (slug) => hasReportingMonths(await getClientBySlug(slug)),
  }
}

/** Snapshot-aware Top Content. OPEN ⇒ live only (never frozen, never written — a rolling window's
 *  key shifts daily, so writing it would just accumulate dead per-day rows); CLOSED + snapshot ⇒
 *  read (no live data query); CLOSED + absent ⇒ fetch once + insert. `channel` scopes the key —
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
  // Lock every number (D27): a client on locked months has its Top Content answer locked with every
  // other number (dash_response_locks, via the locking client), so it skips this older freeze table.
  if (await d.responseLocked(slug)) return d.fetchLive(slug, dateRange, channel)
  const { start, end } = d.isoRange(dateRange)
  const key = channel ?? 'ALL'
  let clientId: string | null = null
  try { clientId = await d.clientId(slug) } catch { clientId = null }

  const open = isPeriodOpen(end, d.rollingEnd)

  // Closed period already frozen → serve the snapshot (no live query), INCLUDING a frozen-empty
  // window (returns []). A read that THROWS is a transient failure, not proof of absence: fall
  // through to live but do NOT re-write, so a momentary DB blip can't overwrite frozen numbers.
  let readFailed = false
  if (!open && clientId) {
    try {
      const snap = await d.readSnapshot(clientId, key, start, end)
      if (snap.frozen) return snap.posts
    } catch (e) {
      readFailed = true
      console.warn('[organic-social] snapshot read failed; serving live (not overwriting):', (e as Error).message)
    }
  }

  // OPEN, or closed-and-not-yet-frozen → live. Persist ONLY when closed AND the read succeeded
  // (absent, not failed): an open/rolling window is never frozen (writing it churns dead per-day
  // rows), and a failed read must not clobber an existing snapshot.
  const posts = await d.fetchLive(slug, dateRange, channel)
  if (clientId && !open && !readFailed) {
    try {
      await d.writeSnapshot(clientId, key, start, end, posts)
    } catch (e) {
      console.warn('[organic-social] snapshot write failed; served live (not frozen):', (e as Error).message)
    }
  }
  return posts
}
