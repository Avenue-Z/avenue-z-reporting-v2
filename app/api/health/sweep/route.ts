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
 *
 * Concurrency: probes run through a bounded rolling window (CONCURRENCY at a
 * time), not an unbounded Promise.all. Each probe self-fetches a full report
 * render (?health=1) that fans out several Neon queries; firing all units at
 * once spiked Function CPU Duration and tripped Neon errors. Bounding keeps
 * peak load flat and under the 60s function ceiling. Each probe is also
 * individually capped (PROBE_TIMEOUT_MS) so one hung render costs its own unit
 * rather than the whole sweep.
 */
import { NextResponse } from 'next/server'
import { getAllClients, getAllHealthState, upsertHealthState } from '@/lib/db/queries'
import { mintServiceCookie } from '@/lib/auth/service-cookie'
import { deriveStatus } from '@/lib/health/derive'
import { diffHealth, formatTransitions } from '@/lib/health/diff'
import { postHealthChanges } from '@/lib/health/slack'
import { mapWithConcurrency } from '@/lib/concurrency'
import type { ProbeResult, Surface } from '@/lib/health/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Max probe renders in flight at once. Balances peak Neon load against the 60s
// maxDuration ceiling (wall time ≈ ceil(units / CONCURRENCY) × render).
const CONCURRENCY = 8

/**
 * Ceiling on a single probe's render.
 *
 * Without one, a probe fetch waits indefinitely and a single hung unit consumes
 * the whole maxDuration above — taking every other unit's result down with it,
 * so a sweep that was meant to report one section down reports nothing at all.
 * That became easy to hit once every Salesforce query took a 60s ceiling
 * (SALESFORCE_TIMEOUT_MS in lib/salesforce/pipeline.ts): one cold, failing
 * Executive Overview render is the entire sweep budget on its own.
 *
 * 25s is well clear of a healthy render and well inside the 60s function
 * budget. The crons are ordered so this is not a close call: cache-warm runs at
 * :30 and the sweeps at :15 and :45 (vercel.json), both inside the 1-hour TTL
 * it writes, so a probe reads warm entries and answers in seconds. A probe that
 * needs 25s is not a cold cache, it is a section in trouble — which is a `down`
 * worth reporting, not a reason to lose the run.
 */
const PROBE_TIMEOUT_MS = 25_000

interface Unit {
  url: string
  surface: Surface
  clientSlug: string
  section: string
}

async function probe(u: Unit, cookieHeader: string): Promise<ProbeResult> {
  try {
    const res = await fetch(u.url, {
      headers: { Cookie: cookieHeader },
      redirect: 'manual',
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    })
    const html = await res.text()
    return deriveStatus({ surface: u.surface, clientSlug: u.clientSlug, section: u.section, httpStatus: res.status, html })
  } catch {
    // Includes the PROBE_TIMEOUT_MS abort. httpStatus: null is deriveStatus's
    // 'fetch failed' -> down path, which is the right verdict for a section
    // that could not answer inside the window.
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

  const observed = await mapWithConcurrency(units, CONCURRENCY, (u) => probe(u, cookieHeader))
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
