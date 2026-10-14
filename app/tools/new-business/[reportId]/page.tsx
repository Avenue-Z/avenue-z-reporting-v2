import { requireStaff } from '@/lib/auth/page-access'
import { outboundAccess } from '@/lib/aeo-outbound/access'
import { DECISIONS, PAGE_WORDS_V1 } from '@/lib/aeo-outbound/config'
import { errorLabel } from '@/lib/aeo-outbound/log'
import { displayStatus, failureCode, failureReason, getReport, isReportId, opensForReportQuery } from '@/lib/aeo-outbound/store'
import { needsValidationPaths, withDefaults } from '@/lib/aeo-outbound/slots'
import { shareOrigin } from '@/lib/aeo-outbound/share-origin'
import { OutboundEditor, type OpenEvent } from '@/components/aeo-outbound/editor'
import { NoAccess } from '@/components/aeo-outbound/no-access'
import { SnapshotNotFound } from '@/components/aeo-outbound/snapshot-not-found'

export default async function NewBusinessEditorPage({
  params,
}: {
  params: Promise<{ reportId: string }>
}) {
  const { reportId } = await params
  const session = await requireStaff()
  const access = await outboundAccess(session.user)
  // Spec v1.1 §19.7 (A3): unreadable settings are a moment to retry, not a refusal.
  if (!access.ok) return <NoAccess admins={access.admins} unavailable={access.reason === 'unavailable'} />
  if (!isReportId(reportId)) return <SnapshotNotFound />
  let row: Awaited<ReturnType<typeof getReport>>
  try {
    row = await getReport(reportId)
  } catch (e) {
    // A database failure is not a missing snapshot: log it and let the error boundary show.
    console.error(`[aeo-outbound] editor read failed id=${reportId} reason=${errorLabel(e)}`)
    throw e
  }
  if (!row) return <SnapshotNotFound />
  const now = Date.now()
  const status = displayStatus(row, now)
  const full = row.data && row.slots && !row.unreadable ? withDefaults(row.slots, row.data) : null
  let opens: OpenEvent[] = []
  if (status === 'live' || status === 'revoked') {
    try {
      opens = (await opensForReportQuery(row.id)).map((o) => ({ openedAt: o.openedAt.toISOString(), uaFamily: o.uaFamily, likelyAutomated: o.likelyAutomated, reason: o.reason }))
    } catch (e) {
      // The open list is a detail: the editor still shows the row and its counter.
      console.error(`[aeo-outbound] editor opens read failed id=${row.id} reason=${errorLabel(e)}`)
    }
  }
  // Every prop is plain data (strings, numbers, booleans, null, arrays and objects of those): check:rsc.
  return (
    <OutboundEditor
      key={row.id}
      id={row.id}
      brand={row.brandName ?? row.peecProjectName}
      linkBrand={row.brandName}
      shareOrigin={shareOrigin()}
      projectId={row.peecProjectId}
      status={status}
      revision={row.revision}
      notes={row.unreadable ? [] : (row.notes ?? [])}
      needsValidation={full ? needsValidationPaths(full) : []}
      token={row.status === 'approved' && !row.shareRevokedAt ? row.shareToken : null}
      error={failureReason(row, now)}
      errorCode={failureCode(row, now)}
      recipient={row.shareRecipient}
      sectionTitles={full ? [full.page.section_1_title, full.page.section_2_title] : [PAGE_WORDS_V1.section_1_title, PAGE_WORDS_V1.section_2_title]}
      about={row.data && !row.unreadable ? { projectId: row.data.projectId, projectName: row.data.projectName, projectStatus: row.data.projectStatus ?? null, windowLabel: row.data.windowLabel, models: row.data.models } : null}
      opens={opens}
      openCount={row.openCount}
      needsValidationBlocksApprove={DECISIONS.needsValidationBlocksApprove}
      unreadable={row.status === 'draft' && !!row.unreadable}
      progressStep={row.progressStep}
      createdAt={row.createdAt.toISOString()}
    />
  )
}
