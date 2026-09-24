/**
 * Lock sweep endpoint (D27).
 *
 * Renders every Organic Social tab of the two most recently locked months for each client on
 * locked months, so a month's numbers are all captured in one run on its lock day. Empty for
 * every other client, so on most runs this does nothing at all.
 *
 * It used to ride at the end of /api/cache-warm's queue, which meant it was what got cut when a
 * run overran (Paul, PR 256). Its own schedule fixes that without taking the budget from the
 * client-facing warm URLs, which the health sweep depends on being warm
 * (lib/health/sweep-probe.ts). See lib/cache-warm/run.ts for the reasoning in full.
 *
 * Scheduled at :00 in vercel.json, the only slot not already taken: cache-warm holds :30 and the
 * health sweeps hold :15 and :45, and they are spaced on purpose to keep peak Neon load flat.
 *
 * Auth: `Authorization: Bearer <CRON_SECRET>`, as cache-warm. Vercel Cron sends it automatically.
 */
import { NextResponse } from 'next/server'
import { getAllClients } from '@/lib/db/queries'
import { lockSweepUrls } from '@/lib/organic-social/lock-sweep'
import { clockFor } from '@/lib/organic-social/reporting-months'
import { warmContext, runWarm } from '@/lib/cache-warm/run'

export const dynamic = 'force-dynamic'
// Matches cache-warm. A locked month's tabs are the same full report renders.
export const maxDuration = 300

export async function GET(req: Request) {
  const ctx = await warmContext(req)
  if (ctx.error) return ctx.error

  const clients = await getAllClients()
  const today = clockFor(new Date()).today
  const urls = clients.flatMap((client) => lockSweepUrls(ctx.baseUrl, client, today))

  return NextResponse.json(await runWarm(urls, ctx.cookieHeader))
}
