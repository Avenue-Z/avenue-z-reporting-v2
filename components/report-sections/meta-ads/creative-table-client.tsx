'use client'
import { useState, type ReactNode } from 'react'
import { usd, num, pct } from '@/lib/supermetrics/format'
import type { CampaignNode, AdSetNode, CreativeRow, CreativeMetrics } from '@/lib/meta/types'

type MetricKey =
  | 'spend' | 'impressions' | 'reach' | 'frequency' | 'linkClicks'
  | 'ctr' | 'cpc' | 'lpv' | 'costPerLpv' | 'engagements' | 'shareOfSpend'

interface Col {
  key: MetricKey
  label: string
  fmt: (n: number) => string
  tooltip?: string
}

const usd2 = (n: number) => '$' + n.toFixed(2)
const freq = (n: number) => n.toFixed(1) + 'x'

const COLS: Col[] = [
  { key: 'spend', label: 'Spend', fmt: usd },
  { key: 'impressions', label: 'Impressions', fmt: num },
  { key: 'reach', label: 'Reach', fmt: num },
  {
    key: 'frequency',
    label: 'Frequency',
    fmt: freq,
    tooltip:
      'At campaign and ad set level, frequency sums reach across ad sets and may double-count users reached in more than one ad set.',
  },
  { key: 'linkClicks', label: 'Link Clicks', fmt: num },
  { key: 'ctr', label: 'CTR', fmt: pct },
  { key: 'cpc', label: 'CPC', fmt: usd2 },
  { key: 'lpv', label: 'LPV', fmt: num },
  // usd2, not usd: Cost / LPV is a per-unit cost and is routinely sub-dollar.
  // Matches CPC above and LinkedIn's Cost / Lead.
  { key: 'costPerLpv', label: 'Cost / LPV', fmt: usd2 },
  { key: 'engagements', label: 'Engagements', fmt: num },
  { key: 'shareOfSpend', label: 'Share of Spend', fmt: pct },
]

type SortKey = MetricKey | 'name'

function sortItems<T extends CreativeMetrics & { name?: string; ad?: string }>(
  items: T[],
  key: SortKey,
  dir: 'asc' | 'desc',
): T[] {
  const sorted = [...items].sort((a, b) => {
    const av = key === 'name' ? (a.name ?? a.ad ?? '') : (a[key] as number)
    const bv = key === 'name' ? (b.name ?? b.ad ?? '') : (b[key] as number)
    if (av < bv) return -1
    if (av > bv) return 1
    return 0
  })
  return dir === 'desc' ? sorted.reverse() : sorted
}

export function CreativeTableClient({
  campaigns,
  totals,
}: {
  campaigns: CampaignNode[]
  totals: CreativeMetrics
}) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'spend', dir: 'desc' })
  const [openCampaigns, setOpenCampaigns] = useState<Set<string>>(new Set())
  const [openAdSets, setOpenAdSets] = useState<Set<string>>(new Set())

  const toggle = (set: Set<string>, key: string) => {
    const next = new Set(set)
    next.has(key) ? next.delete(key) : next.add(key)
    return next
  }

  const onSort = (key: SortKey) =>
    setSort((s) => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }))

  const sortedCampaigns = sortItems(campaigns, sort.key, sort.dir)

  const indent = (depth: number) => ({ paddingLeft: 20 + depth * 22 })

  const metricCells = (m: CreativeMetrics) =>
    COLS.map((c) => (
      <td key={c.key} className="px-5 py-3 text-right text-white">
        {c.fmt(m[c.key])}
      </td>
    ))

  return (
    <div className="overflow-x-auto rounded-lg border border-white/[0.06] bg-bg-surface">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/[0.06]">
            <th
              onClick={() => onSort('name')}
              className="cursor-pointer select-none px-5 py-3 text-left text-[11px] font-extrabold uppercase tracking-widest text-text-muted hover:text-white"
            >
              Name{sort.key === 'name' ? (sort.dir === 'desc' ? ' ↓' : ' ↑') : ''}
            </th>
            {COLS.map((c) => (
              <th
                key={c.key}
                onClick={() => onSort(c.key)}
                className="cursor-pointer select-none px-5 py-3 text-right text-[11px] font-extrabold uppercase tracking-widest text-text-muted hover:text-white"
              >
                <span className="inline-flex items-center gap-1">
                  {c.label}
                  {c.tooltip && (
                    <span className="group relative inline-flex flex-shrink-0">
                      <span className="flex h-3.5 w-3.5 cursor-default items-center justify-center rounded-full border border-white/20 text-[9px] font-bold leading-none text-text-muted">
                        ?
                      </span>
                      <span className="pointer-events-none absolute bottom-full right-0 z-10 mb-2 w-56 rounded-md border border-white/[0.08] bg-bg-surface px-3 py-2 text-left text-xs font-normal normal-case leading-relaxed tracking-normal text-text-muted opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100">
                        {c.tooltip}
                      </span>
                    </span>
                  )}
                  {sort.key === c.key ? (sort.dir === 'desc' ? ' ↓' : ' ↑') : ''}
                </span>
              </th>
            ))}
            <th className="px-5 py-3 text-left text-[11px] font-extrabold uppercase tracking-widest text-text-muted">
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedCampaigns.map((camp) => {
            const campOpen = openCampaigns.has(camp.name)
            const adSets = sortItems(camp.adSets, sort.key, sort.dir)
            return (
              <CampaignRows
                key={camp.name}
                camp={camp}
                campOpen={campOpen}
                adSets={adSets}
                openAdSets={openAdSets}
                sort={sort}
                indent={indent}
                metricCells={metricCells}
                onToggleCampaign={() => setOpenCampaigns((s) => toggle(s, camp.name))}
                onToggleAdSet={(setKey: string) => setOpenAdSets((s) => toggle(s, setKey))}
              />
            )
          })}
          <tr className="border-t border-white/[0.12] font-semibold">
            <td className="px-5 py-3 text-left text-white" style={indent(0)}>
              {`Total (${campaigns.length} ${campaigns.length === 1 ? 'Campaign' : 'Campaigns'})`}
            </td>
            {metricCells(totals)}
            <td className="px-5 py-3 text-left text-white" />
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function Chevron({ open }: { open: boolean }) {
  return <span className="inline-block w-4 text-text-muted">{open ? '▾' : '▸'}</span>
}

