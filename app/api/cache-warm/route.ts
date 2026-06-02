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
 * Concurrency: all URLs fire in parallel via Promise.all — total wall
 * time is the slowest single page render (typically ≤10s cold), well
 * under the Vercel Pro 60s function ceiling.
 */
import { NextResponse } from 'next/server'
import { encode } from '@auth/core/jwt'
import { getAllClients } from '@/lib/db/queries'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

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

async function mintServiceCookie(secret: string, salt: string): Promise<string> {
  const maxAge = 60 * 60
  const now = Math.floor(Date.now() / 1000)
  return encode({
    secret,
    salt,
    maxAge,
    token: {
      sub:        'cache-warm@avenuez.com',
      email:      'cache-warm@avenuez.com',
      name:       'cache-warm',
      role:       'INTERNAL_ADMIN',
      clientSlug: 'avenue-z',
      iat:        now,
      exp:        now + maxAge,
      jti:        crypto.randomUUID(),
    },
  })
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
  const token = await mintServiceCookie(authSecret, cookieName)
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

  const results = await Promise.all(urls.map((u) => warmOne(u, cookieHeader)))
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
