// scripts/v2-calendar-audit.ts
export {} // module scope
// Run: CACHE_DISABLE=1 npx tsx --env-file=.env.local scripts/v2-calendar-audit.ts <slug>
// Read-only. V1/V2 audit of the content-calendar sheet: per tab header row,
// publishDate header match, raw Publish Date formats vs parseCalendarDate,
// Content Type -> parseContentAction, Status counts, duplicate URLs across tabs.

import { getClientBySlug } from '@/lib/db/queries'
import {
  fetchAllTabValues, buildColumnMap, parseContentAction, parseTabRows,
} from '@/lib/content-calendar/client'
import { parseCalendarDate, parseYearHint } from '@/lib/content-calendar/date'
import { urlJoinKey } from '@/lib/url'

// Collapse a raw cell to a format shape: digits -> 9, letters -> a.
const shape = (s: string) => s.replace(/\d/g, '9').replace(/[A-Za-z]+/g, 'a')

async function main() {
  const slug = process.argv[2]
  if (!slug) throw new Error('usage: v2-calendar-audit.ts <slug>')
  const client = await getClientBySlug(slug)
  if (!client?.contentCalendarSheetId) throw new Error(`no contentCalendarSheetId for ${slug}`)
  const tabs = await fetchAllTabValues(client.contentCalendarSheetId)
  console.log(`tabs: ${tabs.length}`)

  const urlTabs = new Map<string, Set<number>>()
  const typeMap = new Map<string, string>()
  const statusCounts = new Map<string, number>()

  tabs.forEach((raw, ti) => {
    console.log(`\n=== tab ${ti} (${raw.length} grid rows) ===`)
    if (raw.length < 2) { console.log('(empty or header-only)'); return }
    const headers = raw[0]
    const col = buildColumnMap(headers)
    console.log('header row:', JSON.stringify(headers))
    const pd = col.get('publishDate')
    console.log('publishDate header matched:', pd == null ? 'NONE' : `col ${pd} "${headers[pd]}"`)
    const mc = col.get('monthContext')
    console.log('monthContext header:', mc == null ? 'NONE' : `col ${mc} "${headers[mc]}"`)

    const formats = new Map<string, { sample: string; parsed: string | null; n: number; nulls: number }>()
    for (const r of raw.slice(1)) {
      if (!r || !r.some((c) => (c ?? '').trim())) continue
      const cell = (name: string) => (col.has(name) ? (r[col.get(name)!] ?? '').trim() : '')
      const rawDate = cell('publishDate')
      const parsed = parseCalendarDate(rawDate, { yearHint: parseYearHint(cell('monthContext')) })
      const f = shape(rawDate) || '(empty)'
      const e = formats.get(f) ?? { sample: rawDate, parsed, n: 0, nulls: 0 }
      e.n++
      if (parsed == null) e.nulls++
      formats.set(f, e)

      const ct = cell('contentType')
      const act = parseContentAction(cell('contentAction'), ct)
      typeMap.set(`${ct}\u0000${cell('contentAction')}`, act)
      const st = cell('status')
      statusCounts.set(st, (statusCounts.get(st) ?? 0) + 1)
    }
    console.log('Publish Date formats (shape | sample | parsed | rows | null):')
    for (const [f, e] of formats) {
      console.log(`  ${f} | ${JSON.stringify(e.sample)} | ${e.parsed} | ${e.n} | ${e.nulls}`)
    }
    for (const row of parseTabRows(raw)) {
      if (!row.url) continue
      const k = urlJoinKey(row.url) ?? row.url
      const s = urlTabs.get(k) ?? new Set<number>()
      s.add(ti)
      urlTabs.set(k, s)
    }
  })

  console.log('\n=== Content Type / Content Action -> parseContentAction ===')
  for (const [k, v] of [...typeMap].sort()) {
    const [ct, ca] = k.split('\u0000')
    console.log(`  type=${JSON.stringify(ct)} action=${JSON.stringify(ca)} -> ${v}`)
  }
  console.log('\n=== Status counts (all tabs; exact string) ===')
  for (const [s, n] of [...statusCounts].sort((a, b) => b[1] - a[1])) console.log(`  ${JSON.stringify(s)}: ${n}`)
  console.log(`  exactly "Published": ${statusCounts.get('Published') ?? 0}; anything else: ${
    [...statusCounts].filter(([s]) => s !== 'Published').reduce((a, [, n]) => a + n, 0)}`)

  const dups = [...urlTabs].filter(([, t]) => t.size > 1)
  console.log(`\n=== URLs on more than one tab: ${dups.length} ===`)
  for (const [k, t] of dups) console.log(`  ${k} tabs=${[...t].join(',')}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
