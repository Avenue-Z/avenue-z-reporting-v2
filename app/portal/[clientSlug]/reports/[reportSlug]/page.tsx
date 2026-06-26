import { redirect } from 'next/navigation'

// Legacy path-style report route. The canonical route is the query-based
// `…/reports?section=<slug>` page, which the sidebar and home tiles link to.
// This redirect keeps old/bookmarked `…/reports/<slug>` URLs working and
// prevents the two routes from drifting again.
export default async function PortalReportRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ clientSlug: string; reportSlug: string }>
  searchParams: Promise<{ dateRange?: string; compareRange?: string }>
}) {
  const { clientSlug, reportSlug } = await params
  const { dateRange, compareRange } = await searchParams

  const sp = new URLSearchParams()
  sp.set('section', reportSlug)
  if (dateRange)    sp.set('dateRange', dateRange)
  if (compareRange) sp.set('compareRange', compareRange)

  redirect(`/portal/${clientSlug}/reports?${sp.toString()}`)
}
