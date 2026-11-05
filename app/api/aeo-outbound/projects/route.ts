// GET /api/aeo-outbound/projects: Peec projects for the hub dropdown (spec §4). Outside the proxy matcher,
// so it checks the session itself.
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { outboundAccess, refusalStatus } from '@/lib/aeo-outbound/access'
import { peecFromEnv, PeecError } from '@/lib/aeo-outbound/peec'
import { listProjects } from '@/lib/aeo-outbound/pull'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET() {
  const session = await auth()
  const access = await outboundAccess(session?.user)
  // Spec v1.1 §19.7 (A3): unreadable settings are a retry (503), not a refusal.
  if (!access.ok) return NextResponse.json({ error: access.reason }, { status: refusalStatus(access.reason) })
  try {
    return NextResponse.json(await listProjects(peecFromEnv({ deadline: Date.now() + 50_000 })), { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    const msg = e instanceof PeecError ? 'Peec is unavailable. Try again.' : 'Could not load projects.'
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
