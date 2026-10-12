// The PDF export page (specs 2026-10-06-organic-social-pdf-export-v2 §5, 2026-10-08-pdf-export-all-reports §4).
// Not a page anyone navigates to: the export route's headless browser opens it with the requester's own
// session (app/api/export/pdf), waits for ExportReadyReporter, and prints it. It renders the same report
// component the live page renders (components/export/report-element.tsx). Organic Social's report resolves the
// locked month itself from the raw range, so the served range is the live page's by construction.
import '../../export-theme.css'
import { notFound } from 'next/navigation'
import { requirePortalAccess } from '@/lib/auth/page-access'
import { getClientBySlug } from '@/lib/db/queries'
import { lockedRangeFor, requestClock } from '@/lib/organic-social/locked-range'
import { exportPeriodLabel } from '@/lib/export-period'
import { exportStamp } from '@/lib/export/filename'
import { safeTimeZone } from '@/lib/export/request'
import { isServerExportSection } from '@/lib/export/sections'
import { resolveExportView } from '@/lib/export/report-view'
import { parseModelsParam } from '@/lib/peec/models'
import { CONTENT_WIDTH } from '@/lib/export/render-pdf'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ExportModeProvider, ExportReadyReporter } from '@/components/export/export-mode'
import { exportReportElement } from '@/components/export/report-element'

export const dynamic = 'force-dynamic'

/** Arrows and symbols (Noto Sans Math) and emoji in post captions (Noto Color Emoji), which Nunito Sans lacks. */
const EXPORT_FONTS_URL = 'https://fonts.googleapis.com/css2?family=Noto+Sans+Math&family=Noto+Color+Emoji&display=block'

const str = (v: unknown) => (typeof v === 'string' && v !== '' ? v : null)

export default async function ReportExportPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientSlug: string; section: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { clientSlug, section } = await params
  const session = await requirePortalAccess(clientSlug)
  const sp = await searchParams
  const client = await getClientBySlug(clientSlug)
  if (!client || !isServerExportSection(section) || !client.enabledReports.includes(section)) notFound()

  const dateRange = str(sp.dateRange) ?? 'last_30_days'
  const compareRange = str(sp.compareRange)
  const tz = safeTimeZone(sp.tz)
  const view = resolveExportView(client, section, str(sp.subsection))
  const report = exportReportElement(view, { clientSlug, dateRange, compareRange, models: parseModelsParam(str(sp.models)) })
  // The period stamped is the range the report serves: Organic Social's locked month for an opted-in client (the
  // same lookup OrganicSocialBody makes), else the requested range. No month to serve, no period.
  const locked = section === 'organic-social' ? lockedRangeFor(client, session.user?.role, dateRange, requestClock()) : null
  const served = locked ? (locked.month?.dateRange ?? null) : dateRange

  return (
    <div className="export-theme" style={{ width: CONTENT_WIDTH }}>
      {/* The root layout paints the dark app background; the PDF is white paper. */}
      <style>{'html, body { background: #fff !important; margin: 0; }'}</style>
      {/* The fallback fonts in export-theme.css's --font-sans. React hoists this into <head>. */}
      <link rel="stylesheet" href={EXPORT_FONTS_URL} precedence="default" />
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
          {report}
        </ExportModeProvider>
      </TooltipProvider>
      <ExportReadyReporter />
    </div>
  )
}
