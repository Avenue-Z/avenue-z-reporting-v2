// GET /api/aeo-outbound/progress?id=… or ?projectId=… (spec v1.1 §16.3): the live step of one generation, polled every
// second while a Generate request is in flight or a row is generating. Outside the proxy matcher, so it checks the
// session itself, before it reads the query. Read-only: one select of one row.
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { outboundAccess } from '@/lib/aeo-outbound/access'
import { errorLabel } from '@/lib/aeo-outbound/log'
import { generationProgressQuery, isReportId } from '@/lib/aeo-outbound/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }
const PROJECT_ID_MAX = 200

export async function GET(req: Request) {
  const session = await auth()
  if (!(await outboundAccess(session?.user)).ok) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: NO_STORE })
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
    return NextResponse.json(r ? { id: r.id, step: r.step, createdAt: r.createdAt.toISOString() } : { step: null }, { headers: NO_STORE })
  } catch (e) {
    console.error(`[aeo-outbound] progress read failed reason=${errorLabel(e)}`)
    return NextResponse.json({ error: 'unavailable' }, { status: 503, headers: NO_STORE })
  }
}
