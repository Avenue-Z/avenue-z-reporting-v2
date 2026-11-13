'use client'
// One of the tab's three tables (spec section 3 items 4 to 6, section 5). Columns end Retrievals, Total citations, Citation rate (the team's
// feedback, 2026-11-12: "Retrieved" removed); URL Gaps keeps Citation share and Citation position before them. 14 rows a page, as the
// outline's screenshots, with search (URL, title, channel) and sortable number columns. Mentions is one dot per brand in Peec's color for it
// (grey for a brand with none), own brand first. In the PDF export: the page the table opens on, with its count, and no search or buttons.
import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { CHART_COLORS } from '@/lib/constants'
import { useExportMode } from '@/components/export/export-mode'
import type { GapRow, SocialsRow } from '@/lib/organic-social/aeo-informed/tables'
import { COLUMN, EMPTY_MARK, SEARCH_PLACEHOLDER, TABLE_EMPTY, aeoPct, pagerLabel } from './copy'

export const PAGE_SIZE = 14
type Brand = { id: string; name: string; color: string | null; isOwn: boolean }
type Row = SocialsRow | GapRow
type SortKey = 'retrievals' | 'totalCitations' | 'citationRate' | 'citationShare' | 'citationPosition'

const isGap = (r: Row): r is GapRow => 'citationShare' in r
/** Only an http or https URL becomes a link; anything else is shown as text. */
const safeHref = (url: string) => (/^https?:\/\//i.test(url) ? url : null)
const signed = (n: number) => (n > 0 ? `+${n.toLocaleString('en-US')}` : n.toLocaleString('en-US'))

function Change({ value, points }: { value: number | null; points?: boolean }) {
  if (value === null) return null
  const shown = points ? Math.round(value * 100) : value
  return (
    <span data-testid="aeo-change" className={cn('block text-[11px] font-bold', shown > 0 ? 'text-brand-green' : shown < 0 ? 'text-[#FF4444]' : 'text-text-muted')}>
      {points ? `${signed(shown)} pts` : signed(shown)}
    </span>
  )
}

function Mentions({ row, brands }: { row: Row; brands: Brand[] }) {
  const byId = new Map(brands.map((b) => [b.id, b]))
  const ids = row.mentionedBrandIds ? row.mentionedBrandIds.split('|') : []
  return (
    <span className="flex items-center gap-1.5">
      <span className="flex -space-x-1">
        {ids.map((id) => {
          const b = byId.get(id)
          return <span key={id} data-testid="aeo-mention-dot" title={b?.name ?? id} className="inline-block h-3 w-3 rounded-full ring-1 ring-black" style={{ backgroundColor: b?.color ?? CHART_COLORS.neutral }} />
        })}
      </span>
      <span data-testid="aeo-mention-count" className="text-xs text-text-muted">{row.mentionedBrandCount}</span>
    </span>
  )
}

export function AeoTable({ kind, rows, brands, showChange }: { kind: 'socials' | 'gaps'; rows: Row[]; brands: Brand[]; showChange: boolean }) {
  const exportMode = useExportMode()
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; dir: 'desc' | 'asc' } | null>(null)
  const [page, setPage] = useState(0)

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    const found = q ? rows.filter((r) => [r.url, r.title ?? '', r.channelTitle ?? ''].some((s) => s.toLowerCase().includes(q))) : rows
    if (!sort) return found
    const val = (r: Row) => (r as unknown as Record<SortKey, number | null>)[sort.key]
    // A missing value (no rate, no position) sorts last whichever way; ties keep the table's own order.
    return [...found].sort((a, b) => {
      const x = val(a), y = val(b)
      if (x === null || y === null) return x === y ? a.rank - b.rank : x === null ? 1 : -1
      return (sort.dir === 'desc' ? y - x : x - y) || a.rank - b.rank
    })
  }, [rows, query, sort])

  const pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE))
  const current = exportMode ? 0 : Math.min(page, pages - 1)
  const slice = shown.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE)
  const toggle = (key: SortKey) => { setSort((s) => (s?.key === key ? { key, dir: s.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: 'desc' })); setPage(0) }

  const numberCols: { key: SortKey; label: string }[] = [
    ...(kind === 'gaps' ? [{ key: 'citationShare' as const, label: COLUMN.citationShare }, { key: 'citationPosition' as const, label: COLUMN.citationPosition }] : []),
    { key: 'retrievals', label: COLUMN.retrievals }, { key: 'totalCitations', label: COLUMN.totalCitations }, { key: 'citationRate', label: COLUMN.citationRate },
  ]
  const head = (c: { key: SortKey; label: string }) => (
    <th key={c.key} scope="col" className="px-3 py-2 text-right" aria-sort={sort?.key === c.key ? (sort.dir === 'desc' ? 'descending' : 'ascending') : 'none'}>
      {exportMode ? c.label : (
        <button type="button" onClick={() => toggle(c.key)} className="font-extrabold uppercase tracking-widest hover:text-white">
          {c.label}{sort?.key === c.key ? (sort.dir === 'desc' ? ' ▼' : ' ▲') : ''}
        </button>
      )}
    </th>
  )

  return (
    <div className="space-y-3">
      {!exportMode && (
        <input type="search" value={query} placeholder={SEARCH_PLACEHOLDER} aria-label={SEARCH_PLACEHOLDER}
          onChange={(e) => { setQuery(e.target.value); setPage(0) }}
          className="w-full max-w-xs rounded-md border border-white/10 bg-bg-surface px-3 py-1.5 text-sm text-white placeholder:text-text-muted" />
      )}
      {shown.length === 0 ? <p className="rounded-lg border border-white/[0.06] bg-bg-surface p-6 text-sm text-text-muted">{TABLE_EMPTY}</p> : (
        <div className="overflow-x-auto rounded-lg border border-white/[0.08] bg-bg-surface">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-[11px] font-extrabold uppercase tracking-widest text-text-muted">
              <tr className="border-b border-white/[0.08]">
                <th scope="col" className="px-3 py-2 text-left">{COLUMN.rank}</th>
                <th scope="col" className="px-3 py-2 text-left">{COLUMN.url}</th>
                <th scope="col" className="px-3 py-2 text-left">{COLUMN.urlType}</th>
                <th scope="col" className="px-3 py-2 text-left">{COLUMN.mentions}</th>
                {numberCols.map(head)}
              </tr>
            </thead>
            <tbody>
              {slice.map((r) => {
                const href = safeHref(r.url)
                const label = r.title ?? r.url
                return (
                  <tr key={`${r.rank}:${r.url}`} data-testid="aeo-row" className="border-b border-white/[0.04] align-top last:border-0">
                    <td className="px-3 py-2 text-text-muted">{r.rank}</td>
                    <td className="max-w-[360px] px-3 py-2">
                      {href ? <a href={href} target="_blank" rel="noopener noreferrer" className="font-semibold text-white hover:underline">{label}</a> : <span className="font-semibold text-white">{label}</span>}
                      <span className="block truncate text-xs text-text-muted">{r.url}</span>
                      {r.channelTitle && (
                        <span className="mt-1 inline-block rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] text-white/80">
                          {!isGap(r) && r.isOwnChannel ? '★ ' : ''}{r.channelTitle}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-text-muted">{r.urlType ?? EMPTY_MARK}</td>
                    <td className="px-3 py-2"><Mentions row={r} brands={brands} /></td>
                    {isGap(r) && (
                      <>
                        <td data-testid="aeo-share" className="px-3 py-2 text-right tabular-nums">{aeoPct(r.citationShare)}</td>
                        <td data-testid="aeo-position" className="px-3 py-2 text-right tabular-nums">{r.citationPosition === null ? EMPTY_MARK : r.citationPosition.toLocaleString('en-US', { maximumFractionDigits: 1 })}</td>
                      </>
                    )}
                    <td className="px-3 py-2 text-right tabular-nums"><span data-testid="aeo-retrievals">{r.retrievals.toLocaleString('en-US')}</span>{showChange && <Change value={r.retrievalsDelta} />}</td>
                    <td className="px-3 py-2 text-right tabular-nums"><span data-testid="aeo-citations">{r.totalCitations.toLocaleString('en-US')}</span>{showChange && <Change value={r.totalCitationsDelta} />}</td>
                    <td className="px-3 py-2 text-right tabular-nums"><span data-testid="aeo-rate">{r.citationRate === null ? EMPTY_MARK : aeoPct(r.citationRate)}</span>{showChange && <Change value={r.citationRateDelta} points />}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {shown.length > 0 && (
        <div className="flex items-center justify-between text-xs text-text-muted">
          <span>{pagerLabel(current * PAGE_SIZE + 1, current * PAGE_SIZE + slice.length, shown.length)}</span>
          {!exportMode && pages > 1 && (
            <span className="flex gap-2">
              <button type="button" aria-label="Previous page" disabled={current === 0} onClick={() => setPage(current - 1)} className="rounded border border-white/10 px-2 py-1 disabled:opacity-40">Previous</button>
              <button type="button" aria-label="Next page" disabled={current >= pages - 1} onClick={() => setPage(current + 1)} className="rounded border border-white/10 px-2 py-1 disabled:opacity-40">Next</button>
            </span>
          )}
        </div>
      )}
    </div>
  )
}
