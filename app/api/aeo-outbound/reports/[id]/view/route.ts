import { type NextRequest } from 'next/server'
import { auth } from '@/auth'
import { outboundEmail } from '@/lib/aeo-outbound/permissions'
import { getReport, isReportId } from '@/lib/aeo-outbound/store'
import { renderSnapshotHtml } from '@/lib/aeo-outbound/render'
import { fmtEasternDay } from '@/lib/aeo-outbound/metrics'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const HEADERS = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': 'sandbox allow-scripts' }
const notFound = () => new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } })

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!outboundEmail(session?.user)) return new Response('Forbidden', { status: 403 })
  const { id } = await ctx.params
  if (!isReportId(id)) return notFound()
  const row = await getReport(id).catch(() => undefined)
  if (!row) return notFound()
  const preview = req.nextUrl.searchParams.get('mode') === 'preview'
  if (row.status === 'approved' && row.html) {
    // The editor shows approved rows as a preview: the frozen page's share button would copy the srcdoc
    // placeholder address there (T2). The public link serves row.html itself.
    if (preview && row.data && row.slots && row.approvedAt) return new Response(renderSnapshotHtml(row.data, row.slots, 'preview', fmtEasternDay(row.approvedAt)), { headers: HEADERS })
    return new Response(row.html, { headers: HEADERS })
  }
  if (row.status !== 'draft' || !row.data || !row.slots) return notFound()
  return new Response(renderSnapshotHtml(row.data, row.slots, preview ? 'preview' : 'draft', fmtEasternDay(new Date(row.data.generatedAt))), { headers: HEADERS })
}
