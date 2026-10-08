'use client'

import { cardThumbs, dayLabel, type ChartAnnotation } from '@/lib/organic-social/annotations'
import { Thumb } from './annotation-callouts'

/** The chart's annotations as the PDF export prints them, under the chart: a day with a point is numbered as its
 *  mark on the chart is (`numbers`), dated, with the full approved note and the post(s) behind
 *  it, each linked. `items` are only what a client sees, already in date order. Each entry is one
 *  unbreakable block, and the list's title sits in the first entry's block so it never ends a page alone. */
export function ExportAnnotationList({ items, numbers }: { items: ChartAnnotation[]; numbers: ReadonlyMap<string, number> }) {
  return (
    <ul aria-label="Annotations" className="space-y-2">
      {items.map((a, i) => (
        <li key={a.date} data-export-block="" className="space-y-2">
          {i === 0 && <h3 className="text-xs font-extrabold uppercase tracking-widest text-text-muted">Annotations</h3>}
          <div className="flex items-start gap-3 rounded-lg border border-white/[0.08] bg-bg-surface p-3">
            {/* The number of its mark on the chart; a day off the chart has no mark, so no number (a spacer keeps the
                text aligned). */}
            {numbers.has(a.date) ? (
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-extrabold"
                style={{ background: '#272727', color: '#ffffff' }}>{numbers.get(a.date)}</span>
            ) : <span aria-hidden className="h-6 w-6 shrink-0" />}
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
