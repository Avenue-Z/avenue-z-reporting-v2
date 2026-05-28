import { readFileSync } from 'node:fs'

export type PerfEntry = {
  ts: string
  vendor: string
  fn: string
  client?: string
  dateRange?: string
  ms: number
  ok: boolean
  err?: string
}

export function parseLines(lines: string[]): PerfEntry[] {
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

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0
  const idx = (sorted.length - 1) * q
  const lo = Math.floor(idx), hi = Math.ceil(idx)
  return lo === hi ? sorted[lo] : Math.round(sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo))
}

export type CallRow = { vendor: string; fn: string; n: number; median: number; p95: number; max: number; err: number }

export function perCall(entries: PerfEntry[]): CallRow[] {
  const groups = new Map<string, PerfEntry[]>()
  for (const e of entries) {
    const key = `${e.vendor}\t${e.fn}`
    const arr = groups.get(key) ?? []
    arr.push(e)
    groups.set(key, arr)
  }
  const rows: CallRow[] = []
  for (const [key, group] of groups) {
    const [vendor, fn] = key.split('\t')
    const sorted = group.map((e) => e.ms).sort((a, b) => a - b)
    rows.push({
      vendor, fn,
      n: group.length,
      median: quantile(sorted, 0.5),
      p95: quantile(sorted, 0.95),
      max: sorted[sorted.length - 1],
      err: group.filter((e) => !e.ok).length,
    })
  }
  return rows.sort((a, b) => b.p95 - a.p95)
}

export type SectionRow = { client: string; fetches: number; wall: number; sum: number; parallelism: number }

/**
 * Infer sections by treating each `db/getClientBySlug` call as the start of
 * a new section render for that client. All subsequent entries (for ANY
 * client) up until the next `db/getClientBySlug` belong to that section.
 *
 * Because perf-walk is sequential, this is unambiguous: only one render is
 * in flight at a time. We tag the section by the client of the bracketing
 * getClientBySlug call.
 */
export function perSection(entries: PerfEntry[]): SectionRow[] {
  const sections: { client: string; entries: PerfEntry[] }[] = []
  let current: { client: string; entries: PerfEntry[] } | null = null

  for (const e of entries) {
    if (e.vendor === 'db' && e.fn === 'getClientBySlug' && e.client) {
      if (current) sections.push(current)
      current = { client: e.client, entries: [e] }
    } else if (current) {
      current.entries.push(e)
    }
  }
  if (current) sections.push(current)

  return sections.map((s) => {
    const tsList = s.entries.map((e) => new Date(e.ts).getTime()).sort((a, b) => a - b)
    const wall = tsList[tsList.length - 1] - tsList[0]
    const sum = s.entries.reduce((acc, e) => acc + e.ms, 0)
    return {
      client: s.client,
      fetches: s.entries.length,
      wall,
      sum,
      parallelism: wall > 0 ? +(sum / wall).toFixed(1) : 0,
    }
  }).sort((a, b) => b.wall - a.wall)
}

export type VendorRow = { vendor: string; totalCalls: number; totalWaitMs: number; median: number }

export function perVendor(entries: PerfEntry[]): VendorRow[] {
  const groups = new Map<string, PerfEntry[]>()
  for (const e of entries) {
    const arr = groups.get(e.vendor) ?? []
    arr.push(e)
    groups.set(e.vendor, arr)
  }
  const rows: VendorRow[] = []
  for (const [vendor, group] of groups) {
    const sorted = group.map((e) => e.ms).sort((a, b) => a - b)
    rows.push({
      vendor,
      totalCalls: group.length,
      totalWaitMs: group.reduce((acc, e) => acc + e.ms, 0),
      median: quantile(sorted, 0.5),
    })
  }
  return rows.sort((a, b) => b.totalWaitMs - a.totalWaitMs)
}

function fmtMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

function pad(str: string, n: number): string {
  return str.length >= n ? str : str + ' '.repeat(n - str.length)
}

function printCallTable(rows: CallRow[]): void {
  console.log('Table 1 — Per vendor call (sorted by p95 desc)')
  console.log(pad('vendor', 16) + pad('fn', 28) + pad('n', 7) + pad('median', 10) + pad('p95', 10) + pad('max', 10) + 'err')
  for (const r of rows) {
    console.log(
      pad(r.vendor, 16) + pad(r.fn, 28) + pad(String(r.n), 7) +
      pad(fmtMs(r.median), 10) + pad(fmtMs(r.p95), 10) + pad(fmtMs(r.max), 10) + String(r.err)
    )
  }
}

function printSectionTable(rows: SectionRow[]): void {
  console.log('\nTable 2 — Per section render (sorted by wall desc)')
  console.log(pad('client', 24) + pad('fetches', 10) + pad('wall', 10) + pad('sum', 10) + 'parallelism')
  for (const r of rows) {
    console.log(
      pad(r.client, 24) + pad(String(r.fetches), 10) +
      pad(fmtMs(r.wall), 10) + pad(fmtMs(r.sum), 10) + `${r.parallelism}x`
    )
  }
}

function printVendorTable(rows: VendorRow[]): void {
  console.log('\nTable 3 — Per vendor totals (sorted by total wait desc)')
  console.log(pad('vendor', 16) + pad('total_calls', 14) + pad('total_wait', 14) + 'median')
  for (const r of rows) {
    console.log(
      pad(r.vendor, 16) + pad(String(r.totalCalls), 14) +
      pad(fmtMs(r.totalWaitMs), 14) + fmtMs(r.median)
    )
  }
}

function main() {
  const path = process.argv[2]
  if (!path) {
    console.error('Usage: tsx scripts/perf-report.ts <perf.log>')
    process.exit(1)
  }
  let lines: string[]
  try {
    lines = readFileSync(path, 'utf-8').split('\n')
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`Could not read perf log at "${path}": ${message}`)
    process.exit(1)
  }
  const entries = parseLines(lines)
  console.log(`Parsed ${entries.length} PERF entries from ${path}\n`)
  printCallTable(perCall(entries))
  printSectionTable(perSection(entries))
  printVendorTable(perVendor(entries))
}

// Run main only when invoked as a script, not when imported by the test.
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}
