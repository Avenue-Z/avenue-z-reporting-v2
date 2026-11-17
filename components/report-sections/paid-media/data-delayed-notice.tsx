import { format } from 'date-fns'
import type { AdsNotice } from '@/lib/bq/googleads-window'

// Local midnight, as formatResolvedRange does, so the label can't drift a day west of UTC.
const day = (iso: string) => format(new Date(`${iso}T00:00:00`), 'MMM d, yyyy')

/** What the reader is told when Paid Search shows less than the range asked for (C3). `channel` names it on the Overview. */
export function adsNoticeText(notice: AdsNotice, channel?: string): string {
  const lead = channel ? `${channel} data delayed` : 'Data delayed'
  if (notice.kind === 'unavailable') return "Data delayed — Paid Search data can't be loaded right now. Try again shortly."
  const parts: string[] = []
  if (notice.through) parts.push(`${lead} — showing through ${day(notice.through)}${notice.empty ? ', so this range has no data yet' : ''}.`)
  if (notice.from) parts.push(`Paid Search history starts ${day(notice.from)}, so this range ${notice.empty ? 'has no data' : 'is shown from then'}.`)
  return parts.join(' ')
}

// Kept in the PDF: a reader of the export needs to know the numbers stop short of the range on its cover.
export function DataDelayedNotice({ notice, channel }: { notice: AdsNotice | null; channel?: string }) {
  if (!notice) return null
  return (
    <p role="note" data-export-block="" className="rounded-lg border border-brand-yellow/30 bg-bg-surface px-4 py-3 text-sm text-brand-yellow">
      {adsNoticeText(notice, channel)}
    </p>
  )
}
