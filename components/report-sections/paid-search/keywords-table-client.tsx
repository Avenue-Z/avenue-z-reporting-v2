'use client'
import { useState } from 'react'
import { DataTable } from '@/components/charts/data-table'
// Import formatters from the pure source, NOT lib/paid-search/base — base pulls
// in lib/db and must never enter a client bundle.
import { num, pct } from '@/lib/supermetrics/format'
import { money } from '@/lib/paid-media/format'
import type { KeywordRow } from '@/lib/paid-search/types'
import type { KeywordsData } from '@/lib/paid-search/keywords'

// A fixed top-10-by-leads ranking — not a sortable table. Only these 10 rows
// reach the client (the total covers the full set, computed server-side), so
// marking the other columns sortable would only reorder these 10 and imply a
// global ranking the client can't actually perform. See PR #188 review.
const COLUMNS = [
  { key: 'keyword', label: 'Keyword', align: 'left' as const },
  { key: 'matchType', label: 'Match Type', align: 'left' as const },
  { key: 'clicks', label: 'Clicks', align: 'right' as const },
  { key: 'impressions', label: 'Impressions', align: 'right' as const },
  { key: 'ctr', label: 'CTR', align: 'right' as const },
  { key: 'cost', label: 'Cost', align: 'right' as const },
  { key: 'leads', label: 'Leads', align: 'right' as const },
  { key: 'cpl', label: 'CPL', align: 'right' as const },
]

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
  }
}

export function KeywordsTableClient({ data }: { data: KeywordsData }) {
  // Default view: only keywords with ≥10 clicks (item 11c). Clearable.
  const [filterOn, setFilterOn] = useState(true)
  const { top, total, count } = filterOn ? data.filtered : data.all

  const noun = count === 1 ? 'keyword' : 'keywords'
  const totalsRow: Record<string, React.ReactNode> = {
    keyword: `Total (${num(count)} ${noun})`,
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

      {count === 0 ? (
        <div className="rounded-lg border border-white/[0.06] bg-bg-surface p-6 text-center text-sm text-text-muted">
          {filterOn
            ? 'No keywords reached 10 clicks in this period.'
            : 'No keyword data available for this period.'}
        </div>
      ) : (
        <DataTable columns={COLUMNS} rows={top.map(toTableRow)} totalsRow={totalsRow} />
      )}
    </div>
  )
}
