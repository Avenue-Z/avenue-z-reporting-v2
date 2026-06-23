// scripts/dash-social-probe.ts
// Run: npx tsx --env-file=../dash-social-connection/.env scripts/dash-social-probe.ts <brandId>
// Throwaway: confirms metric availability + captures fixtures for the
// organic-social transform tests. Delete after Task 1.
import { writeFileSync, mkdirSync } from 'node:fs'

const token = process.env.DASH_API_TOKEN
if (!token) throw new Error('DASH_API_TOKEN missing')
const brandId = Number(process.argv[2])
if (!brandId) throw new Error('usage: dash-social-probe.ts <brandId>')

const H = { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' }
// ~30d window with a prior context window for TOTAL_METRIC deltas.
const start = '2026-05-24', today = '2026-06-23'
const ctxStart = '2026-04-24', ctxEnd = '2026-05-23'

async function reports(params: Record<string, string>) {
  const u = new URL('https://dashboard.dashsocial.com/reports/data')
  Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v))
  const r = await fetch(u, { headers: H })
  return { status: r.status, body: (await r.json().catch(() => null)) as unknown }
}

async function main() {
mkdirSync('lib/organic-social/__fixtures__', { recursive: true })

// 1. Probe candidate metric names on INSTAGRAM (confirm Comments/Shares/Saves/Likes ids).
const candidates = [
  'TOTAL_FOLLOWERS', 'NET_NEW_FOLLOWERS', 'IMPRESSIONS', 'TOTAL_ENGAGEMENTS', 'PROFILE_VIEWS',
  'COMMENTS', 'SHARES', 'SAVES', 'LIKES', 'REACTIONS', 'ACCOUNTS_REACHED', 'EFFECTIVENESS',
]
for (const m of candidates) {
  const { status, body } = await reports({
    channels: 'INSTAGRAM', brand_ids: String(brandId), metrics: m,
    report_type: 'TOTAL_METRIC', start_date: start, end_date: today,
    context_start_date: ctxStart, context_end_date: ctxEnd,
  })
  console.log(`metric ${m}: ${status}${status === 200 ? ' OK' : ' ' + JSON.stringify(body).slice(0, 140)}`)
}

// 2. Capture fixtures (the confirmed-good metric set).
const good = 'TOTAL_FOLLOWERS,NET_NEW_FOLLOWERS,IMPRESSIONS,TOTAL_ENGAGEMENTS,PROFILE_VIEWS'
const channels = 'INSTAGRAM,FACEBOOK,TWITTER'
const total = await reports({
  channels, brand_ids: String(brandId), metrics: good, report_type: 'TOTAL_METRIC',
  start_date: start, end_date: today, context_start_date: ctxStart, context_end_date: ctxEnd,
})
const graph = await reports({
  channels, brand_ids: String(brandId), metrics: 'TOTAL_FOLLOWERS,TOTAL_ENGAGEMENTS',
  report_type: 'GRAPH', time_scale: 'DAILY', start_date: start, end_date: today,
})
const mediaRes = await fetch(`https://library-backend.dashsocial.com/brands/${brandId}/media/v2`, {
  method: 'PUT', headers: H, body: JSON.stringify({ start_date: start, end_date: today, limit: 25 }),
})
const media = await mediaRes.json().catch(() => null)

console.log(`\nreports TOTAL: ${total.status}, GRAPH: ${graph.status}, media/v2: ${mediaRes.status}`)
writeFileSync('lib/organic-social/__fixtures__/reports-total.json', JSON.stringify(total.body, null, 2))
writeFileSync('lib/organic-social/__fixtures__/reports-graph.json', JSON.stringify(graph.body, null, 2))
writeFileSync('lib/organic-social/__fixtures__/media-v2.json', JSON.stringify(media, null, 2))
console.log('fixtures written to lib/organic-social/__fixtures__/')

// 3. Dump the top-level shape of each response so we can finalize types.
const shape = (o: unknown): string => (o && typeof o === 'object' ? JSON.stringify(Object.keys(o as object)) : typeof o)
console.log('\nshapes:')
console.log('  reports-total top keys:', shape(total.body))
console.log('  reports-graph top keys:', shape(graph.body))
console.log('  media-v2 top keys:', shape(media))
}

main().catch((e) => { console.error(e); process.exit(1) })
