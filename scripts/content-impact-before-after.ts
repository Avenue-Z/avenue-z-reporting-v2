// scripts/content-impact-before-after.ts
export {} // module scope
// Run: CACHE_DISABLE=1 npx tsx --env-file=.env.local scripts/content-impact-before-after.ts <slug>
// Read-only before/after evidence for the Content Impact redesign. "Before" =
// the old single-page fetches (getDomainCoverage 10,000 rows, getUrlCitations
// 2,000 rows, first-variant engagement rate); "After" = the walked/uncapped
// fetches and session-weighted engagement rate. Window: last_30_days with a
// previous_period comparison (the fullest table state). No writes anywhere.
// The GA4 per-path lookups below reproduce the minimum of content-impact.tsx's
// wiring (that code is inline in a 1,200-line RSC, not a clean seam to extract).

import { getPeecOverview } from '@/lib/peec/client'
import { getUrlCitations, getOwnedUrlCitations, getDomainCoverage, ownedPromptCoveragePctForModels, urlPromptIds } from '@/lib/peec/url-citations'
import { getCoverageProjection } from '@/lib/peec/coverage-projection'
import { buildContentPerformanceRows, engagementRateByPath, blankCountsByColumn, normPath, type ContentPerformanceRow } from '@/lib/peec/content-performance-rows'
import { toCalendarPages } from '@/lib/content-calendar/pages'
import { getContentCalendarData } from '@/lib/content-calendar/client'
import { ga4Query, parseDateRange, deriveCompareRange } from '@/lib/ga4/client'
import { isAiSource } from '@/lib/constants'

type GRow = Record<string, unknown>
const slug = process.argv[2]
if (!slug) { console.error('usage: content-impact-before-after.ts <slug>'); process.exit(2) }

const pct = (n: number | null, d = 1) => (n == null ? '--' : `${n.toFixed(d)}%`)
const head = (t: string) => console.log(`\n=== ${t} ===`)

function pathMaps(erRows: GRow[], aiRows: GRow[], chRows: GRow[]) {
  const sum = (rows: GRow[], pred: (r: GRow) => boolean) => {
    const m = new Map<string, number>(); const seen = new Set<string>()
    for (const r of rows) {
      const p = normPath(String(r.pagePath ?? '')); seen.add(p)
      if (pred(r)) m.set(p, (m.get(p) ?? 0) + (Number(r.sessions) || 0))
    }
    return { m, seen }
  }
  const er = engagementRateByPath(erRows as never)
  const ai = sum(aiRows, (r) => isAiSource(String(r.sessionSource ?? '')))
  const org = sum(chRows, (r) => String(r.sessionDefaultChannelGroup ?? '') === 'Organic Search')
  const erSeen = new Set(erRows.map((r) => normPath(String(r.pagePath ?? ''))))
  return (path: string) => {
    const p = normPath(path)
    return {
      aiReferred: erSeen.has(p) ? ai.m.get(p) ?? 0 : null,
      organic: org.seen.has(p) ? org.m.get(p) ?? 0 : null,
      engagementRate: er.get(p) ?? null,
    }
  }
}

