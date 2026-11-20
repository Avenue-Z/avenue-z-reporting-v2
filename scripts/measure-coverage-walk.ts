// scripts/measure-coverage-walk.ts
export {} // module scope
// Run: CACHE_DISABLE=1 npx tsx --env-file=.env.local scripts/measure-coverage-walk.ts <slug>
// Read-only. Walks Peec /reports/urls (prompt_id+model_id dimensions, and the
// base query) over the last 30 days and prints row/page/duplicate counts and
// the JSON size of the aggregated coverage / owned-host subset.

import { getClientBySlug } from '@/lib/db/queries'
import { aggregateDomainCoverage, type ApiUrlRow } from '@/lib/peec/url-citations'
import { urlJoinKey } from '@/lib/url'

const BASE = 'https://api.peec.ai/customer/v1'
const PAGE = 10_000
const MAX_PAGES = 30 // measurement only: generous ceiling so the true size is seen

const iso = (d: Date) => d.toISOString().slice(0, 10)
function last30() {
  const end = new Date(); const start = new Date(end); start.setDate(start.getDate() - 29)
  return { start_date: iso(start), end_date: iso(end) }
}

async function post<T>(path: string, body: Record<string, unknown>, pid: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'X-API-Key': process.env.PEEC_AI_CUSTOMER_TOKEN!, 'Content-Type': 'application/json' },
    body: JSON.stringify({ project_id: pid, ...body }),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Peec ${res.status}: ${path}`)
  return res.json() as Promise<T>
}

async function walk(pid: string, extra: Record<string, unknown>) {
  const rows: ApiUrlRow[] = []
  let pages = 0
  for (; pages < MAX_PAGES; ) {
    const { data } = await post<{ data: ApiUrlRow[] }>(
      '/reports/urls', { ...last30(), ...extra, limit: PAGE, offset: pages * PAGE }, pid)
    pages++
    rows.push(...(data ?? []))
    if ((data ?? []).length < PAGE) return { rows, pages, truncated: false }
  }
  return { rows, pages, truncated: true }
}

async function main() {
  const slug = process.argv[2]
  if (!slug) throw new Error('usage: measure-coverage-walk.ts <slug>')
  if (!process.env.PEEC_AI_CUSTOMER_TOKEN) throw new Error('Missing PEEC_AI_CUSTOMER_TOKEN')
  const client = await getClientBySlug(slug)
  const pid = client?.peecCustomerProjectId
  if (!pid) throw new Error(`no peecCustomerProjectId for ${slug}`)

  const dupKeys = (rows: ApiUrlRow[], keyOf: (r: ApiUrlRow) => string) => {
    const seen = new Set<string>(); let d = 0
    for (const r of rows) { const k = keyOf(r); if (seen.has(k)) d++; else seen.add(k) }
    return d
  }

  // 1) prompt_id + model_id dimensioned walk
  const dim = await walk(pid, { dimensions: ['prompt_id', 'model_id'] })
  const dupDim = dupKeys(dim.rows, (r) => `${r.url}|${r.prompt?.id}|${r.model?.id ?? r.model_channel?.id}`)
  const cov = aggregateDomainCoverage(dim.rows, [], {})
  console.log('[prompt_id+model_id walk]')
  console.log(`  total rows: ${dim.rows.length}; pages: ${dim.pages}; truncated: ${dim.truncated}`)
  console.log(`  duplicate (url,prompt,model) keys: ${dupDim}`)
  console.log(`  aggregateDomainCoverage JSON length: ${JSON.stringify(cov).length} bytes`)

  // 2) base walk + owned-host subset (FB-050 suffix rule)
  const base = await walk(pid, {})
  console.log('[base walk (no dimensions)]')
  console.log(`  total rows: ${base.rows.length}; pages: ${base.pages}; truncated: ${base.truncated}`)
  console.log(`  duplicate url keys: ${dupKeys(base.rows, (r) => r.url)}`)

  const dom = await post<{ data: { domain: string; classification: string }[] }>(
    '/reports/domains', { ...last30(), limit: 5000 }, pid)
  const ownKeys = (dom.data ?? [])
    .filter((d) => d.classification?.toUpperCase() === 'OWN')
    .map((d) => urlJoinKey(d.domain))
    .filter((k): k is string => !!k)
  console.log(`  Own domains from /reports/domains: ${ownKeys.length}`)
  const isOwned = (host: string | null) =>
    !!host && ownKeys.some((k) => host === k || host.endsWith(`.${k}`))
  const owned = base.rows.filter((r) => {
    let h: string | null
    try { h = new URL(r.url).hostname.replace(/^www\./i, '').toLowerCase() } catch { h = (urlJoinKey(r.url) ?? '').split('/')[0] || null }
    return isOwned(h)
  })
  console.log(`  owned-host rows: ${owned.length}; JSON size: ${JSON.stringify(owned).length} bytes`)
  console.log(`  full base JSON size (for reference): ${JSON.stringify(base.rows).length} bytes`)
}

main().catch((e) => { console.error(e); process.exit(1) })
