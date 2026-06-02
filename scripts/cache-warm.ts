/**
 * CLI wrapper for the cache-warm endpoint.
 *
 * Useful for:
 *   - Triggering a warm pass manually after a deploy (before the next cron run)
 *   - CI workflows that warm caches after deploy (see
 *     .github/workflows/cache-warm-after-deploy.yml)
 *   - Local testing against a running dev/prod server
 *
 * Usage:
 *   CRON_SECRET='...' tsx scripts/cache-warm.ts https://your.app
 *   CRON_SECRET='...' tsx scripts/cache-warm.ts http://localhost:3000
 *
 * Exit code: 0 if all warms succeeded, 1 if any failed.
 */
async function main() {
  const baseUrl = process.argv[2] ?? process.env.CACHE_WARM_BASE_URL
  const secret = process.env.CRON_SECRET

  if (!baseUrl) {
    console.error('Usage: tsx scripts/cache-warm.ts <base-url>')
    console.error('   or: CACHE_WARM_BASE_URL=... tsx scripts/cache-warm.ts')
    process.exit(2)
  }
  if (!secret) {
    console.error('CRON_SECRET env var required')
    process.exit(2)
  }

  const start = Date.now()
  console.log(`Warming ${baseUrl}/api/cache-warm ...`)

  const res = await fetch(`${baseUrl}/api/cache-warm`, {
    headers: { Authorization: `Bearer ${secret}` },
  })

  if (!res.ok) {
    const body = await res.text()
    console.error(`HTTP ${res.status}: ${body.slice(0, 500)}`)
    process.exit(1)
  }

  const data = await res.json() as {
    total:      number
    ok:         number
    failed:     number
    durationMs: number
    results:    Array<{ url: string; status: number | null; ms: number; ok: boolean; error?: string }>
  }

  const totalSec = ((Date.now() - start) / 1000).toFixed(1)
  console.log(`\nWarm complete: ${data.ok}/${data.total} ok, ${data.failed} failed, ${totalSec}s total\n`)

  // Show per-URL detail; failures first.
  const failures = data.results.filter((r) => !r.ok)
  if (failures.length > 0) {
    console.log('Failures:')
    for (const r of failures) {
      console.log(`  ✗ ${r.status ?? 'ERR'.padEnd(3)}  ${String(r.ms).padStart(5)}ms  ${r.url}`)
      if (r.error) console.log(`      ${r.error}`)
    }
    console.log()
  }

  console.log('Per-URL ms (ok):')
  for (const r of data.results.filter((x) => x.ok)) {
    console.log(`  ✓ ${String(r.status).padEnd(3)}  ${String(r.ms).padStart(5)}ms  ${r.url}`)
  }

  process.exit(data.failed > 0 ? 1 : 0)
}

main().catch((err) => { console.error(err); process.exit(1) })
