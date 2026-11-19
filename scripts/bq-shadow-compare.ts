// Run: CACHE_DISABLE=1 npx tsx --env-file=.env.local scripts/bq-shadow-compare.ts renaissance
// One source only (googleads | linkedin | meta):
//      CACHE_DISABLE=1 npx tsx --env-file=.env.local scripts/bq-shadow-compare.ts renaissance meta
// Other ranges: SHADOW_RANGES='last_7_days;2025-01-01,2025-03-31' (`;`-separated, since a range holds a comma).
// Calls every in-scope fetcher with the live path and with the BigQuery path, then diffs the outputs.
// Exit 0 only when nothing differs and no BigQuery call fell back (a fallback would compare live with live).
import { getPaidSearchKpis } from '@/lib/paid-search/kpis'
import { getHeroSeries } from '@/lib/paid-search/hero'
import { getCampaignRows } from '@/lib/paid-search/campaigns'
import { getLeadBreakdown } from '@/lib/paid-search/leads'
import { getGeoRows } from '@/lib/paid-search/geo'
import { getKeywordsData } from '@/lib/paid-search/keywords'
import { getLinkedInKpis } from '@/lib/linkedin/kpis'
import { getCreativeTree } from '@/lib/linkedin/creative'
import { getPaidMediaTrend } from '@/lib/paid-media/trend'
import { getMetaKpis } from '@/lib/meta/kpis'
import { getCreativeTree as getMetaCreativeTree } from '@/lib/meta/creative'
import { getMetaGeoData } from '@/lib/meta/geo'
import { AW_HISTORY_FROM } from '@/lib/bq/googleads'

const SOURCES = ['googleads', 'linkedin', 'meta'] as const
type Source = (typeof SOURCES)[number]
const slug = process.argv[2]
const only = process.argv[3] as Source | undefined
if (!slug || (only && !SOURCES.includes(only))) throw new Error(`usage: bq-shadow-compare.ts <client-slug> [${SOURCES.join('|')}]`)
process.env.BQ_CLIENTS = slug

// Ranges > 31 days exercise the ISO-week (Yearweekiso) path. None may start before AW_HISTORY_FROM
// (2026-04-01). Since C3 a Google Ads read before it throws instead of falling back to live, so a
// range starting on the floor is compared without its prior period (Q1), which BigQuery cannot serve.
const RANGES = process.env.SHADOW_RANGES
  ? process.env.SHADOW_RANGES.split(';').map((r) => r.trim()).filter(Boolean)
  : ['last_7_days', 'last_30_days', 'last_90_days', 'last_month', '2026-04-01,2026-06-30']

type Diff = { path: string; live: unknown; bq: unknown; kind: 'MISMATCH' | 'TIE' | 'ORDER' }

// List items are matched by identity, not position: one restated lead re-ranks a list, and a
// positional diff turns that into dozens of lines. A different order of the same items is ORDER.
const ID_FIELDS = ['region', 'dma', 'bucket', 'week', 'date', 'key', 'name', 'ad', 'campaign', 'channel']
function idOf(x: unknown): string | null {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return null
  const o = x as Record<string, unknown>
  if (typeof o.keyword === 'string') return `${o.keyword}|${String(o.matchType ?? '')}`
  for (const f of ID_FIELDS) if (typeof o[f] === 'string') return `${f}=${o[f] as string}`
  return null
}

function diff(live: unknown, bq: unknown, path: string, out: Diff[]): number {
  if (typeof live === 'number' && typeof bq === 'number') {
    if (Number.isInteger(live) && Number.isInteger(bq)) { if (live !== bq) out.push({ path, live, bq, kind: 'MISMATCH' }); return 1 }
    const d = Math.abs(live - bq)
    if (d <= 0.005) return 1
    // A displayed toFixed value one step off is a rounding tie (LinkedIn note, accepted explanation 4).
    if (d <= 0.1 + 1e-9) { out.push({ path, live, bq, kind: 'TIE' }); return 1 }
    out.push({ path, live, bq, kind: 'MISMATCH' }); return 1
  }
  if (Array.isArray(live) && Array.isArray(bq)) {
    const liveIds = live.map(idOf), bqIds = bq.map(idOf)
    if (live.length && bq.length && [...liveIds, ...bqIds].every((i) => i !== null)) {
      const lm = new Map(live.map((x, i) => [liveIds[i]!, x])), bm = new Map(bq.map((x, i) => [bqIds[i]!, x]))
      let n = 0
      for (const id of new Set([...lm.keys(), ...bm.keys()])) {
        if (!lm.has(id) || !bm.has(id)) { out.push({ path: `${path}{${id}}`, live: lm.has(id) ? 'present' : 'absent', bq: bm.has(id) ? 'present' : 'absent', kind: 'MISMATCH' }); n++; continue }
        n += diff(lm.get(id), bm.get(id), `${path}{${id}}`, out)
      }
      const common = (ids: (string | null)[], other: Map<string, unknown>) => ids.filter((i) => other.has(i!)).join('\u0000')
      if (common(liveIds, bm) !== common(bqIds, lm)) out.push({ path: `${path}.order`, live: liveIds.slice(0, 5), bq: bqIds.slice(0, 5), kind: 'ORDER' })
      return n
    }
    if (live.length !== bq.length) out.push({ path: `${path}.length`, live: live.length, bq: bq.length, kind: 'MISMATCH' })
    let n = 0
    for (let i = 0; i < Math.min(live.length, bq.length); i++) n += diff(live[i], bq[i], `${path}[${i}]`, out)
    return n
  }
  if (live && bq && typeof live === 'object' && typeof bq === 'object') {
    let n = 0
    for (const k of new Set([...Object.keys(live), ...Object.keys(bq)])) n += diff((live as Record<string, unknown>)[k], (bq as Record<string, unknown>)[k], `${path}.${k}`, out)
    return n
  }
  if (live !== bq) out.push({ path, live, bq, kind: 'MISMATCH' })
  return 1
}

