import { type NextRequest } from 'next/server'
import { auth } from '@/auth'
import { outboundAccess } from '@/lib/aeo-outbound/access'
import { getReport, isReportId } from '@/lib/aeo-outbound/store'
import { SHARE_BUTTON, SHARE_MOBILE, renderSnapshotHtml } from '@/lib/aeo-outbound/render'
import { AIVX_SHARE_BLOCK } from '@/lib/aeo-outbound/aivx/share'
import { REPORT_CSP } from '@/lib/aeo-outbound/sandbox'
import { errorLabel } from '@/lib/aeo-outbound/log'
import { preparedDay } from '@/lib/aeo-outbound/metrics'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const HEADERS = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': REPORT_CSP }
const unavailable = () => new Response('Unavailable', { status: 503, headers: { 'Cache-Control': 'no-store' } })
const notFound = () => new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } })

const HIDE_SHARE = '<style>.share-btn,.share-toast,.aeo-share-mobile{display:none!important}</style>'
const once = (html: string, part: string) => html.split(part).length === 2

/** The frozen page minus its share button and share block. A report approved after v1.1 §17.11 carries none of the three
 *  share strings (button, block, phone Share block), so it is returned unchanged with no warning. For older rows each
 *  of the button and the block is removed only when it occurs exactly once, else CSS hides them. The phone Share block is
 *  removed when it occurs once, left alone when absent (rows approved before it existed), and sends the page to the CSS
 *  fallback when it occurs more than once (v1.1 §17.2, §17.11). */
function withoutShare(html: string, id: string): string {
  const mobile = html.split(SHARE_MOBILE).length - 1
  if (!html.includes(SHARE_BUTTON) && !html.includes(AIVX_SHARE_BLOCK) && mobile === 0) return html
  if (once(html, SHARE_BUTTON) && once(html, AIVX_SHARE_BLOCK) && mobile <= 1) {
    const out = html.replace(SHARE_BUTTON, '').replace(AIVX_SHARE_BLOCK, '')
    return mobile === 1 ? out.replace(SHARE_MOBILE, '') : out
  }
  console.warn(`[aeo-outbound] view share strip fallback id=${id}`)
  return html.includes('</head>') ? html.replace('</head>', `${HIDE_SHARE}</head>`) : HIDE_SHARE + html
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth()
  const access = await outboundAccess(session?.user)
  // Spec v1.1 §19.7 (A3): unreadable settings are a retry, not a refusal.
  if (!access.ok) return access.reason === 'unavailable' ? unavailable() : new Response('Forbidden', { status: 403 })
  const { id } = await ctx.params
  if (!isReportId(id)) return notFound()
  let row: Awaited<ReturnType<typeof getReport>>
  try { row = await getReport(id) } catch (e) {
    console.error(`[aeo-outbound] view read failed id=${id} reason=${errorLabel(e)}`)
    return unavailable()
  }
  // An unreadable draft (stored data that breaks its contract) is served like a missing one: nothing of it renders.
  // An approved row serves its frozen HTML, which does not read that data.
  if (!row || (row.unreadable && row.status !== 'approved')) return notFound()
  const preview = req.nextUrl.searchParams.get('mode') === 'preview'
  if (row.status === 'approved' && row.html) {
    // Always the frozen HTML, never a re-render, so the editor shows exactly what the prospect sees (spec §4). The
    // preview only drops the share UI of rows approved before v1.1 §17.11: its button would copy the srcdoc placeholder address there (T2).
    return new Response(preview ? withoutShare(row.html, id) : row.html, { headers: HEADERS })
  }
  if (row.status !== 'draft' || !row.data || !row.slots) return notFound()
  // The date approving now would freeze (app/actions/aeo-outbound.ts), so the editor and its preview show the Prepared date
  // the prospect will see (spec v1.1 §18.6): today's Eastern day, or the window's last day when later (§19.8).
  // X-Report-Revision: the revision this draft was rendered at, which the editor's save queue adopts (spec v1.1 §19.7).
  return new Response(renderSnapshotHtml(row.data, row.slots, preview ? 'preview' : 'draft', preparedDay(new Date(), row.data.window.end)), { headers: { ...HEADERS, 'X-Report-Revision': String(row.revision) } })
}
