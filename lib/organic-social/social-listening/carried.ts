// lib/organic-social/social-listening/carried.ts
// The keyword appendix carries over month to month (plan docs/superpowers/plans/2026-11-24-social-listening-feedback.md,
// Unit G; spec F5, D10): when a month has no appendix of its own, the newest earlier approved one shows, to the client too,
// with no new approval. Nothing is copied or written; the appendix is read where it was approved. Only the two keyword
// boxes carry over. Pure, no I/O.
import { clientMonthEntry, eligibleEntries, monthOfEntry, pickMonthDefault } from '@/lib/commentary/month'
import { visibleEntries } from '@/lib/commentary/select'
import type { CommentaryCapabilities, CommentaryEntry } from '@/lib/commentary/types'
import type { SlBoxId } from './boxes'

/** The boxes whose approved text carries into a month that has none. */
export const SL_CARRIED_BOXES: readonly SlBoxId[] = ['b-keywords', 'i-keywords']

export function isCarriedBox(id: SlBoxId): boolean {
  return SL_CARRIED_BOXES.includes(id)
}

/** The newest approved entry of a month before `month`: the latest such month, and in it the entry a client would open on
 *  (a whole-month entry first, else the newest), from the approved entries only. Null when there is none. `entries` are
 *  one box's rows. */
export function carriedEntry(entries: CommentaryEntry[], month: string): CommentaryEntry | null {
  const approved = visibleEntries(entries, { canEdit: false, canApprove: false }).filter((e) => monthOfEntry(e) < month)
  if (approved.length === 0) return null
  const latest = approved.map(monthOfEntry).sort().at(-1)!
  return pickMonthDefault(approved.filter((e) => monthOfEntry(e) === latest), latest)
}

/** Whether the viewer already has this month's own entry, so nothing carries over. A client (and the PDF, and a preview)
 *  has one only when a client would open on an approved entry for the month (clientMonthEntry), so a staff draft never
 *  hides the carried appendix from the client before it is approved. Staff have one as soon as they can see any entry of
 *  the month, so their draft shows in place of the carried text. */
export function hasOwnEntry(entries: CommentaryEntry[], month: string, viewer: { clientView: boolean; caps: CommentaryCapabilities; clientMonths: { key: string }[] }): boolean {
  if (viewer.clientView) return clientMonthEntry(entries, month, viewer.clientMonths) !== null
  return eligibleEntries(visibleEntries(entries, viewer.caps), month, null).length > 0
}
