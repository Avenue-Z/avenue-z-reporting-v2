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
import type { TaSource } from './types'

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
const BUDGET_MS = 270_000 // leaves 30 s of the 300 s maxDuration for the response
const STALE_DAYS = 35
const MAX_NEW_PER_BRAND = 12 // a first run for a brand with years of folders spreads over several days
const REASON_MAX = 200
const SF_MISSING = 'Issues Overview not in this crawl’s export'

const DAY_MS = 86_400_000
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10)

/** One line, bounded: reasons reach the log and the report, and may embed vendor text. */
function clean(reason: string): string {
  return reason.replace(/\s+/g, ' ').trim().slice(0, REASON_MAX)
}
const messageOf = (e: unknown) => clean(e instanceof Error ? e.message : 'Unknown error')

export async function runSweep(deps: SweepDeps, now: Date): Promise<SweepReport> {
  const deadline = Date.now() + (deps.budgetMs ?? BUDGET_MS)
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
      try {
        // A folder dated after tomorrow is a typo; as the newest it would hide every real crawl after it.
        const tomorrow = isoDay(now.getTime() + DAY_MS)
        const runs = (await deps.listSfRuns(client.sfDriveFolderId))
          .filter((r) => r.date <= tomorrow)
          .sort((a, b) => (a.date < b.date ? -1 : 1))
        const newest = runs[runs.length - 1]?.date
        if (!newest || newest < isoDay(now.getTime() - STALE_DAYS * DAY_MS)) report.staleCrawl.push(client.slug)
        const known = await deps.getSnapshots(client.id, { publishedOnly: false })
        const latestKnown = known.reduce<string | null>((m, s) => (m === null || s.snapshotDate > m ? s.snapshotDate : m), null)
        for (const run of runs.filter((r) => latestKnown === null || r.date > latestKnown).slice(0, MAX_NEW_PER_BRAND)) {
          if (outOfTime()) return
          if ((await deps.ensureSnapshot(client.id, run)).created) report.created++
        }
      } catch (e) {
        fail(client.slug, today, 'sf', messageOf(e))
      }
    }

    let drafts
    try {
      drafts = (await deps.getSnapshots(client.id, { publishedOnly: false })).filter((s) => s.status === 'draft')
    } catch (e) {
      fail(client.slug, today, 'sf', messageOf(e))
      return
    }
    for (const snap of drafts) {
      const date = snap.snapshotDate
      const record = async (source: TaSource, status: 'failed' | 'missing', reason: string) => {
        fail(client.slug, date, source, reason)
        try {
          await deps.failRun(client.id, snap.id, source, status, reason)
        } catch (e) {
          console.warn(`[tech-audit] ${client.slug} ${date} ${source} could not record failure: ${messageOf(e)}`)
        }
      }
      const done = (source: TaSource) => report.completed.push(`${client.slug} ${date} ${source}`)

      if (client.sfDriveFolderId && snap.sfRunFolderId && !outOfTime() && await deps.claimRun(snap.id, 'sf', undefined, { includeMissing: true })) {
        try {
          const file = await deps.fetchIssuesOverview(snap.sfRunFolderId)
          if (!file) {
            await record('sf', 'missing', SF_MISSING)
          } else {
            const parsed = deps.parseSfIssuesOverview(new TextDecoder().decode(file.bytes), date)
            if (!parsed.ok) {
              await record('sf', 'missing', clean(parsed.reason))
            } else {
              const { issueTypes, urls, issues } = parsed.value
              await deps.completeRun(client.id, snap.id, 'sf', file.bytes, {
                metrics: {
                  sfIssueTypesIssue: issueTypes.issue, sfIssueTypesWarning: issueTypes.warning, sfIssueTypesOpportunity: issueTypes.opportunity,
                  sfUrlsIssue: urls.issue, sfUrlsWarning: urls.warning, sfUrlsOpportunity: urls.opportunity,
                },
                issues,
                snapshot: { sfCrawlDate: date },
              })
              done('sf')
            }
          }
        } catch (e) {
          await record('sf', 'failed', messageOf(e))
        }
      }

      if (client.ahrefsProjectId && !outOfTime() && await deps.claimRun(snap.id, 'ahrefs', undefined, { includeMissing: true })) {
        try {
          const { raw, result } = await deps.fetchAhrefs(client.ahrefsProjectId, date)
          if (!result.ok) {
            await record('ahrefs', 'missing', clean(result.reason))
          } else {
            const { crawlDate, healthScore, issues } = result.value
            await deps.completeRun(client.id, snap.id, 'ahrefs', raw, {
              metrics: { ahrefsHealthScore: healthScore },
              issues,
              snapshot: { ahrefsCrawlDate: crawlDate, ahrefsHealthScore: healthScore },
            })
            done('ahrefs')
          }
        } catch (e) {
          await record('ahrefs', 'failed', messageOf(e))
        }
      }
    }
  }

  await mapWithConcurrency(clients, CONCURRENCY, async (client) => {
    try {
      await sweepBrand(client)
    } catch (e) {
      fail(client.slug, isoDay(now.getTime()), 'sf', messageOf(e))
    }
  })
  return report
}
