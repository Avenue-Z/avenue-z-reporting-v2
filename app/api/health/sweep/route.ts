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
 * peak load flat.
 *
 * Budget: two caps doing two different jobs, both in lib/health/sweep-probe.ts.
 * PROBE_TIMEOUT_MS bounds ONE render so a hung unit costs only itself.
 * SWEEP_BUDGET_MS bounds the whole probe phase, which the per-probe cap alone
 * does not — see its docblock for why three slow probes would otherwise take
 * the entire run down with them. Past the deadline, remaining units are
 * SKIPPED, not probed: skipped is unknown rather than down, so they keep their
 * stored status and cannot fire a false 🔴 into Slack.
 */
import { NextResponse } from 'next/server'
import { getAllClients, getAllHealthState, upsertHealthState } from '@/lib/db/queries'
import { mintServiceCookie } from '@/lib/auth/service-cookie'
import { diffHealth, formatTransitions } from '@/lib/health/diff'
import { postHealthChanges } from '@/lib/health/slack'
import { mapWithConcurrency } from '@/lib/concurrency'
import { probe, SWEEP_BUDGET_MS, type Unit } from '@/lib/health/sweep-probe'
import type { ProbeResult } from '@/lib/health/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Max probe renders in flight at once. Balances peak Neon load against the 60s
// maxDuration ceiling (wall time ≈ ceil(units / CONCURRENCY) × render).
const CONCURRENCY = 8

export async function GET(req: Request) {
  // Opened at entry, not just before the probes, so the setup below (a Neon read
  // and a cookie mint) comes out of the budget rather than being added on top.
  const deadline = Date.now() + SWEEP_BUDGET_MS
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

  const probed = await mapWithConcurrency(units, CONCURRENCY, (u) => probe(u, cookieHeader, deadline))
  const observed = probed.filter((p): p is ProbeResult => p !== null)
  const skipped = probed.length - observed.length
  if (skipped > 0) {
    // Never silent: a sweep that quietly covered two thirds of the estate still
    // returns 200 and still posts transitions, which reads as a clean run.
    console.warn(`[health-sweep] budget spent after ${observed.length}/${probed.length} units; ${skipped} skipped`)
  }
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
    skipped,
    down: observed.filter((o) => o.status === 'down').length,
    transitions: transitions.length,
  })
}
