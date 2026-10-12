import { requireStaff } from '@/lib/auth/page-access'
import { outboundAccess } from '@/lib/aeo-outbound/access'
import { cleanSearch, toHubRow } from '@/lib/aeo-outbound/hub-rows'
import { hubCounts, listReportSummaries, projectStats } from '@/lib/aeo-outbound/store'
import { shareOrigin } from '@/lib/aeo-outbound/share-origin'
import { OutboundHub } from '@/components/aeo-outbound/hub'
import { NoAccess } from '@/components/aeo-outbound/no-access'

export default async function NewBusinessHubPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>
}) {
  const { q } = await searchParams
  const session = await requireStaff()
  const access = await outboundAccess(session.user)
  if (!access.ok) return <NoAccess admins={access.admins} />
  // v1.1 §5: search is server-side over every row; the tab counts cover every row that matches it.
  const search = cleanSearch(q)
  const now = Date.now()
  const [list, counts, stats] = await Promise.all([listReportSummaries({ q: search }), hubCounts(search, new Date(now)), projectStats()])
  // Every prop is plain data (strings, numbers, null, arrays and objects of those): nothing here may be a function (check:rsc).
  return (
    <OutboundHub rows={list.rows.map((r) => toHubRow(r, now))} cursor={list.cursor} counts={counts} q={search ?? ''} projectStats={stats} isAdmin={access.admin} shareOrigin={shareOrigin()} />
  )
}
