/** Compact "no data for this period" placeholder — same card frame as the error Fallback and
 *  the KPI cards. Shown when a part's window has no data (all KPIs null, or an empty trend), so
 *  the client sees an honest empty state instead of a wall of zeros or a blank chart. Kept as a
 *  plain presentational component (no 'use client', no server imports) so both the server-rendered
 *  headlines and the client-rendered trend chart can use it. */
export function NoData({ message = 'No data for this period.' }: { message?: string }) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-bg-surface p-6 text-sm text-text-muted">
      {message}
    </div>
  )
}