function CampaignRows({
  camp,
  campOpen,
  adSets,
  openAdSets,
  sort,
  indent,
  metricCells,
  onToggleCampaign,
  onToggleAdSet,
}: {
  camp: CampaignNode
  campOpen: boolean
  adSets: AdSetNode[]
  openAdSets: Set<string>
  sort: { key: SortKey; dir: 'asc' | 'desc' }
  indent: (depth: number) => { paddingLeft: number }
  metricCells: (m: CreativeMetrics) => ReactNode
  onToggleCampaign: () => void
  onToggleAdSet: (setKey: string) => void
}) {
  return (
    <>
      <tr
        onClick={onToggleCampaign}
        className="cursor-pointer border-b border-white/[0.04] transition-colors hover:bg-bg-subtle/50"
      >
        <td className="px-5 py-3 text-left text-white" style={indent(0)}>
          <Chevron open={campOpen} /> {camp.name}
        </td>
        {metricCells(camp)}
        <td className="px-5 py-3 text-left text-white" />
      </tr>
      {campOpen &&
        adSets.map((set) => {
          const setKey = `${camp.name}||${set.name}`
          const setOpen = openAdSets.has(setKey)
          const ads = sortItems(set.ads, sort.key, sort.dir)
          return (
            <AdSetRows
              key={setKey}
              set={set}
              setOpen={setOpen}
              ads={ads}
              indent={indent}
              metricCells={metricCells}
              onToggle={() => onToggleAdSet(setKey)}
            />
          )
        })}
    </>
  )
}

function AdSetRows({
  set,
  setOpen,
  ads,
  indent,
  metricCells,
  onToggle,
}: {
  set: AdSetNode
  setOpen: boolean
  ads: CreativeRow[]
  indent: (depth: number) => { paddingLeft: number }
  metricCells: (m: CreativeMetrics) => ReactNode
  onToggle: () => void
}) {
  return (
    <>
      <tr
        onClick={onToggle}
        className="cursor-pointer border-b border-white/[0.04] bg-white/[0.015] transition-colors hover:bg-bg-subtle/50"
      >
        <td className="px-5 py-3 text-left text-white/90" style={indent(1)}>
          <Chevron open={setOpen} /> {set.name}
        </td>
        {metricCells(set)}
        <td className="px-5 py-3 text-left text-white" />
      </tr>
      {setOpen &&
        ads.map((ad) => (
          <tr key={ad.ad} className="border-b border-white/[0.04] bg-white/[0.03]">
            <td className="px-5 py-3 text-left text-white/80" style={indent(2)}>
              {ad.ad}
            </td>
            {metricCells(ad)}
            <td className="px-5 py-3 text-left text-white/80">{ad.status}</td>
          </tr>
        ))}
    </>
  )
}
