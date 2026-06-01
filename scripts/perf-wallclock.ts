/**
 * Wall-clock walker — measures full body drain time per URL across N passes.
 *
 * Unlike perf-walk.ts (which captures server-side PERF lines), this measures
 * what the user actually waits for: fetch start → entire streamed body
 * received. Each pass back-to-back; pass 1 is cold (cache empty), pass 2+
 * are warm (cache populated from pass 1).
 *
 * Usage:
 *   PERF_SESSION_COOKIE='authjs.session-token=...' \
 *     tsx --env-file=.env.local scripts/perf-wallclock.ts [--passes N] [--surface portal|dashboard|both]
 *
 * For a clean cold pass, restart the server (and rm -rf .next/cache for a
 * truly empty data cache) before running.
 */
import { getAllClients } from '../lib/db/queries'

type Surface = 'portal' | 'dashboard'

const BASE = process.env.PERF_BASE_URL ?? 'http://localhost:3000'
const COOKIE = process.env.PERF_SESSION_COOKIE
const DATE_RANGE = process.env.PERF_DATE_RANGE ?? 'last_30_days'

const SUBSECTIONS: Record<string, string[]> = {
  'peec-ai': ['pr-influence', 'content-impact', 'technical-audit'],
}

function parseArg(name: string, fallback: string): string {
  const idx = process.argv.indexOf(name)
  if (idx === -1) return fallback
  const value = process.argv[idx + 1]
  if (!value || value.startsWith('--')) {
    console.error(`${name} requires an argument`)
    process.exit(1)
  }
  return value
}

function parseSurface(): Surface[] {
  const v = parseArg('--surface', 'both')
  if (v === 'portal') return ['portal']
  if (v === 'dashboard') return ['dashboard']
  if (v === 'both') return ['portal', 'dashboard']
  console.error('--surface must be one of: portal, dashboard, both')
  process.exit(1)
}

function buildUrl(surface: Surface, slug: string, report: string, subsection?: string): string {
  const dr = encodeURIComponent(DATE_RANGE)
  if (surface === 'portal') {
    return `${BASE}/portal/${slug}/reports/${report}?dateRange=${dr}`
  }
  const sub = subsection ? `&subsection=${encodeURIComponent(subsection)}` : ''
  return `${BASE}/dashboard/${slug}/reports?section=${encodeURIComponent(report)}${sub}&dateRange=${dr}`
}

interface Hit {
  label: string
  url: string
}

interface Measurement {
  url: string
  label: string
  passes: number[]  // ms per pass
  status: number
}

async function measureOne(url: string): Promise<{ ms: number; status: number }> {
  const start = Date.now()
  const res = await fetch(url, { headers: { Cookie: COOKIE! }, redirect: 'manual' })
  await res.text()  // drain full streamed body
  return { ms: Date.now() - start, status: res.status }
}

async function main() {
  if (!COOKIE) {
    console.error('Missing PERF_SESSION_COOKIE env var.')
    process.exit(1)
  }

  const passes = parseInt(parseArg('--passes', '2'), 10)
  const surfaces = parseSurface()

  const clients = await getAllClients()

  // Build the full hit list once
  const hits: Hit[] = []
  for (const surface of surfaces) {
    for (const client of clients) {
      for (const report of client.enabledReports) {
        const variants: Array<{ subsection?: string; label: string }> = [{ label: report }]
        if (surface === 'dashboard' && SUBSECTIONS[report]) {
          for (const sub of SUBSECTIONS[report]) {
            variants.push({ subsection: sub, label: `${report}/${sub}` })
          }
        }
        for (const v of variants) {
          hits.push({
            label: `${surface}/${client.slug}/${v.label}`,
            url: buildUrl(surface, client.slug, report, v.subsection),
          })
        }
      }
    }
  }

  console.log(`Wall-clock walker: ${hits.length} URLs × ${passes} passes (pass 1 = cold)\n`)

  const results: Measurement[] = hits.map((h) => ({ url: h.url, label: h.label, passes: [], status: 0 }))

  for (let p = 0; p < passes; p++) {
    const passLabel = p === 0 ? 'cold' : `warm-${p}`
    console.log(`── Pass ${p + 1} (${passLabel}) ──`)
    for (let i = 0; i < hits.length; i++) {
      try {
        const { ms, status } = await measureOne(hits[i].url)
        results[i].passes.push(ms)
        results[i].status = status
        const tag = status >= 200 && status < 400 ? '✓' : '✗'
        console.log(`  ${tag} ${hits[i].label.padEnd(50)} ${String(status)}  ${String(ms).padStart(5)}ms`)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.log(`  ✗ ${hits[i].label.padEnd(50)} ERROR  ${msg}`)
        results[i].passes.push(-1)
      }
    }
    console.log()
  }

  // Summary table
  const passHeaders = Array.from({ length: passes }, (_, i) => i === 0 ? 'cold' : `warm-${i}`)
  console.log(`Summary (ms per pass, delta = (warm-1 - cold) / cold)`)
  console.log()
  console.log(`${'page'.padEnd(50)}  ${passHeaders.map((h) => h.padStart(7)).join('  ')}  ${'delta'.padStart(7)}`)
  console.log('─'.repeat(50 + passes * 9 + 12))

  let totalCold = 0
  let totalWarm = 0
  for (const r of results) {
    const cold = r.passes[0] ?? -1
    const warm = r.passes[1] ?? cold
    const delta = cold > 0 ? Math.round(((warm - cold) / cold) * 100) : 0
    totalCold += Math.max(0, cold)
    totalWarm += Math.max(0, warm)
    const passCols = r.passes.map((p) => String(p).padStart(7)).join('  ')
    const sign = delta > 0 ? '+' : ''
    console.log(`${r.label.padEnd(50)}  ${passCols}  ${(sign + delta + '%').padStart(7)}`)
  }
  const totalDelta = totalCold > 0 ? Math.round(((totalWarm - totalCold) / totalCold) * 100) : 0
  const sign = totalDelta > 0 ? '+' : ''
  console.log('─'.repeat(50 + passes * 9 + 12))
  console.log(`${'TOTAL'.padEnd(50)}  ${String(totalCold).padStart(7)}  ${String(totalWarm).padStart(7)}${' '.repeat(Math.max(0, (passes - 2) * 9))}  ${(sign + totalDelta + '%').padStart(7)}`)
}

main().catch((err) => { console.error(err); process.exit(1) })
