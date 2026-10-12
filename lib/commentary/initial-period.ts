import type { CommentaryEntry } from './types'

/** The period the editor starts from: an edited entry's own, else the month on screen for a new
 *  entry on a locked-months view, else empty (today's behaviour). */
export function initialPeriod(entry?: Pick<CommentaryEntry, 'periodStart' | 'periodEnd'>, defaultPeriod?: { start: string; end: string }) {
  return { start: entry?.periodStart ?? defaultPeriod?.start ?? '', end: entry?.periodEnd ?? defaultPeriod?.end ?? '' }
}
