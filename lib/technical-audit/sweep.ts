// lib/technical-audit/sweep.ts
// The daily sweep: finds each brand's new Screaming Frog run folders, creates a draft snapshot per folder, and fills
// the Screaming Frog and Ahrefs data of every draft. Pure orchestration over injected deps (the route wires the real
// ones) so it is tested without Drive, Ahrefs or a database.
//
// One brand's failure never rejects the batch, and one source's failure never stops its sibling: each is recorded on
// its run row (so a later sweep retries) and in the report. Only draft snapshots are worked, so a published page
// never changes under its readers.

import { mapWithConcurrency } from '@/lib/concurrency'
import type * as Store from './store'
import type * as Sf from './sf'
import type * as Ahrefs from './ahrefs'
import type { AhrefsResult, SfResult, TaSource } from './types'

export interface SweepClient { id: string; slug: string; sfDriveFolderId: string | null; ahrefsProjectId: string | null }

export interface SweepDeps {
  listClients: () => Promise<SweepClient[]>
  listSfRuns: typeof Sf.listSfRuns
  fetchIssuesOverview: typeof Sf.fetchIssuesOverview
  parseSfIssuesOverview: typeof Sf.parseSfIssuesOverview
  fetchAhrefs: typeof Ahrefs.fetchAhrefs
  ensureSnapshot: typeof Store.ensureSnapshot
  getSnapshots: typeof Store.getSnapshots
  claimRun: typeof Store.claimRun
  completeRun: typeof Store.completeRun
  failRun: typeof Store.failRun
  /** Wall-clock budget for the whole sweep; the route's maxDuration is 300 s. Tests lower it. */
  budgetMs?: number
}

export interface SweepReport {
  brands: number
  created: number
  completed: string[]
  failed: { slug: string; date: string; source: TaSource; reason: string }[]
  staleCrawl: string[]
}

const CONCURRENCY = 4
export const SWEEP_BUDGET_MS = 240_000 // leaves 60 s of the 300 s maxDuration for the response
const STALE_DAYS = 35
const MAX_NEW_PER_BRAND = 12 // a first run for a brand with years of folders spreads over several days
const REASON_MAX = 200
const RECHECK_MISSING_DAYS = 45 // older drafts retry pending/failed runs only, so a long-dead source stops costing a call a day
const DB_ERROR = 'database error'
const SF_MISSING = 'Issues Overview not in this crawl’s export'

const DAY_MS = 86_400_000
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10)

/** One line, bounded: reasons reach the log and the report, and may embed vendor text. */
function clean(reason: string): string {
  return reason.replace(/\s+/g, ' ').trim().slice(0, REASON_MAX)
}
/** Only for errors thrown by a source call (sf.ts, ahrefs.ts), whose messages are fixed strings such as `Ahrefs 429`.
 *  A store call's error is never passed through: Drizzle embeds the SQL and its params in the message. */
const messageOf = (e: unknown) => clean(e instanceof Error ? e.message : 'Unknown error')

