// Run: CACHE_DISABLE=1 npx tsx --env-file=.env.local scripts/bq-shadow-compare.ts renaissance
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

const slug = process.argv[2]
if (!slug) throw new Error('usage: bq-shadow-compare.ts <client-slug>')
process.env.BQ_CLIENTS = slug

// Ranges > 31 days exercise the ISO-week (Yearweekiso) path. None may start before AW_HISTORY_FROM
// (2026-04-01), or the Google Ads checks fall back to live and read NOT RUN.
const RANGES = ['last_7_days', 'last_30_days', 'last_90_days', 'last_month', '2026-04-01,2026-06-30']

type Diff = { path: string; live: unknown; bq: unknown; kind: 'MISMATCH' | 'TIE' }

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
  console.warn = (msg?: unknown) => { if (typeof msg === 'string' && msg.includes('"bq_fallback"')) fellBack.push(msg); else warn(msg) }
  for (const f of flags) process.env[f] = 'bq'
  try { return { live, bq: await fn(), fellBack } } finally { console.warn = warn; for (const f of flags) process.env[f] = 'live' }
}

async function main() {
  const AW = ['DATA_BACKEND_GOOGLEADS']
  const LI = ['DATA_BACKEND_LINKEDIN']
  let compared = 0, mismatches = 0, ties = 0, notRun = 0
  for (const r of RANGES) {
    const checks: Array<[string, string[], () => Promise<unknown>]> = [
      ['paid-search.kpis', AW, () => getPaidSearchKpis(slug, r, 'previous_period')],
      ['paid-search.hero', AW, () => getHeroSeries(slug, r)],
      ['paid-search.campaigns', AW, () => getCampaignRows(slug, r)],
      ['paid-search.leads', AW, () => getLeadBreakdown(slug, r)],
      ['paid-search.geo', AW, () => getGeoRows(slug, r)],
      ['paid-search.keywords', AW, () => getKeywordsData(slug, r)],
      ['linkedin.kpis', LI, () => getLinkedInKpis(slug, r, 'previous_period')],
      ['linkedin.creative', LI, () => getCreativeTree(slug, r)],
      ['paid-media.trend', [...AW, ...LI], () => getPaidMediaTrend(slug, r)],
    ]
    for (const [name, flags, fn] of checks) {
      const { live, bq, fellBack } = await both(flags, fn)
      if (fellBack.length) { notRun++; console.log(`NOT RUN  ${r}  ${name}  (BigQuery fell back: ${fellBack[0]})`); continue }
      const out: Diff[] = []
      compared += diff(live, bq, name, out)
      for (const d of out) {
        if (d.kind === 'TIE') ties++; else mismatches++
        console.log(`${d.kind.padEnd(8)} ${r}  ${d.path}  live=${JSON.stringify(d.live)}  bq=${JSON.stringify(d.bq)}`)
      }
    }
  }
  const ok = mismatches === 0 && notRun === 0
  console.log(`${ok ? 'SHADOW OK' : 'SHADOW DIFFERS'}: ${compared} compared, ${mismatches} MISMATCH, ${ties} TIE, ${notRun} NOT RUN`)
  process.exit(ok ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(2) })
