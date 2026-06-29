import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { canEditDashboard } from '@/lib/dashboard/permissions'
import { getClientBySlug, upsertSmDimensionValues, listStaleSmDimensionCacheRows } from '@/lib/db/queries'
import { resolveSmApiKey } from '@/lib/dashboard/adapters/supermetrics'
import { smDimensionValues } from '@/lib/supermetrics/discovery'
import { parseDateRange } from '@/lib/ga4/client'
import { isValidCronAuth, SM_DIM_CACHE_TTL_MS } from '@/lib/dashboard/discovery-refresh'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

async function refreshOne(slug: string, dsId: string, account: string, column: string): Promise<void> {
  const apiKey = resolveSmApiKey((await getClientBySlug(slug))?.smApiKeyEnvVar, process.env)
  if (!apiKey) throw new Error('disconnected')
  const { startDate, endDate } = parseDateRange('last_30_days')
  const values = await smDimensionValues(apiKey, dsId, account, column, { startDate, endDate })
  await upsertSmDimensionValues(slug, dsId, account, column, values)
}

/** Button mode: refresh one dimension for a logged-in editor. */
export async function POST(req: Request): Promise<Response> {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 })
  const body = (await req.json()) as { slug?: unknown; dsId?: unknown; account?: unknown; column?: unknown }
  const { slug, dsId, account, column } = body
  if (typeof slug !== 'string' || typeof dsId !== 'string' || typeof account !== 'string' || typeof column !== 'string') {
    return NextResponse.json({ ok: false, error: 'bad request' }, { status: 400 })
  }
  if (!canEditDashboard(session.user.role, session.user.clientSlug, slug)) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  }
  try {
    await refreshOne(slug, dsId, account, column)
    const { getCachedSmDimensionValues } = await import('@/lib/db/queries')
    const row = await getCachedSmDimensionValues(slug, dsId, account, column)
    return NextResponse.json({ ok: true, values: row?.values ?? [] })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'refresh failed' }, { status: 200 })
  }
}

/** Cron mode: re-warm all rows older than the TTL, in parallel. */
export async function GET(req: Request): Promise<Response> {
  if (!isValidCronAuth(req.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }
  const stale = await listStaleSmDimensionCacheRows(new Date(Date.now() - SM_DIM_CACHE_TTL_MS))
  const results = await Promise.allSettled(stale.map((r) => refreshOne(r.clientSlug, r.dsId, r.account, r.column)))
  const refreshed = results.filter((r) => r.status === 'fulfilled').length
  return NextResponse.json({ ok: true, refreshed, failed: results.length - refreshed })
}
