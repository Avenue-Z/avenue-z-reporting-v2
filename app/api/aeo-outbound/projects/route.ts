// GET /api/aeo-outbound/projects: Peec projects for the hub dropdown (spec §4). Outside the proxy matcher,
// so it checks the session itself.
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { outboundEmail } from '@/lib/aeo-outbound/permissions'
import { peecFromEnv, PeecError } from '@/lib/aeo-outbound/peec'
import { listProjects } from '@/lib/aeo-outbound/pull'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET() {
  const session = await auth()
  if (!outboundEmail(session?.user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  try {
    return NextResponse.json(await listProjects(peecFromEnv({ deadline: Date.now() + 50_000 })), { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    const msg = e instanceof PeecError ? 'Peec is unavailable. Try again.' : 'Could not load projects.'
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
