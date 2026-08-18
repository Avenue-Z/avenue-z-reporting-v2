/**
 * Compact "no data for this period" placeholder — the same card frame each chart in
 * this section already uses, so a failed or empty query renders an honest empty state
 * instead of bare axes, an empty split bar, or tabs and column headers above no rows.
 *
 * Distinct from NeedsConnection (same folder): NeedsConnection means "you haven't
 * connected this data source," this means "we queried it and got nothing back for the
 * selected period." Keeping them separate avoids telling a connected client their CRM
 * (or GA4) isn't connected when the real story is just an empty window.
 */
export function NoData({ message = 'No data for this period.' }: { message?: string }) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-bg-surface p-6 text-sm text-text-muted">
      {message}
    </div>
  )
}
