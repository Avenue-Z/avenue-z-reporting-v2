'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { CHART_COLORS } from '@/lib/constants'

export interface LandingRow {
  page: string
  sessions: number
  engaged: number
  keyEvents: number
  convRate: number
}

export interface ConvertingRow {
  page: string
  sessions: number
  keyEvents: number
  convRate: number
}

interface ConversionPageTablesProps {
  landingRows: LandingRow[]
  convertingPages: ConvertingRow[]
  staleLandingPaths: string[]
  staleConvertingPaths: string[]
  overallConvRate: number
}

function Tooltip({ text }: { text: string }) {
  return (
    <div className="group relative flex-shrink-0">
      <span className="flex h-3.5 w-3.5 cursor-default items-center justify-center rounded-full border border-white/20 text-[9px] font-bold leading-none text-text-muted">
        ?
      </span>
      <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-72 -translate-x-1/2 rounded-md border border-white/[0.08] bg-bg-surface px-3 py-2 text-xs leading-relaxed text-text-muted opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100">
        {text}
        <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-white/[0.08]" />
      </div>
    </div>
  )
}

const DISPLAY_LIMIT = 10

function fmtPct(n: number, decimals = 1) {
  return `${(n * 100).toFixed(decimals)}%`
}

function fmtNum(n: number) {
  return n.toLocaleString()
}

function RisingButton({
  active,
  hasStaleData,
  onClick,
}: {
  active: boolean
  hasStaleData: boolean
  onClick: () => void
}) {
  if (!hasStaleData) return null
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold transition-all duration-150',
        active
          ? 'border-[#60FF80]/40 bg-[#60FF80]/10 text-[#60FF80]'
          : 'border-white/10 bg-white/[0.04] text-text-muted hover:text-white/60'
      )}
      title="Hide pages that have been in the top 10 for the last 90 days"
    >
      <span>↑</span>
      <span>Rising</span>
    </button>
  )
}

function PageRow({
  rank,
  page,
  sessions,
  engagedPct,
  convRate,
  keyEvents,
  barMaxKeyEvents,
  color,
  overallConvRate,
}: {
  rank: number
  page: string
  sessions: number
  engagedPct?: number
  convRate: number
  keyEvents: number
  barMaxKeyEvents: number
  color: string
  overallConvRate: number
}) {
  const barW        = (keyEvents / barMaxKeyEvents) * 100
  const displayPage = page.length > 48 ? page.slice(0, 45) + '…' : page

  return (
    <div className="flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-white/[0.02]">
      <span
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-bold"
        style={{
          backgroundColor: rank <= 3 ? color : 'rgba(255,255,255,0.08)',
          color:           rank <= 3 ? '#000' : 'rgba(255,255,255,0.35)',
        }}
      >
        {rank}
      </span>

      <div className="min-w-0 flex-1">
        <span className="block truncate font-mono text-[13px] text-white/80" title={page}>
          {displayPage || '/'}
        </span>
      </div>

      <div className="relative h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className="h-full rounded-full"
          style={{ width: `${barW}%`, backgroundColor: color, opacity: 0.75 }}
        />
      </div>

      <div className="w-16 shrink-0 text-right">
        <span className="tabular-nums text-xs text-white/60">{fmtNum(sessions)}</span>
      </div>

      {engagedPct !== undefined && (
        <div className="w-16 shrink-0 text-right">
          <span className="tabular-nums text-xs text-white/60">{fmtPct(engagedPct)}</span>
        </div>
      )}

      <div className="w-16 shrink-0 text-right">
        <span
          className="tabular-nums text-xs font-semibold"
          style={{ color: convRate > overallConvRate ? CHART_COLORS.positive : 'rgba(255,255,255,0.6)' }}
        >
          {fmtPct(convRate)}
        </span>
      </div>

      <div className="w-16 shrink-0 text-right">
        <span className="tabular-nums text-sm font-bold text-white">{fmtNum(keyEvents)}</span>
      </div>
    </div>
  )
}

