// scripts/verify-m2-basis.ts
export {} // module scope
// GATE 2 of M2 — end-to-end /verify of the basis flip. Read-only.
// Run from a machine WITH Dash access:
//   npx tsx --env-file=.env.local scripts/verify-m2-basis.ts
//
// For each channel it queries BOTH basis metric names directly (from PLATFORM_KPIS)
// for exposure + engagements, plus the by-post engagement daily series, so you see:
//   (a) MOVED:      X exposure and LinkedIn engagements differ all-posts vs by-post
//   (b) GRAPH==CARD: the by-post engagement daily series SUMS to the by-post
//                    engagement card (findings §7.1 — the bug fix riding along)
//   (c) UNCHANGED:  IG/FB exposure+engagements identical across bases
//
// Talks to DashSocialClient directly (token + brandId) — NOT dashClientFor, which
// is Next-cache-wrapped and throws "incrementalCache missing" in a plain script.

import { DashSocialClient } from '@/lib/dash-social/client'
import { CHANNELS, CHANNEL_LABEL, kpiFor } from '@/lib/organic-social/metrics'
import type { TotalMetric, GraphMetric } from '@/lib/dash-social/types'

const TOKEN = process.env.DASH_API_TOKEN
if (!TOKEN) { console.error('Missing DASH_API_TOKEN'); process.exit(1) }

const BRAND_ID = Number(process.env.PROBE_BRAND_ID ?? 26952)
const RANGE = process.env.PROBE_RANGE ?? '2026-06-22,2026-07-22'

const tz = (d: string) => `${d}T04:00:00Z`
const [startRaw, endRaw] = RANGE.split(',')
const start = tz(startRaw)
const end = tz(endRaw)
// Dash requires a compare window when require_posts is set (see probe script). Prior equal window.
const lenMs = new Date(end).getTime() - new Date(start).getTime()
const ctxStart = new Date(new Date(start).getTime() - lenMs).toISOString().slice(0, 10) + 'T04:00:00Z'
const ctxEnd = start
const key = String(BRAND_ID)

type GraphData = { metrics?: Record<string, GraphMetric> }
const client = new DashSocialClient({ token: TOKEN })

async function main() {
  console.log(`Brand ${BRAND_ID} · window ${RANGE}\n`)

  for (const channel of CHANNELS) {
    const exposure = kpiFor(channel, 'exposure')
    const engagements = kpiFor(channel, 'engagements')
    const names = Array.from(new Set([
      exposure.metric.allPosts, exposure.metric.byPost,
      engagements.metric.allPosts, engagements.metric.byPost,
    ]))
    const res = await client.getReportsData<TotalMetric>({
      brandId: BRAND_ID, channels: [channel], reportType: 'TOTAL_GROUPED_METRIC',
      aggregateBy: 'BRAND', requirePosts: true, metrics: names, startDate: start, endDate: end,
      contextStartDate: ctxStart, contextEndDate: ctxEnd,
    })
    const m = res.data?.[key]?.metrics ?? {}
    const val = (name: string) => m[name]?.value ?? null

    const g = await client.getReportsData<GraphMetric>({
      brandId: BRAND_ID, channels: [channel], reportType: 'GRAPH', timeScale: 'DAILY',
      metrics: [engagements.metric.byPost], startDate: start, endDate: end,
    })
    const daily = (g.data as GraphData).metrics?.[engagements.metric.byPost]?.ALL_CHANNELS ?? {}
    const graphSum = Object.values(daily).reduce((s: number, v) => s + (typeof v === 'number' ? v : 0), 0)

    const expMoved = exposure.metric.allPosts !== exposure.metric.byPost
    const engMoved = engagements.metric.allPosts !== engagements.metric.byPost
    const cardByPost = val(engagements.metric.byPost)

    console.log(`${CHANNEL_LABEL[channel]} (${channel})`)
    console.log(`  exposure   all-posts=${val(exposure.metric.allPosts)}  by-post=${val(exposure.metric.byPost)}  ${expMoved ? '← MOVED' : '(unchanged name)'}`)
    console.log(`  engagements all-posts=${val(engagements.metric.allPosts)}  by-post=${cardByPost}  ${engMoved ? '← MOVED' : '(unchanged name)'}`)
    console.log(`  engagement graph sum (by-post)=${graphSum}  ${graphSum === cardByPost ? '✅ == card' : '❌ != card (' + cardByPost + ')'}`)
    console.log('')
  }

  console.log('EXPECT: X exposure & LinkedIn engagements show "MOVED"; every channel graph sum == card;')
  console.log('        Instagram/Facebook show "unchanged name". Followers/NetNew/EngRate are basis-neutral (not queried here).')
}

main().catch((e) => { console.error(e); process.exit(1) })
