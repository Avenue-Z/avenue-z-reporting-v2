'use client'
// The Line / Columns toggle on a Social Listening chart (plan docs/superpowers/plans/2026-11-24-social-listening-feedback.md,
// Unit C; decisions D3: every viewer gets it, the PDF prints whichever view is on screen). Both views are drawn on the server
// and passed in; this only picks one. A click switches at once and writes the choice to the URL's `slcols`, so the route
// hands it to the export button and a reload keeps it. `router.replace`, not `push`: flipping a chart is not a page the Back
// button should step through. In the PDF only the chosen view is drawn, with no buttons.
import { useState, type ReactNode } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useExportMode } from '@/components/export/export-mode'
import { formatSlCols, parseSlCols, type SlToggleChart } from '@/lib/organic-social/social-listening/params'
import { nextHref } from './pending-url'
import s from '../design/kit.module.css'
import f from '../design/frames.module.css'

export type ChartView = 'line' | 'columns'

export function ChartToggle({ id, initial, line, columns }: { id: SlToggleChart; initial: ChartView; line: ReactNode; columns: ReactNode }) {
  const exportMode = useExportMode()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [view, setView] = useState<ChartView>(initial)
  // Follows a new view from the server (#529), as AuthorSortControl does, so the screen never shows one view while the URL,
  // and so the PDF, says the other.
  const [seen, setSeen] = useState<ChartView>(initial)
  if (initial !== seen) { setSeen(initial); setView(initial) }
  if (exportMode) return <>{initial === 'columns' ? columns : line}</>

  const choose = (next: ChartView) => {
    if (next === view) return
    setView(next)
    // Built on any URL a click before this one has not landed yet (pending-url.ts, #529).
    const href = nextHref(pathname, searchParams.toString(), (params) => {
      const others = parseSlCols(params.get('slcols')).filter((c) => c !== id)
      const value = formatSlCols(next === 'columns' ? [...others, id] : others)
      if (value) params.set('slcols', value)
      else params.delete('slcols')
    })
    router.replace(href, { scroll: false })
  }

  return (
    <>
      <div className={f.toggle} role="group" aria-label="Chart view">
        {(['line', 'columns'] as const).map((v) => (
          <button key={v} type="button" className={s.pill} aria-pressed={view === v} onClick={() => choose(v)}>
            {v === 'line' ? 'Line' : 'Columns'}
          </button>
        ))}
      </div>
      {view === 'columns' ? columns : line}
    </>
  )
}
