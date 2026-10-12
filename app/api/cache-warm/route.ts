/**
 * Cache warming endpoint.
 *
 * Iterates every (client × enabledReport) URL on both the portal and
 * dashboard surfaces, plus dashboard subsections that exercise distinct
 * cached fetchers (peec-ai/{pr-influence,content-impact,technical-audit}
 * use getAgentAnalytics, which the base /peec-ai page doesn't), and hits
 * each one. The page renders, the cached() helpers populate Next's data
 * cache, and the next real user gets a warm response.
 *
 * Auth: requires `Authorization: Bearer <CRON_SECRET>`. Vercel Cron Jobs
 * include this header automatically when CRON_SECRET is set in env.
 *
 * Self-fetch auth: a synthetic session cookie is minted from AUTH_SECRET
 * for an `cache-warm@avenuez.com` INTERNAL_ADMIN principal. The cookie is
 * scoped to this run (1h expiry).
 *
 * Concurrency: URLs are warmed through a bounded rolling window
 * (CONCURRENCY at a time), not an unbounded Promise.all. Each self-fetch
 * renders a full report that fans out several Neon queries, so firing every
 * URL at once produced a burst of concurrent DB requests that spiked Function
 * CPU Duration and tripped Neon errors — worst at :30, where this cron
 * overlapped the health sweep. Bounding keeps peak load flat.
 */
import { NextResponse } from 'next/server'
import { getAllClients } from '@/lib/db/queries'
import { warmContext, runWarm } from '@/lib/cache-warm/run'

export const dynamic = 'force-dynamic'
// Raised from 60s. The Executive Overview render waits out the Salesforce
// queries instead of aborting them at 15s (SALESFORCE_TIMEOUT_MS in
// lib/salesforce/pipeline.ts, which all four queries now take — it started as a
// wide-window-only allowance and is no longer that), and the by-owner query
// alone measured about 42s live. At 60s a single such URL could consume the
// whole budget and leave the remaining batches unwarmed, which defeats the
// point: this cron exists so the slow first render lands here rather than on a
// reader. 300 matches the ceiling already in use on
// app/api/discovery/sm-dimension-values/route.ts.
export const maxDuration = 300

// peec-ai subsections that call cached fetchers (getAgentAnalytics) the
// base /peec-ai page doesn't exercise. ga4 and inbound-funnel subsections
// share fetchers with their base, so warming the base is sufficient.
const DASHBOARD_SUBSECTIONS: Record<string, string[]> = {
  'peec-ai': ['pr-influence', 'content-impact', 'technical-audit'],
}

export async function GET(req: Request) {
  const ctx = await warmContext(req)
  if (ctx.error) return ctx.error
  const { baseUrl, cookieHeader } = ctx

  const clients = await getAllClients()

  const urls: string[] = []
  for (const client of clients) {
    for (const report of client.enabledReports) {
      const dr = 'last_30_days'
      // Portal surface (client-facing)
      urls.push(`${baseUrl}/portal/${client.slug}/reports/${report}?dateRange=${dr}`)
      // Dashboard surface, base case
      urls.push(`${baseUrl}/dashboard/${client.slug}/reports?section=${report}&dateRange=${dr}`)
      // Dashboard subsections, when they call distinct cached fetchers
      const subs = DASHBOARD_SUBSECTIONS[report] ?? []
      for (const sub of subs) {
        urls.push(`${baseUrl}/dashboard/${client.slug}/reports?section=${report}&subsection=${sub}&dateRange=${dr}`)
      }
    }
  }

  // The lock sweep used to be appended here, which made it what got cut when a run overran
  // (Paul, PR 256). It now has its own route and schedule, /api/lock-sweep at :00, so neither it
  // nor the client-facing URLs above are starved by the other. lib/cache-warm/run.ts explains why
  // putting it first instead would have moved the problem rather than fixed it.

  return NextResponse.json(await runWarm(urls, cookieHeader))
}
