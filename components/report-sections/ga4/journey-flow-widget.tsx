'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

interface FlowPage {
  page: string
  sessions: number
  bounceRate?: number
}

interface JourneyFlowWidgetProps {
  entryPages: FlowPage[]
  exitPages: FlowPage[]
}

function shortPath(page: string): string {
  if (!page || page === '/') return '/ (Home)'
  // Strip query string
  const path = page.split('?')[0]
  const parts = path.split('/').filter(Boolean)
  if (parts.length === 0) return '/'
  if (parts.length === 1) return `/${parts[0]}`
  return `…/${parts[parts.length - 1]}`
}

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`
}

const ENTRY_COLOR = '#3B82F6' // blue
const EXIT_COLOR  = '#FF7A59' // orange

export function JourneyFlowWidget({ entryPages, exitPages }: JourneyFlowWidgetProps) {
  const svgRef   = useRef<SVGSVGElement>(null)
  const leftRef  = useRef<HTMLDivElement>(null)
  const rightRef = useRef<HTMLDivElement>(null)

  const [paths, setPaths] = useState<{ d: string; color: string; opacity: number }[]>([])
  const [hovered, setHovered] = useState<{ side: 'entry' | 'exit'; index: number } | null>(null)

  const maxEntry = Math.max(...entryPages.map((p) => p.sessions), 1)
  const maxExit  = Math.max(...exitPages.map((p) => p.sessions), 1)

  useEffect(() => {
    const svg     = svgRef.current
    const left    = leftRef.current
    const right   = rightRef.current
    if (!svg || !left || !right) return

    const svgRect   = svg.getBoundingClientRect()
    const leftItems  = left.querySelectorAll<HTMLElement>('[data-row]')
    const rightItems = right.querySelectorAll<HTMLElement>('[data-row]')

    const count = Math.min(leftItems.length, rightItems.length)
    const newPaths: { d: string; color: string; opacity: number }[] = []

    for (let i = 0; i < count; i++) {
      const lRect = leftItems[i].getBoundingClientRect()
      const rRect = rightItems[i].getBoundingClientRect()

      const x1 = lRect.right  - svgRect.left
      const y1 = lRect.top    + lRect.height / 2 - svgRect.top
      const x2 = rRect.left   - svgRect.left
      const y2 = rRect.top    + rRect.height / 2 - svgRect.top

      const cx = (x1 + x2) / 2
      const d  = `M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`

      const isActive =
        hovered === null ||
        (hovered.side === 'entry' && hovered.index === i) ||
        (hovered.side === 'exit'  && hovered.index === i)

      newPaths.push({
        d,
        color:   i === 0 ? ENTRY_COLOR : '#8A8A8A',
        opacity: isActive ? (i === 0 ? 0.7 : 0.3) : 0.08,
      })
    }

    setPaths(newPaths)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hovered, entryPages.length, exitPages.length])

  // Recalculate on resize
  useEffect(() => {
    const observer = new ResizeObserver(() => {
      setHovered((h) => h) // trigger re-render to recalc paths
    })
    if (svgRef.current?.parentElement) observer.observe(svgRef.current.parentElement)
    return () => observer.disconnect()
  }, [])

  return (
    <div className="rounded-lg border border-white/[0.06] bg-bg-surface p-6">
      {/* Header */}
      <div className="mb-5 flex items-center gap-2">
        <h3 className="text-lg font-bold text-white">Entry → Exit Flow</h3>
        <div className="group relative flex-shrink-0">
          <span className="flex h-3.5 w-3.5 cursor-default items-center justify-center rounded-full border border-white/20 text-[9px] font-bold leading-none text-text-muted">
            ?
          </span>
          <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-72 -translate-x-1/2 rounded-md border border-white/[0.08] bg-bg-surface px-3 py-2 text-xs leading-relaxed text-text-muted opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100">
            Where visitors start vs. where they leave. Entry pages are the first pages visitors see; exit pages are where they leave — matched by rank to show the most common journey patterns. Hover a row to highlight its path.
            <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-white/[0.08]" />
          </div>
        </div>
      </div>

      {/* Column labels */}
      <div className="mb-3 grid grid-cols-[1fr_80px_1fr] items-center">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: ENTRY_COLOR }} />
          <span className="text-xs font-bold uppercase tracking-wider text-text-muted">Entry Pages</span>
        </div>
        <div />
        <div className="flex items-center justify-end gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-text-muted">Exit Pages</span>
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: EXIT_COLOR }} />
        </div>
      </div>

      {/* Flow layout */}
      <div className="relative">
        <div className="grid grid-cols-[1fr_80px_1fr] gap-0">
          {/* Left column — Entry Pages */}
          <div ref={leftRef} className="flex flex-col gap-2">
            {entryPages.map((page, i) => {
              const barW   = Math.round((page.sessions / maxEntry) * 100)
              const active = hovered === null || (hovered.side === 'entry' && hovered.index === i)
              return (
                <div
                  key={i}
                  data-row={i}
                  className={cn(
                    'relative cursor-default rounded-md border px-3 py-2 transition-all duration-200',
                    active
                      ? 'border-white/[0.12] bg-white/[0.04]'
                      : 'border-transparent opacity-30'
                  )}
                  onMouseEnter={() => setHovered({ side: 'entry', index: i })}
                  onMouseLeave={() => setHovered(null)}
                >
                  {/* Progress fill */}
                  <div
                    className="pointer-events-none absolute inset-y-0 left-0 rounded-md transition-all duration-300"
                    style={{
                      width: `${barW}%`,
                      backgroundColor: ENTRY_COLOR,
                      opacity: 0.08,
                    }}
                  />
                  <div className="relative flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-[9px] font-bold text-black"
                        style={{ backgroundColor: ENTRY_COLOR, opacity: active ? 1 : 0.5 }}
                      >
                        {i + 1}
                      </span>
                      <span className="truncate text-xs text-white/80" title={page.page}>
                        {shortPath(page.page)}
                      </span>
                    </div>
                    <span className="shrink-0 tabular-nums text-xs font-semibold text-white/60">
                      {page.sessions.toLocaleString()}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* SVG connector — overlaid in middle column */}
          <div className="relative">
            <svg
              ref={svgRef}
              className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
              style={{ zIndex: 1 }}
            >
              {paths.map((p, i) => (
                <path
                  key={i}
                  d={p.d}
                  fill="none"
                  stroke={p.color}
                  strokeWidth={hovered?.index === i ? 2 : 1.5}
                  strokeOpacity={p.opacity}
                  strokeDasharray={i === 0 ? undefined : undefined}
                  style={{ transition: 'stroke-opacity 0.2s' }}
                />
              ))}
            </svg>
          </div>

          {/* Right column — Exit Pages */}
          <div ref={rightRef} className="flex flex-col gap-2">
            {exitPages.map((page, i) => {
              const barW   = Math.round((page.sessions / maxExit) * 100)
              const active = hovered === null || (hovered.side === 'exit' && hovered.index === i)
              return (
                <div
                  key={i}
                  data-row={i}
                  className={cn(
                    'relative cursor-default rounded-md border px-3 py-2 transition-all duration-200',
                    active
                      ? 'border-white/[0.12] bg-white/[0.04]'
                      : 'border-transparent opacity-30'
                  )}
                  onMouseEnter={() => setHovered({ side: 'exit', index: i })}
                  onMouseLeave={() => setHovered(null)}
                >
                  {/* Progress fill (right-aligned) */}
                  <div
                    className="pointer-events-none absolute inset-y-0 right-0 rounded-md transition-all duration-300"
                    style={{
                      width: `${barW}%`,
                      backgroundColor: EXIT_COLOR,
                      opacity: 0.08,
                    }}
                  />
                  <div className="relative flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-[9px] font-bold text-black"
                        style={{ backgroundColor: EXIT_COLOR, opacity: active ? 1 : 0.5 }}
                      >
                        {i + 1}
                      </span>
                      <span className="truncate text-xs text-white/80" title={page.page}>
                        {shortPath(page.page)}
                      </span>
                    </div>
                    <div className="flex shrink-0 flex-col items-end">
                      <span className="tabular-nums text-xs font-semibold text-white/60">
                        {page.sessions.toLocaleString()}
                      </span>
                      {page.bounceRate != null && (
                        <span className="text-[10px] text-text-muted">
                          {fmtPct(page.bounceRate)} bounce
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Footer note */}
      <p className="mt-4 text-[10px] text-text-muted/50">
        Entry pages ranked by sessions · Exit pages ranked by bounce rate (≥10 sessions) · Rows matched by rank
      </p>
    </div>
  )
}