async function both<T>(flags: string[], fn: () => Promise<T>): Promise<{ live: T; bq: T; fellBack: string[] }> {
  for (const f of flags) process.env[f] = 'live'
  const live = await fn()
  const fellBack: string[] = []
  const warn = console.warn
  // A refusal for a range before AW_HISTORY_FROM is the designed behaviour (e.g. a compare period
  // reaching into Q1), not a failed BigQuery read, so it does not make the check NOT RUN.
  console.warn = (msg?: unknown) => {
    if (typeof msg !== 'string' || !msg.includes('"bq_fallback"')) return warn(msg)
    if (!msg.includes('history floor')) fellBack.push(msg)
  }
  for (const f of flags) process.env[f] = 'bq'
  // Since C3 a BigQuery miss on the range itself throws rather than serving live; that check did not run.
  try { return { live, bq: await fn(), fellBack } } catch (e) {
    fellBack.push(e instanceof Error ? e.message : String(e))
    return { live, bq: live, fellBack }
  } finally { console.warn = warn; for (const f of flags) process.env[f] = 'live' }
}

async function main() {
  const FLAGS: Record<Source, string[]> = {
    googleads: ['DATA_BACKEND_GOOGLEADS'],
    linkedin: ['DATA_BACKEND_LINKEDIN'],
    meta: ['DATA_BACKEND_META'],
  }
  const { googleads: AW, linkedin: LI, meta: META } = FLAGS
  // The trend blends every channel: with one source asked for, only that source switches to BigQuery.
  const TREND = only ? FLAGS[only] : [...AW, ...LI, ...META]
  let compared = 0, mismatches = 0, ties = 0, orders = 0, notRun = 0
  for (const r of RANGES) {
    const checks: Array<[string, Source | 'all', string[], () => Promise<unknown>]> = [
      ['paid-search.kpis', 'googleads', AW, () => getPaidSearchKpis(slug, r, r.startsWith(AW_HISTORY_FROM) ? null : 'previous_period')],
      ['paid-search.hero', 'googleads', AW, () => getHeroSeries(slug, r)],
      ['paid-search.campaigns', 'googleads', AW, () => getCampaignRows(slug, r)],
      ['paid-search.leads', 'googleads', AW, () => getLeadBreakdown(slug, r)],
      ['paid-search.geo', 'googleads', AW, () => getGeoRows(slug, r)],
      ['paid-search.keywords', 'googleads', AW, () => getKeywordsData(slug, r)],
      ['linkedin.kpis', 'linkedin', LI, () => getLinkedInKpis(slug, r, 'previous_period')],
      ['linkedin.creative', 'linkedin', LI, () => getCreativeTree(slug, r)],
      ['meta.kpis', 'meta', META, () => getMetaKpis(slug, r, 'previous_period')],
      ['meta.creative', 'meta', META, () => getMetaCreativeTree(slug, r)],
      ['meta.geo', 'meta', META, () => getMetaGeoData(slug, r, 'previous_period')],
      ['paid-media.trend', 'all', TREND, () => getPaidMediaTrend(slug, r)],
    ]
    for (const [name, source, flags, fn] of checks) {
      if (only && source !== 'all' && source !== only) continue
      const { live, bq, fellBack } = await both(flags, fn)
      if (fellBack.length) { notRun++; console.log(`NOT RUN  ${r}  ${name}  (BigQuery fell back: ${fellBack[0]})`); continue }
      const out: Diff[] = []
      compared += diff(live, bq, name, out)
      for (const d of out) {
        if (d.kind === 'TIE') ties++; else if (d.kind === 'ORDER') orders++; else mismatches++
        console.log(`${d.kind.padEnd(8)} ${r}  ${d.path}  live=${JSON.stringify(d.live)}  bq=${JSON.stringify(d.bq)}`)
      }
    }
  }
  const ok = mismatches === 0 && notRun === 0
  console.log(`${ok ? 'SHADOW OK' : 'SHADOW DIFFERS'}: ${compared} compared, ${mismatches} MISMATCH, ${ties} TIE, ${orders} ORDER, ${notRun} NOT RUN`)
  process.exit(ok ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(2) })
