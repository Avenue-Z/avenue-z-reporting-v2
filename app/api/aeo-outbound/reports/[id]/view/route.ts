import { type NextRequest } from 'next/server'
import { auth } from '@/auth'
import { outboundEmail } from '@/lib/aeo-outbound/permissions'
import { getReport, isReportId } from '@/lib/aeo-outbound/store'
import { SHARE_BUTTON, renderSnapshotHtml } from '@/lib/aeo-outbound/render'
import { AIVX_SHARE_BLOCK } from '@/lib/aeo-outbound/aivx/share'
import { errorLabel } from '@/lib/aeo-outbound/log'
import { fmtEasternDay } from '@/lib/aeo-outbound/metrics'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const HEADERS = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': 'sandbox allow-scripts' }
const unavailable = () => new Response('Unavailable', { status: 503, headers: { 'Cache-Control': 'no-store' } })
const notFound = () => new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } })

const HIDE_SHARE = '<style>.share-btn,.share-toast{display:none!important}</style>'
const once = (html: string, part: string) => html.split(part).length === 2

/** The frozen page minus its share button and share block, each removed only when it occurs exactly once; else CSS hides them. */
function withoutShare(html: string, id: string): string {
  if (once(html, SHARE_BUTTON) && once(html, AIVX_SHARE_BLOCK)) return html.replace(SHARE_BUTTON, '').replace(AIVX_SHARE_BLOCK, '')
  console.warn(`[aeo-outbound] view share strip fallback id=${id}`)
  return html.includes('</head>') ? html.replace('</head>', `${HIDE_SHARE}</head>`) : HIDE_SHARE + html
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!outboundEmail(session?.user)) return new Response('Forbidden', { status: 403 })
  const { id } = await ctx.params
  if (!isReportId(id)) return notFound()
  let row: Awaited<ReturnType<typeof getReport>>
  try { row = await getReport(id) } catch (e) {
    console.error(`[aeo-outbound] view read failed id=${id} reason=${errorLabel(e)}`)
    return unavailable()
  }
  if (!row) return notFound()
  const preview = req.nextUrl.searchParams.get('mode') === 'preview'
  if (row.status === 'approved' && row.html) {
    // Always the frozen HTML, never a re-render, so the editor shows exactly what the prospect sees (spec §4). The
    // preview only drops the share UI: its button would copy the srcdoc placeholder address there (T2).
    return new Response(preview ? withoutShare(row.html, id) : row.html, { headers: HEADERS })
  }
  if (row.status !== 'draft' || !row.data || !row.slots) return notFound()
  return new Response(renderSnapshotHtml(row.data, row.slots, preview ? 'preview' : 'draft', fmtEasternDay(new Date(row.data.generatedAt))), { headers: HEADERS })
}
