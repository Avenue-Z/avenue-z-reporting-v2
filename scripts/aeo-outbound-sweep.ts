// The any-client check for the AEO Outbound tool: every Peec pitch project through the steps generation runs before
// Glean (pull, numbers, sentences, the grounding check, chart, page), checked by lib/aeo-outbound/sweep-checks.ts.
// Read only: Peec reads only, no Glean, no database, no writes. Run it before every promotion to staging.
//
//   npm run aeo:sweep                                   full history, every pitch project
//   npm run aeo:sweep -- --start 2026-09-22 --end 2026-10-21
//   npm run aeo:sweep -- --only "PocketGuard|Crocs" --verbose
//
// Needs PEEC_AI_CUSTOMER_TOKEN (read from .env.local). Uses the code's default settings, not a saved Settings row.
// Exit 0: every project with data passed. Exit 1: at least one failed. A project with no Peec data is listed, not failed.
import { PeecError, peecFromEnv } from '../lib/aeo-outbound/peec'
import { listProjects, pullSnapshot, type PeecProject } from '../lib/aeo-outbound/pull'
import { buildSnapshotData } from '../lib/aeo-outbound/metrics'
import { dataSentences } from '../lib/aeo-outbound/sentences'
import { checkReport } from '../lib/aeo-outbound/sweep-checks'
import { DECISIONS } from '../lib/aeo-outbound/config'
import { SETTINGS_DEFAULTS } from '../lib/aeo-outbound/settings'

const PER_PROJECT_MS = 240_000
const CONCURRENCY = 5

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}
const start = arg('start')
const end = arg('end')
if (!!start !== !!end) throw new Error('Pass both --start and --end, or neither for full history.')
const range = start && end ? { start, end } : null
const only = arg('only')
const verbose = process.argv.includes('--verbose')

type Result = { name: string; status: 'ok' | 'fail' | 'no data'; problems: string[]; lines: string[] }

async function one(p: PeecProject): Promise<Result> {
  const client = peecFromEnv({ deadline: Date.now() + PER_PROJECT_MS })
  try {
    const pull = await pullSnapshot(client, p.id, Date.now(), undefined, range)
    const s = SETTINGS_DEFAULTS
    const d = buildSnapshotData(pull, new Date().toISOString(),
      { rankAmong: s.rankAmong, competitorSiteGaps: DECISIONS.competitorSiteGaps, sourceMixWeight: DECISIONS.sourceMixWeight },
      { peecOpportunityRows: s.peecOpportunityRows, methodologyStatesPromptsAndModels: s.methodologyStatesPromptsAndModels, fixedNextStep: s.fixedNextStep })
    const problems = checkReport(d)
    const sent = dataSentences(d)
    const lines = [
      `${d.brands.length} brands with data, ${d.competitorsTracked} competitors tracked, rank ${d.own.rank}, visibility ${d.own.visibilityPct}%`,
      ...[...sent.competitive_bullets, ...sent.sources_bullets].map((b) => `${b.lead} ${b.text}`),
      ...sent.opportunities.map((o) => `[${o.workstream}] ${o.signal}`),
    ]
    return { name: p.name, status: problems.length ? 'fail' : 'ok', problems, lines }
  } catch (e) {
    if (e instanceof PeecError && e.code === 'no_data') return { name: p.name, status: 'no data', problems: [e.message], lines: [] }
    return { name: p.name, status: 'fail', problems: [`threw: ${String((e as Error)?.message ?? e).slice(0, 200)}`], lines: [] }
  }
}

async function main() {
  const projects = (await listProjects(peecFromEnv({ deadline: Date.now() + 60_000 }))).filter((p) => !only || new RegExp(only, 'i').test(p.name))
  console.log(`AEO Outbound sweep: ${projects.length} projects, ${range ? `${range.start} to ${range.end}` : 'full history'}`)
  const queue = [...projects]
  const results: Result[] = []
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    for (let p = queue.shift(); p; p = queue.shift()) results.push(await one(p))
  }))
  results.sort((a, b) => a.name.localeCompare(b.name))
  for (const r of results) {
    if (r.status === 'ok' && !verbose) continue
    console.log(`${r.status.toUpperCase().padEnd(7)} ${r.name}`)
    for (const p of r.status === 'no data' ? [] : r.problems) console.log(`        ! ${p}`)
    if (verbose) for (const l of r.lines) console.log(`        ${l}`)
  }
  const count = (s: Result['status']) => results.filter((r) => r.status === s).length
  console.log(`\nok ${count('ok')}, failed ${count('fail')}, no data ${count('no data')} (of ${results.length})`)
  process.exit(count('fail') ? 1 : 0)
}

main().catch((e) => {
  console.error(String((e as Error)?.message ?? e))
  process.exit(1)
})
