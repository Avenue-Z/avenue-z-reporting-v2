'use client'

import { useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'
import { bucketDaily } from '@/lib/aeo/bucket'
import type { BucketGranularity, ChartBucket, DailyPoint } from '@/lib/aeo/types'
import { useExportMode } from '@/components/export/export-mode'
import {
  MAX_COMPETITOR_LINES, TREND_PARAM, defaultTrendSelection, parseTrendParam, serializeTrend, type TrendSelection,
} from './trend-selection'
import { shadeRange } from './trend-shading'

export type TrendSeries = { key: string; name: string; color: string; isYou: boolean; points: DailyPoint[] }
type DateWindow = { start: string; end: string }
type Line = { s: TrendSeries; buckets: ChartBucket[] }

const GRANULARITIES: { id: BucketGranularity; label: string }[] = [
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'quarterly', label: 'Quarterly' },
]

const CAP_LINE = `Up to ${MAX_COMPETITOR_LINES + 1} lines at once. Uncheck a brand to add another.`

function summaryLine(clientName: string | null, competitors: number, g: BucketGranularity): string {
  const others = competitors > 0 ? `${competitors} ${competitors === 1 ? 'competitor' : 'competitors'}` : null
  const drawn = [clientName, others].filter(Boolean).join(' and ')
  return `${drawn} · ${g}`
}

/**
 * Section 02's year-to-date visibility trend, one line per brand. The competitor selection lives in the URL
 * (`aeoTrend`, ./trend-selection.ts) so the PDF export draws the same lines; the granularity is local, weekly by default.
 * Competitors off draws the client's line alone with the selected period shaded, and its comparison period in a lighter
 * tone when deltas show. With no client brand identified there is no client line, so the switch is hidden and a muted line
 * says so; the competitor lines still draw.
 */