export function ConversionPageTables({
  landingRows,
  convertingPages,
  staleLandingPaths,
  staleConvertingPaths,
  overallConvRate,
}: ConversionPageTablesProps) {
  const [landingRising,    setLandingRising]    = useState(false)
  const [convertingRising, setConvertingRising] = useState(false)

  const staleLandingSet    = new Set(staleLandingPaths)
  const staleConvertingSet = new Set(staleConvertingPaths)

  // Filter + slice
  const filteredLanding = landingRising
    ? landingRows.filter((r) => !staleLandingSet.has(r.page))
    : landingRows
  const visibleLanding = filteredLanding.slice(0, DISPLAY_LIMIT)

  const filteredConverting = convertingRising
    ? convertingPages.filter((r) => !staleConvertingSet.has(r.page))
    : convertingPages
  const visibleConverting = filteredConverting.slice(0, DISPLAY_LIMIT)

  // How many stale pages would be hidden
  const landingHiddenCount    = landingRows.filter((r) => staleLandingSet.has(r.page)).length
  const convertingHiddenCount = convertingPages.filter((r) => staleConvertingSet.has(r.page)).length

  const landingMaxKeyEvents    = Math.max(...visibleLanding.map((r) => r.keyEvents), 1)
  const convertingMaxKeyEvents = Math.max(...visibleConverting.map((r) => r.keyEvents), 1)

  return (
    <div className="space-y-5">

      {/* ── Where Journeys Start — Landing Pages ─────────────────────────── */}
      <div className="rounded-lg border border-white/[0.06] bg-bg-surface px-6 py-5">
        <div className="mb-1 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-bold text-white">Where Journeys Start</h3>
            <Tooltip text="Top landing pages ranked by key events generated. Conv Rate highlighted in green when it beats the site average. Shows which entry points are driving real conversion activity." />
          </div>
          <RisingButton
            active={landingRising}
            hasStaleData={staleLandingSet.size > 0}
            onClick={() => setLandingRising((v) => !v)}
          />
        </div>

        <p className="mb-1 text-xs text-text-muted">
          Landing pages with 5+ sessions · ranked by key events
        </p>

        {landingRising && landingHiddenCount > 0 && (
          <p className="mb-3 text-[11px] text-text-muted/60">
            Landing pages in the top 10 for the last 90 days are excluded. Only newer, climbing entry points are shown.
          </p>
        )}

        {/* Column headers */}
        <div className="mb-1 mt-4 flex items-center gap-3 px-2">
          <div className="w-5 shrink-0" />
          <div className="flex-1 text-[10px] font-bold uppercase tracking-wider text-text-muted">Landing Page</div>
          <div className="w-24 shrink-0" />
          <div className="w-16 shrink-0 text-right text-[10px] font-bold uppercase tracking-wider text-text-muted">Sessions</div>
          <div className="w-16 shrink-0 text-right text-[10px] font-bold uppercase tracking-wider text-text-muted">Engaged</div>
          <div className="w-16 shrink-0 text-right text-[10px] font-bold uppercase tracking-wider text-text-muted">Conv Rate</div>
          <div className="w-16 shrink-0 text-right text-[10px] font-bold uppercase tracking-wider text-text-muted">Key Events</div>
        </div>

        <div className="space-y-0.5">
          {visibleLanding.length > 0 ? (
            visibleLanding.map((row, i) => (
              <PageRow
                key={row.page + i}
                rank={i + 1}
                page={row.page}
                sessions={row.sessions}
                engagedPct={row.sessions > 0 ? row.engaged / row.sessions : 0}
                convRate={row.convRate}
                keyEvents={row.keyEvents}
                barMaxKeyEvents={landingMaxKeyEvents}
                color={CHART_COLORS.ga4}
                overallConvRate={overallConvRate}
              />
            ))
          ) : (
            <p className="py-6 text-center text-sm italic text-text-muted/50">
              {landingRising
                ? 'All landing pages have been in the top 10 for the last 90 days. Disable Rising to see them.'
                : 'No landing page data available for this period.'}
            </p>
          )}
        </div>
      </div>

      {/* ── Pages in Converting Sessions ─────────────────────────────────── */}
      <div className="rounded-lg border border-white/[0.06] bg-bg-surface px-6 py-5">
        <div className="mb-1 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-bold text-white">Pages in Converting Sessions</h3>
            <Tooltip text="Pages that appear in sessions where a key event was triggered, ranked by key event volume. A high conv rate means users who visited this page were very likely to convert." />
          </div>
          <RisingButton
            active={convertingRising}
            hasStaleData={staleConvertingSet.size > 0}
            onClick={() => setConvertingRising((v) => !v)}
          />
        </div>

        <p className="mb-1 text-xs text-text-muted">
          Pages with 10+ sessions and at least one key event · ranked by key events
        </p>

        {convertingRising && convertingHiddenCount > 0 && (
          <p className="mb-3 text-[11px] text-text-muted/60">
            Pages in the top 10 for the last 90 days are excluded. Only newer, climbing pages are shown.
          </p>
        )}

        {/* Column headers */}
        <div className="mb-1 mt-4 flex items-center gap-3 px-2">
          <div className="w-5 shrink-0" />
          <div className="flex-1 text-[10px] font-bold uppercase tracking-wider text-text-muted">Page</div>
          <div className="w-24 shrink-0" />
          <div className="w-16 shrink-0 text-right text-[10px] font-bold uppercase tracking-wider text-text-muted">Sessions</div>
          <div className="w-16 shrink-0 text-right text-[10px] font-bold uppercase tracking-wider text-text-muted">Conv Rate</div>
          <div className="w-16 shrink-0 text-right text-[10px] font-bold uppercase tracking-wider text-text-muted">Key Events</div>
        </div>

        <div className="space-y-0.5">
          {visibleConverting.length > 0 ? (
            visibleConverting.map((row, i) => (
              <PageRow
                key={row.page + i}
                rank={i + 1}
                page={row.page}
                sessions={row.sessions}
                convRate={row.convRate}
                keyEvents={row.keyEvents}
                barMaxKeyEvents={convertingMaxKeyEvents}
                color={CHART_COLORS.positive}
                overallConvRate={overallConvRate}
              />
            ))
          ) : (
            <p className="py-6 text-center text-sm italic text-text-muted/50">
              {convertingRising
                ? 'All converting pages have been in the top 10 for the last 90 days. Disable Rising to see them.'
                : 'No pages with key events found. Mark events as Key Events in your GA4 property to populate this table.'}
            </p>
          )}
        </div>
      </div>

    </div>
  )
}
