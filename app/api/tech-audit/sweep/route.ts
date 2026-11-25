/**
 * Technical Audit daily sweep. Finds each brand's new Screaming Frog crawl folder, creates a draft snapshot, and
 * fills its Screaming Frog and Ahrefs data (lib/technical-audit/sweep.ts).
 *
 * Auth: requires `Authorization: Bearer <CRON_SECRET>` (Vercel Cron sends it), as app/api/health/sweep/route.ts.
 * Budget: 270 s inside the sweep, under the 300 s maxDuration. Work not reached waits for tomorrow's run.
 */
import { NextResponse } from 'next/server'
import { isNotNull, or } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { clients } from '@/lib/db/schema'
import { claimRun, completeRun, ensureSnapshot, failRun, getSnapshots } from '@/lib/technical-audit/store'
import { fetchIssuesOverview, listSfRuns, parseSfIssuesOverview } from '@/lib/technical-audit/sf'
import { fetchAhrefs } from '@/lib/technical-audit/ahrefs'
import { runSweep } from '@/lib/technical-audit/sweep'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return NextResponse.json({ error: 'CRON_SECRET not set' }, { status: 500 })
  if (req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const report = await runSweep({
    listClients: () =>
      db.select({ id: clients.id, slug: clients.slug, sfDriveFolderId: clients.sfDriveFolderId, ahrefsProjectId: clients.ahrefsProjectId })
        .from(clients)
        .where(or(isNotNull(clients.sfDriveFolderId), isNotNull(clients.ahrefsProjectId))),
    listSfRuns, fetchIssuesOverview, parseSfIssuesOverview, fetchAhrefs,
    ensureSnapshot, getSnapshots, claimRun, completeRun, failRun,
  }, new Date())
  return NextResponse.json(report)
}
