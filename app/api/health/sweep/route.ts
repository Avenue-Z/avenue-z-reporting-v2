/**
 * Health sweep. Crawls every (client × enabledReport) URL on both the portal
 * and dashboard surfaces in health mode (?health=1), parses each page's
 * health beacon + HTTP status into a per-unit status, diffs against the
 * health_state table, posts only the transitions to Slack, and upserts the
 * new statuses.
 *
 * Auth: requires `Authorization: Bearer <CRON_SECRET>` (Vercel Cron sends it).
 * Self-fetch auth: a synthetic INTERNAL_ADMIN session cookie (1h) — copied
 * from app/api/cache-warm/route.ts.
 */
import { NextResponse } from 'next/server'
import { getAllClients, getAllHealthState, upsertHealthState } from '@/lib/db/queries'
import { mintServiceCookie } from '@/lib/auth/service-cookie'
import { deriveStatus } from '@/lib/health/derive'
import { diffHealth, formatTransitions } from '@/lib/health/diff'
import { postHealthChanges } from '@/lib/health/slack'
import type { ProbeResult, Surface } from '@/lib/health/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

interface Unit {
  url: string
  surface: Surface
  clientSlug: string
  section: string
}

async function probe(u: Unit, cookieHeader: string): Promise<ProbeResult> {
  try {
    const res = await fetch(u.url, { headers: { Cookie: cookieHeader }, redirect: 'manual' })
    const html = await res.text()
    return deriveStatus({ surface: u.surface, clientSlug: u.clientSlug, section: u.section, httpStatus: res.status, html })
  } catch {
    return deriveStatus({ surface: u.surface, clientSlug: u.clientSlug, section: u.section, httpStatus: null, html: '' })
  }
}

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return NextResponse.json({ error: 'CRON_SECRET not set' }, { status: 500 })
  if (req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return new NextResponse('Unauthorized', { status: 401 })
  }
  const authSecret = process.env.AUTH_SECRET
  if (!authSecret) return NextResponse.json({ error: 'AUTH_SECRET not set' }, { status: 500 })

  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : (process.env.APP_URL ?? new URL(req.url).origin)
  const isSecure = baseUrl.startsWith('https://')
  const cookieName = isSecure ? '__Secure-authjs.session-token' : 'authjs.session-token'
  const token = await mintServiceCookie(authSecret, cookieName, { email: 'health-sweep@avenuez.com', name: 'health-sweep' })
  const cookieHeader = `${cookieName}=${token}`

  const clients = await getAllClients()
  const dr = 'last_30_days'
  const units: Unit[] = []
  for (const client of clients) {
    for (const report of client.enabledReports) {
      units.push({
        surface: 'portal', clientSlug: client.slug, section: report,
        url: `${baseUrl}/portal/${client.slug}/reports/${report}?dateRange=${dr}&health=1`,
      })
      units.push({
        surface: 'dashboard', clientSlug: client.slug, section: report,
        url: `${baseUrl}/dashboard/${client.slug}/reports?section=${report}&dateRange=${dr}&health=1`,
      })
    }
  }

  const observed = await Promise.all(units.map((u) => probe(u, cookieHeader)))
  const stored = await getAllHealthState()
  const { transitions, upserts } = diffHealth(stored, observed)

  const prev = new Map(stored.map((s) => [s.key, s.status]))
  await upsertHealthState(
    upserts.map((o) => ({
      key: o.key,
      status: o.status,
      detail: o.detail,
      changed: prev.has(o.key) && prev.get(o.key) !== o.status,
    })),
  )

  const message = formatTransitions(transitions)
  if (message) await postHealthChanges(message)

  return NextResponse.json({
    probed: observed.length,
    down: observed.filter((o) => o.status === 'down').length,
    transitions: transitions.length,
  })
}
