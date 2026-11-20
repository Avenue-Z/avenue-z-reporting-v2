// scripts/measure-coverage-walk.ts
export {} // module scope
// Run: CACHE_DISABLE=1 npx tsx --env-file=.env.local scripts/measure-coverage-walk.ts <slug>
// Read-only. Walks Peec /reports/urls (prompt_id+model_id dimensions, and the
// base query) over the last 30 days and prints row/page/duplicate counts and
// the JSON size of the aggregated coverage / owned-host subset.

import { getClientBySlug } from '@/lib/db/queries'
import { aggregateDomainCoverage, getUrlCitations, normalizeEngine, type ApiUrlRow } from '@/lib/peec/url-citations'
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
  const t0 = Date.now()
  const dim = await walk(pid, { dimensions: ['prompt_id', 'model_id'] })
  const walkMs = Date.now() - t0
  const dupDim = dupKeys(dim.rows, (r) => `${r.url}|${r.prompt?.id}|${r.model?.id ?? r.model_channel?.id}`)
  const cov = aggregateDomainCoverage(dim.rows, [], {})
  console.log('[prompt_id+model_id walk]')
  console.log(`  total rows: ${dim.rows.length}; pages: ${dim.pages}; truncated: ${dim.truncated}; wall ${walkMs} ms`)
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

  await projections(pid, slug, dim.rows, ownKeys, isOwned)
}

const hostOfUrl = (u: string): string | null => {
  try { return new URL(u).hostname.replace(/^www\./i, '').toLowerCase() } catch { return (urlJoinKey(u) ?? '').split('/')[0] || null }
}
const bytes = (v: unknown) => JSON.stringify(v).length

async function projections(
  pid: string, slug: string, rows: ApiUrlRow[], ownKeys: string[],
  isOwned: (h: string | null) => boolean,
) {
  console.log('[projection sizes, bytes]')
  // Same tag walk as production getDomainCoverage (tag_id, limit 2000) + /tags.
  const [tagRes, tagsRes, promptsRes, domRes] = await Promise.all([
    post<{ data: ApiUrlRow[] }>('/reports/urls', { ...last30(), dimensions: ['tag_id'], limit: 2000 }, pid),
    fetch(`${BASE}/tags?project_id=${pid}&limit=500`, { headers: { 'X-API-Key': process.env.PEEC_AI_CUSTOMER_TOKEN! }, cache: 'no-store' }).then((r) => r.json()) as Promise<{ data: { id: string; name: string }[] }>,
    fetch(`${BASE}/prompts?project_id=${pid}&limit=1`, { headers: { 'X-API-Key': process.env.PEEC_AI_CUSTOMER_TOKEN! }, cache: 'no-store' }).then((r) => r.json()) as Promise<{ totalCount?: number; data?: unknown[] }>,
    post<{ data: { domain: string; classification: string; citation_count: number }[] }>('/reports/domains', { ...last30(), limit: 5000 }, pid),
  ])
  const tagNameById = Object.fromEntries((tagsRes.data ?? []).map((t) => [t.id, t.name]))
  const cov = aggregateDomainCoverage(rows, tagRes.data ?? [], tagNameById)
  console.log(`  tracked prompts (/prompts totalCount): ${promptsRes.totalCount ?? 'n/a'}`)
  console.log('  1) full aggregate fields:')
  for (const k of ['promptIdsByDomain', 'promptIdsByDomainByModel', 'promptIdsByUrlKey', 'tagIdsByDomain', 'tagIdsByUrlKey', 'tagNameById'] as const) {
    console.log(`     ${k}: ${bytes(cov[k])}`)
  }

  // (a) owned prompt ids union + per engine
  const ownedAll = new Set<string>(); const ownedByEng = new Map<string, Set<string>>()
  for (const r of rows) {
    if (!isOwned(hostOfUrl(r.url)) || !r.prompt?.id) continue
    ownedAll.add(r.prompt.id)
    const eng = normalizeEngine(r.model?.id ?? r.model_channel?.id ?? '')
    if (!eng) continue
    if (!ownedByEng.has(eng)) ownedByEng.set(eng, new Set())
    ownedByEng.get(eng)!.add(r.prompt.id)
  }
  const a = { all: [...ownedAll], byEngine: Object.fromEntries([...ownedByEng].map(([k, v]) => [k, [...v]])) }
  console.log(`  2a) owned prompt ids (+per engine): ${bytes(a)} (${ownedAll.size} prompts)`)

  // (b) promptIdsByUrlKey restricted to owned url keys
  const b: Record<string, string[]> = {}
  for (const [k, v] of Object.entries(cov.promptIdsByUrlKey)) if (isOwned(k.split('/')[0])) b[k] = v
  console.log(`  2b) promptIdsByUrlKey owned only: ${bytes(b)} (${Object.keys(b).length} keys)`)

  // (c) top N competitor domains + owned domains
  const comps = (domRes.data ?? []).filter((d) => d.classification?.toUpperCase() === 'COMPETITOR')
    .sort((x, y) => y.citation_count - x.citation_count)
  const cSize = (n: number) => {
    const keep = new Set([...comps.slice(0, n).map((d) => urlJoinKey(d.domain)), ...ownKeys].filter((k): k is string => !!k))
    const pick = <T,>(o: Record<string, T> | undefined) =>
      Object.fromEntries(Object.entries(o ?? {}).filter(([h]) => keep.has(h)))
    return bytes({ promptIdsByDomain: pick(cov.promptIdsByDomain), promptIdsByDomainByModel: pick(cov.promptIdsByDomainByModel) })
  }
  const c25 = cSize(25)
  console.log(`  2c) top25 competitors+own: ${c25}; top50: ${cSize(50)} (competitor domains total: ${comps.length})`)

  // (d) per prompt: top 3 non-owned url keys by citation count + rest count
  const per = new Map<string, Map<string, { url: string; n: number }>>()
  for (const r of rows) {
    const pidr = r.prompt?.id
    if (!pidr || isOwned(hostOfUrl(r.url))) continue
    if (!per.has(pidr)) per.set(pidr, new Map())
    const m = per.get(pidr)!; const key = urlJoinKey(r.url) ?? r.url
    const e = m.get(key) ?? { url: r.url, n: 0 }
    e.n += r.citation_count ?? 0
    m.set(key, e)
  }
  const d: Record<string, { urls: { url: string; citationCount: number }[]; more: number }> = {}
  for (const [id, m] of per) {
    const sorted = [...m.values()].sort((x, y) => y.n - x.n)
    d[id] = { urls: sorted.slice(0, 3).map((e) => ({ url: e.url, citationCount: e.n })), more: Math.max(0, sorted.length - 3) }
  }
  const dSize = bytes(d)
  console.log(`  2d) per-prompt top3 non-owned: ${dSize} (${Object.keys(d).length} prompts)`)

  // (e) promptIdsByUrlKey for brand-absent competitor-naming urls in capped getUrlCitations
  const cites = await getUrlCitations(slug)
  const keys = new Set(cites.filter((c) => !c.mentionsYourBrand && c.competitorBrandNames.length > 0).map((c) => c.urlKey))
  const e: Record<string, string[]> = {}
  for (const k of keys) if (cov.promptIdsByUrlKey[k]) e[k] = cov.promptIdsByUrlKey[k]
  const eSize = bytes(e)
  console.log(`  2e) brand-absent competitor urls: ${eSize} (${keys.size} qualifying of ${cites.length}; ${Object.keys(e).length} with prompt ids)`)

  console.log(`  2f) sum a+b+c25+d+e: ${bytes(a) + bytes(b) + c25 + dSize + eSize}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