async function main() {
  const range = 'last_30_days'
  const main = parseDateRange(range)
  const cmp = deriveCompareRange(range, 'previous_period')
  if (!cmp) throw new Error('could not derive previous_period range')
  const iso = (d: { startDate: string; endDate: string }) => `${d.startDate},${d.endDate}`
  console.log(`Content Impact before/after for "${slug}"`)
  console.log(`Window ${iso(main)}; comparison ${iso(cmp)}. Read-only.`)

  const peec = await getPeecOverview(slug, range)
  const ownDomains = peec.topDomains.filter((d) => d.type === 'Own').map((d) => d.domain)
  const totalPrompts = peec.trackedPrompts.length
  console.log(`Owned hosts: ${ownDomains.join(', ') || '(none)'}; tracked prompts: ${totalPrompts}`)

  const win = { startDate: main.startDate, endDate: main.endDate }
  const [oldCov, newCov, newCovPrior, urls, owned, ownedPrior, cal] = await Promise.all([
    getDomainCoverage(slug, win),
    getCoverageProjection(slug, win),
    getCoverageProjection(slug, cmp),
    getUrlCitations(slug),
    getOwnedUrlCitations(slug, [...ownDomains].sort()),
    getOwnedUrlCitations(slug, [...ownDomains].sort(), cmp),
    getContentCalendarData(slug),
  ])

  // ── 1. Prompt Coverage ──
  head('1. Prompt Coverage KPI (owned domains, all models)')
  const oldAvail = Object.keys(oldCov.promptIdsByDomain).length > 0 || Object.keys(oldCov.tagIdsByDomain).length > 0
  const kpiOld = ownedPromptCoveragePctForModels(oldCov, ownDomains, totalPrompts, null, oldAvail)
  const kpiNew = ownedPromptCoveragePctForModels(newCov, ownDomains, totalPrompts, null, true)
  console.log(`Before (single 10,000-row fetch): ${pct(kpiOld, 0)}`)
  console.log(`After  (complete walk, complete=${newCov.complete}, duplicateRows=${newCov.duplicateRows}): ${pct(kpiNew, 0)}`)

  // ── 2. Citation share denominator ──
  head('2. Citation share denominator')
  const oldDen = urls.reduce((s, c) => s + (Number(c.citationCount) || 0), 0)
  const oldOwnedNum = urls.filter((c) => ownDomains.some((d) => c.domain.replace(/^www\./, '') === d.replace(/^www\./, ''))).reduce((s, c) => s + (Number(c.citationCount) || 0), 0)
  console.log(`Before: ${urls.length} rows (2,000-row cap), denominator ${oldDen}`)
  console.log(`After:  totalCitationCount ${owned.totalCitationCount} (owned walk complete=${owned.complete}), owned cited rows ${owned.rows.length}`)
  const ownedNum = owned.rows.reduce((s, c) => s + c.citationCount, 0)
  console.log(`Owned citations: before (exact-host match in capped rows) ${oldOwnedNum} -> after ${ownedNum}`)
  console.log(`Owned citation share: before ${pct(oldDen > 0 ? (oldOwnedNum / oldDen) * 100 : null, 2)} -> after ${pct(owned.totalCitationCount > 0 ? (ownedNum / owned.totalCitationCount) * 100 : null, 2)}`)

  // ── Rows ──
  const primary = (ownDomains[0] ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '') || null
  const pages = toCalendarPages(cal?.rows ?? [], primary)
  const [er, aiMain, chMain, aiPri, chPri, erPri] = await Promise.all([
    ga4Query({ clientSlug: slug, dateRange: range, metrics: ['sessions', 'activeUsers', 'screenPageViews', 'engagementRate'], dimensions: ['pagePath'], limit: 1000 }),
    ga4Query({ clientSlug: slug, dateRange: range, metrics: ['sessions'], dimensions: ['pagePath', 'sessionSource'], limit: 2000 }),
    ga4Query({ clientSlug: slug, dateRange: iso(main), metrics: ['sessions'], dimensions: ['pagePath', 'sessionDefaultChannelGroup'], limit: 5000 }),
    ga4Query({ clientSlug: slug, dateRange: iso(cmp), metrics: ['sessions'], dimensions: ['pagePath', 'sessionSource'], limit: 2000 }),
    ga4Query({ clientSlug: slug, dateRange: iso(cmp), metrics: ['sessions'], dimensions: ['pagePath', 'sessionDefaultChannelGroup'], limit: 5000 }),
    ga4Query({ clientSlug: slug, dateRange: iso(cmp), metrics: ['sessions', 'activeUsers', 'screenPageViews', 'engagementRate'], dimensions: ['pagePath'], limit: 1000 }),
  ])
  const erRows = er.rows as GRow[]
  const rows: ContentPerformanceRow[] = buildContentPerformanceRows({
    pages, owned, ownedPrior, coverage: newCov, coveragePrior: newCovPrior, totalTrackedPrompts: totalPrompts,
    current: pathMaps(erRows, aiMain.rows as GRow[], chMain.rows as GRow[]),
    prior: pathMaps(erPri.rows as GRow[], aiPri.rows as GRow[], chPri.rows as GRow[]),
  })
  const azRows = rows.filter((r) => r.scopes.includes('az'))

  // per-URL coverage old vs new
  head('3. Per-URL prompt coverage, before vs after (pages where it differs)')
  let diffs = 0
  for (const r of rows) {
    const o = oldAvail && totalPrompts > 0 ? (urlPromptIds(oldCov, r.key).length / totalPrompts) * 100 : null
    if (o === r.promptCoverage) continue
    diffs++
    console.log(`- ${r.slug}: ${pct(o)} -> ${pct(r.promptCoverage)}`)
  }
  console.log(`${diffs} of ${rows.length} rows differ`)

  // ── Engagement rate ──
  head('4. Engagement rate: old (first trailing-slash variant) vs new (session-weighted), pages that differ')
  const oldEr = (path: string): number | null => {
    const row = erRows.find((r) => {
      const p = String(r.pagePath ?? '')
      return p === path || p === path.replace(/\/$/, '') || path === p.replace(/\/$/, '')
    })
    return row && row.engagementRate != null ? Number(row.engagementRate) : null
  }
  const fmtEr = (v: number | null) => (v == null ? '--' : `${(v * 100).toFixed(1)}%`)
  let erDiff = 0
  for (const r of rows) {
    const o = oldEr(r.slug), n = r.engagementRate
    if (o === n || (o != null && n != null && Math.abs(o - n) < 1e-9)) continue
    erDiff++
    console.log(`- ${r.slug} [${r.scopes.includes('az') ? 'Avenue Z' : 'cited'}]: old ${fmtEr(o)} -> new ${fmtEr(n)}`)
  }
  console.log(`${erDiff} of ${rows.length} pages differ`)

  // ── Blanks ──
  head('5. Blank cells per column (F-5)')
  for (const [label, set] of [['Avenue Z scope', azRows], ['All cited scope', rows]] as const) {
    console.log(`\n${label}: ${set.length} rows`)
    const counts = blankCountsByColumn(set as ContentPerformanceRow[])
    for (const [col, n] of Object.entries(counts)) {
      console.log(`  ${col.padEnd(24)} ${String(n).padStart(4)}  ${set.length ? pct((n / set.length) * 100, 0) : '--'}`)
    }
  }

  // ── Calendar dates (R1) ──
  head('6. Calendar dates (published Avenue Z pages)')
  const pub = pages.filter((p) => p.published)
  console.log(`Published pages: ${pub.length}`)
  console.log(`  with a Published date:      ${pub.filter((p) => p.publishDate).length}`)
  console.log(`  with a Last optimized date: ${pub.filter((p) => p.lastOptimizedDate).length}`)
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(2) })
