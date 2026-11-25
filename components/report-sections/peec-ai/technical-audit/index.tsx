// The AEO Technical Performance tab as a monthly Technical Audit snapshot (spec 2026-11-23 §5). One view model
// (loadTechAuditView) feeds presentational parts. The viewer is the server session's, never a prop or URL value:
// a client sees published snapshots only, and staff-only parts (checklist, stale flag) never print in the PDF.
import { Gauge, ListChecks, TrendingUp } from 'lucide-react'
import { auth } from '@/auth'
import { ReportErrorBoundary } from '@/components/report-sections/error-boundary'
import { buildChecklist } from '@/lib/technical-audit/checklist'
import { isTechAuditStaff } from '@/lib/technical-audit/staff'
import { isTaSource, type TaRunStatus } from '@/lib/technical-audit/types'
import { loadTechAuditView, type ViewRun } from '@/lib/technical-audit/view'
import { SectionHeader } from '../section-header'
import { ChangeOverTime } from './change-over-time'
import { HealthTiles } from './health-tiles'
import { IssueList } from './issue-list'
import { PublishChecklist } from './publish-checklist'
import { SnapshotHeader } from './snapshot-header'

const RUN_STATUSES: readonly TaRunStatus[] = ['pending', 'complete', 'failed', 'missing']

/** The selected snapshot's runs in the checklist's types; an unknown source or status (never written) is left out. */
function checklistRuns(runs: ViewRun[]) {
  return runs.flatMap((r) => {
    const status = RUN_STATUSES.find((s) => s === r.status)
    return isTaSource(r.source) && status ? [{ source: r.source, status, lastError: r.lastError }] : []
  })
}

/** `exporting`: the PDF export, which always renders the client view whoever exports it (published snapshots only,
 *  no checklist, client copy), as the other exported reports do. */
const runReason = (runs: ViewRun[], source: string) => runs.find((r) => r.source === source)?.lastError ?? null

export async function TechnicalAuditPage({ clientSlug, snapshot, exporting = false }: { clientSlug: string; snapshot?: string; exporting?: boolean }) {
  const viewer = !exporting && isTechAuditStaff(await auth()) ? 'team' : 'client'
  const view = await loadTechAuditView(clientSlug, snapshot, viewer)

  if (!view) {
    return (
      <div className="rounded-2xl border border-white/[0.06] bg-bg-surface p-6">
        <p className="text-sm text-text-muted">No Technical Audit snapshot yet.</p>
      </div>
    )
  }

  const { selected, previous } = view
  return (
    <div className="flex flex-col gap-6">
      <ReportErrorBoundary sectionName="Technical Audit header">
        <SnapshotHeader
          snapshots={view.snapshots.map((s) => ({ date: s.date, status: s.status }))}
          selectedDate={selected.snapshotDate}
          previousDate={previous?.snapshotDate ?? null}
          sfCrawlDate={selected.sfCrawlDate}
          ahrefsCrawlDate={selected.ahrefsCrawlDate}
          gscExportDate={selected.gscExportDate}
          runs={view.runs.map((r) => ({ source: r.source, status: r.status }))}
          crawlSettingsChanged={view.crawlSettingsChanged}
          staleSince={view.staleSince}
        />
      </ReportErrorBoundary>

      {viewer === 'team' && (
        <ReportErrorBoundary sectionName="Before you publish">
          {/* Commentary state is wired by Task 13b; until then the item reads "none". */}
          <PublishChecklist
            clientSlug={clientSlug}
            snapshotId={selected.id}
            items={buildChecklist({ runs: checklistRuns(view.runs), commentary: 'none', status: selected.status })}
            status={selected.status}
          />
        </ReportErrorBoundary>
      )}

      {/* Commentary part (spec §7) goes here: Task 13b. */}

      <ReportErrorBoundary sectionName="Health scores">
        <section className="flex flex-col gap-4">
          <SectionHeader icon={Gauge} title="01 · Health scores" subtitle="How healthy is the site right now?" />
          <HealthTiles metrics={view.metrics} prevMetrics={view.prevMetrics} previousDate={previous?.snapshotDate ?? null} viewer={viewer}
            reasons={{ sf: runReason(view.runs, 'sf'), ahrefs: runReason(view.runs, 'ahrefs') }} />
        </section>
      </ReportErrorBoundary>

      <ReportErrorBoundary sectionName="Change over time">
        <section className="flex flex-col gap-4">
          <SectionHeader icon={TrendingUp} title="02 · Change over time" subtitle="What changed since the last snapshot?" />
          <ChangeOverTime
            series={view.series}
            metrics={view.metrics}
            prevMetrics={view.prevMetrics}
            selectedDate={selected.snapshotDate}
            previousDate={previous?.snapshotDate ?? null}
          />
        </section>
      </ReportErrorBoundary>

      <ReportErrorBoundary sectionName="Issues to investigate">
        <section className="flex flex-col gap-4">
          <SectionHeader icon={ListChecks} title="03 · Issues to investigate" subtitle="What should we look at first?" />
          <IssueList clientSlug={clientSlug} issues={view.issues} viewer={viewer} />
        </section>
      </ReportErrorBoundary>
    </div>
  )
}
