'use client'
import { useState } from 'react'
import { DataTable } from '@/components/charts/data-table'
// Import formatters from the pure source, NOT lib/paid-search/base — base pulls
// in lib/db and must never enter a client bundle.
import { num, pct } from '@/lib/supermetrics/format'
import { money } from '@/lib/paid-media/format'
import type { KeywordRow } from '@/lib/paid-search/types'

const MIN_CLICKS = 10

const COLUMNS = [
  { key: 'keyword', label: 'Keyword', align: 'left' as const },
  { key: 'matchType', label: 'Match Type', align: 'left' as const },
  { key: 'clicks', label: 'Clicks', align: 'right' as const, sortable: true, sortKey: '_clicks' },
  { key: 'impressions', label: 'Impressions', align: 'right' as const, sortable: true, sortKey: '_impressions' },
  { key: 'ctr', label: 'CTR', align: 'right' as const, sortable: true, sortKey: '_ctr' },
  { key: 'cost', label: 'Cost', align: 'right' as const, sortable: true, sortKey: '_cost' },
  { key: 'leads', label: 'Leads', align: 'right' as const, sortable: true, sortKey: '_leads' },
  { key: 'cpl', label: 'CPL', align: 'right' as const, sortable: true, sortKey: '_cpl' },
]

interface KeywordTotal {
  clicks: number
  impressions: number
  cost: number
  leads: number
  ctr: number
  cpl: number
}

/**
 * Apply the ≥10-clicks filter, total the FULL filtered set (item 10), and take
 * the top 10 for display. Derived metrics (CTR, CPL) are recomputed from summed
 * numerators/denominators — NOT summed — mirroring campaign-table.tsx.
 */
export function summarizeKeywords(
  rows: KeywordRow[],
  filterOn: boolean,
): { display: KeywordRow[]; total: KeywordTotal; filteredCount: number } {
  const filtered = filterOn ? rows.filter((r) => r.clicks >= MIN_CLICKS) : rows
  const agg = filtered.reduce(
    (a, r) => {
      a.clicks += r.clicks
      a.impressions += r.impressions
      a.cost += r.cost
      a.leads += r.leads
      return a
    },
    { clicks: 0, impressions: 0, cost: 0, leads: 0 },
  )
  const total: KeywordTotal = {
    ...agg,
    ctr: agg.impressions ? (agg.clicks / agg.impressions) * 100 : 0,
    cpl: agg.leads ? agg.cost / agg.leads : 0,
  }
  return { display: filtered.slice(0, 10), total, filteredCount: filtered.length }
}

function toTableRow(r: KeywordRow): Record<string, React.ReactNode> {
  return {
    keyword: r.keyword,
    matchType: r.matchType,
    clicks: num(r.clicks),
    impressions: num(r.impressions),
    ctr: pct(r.ctr),
    cost: money(r.cost),
    leads: num(r.leads),
    cpl: money(r.cpl),
    // raw numeric values for sort — prefixed with _ to avoid column key collision
    _clicks: r.clicks,
    _impressions: r.impressions,
    _ctr: r.ctr,
    _cost: r.cost,
    _leads: r.leads,
    _cpl: r.cpl,
  }
}

export function KeywordsTableClient({ rows }: { rows: KeywordRow[] }) {
  // Default view: only keywords with ≥10 clicks (item 11c). Clearable.
  const [filterOn, setFilterOn] = useState(true)
  const { display, total, filteredCount } = summarizeKeywords(rows, filterOn)

  const noun = filteredCount === 1 ? 'keyword' : 'keywords'
  const totalsRow: Record<string, React.ReactNode> = {
    keyword: `Total (${num(filteredCount)} ${noun})`,
    matchType: '',
    clicks: num(total.clicks),
    impressions: num(total.impressions),
    ctr: pct(total.ctr),
    cost: money(total.cost),
    leads: num(total.leads),
    cpl: money(total.cpl),
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-extrabold uppercase tracking-widest text-text-muted">Keywords</p>
        <button
          onClick={() => setFilterOn((v) => !v)}
          className="rounded-md px-3 py-1 text-xs text-text-muted transition-colors hover:bg-white/10 hover:text-white"
        >
          {filterOn ? 'Showing keywords with ≥10 clicks · Show all' : 'Showing all keywords · Filter ≥10 clicks'}
        </button>
      </div>

      {filteredCount === 0 ? (
        <div className="rounded-lg border border-white/[0.06] bg-bg-surface p-6 text-center text-sm text-text-muted">
          {filterOn
            ? 'No keywords reached 10 clicks in this period.'
            : 'No keyword data available for this period.'}
        </div>
      ) : (
        <DataTable columns={COLUMNS} rows={display.map(toTableRow)} defaultSort={{ key: 'leads', dir: 'desc' }} totalsRow={totalsRow} />
      )}
    </div>
  )
}
