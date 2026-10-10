import { notFound } from 'next/navigation'
import { requireStaff } from '@/lib/auth/page-access'
import { outboundEmail } from '@/lib/aeo-outbound/permissions'
import { displayStatus, failureReason, getReport } from '@/lib/aeo-outbound/store'
import { needsValidationPaths } from '@/lib/aeo-outbound/slots'
import { OutboundEditor } from '@/components/aeo-outbound/editor'
import { NoAccess } from '@/components/aeo-outbound/no-access'

export default async function NewBusinessEditorPage({
  params,
}: {
  params: Promise<{ reportId: string }>
}) {
  const { reportId } = await params
  const session = await requireStaff()
  if (!outboundEmail(session.user)) return <NoAccess />
  const row = await getReport(reportId).catch(() => undefined)
  if (!row) notFound()
  const now = Date.now()
  return (
    <OutboundEditor
      key={row.id}
      id={row.id}
      brand={row.brandName ?? row.peecProjectName}
      projectId={row.peecProjectId}
      status={displayStatus(row, now)}
      revision={row.revision}
      notes={row.notes ?? []}
      needsValidation={row.slots ? needsValidationPaths(row.slots) : []}
      token={row.status === 'approved' && !row.shareRevokedAt ? row.shareToken : null}
      error={failureReason(row, now)}
    />
  )
}
