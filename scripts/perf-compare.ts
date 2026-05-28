/**
 * Compares cold and warm walks captured in a single PERF log.
 *
 * Usage: tsx scripts/perf-compare.ts <perf.log> <cold-label> <warm-label>
 * Example: tsx scripts/perf-compare.ts perf.log cold warm
 *
 * Splits the log on boundary markers (PERF entries with vendor=_walk,
 * fn=boundary). Boundary entries themselves are excluded from per-vendor
 * aggregates.
 */
import { readFileSync } from 'node:fs'

export type PerfEntry = {
  ts: string
  vendor: string
  fn: string
  ms: number
  ok: boolean
  cached?: boolean
  client?: string
  dateRange?: string
  label?: string
  err?: string
}

function parseLines(lines: string[]): PerfEntry[] {
  const out: PerfEntry[] = []
  for (const line of lines) {
    if (!line.startsWith('PERF ')) continue
    try {
      const obj = JSON.parse(line.slice(5))
      if (typeof obj.vendor === 'string' && typeof obj.fn === 'string' && typeof obj.ms === 'number') {
        out.push(obj as PerfEntry)
      }
    } catch {
      // skip malformed
    }
  }
  return out
}

export function splitByBoundaries(
  lines: string[],
  coldLabel: string,
  warmLabel: string,
): { cold: PerfEntry[]; warm: PerfEntry[] } {
  const entries = parseLines(lines)
  const cold: PerfEntry[] = []
  const warm: PerfEntry[] = []
  let bucket: 'cold' | 'warm' | null = null

  for (const e of entries) {
    if (e.vendor === '_walk' && e.fn === 'boundary') {
      if (e.label === coldLabel) bucket = 'cold'
      else if (e.label === warmLabel) bucket = 'warm'
      else bucket = null  // unknown label resets — don't bucket subsequent entries
      continue  // boundary markers themselves are excluded from buckets
    }
    if (bucket === 'cold') cold.push(e)
    else if (bucket === 'warm') warm.push(e)
  }

  return { cold, warm }
}

export type VendorDelta = {
  vendor: string
  coldCalls: number
  warmCalls: number
  coldTotalMs: number
  warmTotalMs: number
  deltaPct: number  // negative = improvement
  hitRatePct: number  // % of warm calls with cached === true
}

export function perVendorDelta(cold: PerfEntry[], warm: PerfEntry[]): VendorDelta[] {
  const vendors = new Set<string>()
  for (const e of cold) vendors.add(e.vendor)
  for (const e of warm) vendors.add(e.vendor)

  const rows: VendorDelta[] = []
  for (const vendor of vendors) {
    const coldEntries = cold.filter((e) => e.vendor === vendor)
    const warmEntries = warm.filter((e) => e.vendor === vendor)
    const coldTotal = coldEntries.reduce((a, e) => a + e.ms, 0)
    const warmTotal = warmEntries.reduce((a, e) => a + e.ms, 0)
    const deltaPct = coldTotal > 0 ? Math.round(((warmTotal - coldTotal) / coldTotal) * 100) : 0
    const cachedHits = warmEntries.filter((e) => e.cached === true).length
    const hitRatePct = warmEntries.length > 0 ? Math.round((cachedHits / warmEntries.length) * 100) : 0
    rows.push({
      vendor,
      coldCalls: coldEntries.length,
      warmCalls: warmEntries.length,
      coldTotalMs: coldTotal,
      warmTotalMs: warmTotal,
      deltaPct,
      hitRatePct,
    })
  }
  return rows.sort((a, b) => b.coldTotalMs - a.coldTotalMs)
}

function fmtMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

function pad(str: string, n: number): string {
  return str.length >= n ? str : str + ' '.repeat(n - str.length)
}

function printDeltaTable(rows: VendorDelta[]): void {
  console.log(pad('vendor', 16) + pad('cold_wait', 12) + pad('warm_wait', 12) + pad('delta', 10) + 'hit_rate')
  for (const r of rows) {
    const deltaStr = r.deltaPct === 0 ? '—' : `${r.deltaPct}%`
    console.log(
      pad(r.vendor, 16) +
      pad(fmtMs(r.coldTotalMs), 12) +
      pad(fmtMs(r.warmTotalMs), 12) +
      pad(deltaStr, 10) +
      `${r.hitRatePct}%`
    )
  }
}

function main() {
  const [logPath, coldLabel, warmLabel] = process.argv.slice(2)
  if (!logPath || !coldLabel || !warmLabel) {
    console.error('Usage: tsx scripts/perf-compare.ts <perf.log> <cold-label> <warm-label>')
    process.exit(1)
  }
  let lines: string[]
  try {
    lines = readFileSync(logPath, 'utf-8').split('\n')
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`Could not read perf log at "${logPath}": ${message}`)
    process.exit(1)
  }
  const { cold, warm } = splitByBoundaries(lines, coldLabel, warmLabel)
  console.log(`Parsed ${cold.length} cold + ${warm.length} warm entries from ${logPath}\n`)
  printDeltaTable(perVendorDelta(cold, warm))
}

// Run main only when invoked as a script, not when imported by the test.
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}
