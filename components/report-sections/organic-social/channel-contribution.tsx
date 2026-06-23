import { DataTable } from '@/components/charts/data-table'
import { num, pct } from '@/lib/organic-social/base'
import type { ChannelRow } from '@/lib/organic-social/types'

export function ChannelContribution({ rows }: { rows: ChannelRow[] }) {
  const columns = [
    { key: 'channel', label: 'Channel' },
    { key: 'followers', label: 'Followers', align: 'right' as const, sortable: true, sortKey: 'followersRaw' },
    { key: 'netNew', label: 'Net New', align: 'right' as const, sortable: true, sortKey: 'netNewRaw' },
    { key: 'engagements', label: 'Engagements', align: 'right' as const, sortable: true, sortKey: 'engagementsRaw' },
    { key: 'engRate', label: 'Eng. Rate', align: 'right' as const },
  ]
  const display = rows.map((r) => ({
    channel: r.channel,
    followers: num(r.followers), followersRaw: r.followers,
    netNew: num(r.netNewFollowers), netNewRaw: r.netNewFollowers,
    engagements: num(r.engagements), engagementsRaw: r.engagements,
    engRate: pct(r.engagementRate),
  }))
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-extrabold uppercase tracking-widest text-text-muted">Channel Contribution</h2>
      <DataTable columns={columns} rows={display} defaultSort={{ key: 'followers', dir: 'desc' }} />
    </section>
  )
}
