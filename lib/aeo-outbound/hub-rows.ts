// The hub's row as plain data (check:rsc), shared by the hub page and the Show older route (spec v1.1 §5).
import { displayStatus, failureCode, failureReason, type DisplayStatus, type ReportSummary } from './store'

export interface HubRow {
  id: string
  brand: string
  /** The row's own brand_name for the link slug; null when Peec never named it (Task 3c, spec v1.1 §16.2). */
  linkBrand: string | null
  projectId: string
  projectName: string
  status: DisplayStatus
  createdAt: string
  createdBy: string
  approvedAt: string | null
  error: string | null
  errorCode: string | null
  progressStep: number
  token: string | null
  recipient: string | null
  openCount: number
  opensPerson: number
  opensAutomated: number
  firstOpenedAt: string | null
  lastOpenedAt: string | null
  requestedStart: string | null
  requestedEnd: string | null
}

export function toHubRow(r: ReportSummary, nowMs: number): HubRow {
  return {
    id: r.id,
    brand: r.brandName ?? r.peecProjectName,
    linkBrand: r.brandName,
    projectId: r.peecProjectId,
    projectName: r.peecProjectName,
    status: displayStatus(r, nowMs),
    createdAt: r.createdAt.toISOString(),
    createdBy: r.createdBy,
    approvedAt: r.approvedAt?.toISOString() ?? null,
    error: failureReason(r, nowMs),
    errorCode: failureCode(r, nowMs),
    progressStep: r.progressStep,
    token: r.status === 'approved' && !r.shareRevokedAt ? r.shareToken : null,
    recipient: r.shareRecipient,
    openCount: r.openCount,
    opensPerson: r.opensPerson,
    opensAutomated: r.opensAutomated,
    firstOpenedAt: r.firstOpenedAt?.toISOString() ?? null,
    lastOpenedAt: r.lastOpenedAt?.toISOString() ?? null,
    requestedStart: r.requestedStart,
    requestedEnd: r.requestedEnd,
  }
}

// One rule for the box and the server (client-safe module, so the hub component can use it without the db).
export { MAX_SEARCH, cleanSearch } from '../../components/aeo-outbound/search-text'
