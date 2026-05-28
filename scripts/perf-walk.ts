/**
 * Sequential walker that drives the local Next.js server through every
 * (client, enabledReport) URL so a single `next start` run captures
 * timing data for the whole platform.
 *
 * Usage:
 *   1. In one terminal: PERF_LOG=1 npm run start 2>&1 | tee perf.log
 *   2. In a browser, sign in. Open DevTools > Application > Cookies and
 *      copy the entire Cookie header value for http://localhost:3000.
 *   3. In another terminal:
 *      PERF_SESSION_COOKIE='<paste here>' npx tsx --env-file=.env.local scripts/perf-walk.ts
 */
import { getAllClients } from '../lib/db/queries'

const BASE = process.env.PERF_BASE_URL ?? 'http://localhost:3000'
const COOKIE = process.env.PERF_SESSION_COOKIE
const DATE_RANGE = process.env.PERF_DATE_RANGE ?? 'last_30_days'

async function main() {
  if (!COOKIE) {
    console.error('Missing PERF_SESSION_COOKIE env var.')
    console.error('Sign in at http://localhost:3000, copy the Cookie header from DevTools, and re-run.')
    process.exit(1)
  }

  const clients = await getAllClients()
  console.log(`Walking ${clients.length} clients...`)

  let total = 0
  let ok = 0
  let failed = 0
  const startedAt = Date.now()

  for (const client of clients) {
    for (const report of client.enabledReports) {
      total++
      const url = `${BASE}/portal/${client.slug}/reports/${report}?dateRange=${encodeURIComponent(DATE_RANGE)}`
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
          console.log(`  ✓ ${client.slug}/${report}  ${status}  ${ms}ms`)
          // Drain the body so the server completes the render and emits all PERF lines.
          await res.text()
        } else {
          failed++
          console.log(`  ✗ ${client.slug}/${report}  ${status}  ${ms}ms`)
        }
      } catch (err) {
        failed++
        const message = err instanceof Error ? err.message : String(err)
        console.log(`  ✗ ${client.slug}/${report}  ERROR  ${message}`)
      }
    }
  }

  const totalSec = ((Date.now() - startedAt) / 1000).toFixed(1)
  console.log(`\nWalk complete: ${ok}/${total} ok, ${failed} failed, ${totalSec}s elapsed.`)
}

main().catch((err) => { console.error(err); process.exit(1) })
