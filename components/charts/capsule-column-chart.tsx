'use client'

import { useState } from 'react'
import { CHART_COLORS } from '@/lib/constants'
import { EditableText } from '@/components/dashboard/editable-text'

export interface CapsuleColumnRow {
  name: string
  /** Raw dimension value — used as the edit target's rawValue. */
  key: string
  /** Numeric value — drives column height. */
  value: number
  /** Pre-formatted display string for the value (formatting happens server-side
   *  so no formatter function crosses the server→client boundary). */
  label: string
  /** Prior-period numeric value — drives the dashed prior-level overlay. */
  prior?: number
  /** Pre-formatted display string for the prior value. */
  priorLabel?: string
}

export interface CapsuleColumnChartProps {
  rows: CapsuleColumnRow[]
  compareLabel?: string
  /** Subtle horizontal reference lines on the value scale (bar block semantics). */
  target?: number
  ceiling?: number
  slug: string
  canEdit: boolean
  dimKey: string
}

const BAR_COLOR = CHART_COLORS.primary  // #60FDFF
const BAR_COLOR_HOVER = '#9BFEFF'       // brighter cyan on hover (matches AEO bars)

function deltaPct(cur: number, prior: number): number | null {
  if (!prior) return null
  return ((cur - prior) / prior) * 100
}

/** Compact y-axis tick (1,400,000 → "1.4M") — no symbol, like the report axes. */
function formatTick(v: number): string {
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(v)
}

/** Generic vertical bar chart — the reporting "big vertical bars" look
 *  (modeled on peec-ai/visibility-chart). Bars fill their cell width, brighten on
 *  hover and dim their siblings; the prior period (when present) is a dashed level
 *  line over each bar, with the delta shown on hover. Display strings are
 *  pre-formatted by the caller (RSC-safe). The caller wraps this in <ChartCard>. */
export function CapsuleColumnChart({
  rows,
  compareLabel = 'Prior period',
  target,
  ceiling,
  slug,
  canEdit,
  dimKey,
}: CapsuleColumnChartProps) {
  const [hovered, setHovered] = useState<number | null>(null)
  // Scale to current values + any target/ceiling. Prior is shown only in the
  // hover tooltip (no on-chart marker), so it does not affect the scale.
  const max = Math.max(
    ...rows.map((r) => r.value),
    target ?? 0,
    ceiling ?? 0,
    1,
  )

  // Tick values top→bottom, aligned with the 5 gridlines (max at top, 0 at bottom).
  const ticks = [1, 0.75, 0.5, 0.25, 0].map((f) => max * f)

  return (
    <div className="flex h-full flex-col">
      {/* Y axis + plot */}
      <div className="flex min-h-0 flex-1">
        {/* Y axis ticks — justify-between matches the gridlines' spacing */}
        <div className="flex w-12 shrink-0 flex-col justify-between pr-2 text-right text-[9px] leading-none tabular-nums text-text-muted">
          {ticks.map((t, i) => (
            <span key={i}>{formatTick(t)}</span>
          ))}
        </div>

        {/* Plot area */}
        <div className="relative min-h-0 flex-1">
        {/* Horizontal gridlines */}
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="w-full border-t border-white/[0.04]" />
          ))}
        </div>

        {/* Target / ceiling reference lines */}
        {target !== undefined && (
          <div
            className="pointer-events-none absolute inset-x-0 border-t border-dashed"
            style={{ bottom: `${(target / max) * 100}%`, borderColor: '#5DD39E' }}
          />
        )}
        {ceiling !== undefined && (
          <div
            className="pointer-events-none absolute inset-x-0 border-t border-dashed"
            style={{ bottom: `${(ceiling / max) * 100}%`, borderColor: '#FF8A3D' }}
          />
        )}

        {/* Bars — each fills its flex-1 cell width (AEO style) */}
        <div className="relative flex h-full gap-1">
          {rows.map((row, i) => {
            const hPct = (row.value / max) * 100
            const isHovered = hovered === i
            const isDimmed = hovered !== null && !isHovered
            const d = row.prior !== undefined ? deltaPct(row.value, row.prior) : null
            return (
              <div
                key={row.key}
                className="group relative h-full flex-1 cursor-default"
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
              >
                {/* Hover tooltip */}
                {isHovered && (
                  <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md border border-white/[0.08] bg-bg-surface px-2.5 py-1.5 text-xs shadow-xl">
                    <p className="font-bold text-white">{row.label}</p>
                    {row.priorLabel !== undefined && (
                      <p className="text-text-muted">
                        {compareLabel}: {row.priorLabel}
                      </p>
                    )}
                    {d !== null && (
                      <p
                        className="font-bold"
                        style={{ color: d >= 0 ? CHART_COLORS.positive : CHART_COLORS.negative }}
                      >
                        {d >= 0 ? '↑' : '↓'} {Math.abs(d).toFixed(1)}%
                      </p>
                    )}
                  </div>
                )}

                {/* Current-period bar — fills cell width */}
                <div
                  className="absolute bottom-0 left-0 right-0 rounded-sm transition-colors duration-150"
                  style={{
                    height: `${Math.max(hPct, 1)}%`,
                    backgroundColor: isHovered ? BAR_COLOR_HOVER : BAR_COLOR,
                    opacity: isDimmed ? 0.35 : 1,
                  }}
                />
              </div>
            )
          })}
        </div>
        </div>
      </div>

      {/* Category labels — offset past the y-axis gutter to align under the bars */}
      <div className="mt-2 flex gap-1 pl-12">
        {rows.map((row) => (
          <div className="flex-1 truncate text-center" key={row.key}>
            <EditableText
              value={row.name}
              slug={slug}
              target={{ kind: 'labelValue', dimKey, rawValue: row.key }}
              canEdit={canEdit}
              as="span"
              className="text-[10px] text-text-muted"
            />
          </div>
        ))}
      </div>
    </div>
  )
}
