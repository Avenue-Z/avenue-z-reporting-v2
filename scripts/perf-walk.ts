/**
 * Sequential walker that drives the local Next.js server through every
 * (client, enabledReport) URL so a single `next start` run captures
 * timing data for the whole platform.
 *
 * Usage (basic):
 *   PERF_SESSION_COOKIE='...' tsx --env-file=.env.local scripts/perf-walk.ts
 *
 * Usage (cold/warm comparison):
 *   In one terminal: PERF_LOG=1 npm run start 2>&1 | tee perf.log
 *   Sign in via browser, copy session cookie from DevTools.
 *   PERF_SESSION_COOKIE='...' tsx --env-file=.env.local scripts/perf-walk.ts --pass cold
 *   PERF_SESSION_COOKIE='...' tsx --env-file=.env.local scripts/perf-walk.ts --pass warm
 *   Then: tsx scripts/perf-compare.ts perf.log cold warm
 *
 * The --pass flag (optional) makes the walker hit /api/perf/boundary?label=<pass>
 * before walking URLs, so perf-compare.ts can split cold/warm passes
 * deterministically.
 *
 * The --surface flag (optional, default `portal`) selects which route(s) to walk:
 *   --surface portal     /portal/<slug>/reports/<report>?dateRange=...
 *   --surface dashboard  /dashboard/<slug>/reports?section=<report>&dateRange=...
 *   --surface both       both, in that order
 */
import { getAllClients } from '../lib/db/queries'

type Surface = 'portal' | 'dashboard'

const BASE = process.env.PERF_BASE_URL ?? 'http://localhost:3000'
const COOKIE = process.env.PERF_SESSION_COOKIE
const DATE_RANGE = process.env.PERF_DATE_RANGE ?? 'last_30_days'

// Subsections walked on the dashboard surface. Portal doesn't render
// subsections, so these are dashboard-only. Currently scoped to peec-ai
// because content-impact + technical-audit are the only subsections that
// call a cached fetcher (getAgentAnalytics) the base case doesn't.
const SUBSECTIONS: Record<string, string[]> = {
  'peec-ai': ['pr-influence', 'content-impact', 'technical-audit'],
}

function parsePassArg(): string | null {
  const idx = process.argv.indexOf('--pass')
  if (idx === -1) return null
  const label = process.argv[idx + 1]
  if (!label || label.startsWith('--')) {
    console.error('--pass requires a label argument (e.g. --pass cold)')
    process.exit(1)
  }
  return label
}

function parseSurfaceArg(): Surface[] {
  const idx = process.argv.indexOf('--surface')
  if (idx === -1) return ['portal']
  const value = process.argv[idx + 1]
  if (value === 'portal') return ['portal']
  if (value === 'dashboard') return ['dashboard']
  if (value === 'both') return ['portal', 'dashboard']
  console.error('--surface must be one of: portal, dashboard, both')
  process.exit(1)
}

function buildUrl(surface: Surface, slug: string, report: string, subsection?: string): string {
  const dr = encodeURIComponent(DATE_RANGE)
  if (surface === 'portal') {
    // Portal doesn't route subsections; caller shouldn't pass one.
    return `${BASE}/portal/${slug}/reports/${report}?dateRange=${dr}`
  }
  const sub = subsection ? `&subsection=${encodeURIComponent(subsection)}` : ''
  return `${BASE}/dashboard/${slug}/reports?section=${encodeURIComponent(report)}${sub}&dateRange=${dr}`
}

async function emitBoundary(label: string): Promise<void> {
  const url = `${BASE}/api/perf/boundary?label=${encodeURIComponent(label)}`
  const res = await fetch(url, { headers: { Cookie: COOKIE! } })
  if (res.status === 404) {
    console.error(`Boundary route returned 404 — make sure the server was started with PERF_LOG=1`)
    process.exit(1)
  }
  if (!res.ok) {
    console.error(`Boundary marker emit failed: HTTP ${res.status}`)
    process.exit(1)
  }
  await res.text()
}

async function main() {
  if (!COOKIE) {
    console.error('Missing PERF_SESSION_COOKIE env var.')
    console.error('Sign in at http://localhost:3000, copy the Cookie header from DevTools, and re-run.')
    process.exit(1)
  }

  const pass = parsePassArg()
  const surfaces = parseSurfaceArg()
  if (pass) {
    console.log(`Emitting boundary marker for pass="${pass}"...`)
    await emitBoundary(pass)
  }

  const clients = await getAllClients()
  console.log(`Walking ${clients.length} clients × [${surfaces.join(', ')}]${pass ? ` (pass=${pass})` : ''}...`)

  let total = 0
  let ok = 0
  let failed = 0
  const startedAt = Date.now()

  for (const surface of surfaces) {
    for (const client of clients) {
      for (const report of client.enabledReports) {
        // Each report is at least one URL (the base case). On dashboard,
        // any registered subsections add additional URLs.
        const variants: Array<{ subsection?: string; label: string }> = [{ label: report }]
        if (surface === 'dashboard' && SUBSECTIONS[report]) {
          for (const sub of SUBSECTIONS[report]) {
            variants.push({ subsection: sub, label: `${report}/${sub}` })
          }
        }

        for (const variant of variants) {
          total++
          const url = buildUrl(surface, client.slug, report, variant.subsection)
          const reqStart = Date.now()
          try {
            const res = await fetch(url, {
              headers: { Cookie: COOKIE },
              redirect: 'manual',
            })
            const ms = Date.now() - reqStart
            const status = res.status
            if (status >= 200 && status < 400) {
              ok++
              console.log(`  ✓ ${surface}/${client.slug}/${variant.label}  ${status}  ${ms}ms`)
              await res.text()
            } else {
              failed++
              console.log(`  ✗ ${surface}/${client.slug}/${variant.label}  ${status}  ${ms}ms`)
            }
          } catch (err) {
            failed++
            const message = err instanceof Error ? err.message : String(err)
            console.log(`  ✗ ${surface}/${client.slug}/${variant.label}  ERROR  ${message}`)
          }
        }
      }
    }
  }

  const totalSec = ((Date.now() - startedAt) / 1000).toFixed(1)
  console.log(`\nWalk complete: ${ok}/${total} ok, ${failed} failed, ${totalSec}s elapsed.`)
}

main().catch((err) => { console.error(err); process.exit(1) })
