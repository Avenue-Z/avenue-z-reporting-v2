// The PDF export page for Organic Social (spec docs/superpowers/specs/2026-10-06-organic-social-pdf-export-v2-design.md §5).
// Not a page anyone navigates to: the export route's headless browser opens it with the requester's own
// session (app/api/export/pdf), waits for ExportReadyReporter, and prints it. It renders the same
// OrganicSocialReport as the live page, which resolves the locked month itself from the raw range, so
// the served range is the live page's by construction.
import '../../export-theme.css'
import { notFound } from 'next/navigation'
import { requirePortalAccess } from '@/lib/auth/page-access'
import { getClientBySlug } from '@/lib/db/queries'
import { lockedRangeFor, requestClock } from '@/lib/organic-social/locked-range'
import { exportPeriodLabel } from '@/lib/export-period'
import { exportStamp } from '@/lib/export/filename'
import { safeTimeZone } from '@/lib/export/request'
import { organicSocialExportView } from '@/lib/export/organic-social-view'
import { CONTENT_WIDTH } from '@/lib/export/render-pdf'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ExportModeProvider, ExportReadyReporter } from '@/components/export/export-mode'
import { OrganicSocialReport } from '@/components/report-sections/organic-social'

export const dynamic = 'force-dynamic'

const str = (v: unknown) => (typeof v === 'string' && v !== '' ? v : null)

export default async function OrganicSocialExportPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientSlug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { clientSlug } = await params
  const session = await requirePortalAccess(clientSlug)
  const sp = await searchParams
  const client = await getClientBySlug(clientSlug)
  if (!client || !client.enabledReports.includes('organic-social')) notFound()

  const dateRange = str(sp.dateRange) ?? 'last_30_days'
  const compareRange = str(sp.compareRange)
  const tz = safeTimeZone(sp.tz)
  const view = organicSocialExportView(client, str(sp.subsection))
  // The period stamped is the range the report serves: the locked month for an opted-in client (the
  // same lookup OrganicSocialBody makes), else the requested range. No month to serve, no period.
  const locked = lockedRangeFor(client, session.user?.role, dateRange, requestClock())
  const served = locked ? (locked.month?.dateRange ?? null) : dateRange

  return (
    <div className="export-theme" style={{ width: CONTENT_WIDTH }}>
      {/* The root layout paints the dark app background; the PDF is white paper. */}
      <style>{'html, body { background: #fff !important; margin: 0; }'}</style>
      <header data-export-block="" className="mb-8 flex items-end gap-4 border-b border-white/[0.08] pb-4">
        {client.logoUrl && (
          // A plain <img>: the readiness check waits on it, and next/image's lazy loading would not load it.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={client.logoUrl} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold uppercase tracking-widest text-text-muted">{client.name}</p>
          <h1 className="text-3xl font-extrabold uppercase text-white">{view.pageTitle}</h1>
        </div>
        <p className="shrink-0 text-xs text-text-muted">{exportStamp(new Date(), tz, served ? exportPeriodLabel(served) : null)}</p>
      </header>
      <TooltipProvider delayDuration={150} skipDelayDuration={50}>
        <ExportModeProvider>
          <OrganicSocialReport clientSlug={clientSlug} dateRange={dateRange} compareRange={compareRange} channel={view.channel} view={view.view} />
        </ExportModeProvider>
      </TooltipProvider>
      <ExportReadyReporter />
    </div>
  )
}
