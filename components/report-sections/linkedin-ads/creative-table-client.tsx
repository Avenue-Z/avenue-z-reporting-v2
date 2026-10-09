'use client'
import { useState, type ReactNode } from 'react'
import { useExportMode } from '@/components/export/export-mode'
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

// Cost/Lead for a leadless row is stored as 0 (see lib/linkedin/creative.ts), but a
// creative with 0 leads has NO cost-per-lead, not the cheapest one. Rank those rows as
// the most expensive so they sort to the bottom of an ascending Cost/Lead sort (and the
// top of a descending one) — matching the "—" the column already displays for them.
const sortValue = <T extends LinkedInCreativeMetrics>(item: T, key: MetricKey): number =>
  key === 'costPerLead' && item.leads === 0 ? Infinity : (item[key] as number)

export function sortItems<T extends LinkedInCreativeMetrics & { name?: string; ad?: string }>(
  items: T[],
  key: SortKey,
  dir: 'asc' | 'desc',
): T[] {
  const sorted = [...items].sort((a, b) => {
    const av = key === 'name' ? (a.name ?? a.ad ?? '') : sortValue(a, key)
    const bv = key === 'name' ? (b.name ?? b.ad ?? '') : sortValue(b, key)
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
  // The PDF export prints the top level as on first load, collapsed, with no sort, expand or hint controls (spec 2026-10-08
  // §7; PR 3 plan deviation 3). Rows split between pages only between rows (app/export/export-theme.css).
  const exportMode = useExportMode()

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
    <div className="overflow-x-auto rounded-lg border border-white/[0.06] bg-bg-surface" data-export-table="" {...(exportMode && sortedGroups.length + 1 <= 15 ? { 'data-export-block': '' } : {})}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/[0.06]">
            <th
              onClick={exportMode ? undefined : () => onSort('name')}
              className={exportMode
                ? 'px-5 py-3 text-left text-[11px] font-extrabold uppercase tracking-widest text-text-muted'
                : 'cursor-pointer select-none px-5 py-3 text-left text-[11px] font-extrabold uppercase tracking-widest text-text-muted hover:text-white'}
            >
              Name{!exportMode && sort.key === 'name' ? (sort.dir === 'desc' ? ' ↓' : ' ↑') : ''}
            </th>
            {COLS.map((c) => (
              <th
                key={c.key}
                onClick={exportMode ? undefined : () => onSort(c.key)}
                className={exportMode
                  ? 'px-5 py-3 text-right text-[11px] font-extrabold uppercase tracking-widest text-text-muted'
                  : 'cursor-pointer select-none px-5 py-3 text-right text-[11px] font-extrabold uppercase tracking-widest text-text-muted hover:text-white'}
              >
                {c.label}
                {!exportMode && sort.key === c.key ? (sort.dir === 'desc' ? ' ↓' : ' ↑') : ''}
              </th>
            ))}
            {/* Not in the PDF export: Status is an ad-level field, and only top-level rows print. */}
            {!exportMode && (
              <th className="px-5 py-3 text-left text-[11px] font-extrabold uppercase tracking-widest text-text-muted">
                Status
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {sortedGroups.map((group) => {
            const groupOpen = openGroups.has(group.name)
            const campaigns = sortItems(group.campaigns, sort.key, sort.dir)
            return (
              <GroupRows
                exportMode={exportMode}
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
          <tr className="border-t border-white/[0.12] font-semibold" data-export-row="">
            <td className="px-5 py-3 text-left text-white" style={exportMode ? undefined : indent(0)}>
              {`Total (${groups.length} ${groups.length === 1 ? 'Campaign Group' : 'Campaign Groups'})`}
            </td>
            {metricCells(totals)}
            {!exportMode && <td className="px-5 py-3 text-left text-white" />}
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function Chevron({ open, exportMode = false }: { open: boolean; exportMode?: boolean }) {
  // No expand arrow on paper: rows can't open in the PDF export.
  if (exportMode) return null
  return <span className="inline-block w-4 text-text-muted">{open ? '▾' : '▸'}</span>
}

function GroupRows({
  exportMode = false,
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
  exportMode?: boolean
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
        onClick={exportMode ? undefined : onToggleGroup}
        data-export-row=""
        className={exportMode ? 'border-b border-white/[0.04]' : 'cursor-pointer border-b border-white/[0.04] transition-colors hover:bg-bg-subtle/50'}
      >
        <td className="px-5 py-3 text-left text-white" style={exportMode ? undefined : indent(0)}>
          <Chevron open={groupOpen} exportMode={exportMode} /> {group.name}
        </td>
        {metricCells(group)}
        {!exportMode && <td className="px-5 py-3 text-left text-white" />}
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
