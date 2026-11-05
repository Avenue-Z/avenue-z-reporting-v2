// GET /api/aeo-outbound/progress?id=… or ?projectId=… (spec v1.1 §16.3): the live step of one generation, polled every
// second while a Generate request is in flight or a row is generating. Outside the proxy matcher, so it checks the
// session itself, before it reads the query. Read-only: one select of one row, or a `select now()` when there is none.
// Both 200 bodies carry `now`, Postgres's clock, so the hook can match its run on the clock that set createdAt (v1.1 §18.9).
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { outboundAccess, refusalStatus } from '@/lib/aeo-outbound/access'
import { errorLabel } from '@/lib/aeo-outbound/log'
import { databaseNow, generationProgressQuery, isReportId } from '@/lib/aeo-outbound/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }
const PROJECT_ID_MAX = 200

export async function GET(req: Request) {
  const session = await auth()
  const access = await outboundAccess(session?.user)
  // Spec v1.1 §19.7 (A3): unreadable settings are a retry (503), not a refusal.
  if (!access.ok) return NextResponse.json({ error: access.reason }, { status: refusalStatus(access.reason), headers: NO_STORE })
  const qs = new URL(req.url).searchParams
  const id = qs.get('id')
  const projectId = qs.get('projectId')
  const by = id !== null && projectId === null && isReportId(id)
    ? { id }
    : projectId !== null && id === null && projectId.length >= 1 && projectId.length <= PROJECT_ID_MAX
      ? { projectId }
      : null
  if (!by) return NextResponse.json({ error: 'bad-request' }, { status: 400, headers: NO_STORE })
  try {
    const r = (await generationProgressQuery(by, new Date()))[0]
    const body = r
      ? { id: r.id, step: r.step, createdAt: r.createdAt.toISOString(), now: r.now.toISOString() }
      : { step: null, now: (await databaseNow()).toISOString() }
    return NextResponse.json(body, { headers: NO_STORE })
  } catch (e) {
    console.error(`[aeo-outbound] progress read failed reason=${errorLabel(e)}`)
    return NextResponse.json({ error: 'unavailable' }, { status: 503, headers: NO_STORE })
  }
}
