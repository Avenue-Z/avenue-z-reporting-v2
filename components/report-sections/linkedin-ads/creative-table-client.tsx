'use client'
import { useState, type ReactNode } from 'react'
import { num, pct } from '@/lib/supermetrics/format'
import { money, DASH } from '@/lib/paid-media/format'
import type {
  LinkedInCampaignGroupNode,
  LinkedInCampaignNode,
  LinkedInCreativeRow,
  LinkedInCreativeMetrics,
} from '@/lib/linkedin/types'

type MetricKey =
  | 'spend' | 'impressions' | 'clicks' | 'ctr' | 'cpc' | 'leads'
  | 'costPerLead' | 'leadFormOpens' | 'leadFormCompletionRate' | 'landingPageClicks' | 'shareOfSpend'

interface Col {
  key: MetricKey
  label: string
  fmt: (n: number, row?: LinkedInCreativeMetrics) => string
}

const COLS: Col[] = [
  { key: 'spend', label: 'Spend', fmt: money },
  { key: 'impressions', label: 'Impressions', fmt: num },
  { key: 'clicks', label: 'Clicks', fmt: num },
  { key: 'ctr', label: 'CTR', fmt: pct },
  { key: 'cpc', label: 'CPC', fmt: money },
  { key: 'leads', label: 'Leads', fmt: num },
  { key: 'costPerLead', label: 'Cost / Lead', fmt: (n, row) => (row && row.leads > 0 ? money(n) : DASH) },
  { key: 'leadFormOpens', label: 'LF Opens', fmt: num },
  { key: 'leadFormCompletionRate', label: 'LF Compl. Rate', fmt: pct },
  { key: 'landingPageClicks', label: 'LP Clicks', fmt: num },
  { key: 'shareOfSpend', label: 'Share of Spend', fmt: pct },
]

type SortKey = MetricKey | 'name'

function sortItems<T extends LinkedInCreativeMetrics & { name?: string; ad?: string }>(
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
  groups,
  totals,
}: {
  groups: LinkedInCampaignGroupNode[]
  totals: LinkedInCreativeMetrics
}) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'spend', dir: 'desc' })
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set())
  const [openCampaigns, setOpenCampaigns] = useState<Set<string>>(new Set())

  const toggle = (set: Set<string>, key: string) => {
    const next = new Set(set)
    next.has(key) ? next.delete(key) : next.add(key)
    return next
  }

  const onSort = (key: SortKey) =>
    setSort((s) => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }))

  const sortedGroups = sortItems(groups, sort.key, sort.dir)

  const indent = (depth: number) => ({ paddingLeft: 20 + depth * 22 })

  const metricCells = (m: LinkedInCreativeMetrics) =>
    COLS.map((c) => (
      <td key={c.key} className="px-5 py-3 text-right text-white">
        {c.fmt(m[c.key], m)}
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
                {c.label}
                {sort.key === c.key ? (sort.dir === 'desc' ? ' ↓' : ' ↑') : ''}
              </th>
            ))}
            <th className="px-5 py-3 text-left text-[11px] font-extrabold uppercase tracking-widest text-text-muted">
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedGroups.map((group) => {
            const groupOpen = openGroups.has(group.name)
            const campaigns = sortItems(group.campaigns, sort.key, sort.dir)
            return (
              <GroupRows
                key={group.name}
                group={group}
                groupOpen={groupOpen}
                campaigns={campaigns}
                openCampaigns={openCampaigns}
                sort={sort}
                indent={indent}
                metricCells={metricCells}
                onToggleGroup={() => setOpenGroups((s) => toggle(s, group.name))}
                onToggleCampaign={(campKey: string) => setOpenCampaigns((s) => toggle(s, campKey))}
              />
            )
          })}
          <tr className="border-t border-white/[0.12] font-semibold">
            <td className="px-5 py-3 text-left text-white" style={indent(0)}>
              {`Total (${groups.length} ${groups.length === 1 ? 'Campaign Group' : 'Campaign Groups'})`}
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

function GroupRows({
  group,
  groupOpen,
  campaigns,
  openCampaigns,
  sort,
  indent,
  metricCells,
  onToggleGroup,
  onToggleCampaign,
}: {
  group: LinkedInCampaignGroupNode
  groupOpen: boolean
  campaigns: LinkedInCampaignNode[]
  openCampaigns: Set<string>
  sort: { key: SortKey; dir: 'asc' | 'desc' }
  indent: (depth: number) => { paddingLeft: number }
  metricCells: (m: LinkedInCreativeMetrics) => ReactNode
  onToggleGroup: () => void
  onToggleCampaign: (campKey: string) => void
}) {
  return (
    <>
      <tr
        onClick={onToggleGroup}
        className="cursor-pointer border-b border-white/[0.04] transition-colors hover:bg-bg-subtle/50"
      >
        <td className="px-5 py-3 text-left text-white" style={indent(0)}>
          <Chevron open={groupOpen} /> {group.name}
        </td>
        {metricCells(group)}
        <td className="px-5 py-3 text-left text-white" />
      </tr>
      {groupOpen &&
        campaigns.map((camp) => {
          const campKey = `${group.name}||${camp.name}`
          const campOpen = openCampaigns.has(campKey)
          const ads = sortItems(camp.ads, sort.key, sort.dir)
          return (
            <CampaignRows
              key={campKey}
              camp={camp}
              campOpen={campOpen}
              ads={ads}
              indent={indent}
              metricCells={metricCells}
              onToggle={() => onToggleCampaign(campKey)}
            />
          )
        })}
    </>
  )
}

function CampaignRows({
  camp,
  campOpen,
  ads,
  indent,
  metricCells,
  onToggle,
}: {
  camp: LinkedInCampaignNode
  campOpen: boolean
  ads: LinkedInCreativeRow[]
  indent: (depth: number) => { paddingLeft: number }
  metricCells: (m: LinkedInCreativeMetrics) => ReactNode
  onToggle: () => void
}) {
  return (
    <>
      <tr
        onClick={onToggle}
        className="cursor-pointer border-b border-white/[0.04] bg-white/[0.015] transition-colors hover:bg-bg-subtle/50"
      >
        <td className="px-5 py-3 text-left text-white/90" style={indent(1)}>
          <Chevron open={campOpen} /> {camp.name}
        </td>
        {metricCells(camp)}
        <td className="px-5 py-3 text-left text-white" />
      </tr>
      {campOpen &&
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
