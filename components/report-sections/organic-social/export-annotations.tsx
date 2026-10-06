'use client'

import { cardThumbs, type ChartAnnotation } from '@/lib/organic-social/annotations'
import { Thumb } from './annotation-callouts'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** `2026-09-10` → `Sep 10`, read from the string so no timezone can move the day. */
const dayLabel = (iso: string) => {
  const [, m, d] = iso.split('-').map(Number)
  return `${MONTHS[m - 1]} ${d}`
}

/** The chart's annotations as the PDF export prints them, under the chart: numbered (the number is also
 *  drawn at the day's point on the chart), dated, with the full approved note and the post(s) behind
 *  it, each linked. `items` are only what a client sees, already in date order. Each entry is one
 *  unbreakable block, and the list's title sits in the first entry's block so it never ends a page alone. */
export function ExportAnnotationList({ items }: { items: ChartAnnotation[] }) {
  return (
    <ul aria-label="Annotations" className="space-y-2">
      {items.map((a, i) => (
        <li key={a.date} data-export-block="" className="space-y-2">
          {i === 0 && <h3 className="text-xs font-extrabold uppercase tracking-widest text-text-muted">Annotations</h3>}
          <div className="flex items-start gap-3 rounded-lg border border-white/[0.08] bg-bg-surface p-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-extrabold"
              style={{ background: '#272727', color: '#ffffff' }}>{i + 1}</span>
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-xs font-bold text-white">{dayLabel(a.date)} · {a.label}</span>
              {a.note && <span className="whitespace-pre-line break-words text-xs text-white">{a.note}</span>}
            </span>
            {cardThumbs(a).map((t, j) => <Thumb key={j} thumb={t} alt={a.label} />)}
          </div>
        </li>
      ))}
    </ul>
  )
}
