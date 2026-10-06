// POST /api/export/pdf — the Organic Social PDF export (spec docs/superpowers/specs/2026-10-06-organic-social-pdf-export-v2-design.md §8).
// Authorises the requester exactly as the portal page does, then has headless Chromium open the export
// page (app/export/[clientSlug]/organic-social) with the requester's own session and print it.
// Role and client always come from the session; the body only says which view, range and timezone.
import { NextResponse, type NextRequest } from 'next/server'
import { auth } from '@/auth'
import { getClientBySlug } from '@/lib/db/queries'
import { canOpenPortal } from '@/lib/auth/route-access'
import { exportPagePath, parseExportRequest, type ExportRequest } from '@/lib/export/request'
import { organicSocialExportView } from '@/lib/export/organic-social-view'
import { contentDisposition, exportFilename } from '@/lib/export/filename'
import { ExportNotReadyError, ExportRenderError, renderPdf } from '@/lib/export/render-pdf'

export const runtime = 'nodejs'
export const maxDuration = 60

/** Auth.js's session cookie, plain or __Secure-, whole or chunked (.0, .1, …). Nothing else is forwarded. */
const SESSION_COOKIE = /^(__Secure-)?authjs\.session-token(\.\d+)?$/

/** The deployment the server's browser loads the export page from: cache-warm's rule (lib/cache-warm/run.ts). */
function baseUrl(req: NextRequest): string {
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return process.env.APP_URL || req.nextUrl.origin
}

export async function POST(req: NextRequest) {
  const started = Date.now()
  // One line per export: who, which view, what happened, how long, and the failed step. Never the
  // cookie or the page URL.
  const log = (r: Pick<ExportRequest, 'clientSlug' | 'subsection'> | null, outcome: string, step?: string) =>
    console.info(`[export] client=${r?.clientSlug ?? '-'} view=${r?.subsection ?? 'overview'} outcome=${outcome}${step ? ` step=${step}` : ''} ms=${Date.now() - started}`)

  let body: unknown = null
  try { body = await req.json() } catch { /* not JSON: a bad request below */ }
  const parsed = parseExportRequest(body)
  if (!parsed) {
    log(null, 'bad-request')
    return NextResponse.json({ error: 'bad-request' }, { status: 400 })
  }

  const session = await auth()
  if (!session?.user || !canOpenPortal(parsed.clientSlug, session.user)) {
    log(parsed, 'forbidden')
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const client = await getClientBySlug(parsed.clientSlug)
  if (!client || !client.enabledReports.includes('organic-social')) {
    log(parsed, 'not-found')
    return NextResponse.json({ error: 'not-found' }, { status: 404 })
  }

  // The tab as the page resolves it: an unknown or hidden tab is Overview.
  const view = organicSocialExportView(client, parsed.subsection)
  const r: ExportRequest = { ...parsed, subsection: view.subsectionId }
  const cookies = req.cookies.getAll().filter((c) => SESSION_COOKIE.test(c.name)).map(({ name, value }) => ({ name, value }))

  try {
    const pdf = await renderPdf({ url: new URL(exportPagePath(r), baseUrl(req)).toString(), cookies })
    log(r, 'ok')
    return new NextResponse(Buffer.from(pdf), {
      status: 200,
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': contentDisposition(exportFilename(client.name, view.pageTitle, new Date(), r.tz)),
        'cache-control': 'no-store',
      },
    })
  } catch (e) {
    if (e instanceof ExportNotReadyError) {
      log(r, 'still-loading')
      return NextResponse.json({ error: 'still-loading' }, { status: 504 })
    }
    log(r, 'render-failed', e instanceof ExportRenderError ? e.step : 'unknown')
    return NextResponse.json({ error: 'render-failed' }, { status: 500 })
  }
}
