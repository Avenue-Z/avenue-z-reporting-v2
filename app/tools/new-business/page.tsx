import { requireStaff } from '@/lib/auth/page-access'
import { outboundEmail } from '@/lib/aeo-outbound/permissions'
import { displayStatus, failureReason, listReportSummaries } from '@/lib/aeo-outbound/store'
import { OutboundHub, type HubRow } from '@/components/aeo-outbound/hub'
import { NoAccess } from '@/components/aeo-outbound/no-access'

export default async function NewBusinessHubPage() {
  const session = await requireStaff()
  if (!outboundEmail(session.user)) return <NoAccess />
  const now = Date.now()
  // Every prop is plain data (strings, numbers, null): nothing here may be a function (check:rsc).
  const rows: HubRow[] = (await listReportSummaries()).map((r) => ({
    id: r.id,
    brand: r.brandName ?? r.peecProjectName,
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
  return <OutboundHub rows={rows} />
}
