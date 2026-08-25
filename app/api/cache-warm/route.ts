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
import { mintServiceCookie } from '@/lib/auth/service-cookie'
import { mapWithConcurrency } from '@/lib/concurrency'

export const dynamic = 'force-dynamic'
// Raised from 60s. The Executive Overview render now waits out the Salesforce
// open-window queries instead of aborting them at 15s (WIDE_TIMEOUT_MS in
// lib/salesforce/pipeline.ts), and the by-owner query alone measures about 42s
// live. At 60s a single such URL could consume the whole budget and leave the
// remaining batches unwarmed, which defeats the point: this cron exists so the
// slow first render lands here rather than on a reader. 300 matches the ceiling
// already in use on app/api/discovery/sm-dimension-values/route.ts.
export const maxDuration = 300

// Max self-fetch renders in flight at once. Balances peak Neon load against
// the maxDuration ceiling above (wall time ≈ ceil(urls / CONCURRENCY) × render).
const CONCURRENCY = 8

// peec-ai subsections that call cached fetchers (getAgentAnalytics) the
// base /peec-ai page doesn't exercise. ga4 and inbound-funnel subsections
// share fetchers with their base, so warming the base is sufficient.
const DASHBOARD_SUBSECTIONS: Record<string, string[]> = {
  'peec-ai': ['pr-influence', 'content-impact', 'technical-audit'],
}

interface WarmResult {
  url:    string
  status: number | null
  ms:     number
  ok:     boolean
  error?: string
}

async function warmOne(url: string, cookie: string): Promise<WarmResult> {
  const start = Date.now()
  try {
    const res = await fetch(url, {
      headers:  { Cookie: cookie },
      redirect: 'manual',
    })
    // Drain the body so all suspended Server Component boundaries resolve
    // and their cached() calls finish populating the data cache.
    await res.text()
    const ms = Date.now() - start
    const ok = res.status >= 200 && res.status < 400
    return { url, status: res.status, ms, ok }
  } catch (err) {
    return {
      url,
      status: null,
      ms:     Date.now() - start,
      ok:     false,
      error:  err instanceof Error ? err.message : String(err),
    }
  }
}

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET not set' }, { status: 500 })
  }
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${cronSecret}`) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const authSecret = process.env.AUTH_SECRET
  if (!authSecret) {
    return NextResponse.json({ error: 'AUTH_SECRET not set' }, { status: 500 })
  }

  // Self-fetch base URL. On Vercel, VERCEL_URL is set automatically.
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : (process.env.APP_URL ?? new URL(req.url).origin)

  const isSecure = baseUrl.startsWith('https://')
  const cookieName = isSecure ? '__Secure-authjs.session-token' : 'authjs.session-token'
  const token = await mintServiceCookie(authSecret, cookieName, { email: 'cache-warm@avenuez.com', name: 'cache-warm' })
  const cookieHeader = `${cookieName}=${token}`

  const clients = await getAllClients()
  const startedAt = Date.now()

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

  const results = await mapWithConcurrency(urls, CONCURRENCY, (u) => warmOne(u, cookieHeader))
  const ok = results.filter((r) => r.ok).length
  const failed = results.length - ok

  return NextResponse.json({
    total:      results.length,
    ok,
    failed,
    durationMs: Date.now() - startedAt,
    results,
  })
}
