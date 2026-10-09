import { auth } from '@/auth'
import { lockedRangeFor, requestClock } from '@/lib/organic-social/locked-range'
import { noMonthsText, viewerForRole } from '@/lib/organic-social/reporting-months'
import { MonthPicker } from './month-picker'

/** The Organic Social picker for a locked-months client (spec 4.4). The routes render it only for
 *  such a client. Reads the session only when no role is passed; a throw or a rejection both mean
 *  client rules. */
export async function OrganicRangeControl({ client, requested, role }: { client: unknown; requested: unknown; role?: string | null }) {
  let viewerRole = role
  if (viewerRole === undefined) {
    try { viewerRole = (await auth())?.user?.role ?? null } catch { viewerRole = null }
  }
  const locked = lockedRangeFor(client, viewerRole, requested, requestClock())
  if (!locked) return null
  return (
    <MonthPicker
      months={locked.months}
      value={locked.month?.key ?? null}
      emptyText={locked.month ? null : noMonthsText(locked, viewerForRole(viewerRole))}
    />
  )
}
