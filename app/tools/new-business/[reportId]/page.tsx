import { notFound } from 'next/navigation'
import { requireStaff } from '@/lib/auth/page-access'
import { outboundEmail } from '@/lib/aeo-outbound/permissions'
import { errorLabel } from '@/lib/aeo-outbound/log'
import { displayStatus, failureReason, getReport, isReportId } from '@/lib/aeo-outbound/store'
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
  if (!isReportId(reportId)) notFound()
  let row: Awaited<ReturnType<typeof getReport>>
  try {
    row = await getReport(reportId)
  } catch (e) {
    // A database failure is not a missing snapshot: log it and let the error boundary show.
    console.error(`[aeo-outbound] editor read failed id=${reportId} reason=${errorLabel(e)}`)
    throw e
  }
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
