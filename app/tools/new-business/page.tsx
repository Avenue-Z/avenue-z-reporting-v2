import { requireStaff } from '@/lib/auth/page-access'
import { outboundAccess } from '@/lib/aeo-outbound/access'
import { displayStatus, failureReason, listReportSummaries } from '@/lib/aeo-outbound/store'
import { OutboundHub, type HubRow } from '@/components/aeo-outbound/hub'
import { shareOrigin } from '@/lib/aeo-outbound/share-origin'
import { NoAccess } from '@/components/aeo-outbound/no-access'

export default async function NewBusinessHubPage() {
  const session = await requireStaff()
  const access = await outboundAccess(session.user)
  if (!access.ok) return <NoAccess admins={access.admins} />
  const now = Date.now()
  // Every prop is plain data (strings, numbers, null): nothing here may be a function (check:rsc).
  const rows: HubRow[] = (await listReportSummaries()).rows.map((r) => ({
    id: r.id,
    brand: r.brandName ?? r.peecProjectName,
    linkBrand: r.brandName,
    projectId: r.peecProjectId,
    projectName: r.peecProjectName,
    status: displayStatus(r, now),
    createdAt: r.createdAt.toISOString(),
    approvedAt: r.approvedAt?.toISOString() ?? null,
    error: failureReason(r, now),
    token: r.status === 'approved' && !r.shareRevokedAt ? r.shareToken : null,
    recipient: r.shareRecipient,
    openCount: r.openCount,
    firstOpenedAt: r.firstOpenedAt?.toISOString() ?? null,
    lastOpenedAt: r.lastOpenedAt?.toISOString() ?? null,
  }))
  return <OutboundHub rows={rows} shareOrigin={shareOrigin()} />
}