export function BrandTrendChart({
  series,
  competitorKeysByVisibility,
  period,
  comparePeriod,
  showDeltas,
  note,
}: {
  series: TrendSeries[]
  competitorKeysByVisibility: string[]
  period: DateWindow
  comparePeriod: DateWindow | null
  showDeltas: boolean
  note: string | null
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const exporting = useExportMode()
  const [granularity, setGranularity] = useState<BucketGranularity>('weekly')
  const [hovered, setHovered] = useState<number | null>(null)

  const selection = parseTrendParam(searchParams.get(TREND_PARAM), competitorKeysByVisibility)

  const bucketed = useMemo(
    () => series.map((s) => ({ s, buckets: bucketDaily(s.points, granularity) })),
    [series, granularity],
  )
  // One x axis for every brand, drawn or not, so ticking a box never shifts it.
  const { keys, labels } = useMemo(() => {
    const byKey = new Map<string, string>()
    for (const { buckets } of bucketed) for (const b of buckets) byKey.set(b.key, b.label)
    const sorted = [...byKey.keys()].sort()
    return { keys: sorted, labels: sorted.map((k) => byKey.get(k)!) }
  }, [bucketed])

  const seriesByKey = new Map(series.map((s) => [s.key, s]))
  const client = series.find((s) => s.isYou) ?? null
  const legendCompetitors = competitorKeysByVisibility
    .map((key) => seriesByKey.get(key))
    .filter((s): s is TrendSeries => s !== undefined && !s.isYou)
  const selectedKeys = selection.competitors ? selection.selected : []
  const bucketedByKey = new Map(bucketed.map((b) => [b.s.key, b]))
  // Competitors in selection order first, the client last so its line sits on top.
  const drawn: Line[] = [
    ...selectedKeys.map((key) => bucketedByKey.get(key)).filter((b): b is Line => b !== undefined && !b.s.isYou),
    ...bucketed.filter((b) => b.s.isYou),
  ].filter((b) => b.buckets.length > 0)
  const drawnCompetitors = drawn.filter((d) => !d.s.isYou).length
  const atCap = selection.competitors && selection.selected.length >= MAX_COMPETITOR_LINES

  if (keys.length === 0) return null

  const n = keys.length
  const index = new Map(keys.map((k, i) => [k, i]))
  const chartMax = Math.max(1, ...drawn.flatMap((d) => d.buckets.map((b) => b.visibility)))
  const x = (i: number) => ((i + 0.5) / n) * 100
  const y = (v: number) => 100 - (v / chartMax) * 100
  const pointsOf = (buckets: ChartBucket[]) => {
    const pts = buckets.map((b) => `${x(index.get(b.key)!).toFixed(2)},${y(b.visibility).toFixed(2)}`)
    // A lone bucket (Q1 at quarterly) still shows: a zero-length segment with round caps is a dot.
    return (pts.length === 1 ? [pts[0], pts[0]] : pts).join(' ')
  }

  const periodBand = selection.competitors ? null : shadeRange(keys, granularity, period)
  const comparisonBand =
    selection.competitors || !showDeltas || !comparePeriod ? null : shadeRange(keys, granularity, comparePeriod)
  const bandStyle = (r: { from: number; to: number }) => ({ left: `${(r.from / n) * 100}%`, width: `${((r.to - r.from + 1) / n) * 100}%` })

  function write(next: TrendSelection) {
    const params = new URLSearchParams(searchParams.toString())
    const value = serializeTrend(next, competitorKeysByVisibility)
    if (value === null) params.delete(TREND_PARAM)
    else params.set(TREND_PARAM, value)
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }
  function toggleCompetitors() {
    write(selection.competitors ? { competitors: false, selected: [] } : defaultTrendSelection(competitorKeysByVisibility))
  }
  function toggleBrand(key: string) {
    const selected = selection.selected.includes(key)
      ? selection.selected.filter((k) => k !== key)
      : [...selection.selected, key]
    write({ competitors: true, selected })
  }

  const labelEvery = Math.max(1, Math.ceil(n / 16))
  const dot = (color: string) => <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
  const bandKey = !selection.competitors && (periodBand || comparisonBand) && (
    <div className="flex items-center gap-4 text-[11px] text-text-muted">
      {periodBand && (
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-4 rounded-sm border border-white/[0.12] bg-white/[0.08]" />
          Selected period
        </span>
      )}
      {comparisonBand && (
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-4 rounded-sm border border-white/[0.08] bg-white/[0.04]" />
          Comparison period
        </span>
      )}
    </div>
  )

  return (
    <div className="rounded-lg border border-white/[0.06] bg-bg-surface p-5" data-export-block="">
      <div className="mb-4 flex items-start justify-between gap-4">
        <p className="text-xs text-text-muted">
          {exporting ? summaryLine(client?.name ?? null, drawnCompetitors, granularity) : 'Year to date'}
        </p>
        {!exporting && (
          <div className="flex gap-1 rounded-lg bg-white/[0.04] p-0.5" data-export-hide="">
            {GRANULARITIES.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => setGranularity(id)}
                className={cn(
                  'rounded-md px-2.5 py-1 text-[11px] font-semibold transition-all',
                  granularity === id ? 'bg-white text-black shadow-sm' : 'text-text-muted hover:text-white',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {!client && <p className="mb-3 text-xs text-text-muted">Client brand not identified for this project.</p>}

      <div className="flex gap-2">
        <div className="flex h-40 w-9 shrink-0 flex-col justify-between text-right">
          {[chartMax, chartMax * 0.75, chartMax * 0.5, chartMax * 0.25, 0].map((v, i) => (
            <span key={i} className="text-[10px] leading-none tabular-nums text-text-muted">{Math.round(v)}%</span>
          ))}
        </div>
        <div className="relative h-40 flex-1">
          {comparisonBand && <div data-band="comparison" className="absolute inset-y-0 bg-white/[0.04]" style={bandStyle(comparisonBand)} />}
          {periodBand && <div data-band="period" className="absolute inset-y-0 bg-white/[0.08]" style={bandStyle(periodBand)} />}
          <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="w-full border-t border-white/[0.04]" />
            ))}
          </div>
          <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
            {drawn.map(({ s, buckets }) => (
              <polyline
                key={s.key}
                data-brand={s.key}
                points={pointsOf(buckets)}
                fill="none"
                stroke={s.color}
                strokeWidth={s.isYou ? 2.5 : 1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>
          {!exporting && (
            <div className="absolute inset-0 flex">
              {keys.map((key, i) => (
                <div key={key} className="relative h-full flex-1" onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)}>
                  {hovered === i && (
                    <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md border border-white/[0.08] bg-bg-surface px-2.5 py-1.5 text-xs shadow-xl">
                      <p className="mb-1 text-text-muted">{labels[i]}</p>
                      {[...drawn].reverse().map(({ s, buckets }) => {
                        const b = buckets.find((bk) => bk.key === key)
                        return b ? (
                          <p key={s.key} className="flex items-center gap-1.5 text-white">
                            {dot(s.color)}
                            {s.name}: <span className="font-bold tabular-nums">{b.visibility.toFixed(1)}%</span>
                          </p>
                        ) : null
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-2 flex gap-2">
        <div className="w-9 shrink-0" />
        <div className="flex flex-1">
          {keys.map((key, i) => (
            <div key={key} className="flex-1 overflow-hidden text-center">
              {i % labelEvery === 0 && <span className="text-[9px] tabular-nums text-text-muted">{labels[i]}</span>}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3">
        {/* Without a client line, competitors off would draw nothing: no switch then. */}
        {!exporting && client && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              role="switch"
              aria-checked={selection.competitors}
              aria-label="Show competitors"
              onClick={toggleCompetitors}
              className={`relative h-5 w-9 rounded-full transition-colors ${selection.competitors ? 'bg-[#60FF80]' : 'bg-white/20'}`}
            >
              <span className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${selection.competitors ? 'translate-x-4' : ''}`} />
            </button>
            <span className="text-xs font-semibold uppercase tracking-widest text-text-muted">Show competitors</span>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-text-muted">
          {exporting
            ? drawn.slice().reverse().map(({ s }) => (
                <span key={s.key} className="flex items-center gap-1.5">{dot(s.color)}{s.name}</span>
              ))
            : (
              <>
                {client && (
                  <label className="flex items-center gap-1.5 font-semibold text-white">
                    <input type="checkbox" aria-label={client.name} checked disabled readOnly className="accent-[#60FDFF]" />
                    {dot(client.color)}
                    {client.name}
                  </label>
                )}
                {selection.competitors && legendCompetitors.map((s) => {
                  const checked = selection.selected.includes(s.key)
                  return (
                    <label key={s.key} className={cn('flex items-center gap-1.5', !checked && atCap && 'opacity-50')}>
                      <input
                        type="checkbox"
                        aria-label={s.name}
                        checked={checked}
                        disabled={!checked && atCap}
                        onChange={() => toggleBrand(s.key)}
                      />
                      {dot(s.color)}
                      {s.name}
                    </label>
                  )
                })}
              </>
            )}
        </div>
        {!exporting && atCap && <p className="text-xs text-text-muted">{CAP_LINE}</p>}
        {bandKey}
        {note && <p className="text-xs text-text-muted">{note}</p>}
      </div>
    </div>
  )
}
