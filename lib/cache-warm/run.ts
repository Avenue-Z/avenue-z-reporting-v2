/**
 * The machinery two cron routes share: the bearer check, the synthetic session cookie, and the
 * bounded self-fetch runner. Extracted when the lock sweep moved to its own schedule.
 *
 * Why the sweep is not simply first in the cache-warm queue (Paul, PR 256): it was last, so it
 * was what got cut when a run overran, which is the bug. But putting it first only moves the
 * loss onto the client-facing warm URLs, and those are load-bearing for something else. The
 * health sweep is scheduled on the assumption that cache-warm has already left pages warm
 * (lib/health/sweep-probe.ts spells this out: "cache-warm runs at :30 and the sweeps at :15 and
 * :45 ... so a probe reads warm entries and answers in seconds"). Cutting warm URLs hourly to
 * protect a once-a-month sweep would make the health probe report healthy sections as down.
 * Separate schedules remove the trade-off instead of flipping who loses it.
 */
import { NextResponse } from 'next/server'
import { mintServiceCookie } from '@/lib/auth/service-cookie'
import { mapWithConcurrency } from '@/lib/concurrency'

export interface WarmResult {
  url: string
  status: number | null
  ms: number
  ok: boolean
  error?: string
}

/** Max self-fetch renders in flight at once. Balances peak Neon load against the maxDuration
 *  ceiling on the routes (wall time is roughly ceil(urls / CONCURRENCY) x render). */
export const CONCURRENCY = 8

export async function warmOne(url: string, cookie: string): Promise<WarmResult> {
  const start = Date.now()
  try {
    const res = await fetch(url, { headers: { Cookie: cookie }, redirect: 'manual' })
    // Drain the body so all suspended Server Component boundaries resolve and their cached()
    // calls finish populating the data cache.
    await res.text()
    return { url, status: res.status, ms: Date.now() - start, ok: res.status >= 200 && res.status < 400 }
  } catch (err) {
    return { url, status: null, ms: Date.now() - start, ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** Pure. The bearer check, split out so both the decision and its reason are testable without a
 *  request. `null` means the caller may proceed. */
export function cronAuthError(cronSecret: string | undefined, authSecret: string | undefined, authHeader: string | null):
  { body: { error: string } | 'Unauthorized'; status: number } | null {
  if (!cronSecret) return { body: { error: 'CRON_SECRET not set' }, status: 500 }
  if (authHeader !== `Bearer ${cronSecret}`) return { body: 'Unauthorized', status: 401 }
  if (!authSecret) return { body: { error: 'AUTH_SECRET not set' }, status: 500 }
  return null
}

/** The bearer check and the per-run session cookie. Returns a response to send back, or the
 *  context the route needs. */
export async function warmContext(req: Request): Promise<
  { error: NextResponse } | { error?: never; baseUrl: string; cookieHeader: string }
> {
  const cronSecret = process.env.CRON_SECRET
  const authSecret = process.env.AUTH_SECRET
  const denied = cronAuthError(cronSecret, authSecret, req.headers.get('authorization'))
  if (denied) {
    return {
      error: typeof denied.body === 'string'
        ? new NextResponse(denied.body, { status: denied.status })
        : NextResponse.json(denied.body, { status: denied.status }),
    }
  }
  // On Vercel, VERCEL_URL is set automatically.
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : (process.env.APP_URL ?? new URL(req.url).origin)
  const isSecure = baseUrl.startsWith('https://')
  const cookieName = isSecure ? '__Secure-authjs.session-token' : 'authjs.session-token'
  const token = await mintServiceCookie(authSecret!, cookieName, { email: 'cache-warm@avenuez.com', name: 'cache-warm' })
  return { baseUrl, cookieHeader: `${cookieName}=${token}` }
}

/** Warm a list of URLs through the bounded rolling window and summarise the run. */
export async function runWarm(urls: string[], cookieHeader: string) {
  const startedAt = Date.now()
  const results = await mapWithConcurrency(urls, CONCURRENCY, (u) => warmOne(u, cookieHeader))
  const ok = results.filter((r) => r.ok).length
  return { total: results.length, ok, failed: results.length - ok, durationMs: Date.now() - startedAt, results }
}