export async function runSweep(deps: SweepDeps, now: Date): Promise<SweepReport> {
  const deadline = Date.now() + (deps.budgetMs ?? SWEEP_BUDGET_MS)
  const clients = await deps.listClients()
  const report: SweepReport = { brands: clients.length, created: 0, completed: [], failed: [], staleCrawl: [] }
  let budgetLogged = false
  const outOfTime = () => {
    if (Date.now() < deadline) return false
    if (!budgetLogged) { budgetLogged = true; console.warn('[tech-audit] budget spent; remaining work waits for the next sweep') }
    return true
  }

  const fail = (slug: string, date: string, source: TaSource, reason: string) => {
    report.failed.push({ slug, date, source, reason })
    console.warn(`[tech-audit] ${slug} ${date} ${source} ${reason}`)
  }

  async function sweepBrand(client: SweepClient): Promise<void> {
    const today = isoDay(now.getTime())
    if (client.sfDriveFolderId) {
      let runs: { date: string; folderId: string }[] | null = null
      try {
        // A folder dated after tomorrow is a typo; as the newest it would hide every real crawl after it.
        const tomorrow = isoDay(now.getTime() + DAY_MS)
        runs = (await deps.listSfRuns(client.sfDriveFolderId))
          .filter((r) => r.date <= tomorrow)
          .sort((a, b) => (a.date < b.date ? -1 : 1))
      } catch (e) {
        fail(client.slug, today, 'sf', messageOf(e))
      }
      if (runs) try {
        const newest = runs[runs.length - 1]?.date
        if (!newest || newest < isoDay(now.getTime() - STALE_DAYS * DAY_MS)) {
          report.staleCrawl.push(client.slug)
          console.warn(`[tech-audit] ${client.slug} ${today} sf no crawl since ${newest ?? 'never'}`)
        }
        const known = await deps.getSnapshots(client.id, { publishedOnly: false })
        const latestKnown = known.reduce<string | null>((m, s) => (m === null || s.snapshotDate > m ? s.snapshotDate : m), null)
        for (const run of runs.filter((r) => latestKnown === null || r.date > latestKnown).slice(0, MAX_NEW_PER_BRAND)) {
          if (outOfTime()) return
          if ((await deps.ensureSnapshot(client.id, run)).created) report.created++
        }
      } catch {
        fail(client.slug, today, 'sf', DB_ERROR)
      }
    }

    let drafts
    try {
      drafts = (await deps.getSnapshots(client.id, { publishedOnly: false })).filter((s) => s.status === 'draft')
    } catch {
      fail(client.slug, today, 'sf', DB_ERROR)
      return
    }
    const recheckFrom = isoDay(now.getTime() - RECHECK_MISSING_DAYS * DAY_MS)
    for (const snap of drafts) {
      const date = snap.snapshotDate
      const done = (source: TaSource) => report.completed.push(`${client.slug} ${date} ${source}`)
      const includeMissing = date >= recheckFrom
      const record = async (source: TaSource, status: 'failed' | 'missing', reason: string) => {
        fail(client.slug, date, source, reason)
        try {
          await deps.failRun(client.id, snap.id, source, status, reason)
        } catch {
          console.warn(`[tech-audit] ${client.slug} ${date} ${source} could not record failure: ${DB_ERROR}`)
        }
      }
      // A store call's failure is reported as a fixed reason, never its message.
      const save = async (source: TaSource, write: () => Promise<void>) => {
        try {
          await write()
          done(source)
        } catch {
          await record(source, 'failed', DB_ERROR)
        }
      }

      if (client.sfDriveFolderId && snap.sfRunFolderId && !outOfTime() && await deps.claimRun(snap.id, 'sf', undefined, { includeMissing })) {
        let sf: { bytes: Uint8Array; value: SfResult } | null = null
        try {
          const file = await deps.fetchIssuesOverview(snap.sfRunFolderId)
          if (!file) {
            await record('sf', 'missing', SF_MISSING)
          } else {
            const parsed = deps.parseSfIssuesOverview(new TextDecoder().decode(file.bytes), date)
            if (parsed.ok) sf = { bytes: file.bytes, value: parsed.value }
            else await record('sf', 'missing', clean(parsed.reason))
          }
        } catch (e) {
          await record('sf', 'failed', messageOf(e))
        }
        if (sf) {
          const { issueTypes, urls, issues } = sf.value
          const bytes = sf.bytes
          await save('sf', () => deps.completeRun(client.id, snap.id, 'sf', bytes, {
            metrics: {
              sfIssueTypesIssue: issueTypes.issue, sfIssueTypesWarning: issueTypes.warning, sfIssueTypesOpportunity: issueTypes.opportunity,
              sfUrlsIssue: urls.issue, sfUrlsWarning: urls.warning, sfUrlsOpportunity: urls.opportunity,
            },
            issues,
            snapshot: { sfCrawlDate: date },
          }, { requireDraft: true }))
        }
      }

      if (client.ahrefsProjectId && !outOfTime() && await deps.claimRun(snap.id, 'ahrefs', undefined, { includeMissing })) {
        let ah: { raw: Uint8Array; value: AhrefsResult } | null = null
        try {
          const { raw, result } = await deps.fetchAhrefs(client.ahrefsProjectId, date)
          if (result.ok) ah = { raw, value: result.value }
          else await record('ahrefs', 'missing', clean(result.reason))
        } catch (e) {
          await record('ahrefs', 'failed', messageOf(e))
        }
        if (ah) {
          const { crawlDate, healthScore, issues } = ah.value
          const raw = ah.raw
          await save('ahrefs', () => deps.completeRun(client.id, snap.id, 'ahrefs', raw, {
            metrics: { ahrefsHealthScore: healthScore },
            issues,
            snapshot: { ahrefsCrawlDate: crawlDate, ahrefsHealthScore: healthScore },
          }, { requireDraft: true }))
        }
      }
    }
  }

  await mapWithConcurrency(clients, CONCURRENCY, async (client) => {
    try {
      await sweepBrand(client)
    } catch {
      // Anything unplanned (a claimRun or store throw) is reported without its message.
      fail(client.slug, isoDay(now.getTime()), 'sf', DB_ERROR)
    }
  })
  return report
}
