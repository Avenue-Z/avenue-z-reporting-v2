// Commentary follows the month on screen for locked-months clients (locked months spec 3.9).
import { firstOf, lastOf, opensOn, parseReportingMonths, shortDay, type Clock } from '@/lib/organic-social/reporting-months'
import { pickDefaultEntry } from './select'
import type { CommentaryEntry } from './types'

export const isOrganicSocialViewKey = (viewKey: string) => viewKey === 'organic-social' || viewKey.startsWith('organic-social:')

/** The month an entry belongs to: the month containing its periodStart. */
export const monthOfEntry = (e: Pick<CommentaryEntry, 'periodStart'>) => e.periodStart.slice(0, 7)

/** The served month's entries; for a client, only those ending by the newest month they can see. */
export function eligibleEntries(entries: CommentaryEntry[], monthKey: string, clientCutoff: string | null): CommentaryEntry[] {
  return entries.filter((e) => monthOfEntry(e) === monthKey && (clientCutoff === null || e.periodEnd <= clientCutoff))
}

/** A whole-month entry wins; otherwise today's ordering. Call on UN-redacted entries. */
export function pickMonthDefault(entries: CommentaryEntry[], monthKey: string): CommentaryEntry | null {
  const whole = entries.filter((e) => e.periodStart === firstOf(monthKey) && e.periodEnd === lastOf(monthKey))
  return pickDefaultEntry(whole.length ? whole : entries)
}

/** Team-only note: when clients will see an entry the cutoff still withholds, or null. */
export function clientOpensNote(entry: Pick<CommentaryEntry, 'periodEnd'>, cfgValue: unknown, clock: Clock): string | null {
  const parsed = parseReportingMonths(cfgValue)
  if (!parsed.ok || parsed.badKey) return null
  const open = opensOn(entry.periodEnd.slice(0, 7), parsed.cfg.opensOnDay, parsed.cfg.weekendRule)
  return clock.today < open ? `Clients see this from ${shortDay(open)}` : null
}
