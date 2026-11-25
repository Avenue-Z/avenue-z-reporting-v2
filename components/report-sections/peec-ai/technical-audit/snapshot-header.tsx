'use client'
// The Technical Audit page header: the snapshot select (the `snapshot=` URL param), what the selected month is compared
// with, one "data as of" line per source, and the flags. In the PDF export the select prints as text and the team-only
// stale line is left out (a staff export prints what a client sees).
import { usePathname, useRouter } from 'next/navigation'
import { useExportMode } from '@/components/export/export-mode'
import type { ViewRun } from '@/lib/technical-audit/view'
import { fmtDate } from './format'

type SourceRun = Pick<ViewRun, 'source' | 'status'>
type Dot = 'ok' | 'problem' | 'partial' | 'none'
const DOT: Record<Dot, { color: string; label: string }> = {
  ok: { color: '#60FF80', label: 'complete' },
  problem: { color: '#FF4444', label: 'failed' },
  partial: { color: '#FFFC60', label: 'incomplete' },
  none: { color: '#8A8A8A', label: 'not available' },
}

function runDot(runs: SourceRun[], source: string): Dot {
  const status = runs.find((r) => r.source === source)?.status
  return status === 'complete' ? 'ok' : status === 'failed' ? 'problem' : status === 'missing' ? 'partial' : 'none'
}

/** GSC is three uploads: all in is ok, any failed is a problem, some in is partial. */
function gscDot(runs: SourceRun[]): Dot {
  const dots = ['gsc_indexing', 'gsc_cwv_mobile', 'gsc_cwv_desktop'].map((s) => runDot(runs, s))
  if (dots.every((d) => d === 'ok')) return 'ok'
  if (dots.includes('problem')) return 'problem'
  return dots.includes('ok') ? 'partial' : 'none'
}

export interface SnapshotHeaderProps {
  /** Newest first, as the view lists them; a client's list holds published snapshots only. */
  snapshots: { date: string; status: 'draft' | 'published' }[]
  selectedDate: string
  previousDate: string | null
  sfCrawlDate: string | null
  ahrefsCrawlDate: string | null
  gscExportDate: string | null
  runs: SourceRun[]
  crawlSettingsChanged: boolean
  /** Set for team viewers only (loadTechAuditView). */
  staleSince: string | null
}

export function SnapshotHeader(p: SnapshotHeaderProps) {
  const exportMode = useExportMode()
  const router = useRouter()
  const pathname = usePathname()
  const label = (s: { date: string; status: string }, i: number) =>
    `${fmtDate(s.date)}${i === 0 ? ' (latest)' : ''}${s.status === 'draft' ? ' (draft)' : ''}`
  const selectedIdx = Math.max(0, p.snapshots.findIndex((s) => s.date === p.selectedDate))

  function select(date: string) {
    const sp = new URLSearchParams(window.location.search)
    sp.set('snapshot', date)
    router.push(`${pathname}?${sp.toString()}`)
  }

  const sources: { label: string; date: string | null; dot: Dot }[] = [
    { label: 'Screaming Frog crawl', date: p.sfCrawlDate, dot: runDot(p.runs, 'sf') },
    { label: 'Ahrefs crawl', date: p.ahrefsCrawlDate, dot: runDot(p.runs, 'ahrefs') },
    { label: 'GSC export', date: p.gscExportDate, dot: gscDot(p.runs) },
  ]

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-white/[0.06] bg-bg-surface p-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {exportMode ? (
          <p className="text-sm font-bold text-white">{label(p.snapshots[selectedIdx], selectedIdx)}</p>
        ) : (
          <label className="flex items-center gap-2 text-sm text-text-muted">
            Snapshot
            <select
              value={p.selectedDate}
              onChange={(e) => select(e.target.value)}
              className="rounded-xl border border-white/10 bg-bg-surface px-3 py-2 text-sm font-bold text-white focus:border-[#60FDFF] focus:outline-none"
            >
              {p.snapshots.map((s, i) => <option key={s.date} value={s.date}>{label(s, i)}</option>)}
            </select>
          </label>
        )}
        <p className="text-sm text-text-muted">
          {p.previousDate ? `Compared with: ${fmtDate(p.previousDate)}` : 'Baseline — first snapshot'}
        </p>
      </div>

      <ul className="flex flex-wrap gap-x-6 gap-y-1">
        {sources.map((s) => (
          <li key={s.label} className="flex items-center gap-2 text-xs text-text-muted">
            <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: DOT[s.dot].color }} />
            <span className="sr-only">{DOT[s.dot].label}: </span>
            {s.label}: {s.date ? fmtDate(s.date) : '—'}
          </li>
        ))}
      </ul>

      {(p.crawlSettingsChanged || (p.staleSince && !exportMode)) && (
        <div className="flex flex-wrap gap-2">
          {p.crawlSettingsChanged && (
            <span className="rounded-full px-3 py-1 text-xs font-bold" style={{ background: 'rgba(255,252,96,0.1)', color: '#FFFC60' }}>
              Crawl settings changed
            </span>
          )}
          {p.staleSince && !exportMode && (
            <span className="rounded-full px-3 py-1 text-xs font-bold" style={{ background: 'rgba(255,68,68,0.1)', color: '#FF4444' }}>
              No crawl since {fmtDate(p.staleSince)}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
