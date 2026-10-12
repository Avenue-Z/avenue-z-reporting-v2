// GET /api/aeo-outbound/reports?before=<ISO>&beforeId=<id>&q=<search>: Show older (spec v1.1 §5). The next 500 rows that
// are not live, older than the cursor and matching the same search, as hub rows, and the next cursor (null when none are
// left). Live rows are never here: the hub already lists every one of them.
import { NextResponse, type NextRequest } from 'next/server'
import { auth } from '@/auth'
import { outboundAccess } from '@/lib/aeo-outbound/access'
import { cleanSearch, toHubRow } from '@/lib/aeo-outbound/hub-rows'
import { errorLabel } from '@/lib/aeo-outbound/log'
import { isReportId, listReportSummaries } from '@/lib/aeo-outbound/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!(await outboundAccess(session?.user)).ok) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const sp = req.nextUrl.searchParams
  const before = sp.get('before')
  const beforeId = sp.get('beforeId')
  const at = before ? new Date(before) : null
  if (!at || Number.isNaN(at.getTime()) || !isReportId(beforeId)) return NextResponse.json({ error: 'bad-request' }, { status: 400 })
  const now = Date.now()
  try {
    const list = await listReportSummaries({ q: cleanSearch(sp.get('q')), before: { createdAt: at, id: beforeId } })
    return NextResponse.json({ rows: list.rows.map((r) => toHubRow(r, now)), cursor: list.cursor }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    console.error(`[aeo-outbound] hub older read failed reason=${errorLabel(e)}`)
    return NextResponse.json({ error: 'unavailable' }, { status: 503 })
  }
}
