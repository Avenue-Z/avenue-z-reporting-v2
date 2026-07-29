// scripts/probe-m3-kpi-names.ts
export {} // module scope
// M3 GATE (platform subpages) — live by-post breakdown-KPI name diagnostic.
//   npx tsx --env-file=.env.local scripts/probe-m3-kpi-names.ts
//
// Read-only. Extends scripts/probe-m2-by-post-impressions.ts to the FULL per-platform
// breakdown-KPI set M3 introduces. Goal: confirm the real by-post metric name for every
// ★ cell in the M3 plan's KPI table before those names are written into PLATFORM_KPIS —
// the same discipline M2 used (metric names were mis-guessed twice; §3a).
//
// Why raw fetch: DashSocialClient throws "400 at <url>" without the body, and the body is
// where Dash names the offending metric. Auth/host are known-good (a 400, not 401, means
// the token works and only the params are wrong).
//
// BATCH CONTRACT (proven live 2026-07-29, PR #173 review #1): Dash 400s the WHOLE request
// if ANY requested metric is invalid for the channel — it does NOT drop the bad name and
// 200 with the rest. So the SINGLE-METRIC query is the definitive per-name classifier:
//   status=200 + a value  → the name is valid on the channel (confirmed by-post name)
//   status=400            → the name is invalid on the channel (rejected; body names it)
// We ALSO send each channel's confirmed set as one batch, to prove the shipped combination
// 200s together (never ship a batch nobody tested).

import { CHANNEL_LABEL } from '@/lib/organic-social/metrics'

const TOKEN = process.env.DASH_API_TOKEN
if (!TOKEN) { console.error('Missing DASH_API_TOKEN'); process.exit(1) }
const BRAND_ID = Number(process.env.PROBE_BRAND_ID ?? 26952)
const RANGE = process.env.PROBE_RANGE ?? '2026-06-22,2026-07-22'
const [s, e] = RANGE.split(',')
const start = `${s}T04:00:00Z`, end = `${e}T04:00:00Z`
// Dash requires a compare window (context_*) when require_posts is set — exactly what
// headlines.ts passes via resolveCompareIso. Prior equal-length window.
const lenMs = new Date(end).getTime() - new Date(start).getTime()
const ctxStart = new Date(new Date(start).getTime() - lenMs).toISOString().slice(0, 10) + 'T04:00:00Z'
const ctxEnd = start
const DASHBOARD = 'https://dashboard.dashsocial.com'

async function query(channel: string, metrics: string[]) {
  const q = new URLSearchParams({
    brand_ids: String(BRAND_ID), channels: channel, metrics: metrics.join(','),
    report_type: 'TOTAL_GROUPED_METRIC', start_date: start, end_date: end,
    context_start_date: ctxStart, context_end_date: ctxEnd,
    aggregate_by: 'BRAND', require_posts: 'true',
  })
  const res = await fetch(`${DASHBOARD}/reports/data?${q}`, {
    headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/json' },
  })
  const body = await res.text()
  let json: any = null
  try { json = JSON.parse(body) } catch { /* leave raw */ }
  const brand = json?.data?.[String(BRAND_ID)]?.metrics ?? {}
  const resolved: Record<string, unknown> = {}
  for (const m of metrics) if (m in brand) resolved[m] = brand[m]?.value ?? brand[m]
  return { status: res.status, ok: res.ok, resolved, rawSnippet: body.slice(0, 400) }
}

// Per ★ cell: the candidate names to test, most-preferred first (prefer _BY_POST when it
// resolves; fall back to the name that does). `expect` is the findings §6.2 acceptance value
// for the confirmed name (sanity check — data drifts, so name-resolves + value-sane is the test).
type Cell = { channel: string; key: string; label: string; candidates: string[]; expect?: number }
const CELLS: Cell[] = [
  // LINKEDIN — breakdown KPIs move all-posts → by-post (§6.3)
  { channel: 'LINKEDIN', key: 'reactions',    label: 'Reactions',     candidates: ['REACTIONS_BY_POST', 'REACTIONS_ALL_POSTS', 'REACTIONS'], expect: 262 },
  { channel: 'LINKEDIN', key: 'comments',     label: 'Comments',      candidates: ['COMMENTS_BY_POST', 'COMMENTS_ALL_POSTS', 'COMMENTS'], expect: 23 },
  { channel: 'LINKEDIN', key: 'shares',       label: 'Shares',        candidates: ['SHARES_BY_POST', 'SHARES_ALL_POSTS', 'SHARES'], expect: 18 },
  { channel: 'LINKEDIN', key: 'postClicks',   label: 'Post Clicks',   candidates: ['CLICKS_BY_POST', 'CLICKS_ALL_POSTS', 'CLICKS'], expect: 1183 },
  { channel: 'LINKEDIN', key: 'profileViews', label: 'Profile Views', candidates: ['PAGE_VIEWS_BY_POST', 'PAGE_VIEWS_ALL_POSTS'], expect: 972 },
  // TWITTER / X — bare names are basis-neutral; Profile *Clicks* not Views (decision 7)
  { channel: 'TWITTER', key: 'profileClicks', label: 'Profile Clicks', candidates: ['PROFILE_CLICKS', 'PROFILE_CLICKS_BY_POST'], expect: 0 },
  { channel: 'TWITTER', key: 'likes',         label: 'Likes',          candidates: ['LIKES', 'LIKES_BY_POST'], expect: 5 },
  { channel: 'TWITTER', key: 'replies',       label: 'Replies',        candidates: ['REPLIES', 'REPLIES_BY_POST'], expect: 2 },
  { channel: 'TWITTER', key: 'reposts',       label: 'Reposts',        candidates: ['RETWEETS', 'RETWEETS_BY_POST'], expect: 0 },
  { channel: 'TWITTER', key: 'linkClicks',    label: 'Link Clicks',    candidates: ['LINK_CLICKS', 'LINK_CLICKS_BY_POST'], expect: 0 },
  // FACEBOOK — no Profile Views (decision 7); footnote on engagements (decision 6)
  { channel: 'FACEBOOK', key: 'reactions',    label: 'Reactions',     candidates: ['REACTIONS', 'REACTIONS_BY_POST'], expect: 10 },
  { channel: 'FACEBOOK', key: 'comments',     label: 'Comments',      candidates: ['TOTAL_COMMENTS', 'COMMENTS_BY_POST'], expect: 0 },
  { channel: 'FACEBOOK', key: 'shares',       label: 'Shares',        candidates: ['SHARES', 'SHARES_BY_POST'], expect: 0 },
  { channel: 'FACEBOOK', key: 'postClicks',   label: 'Post Clicks',   candidates: ['POST_CLICKS', 'POST_CLICKS_BY_POST'], expect: 4 },
  // INSTAGRAM — already the by-post family; basis-neutral (§6.2 "IG needs no change"). Expect all 200.
  { channel: 'INSTAGRAM', key: 'profileViews', label: 'Profile Views', candidates: ['PROFILE_VIEWS'], expect: 62 },
  { channel: 'INSTAGRAM', key: 'likes',        label: 'Likes',         candidates: ['ORGANIC_LIKES'], expect: 29 },
  { channel: 'INSTAGRAM', key: 'comments',     label: 'Comments',      candidates: ['ORGANIC_COMMENTS'], expect: 0 },
  { channel: 'INSTAGRAM', key: 'shares',       label: 'Shares',        candidates: ['SHARES'], expect: 0 },
  { channel: 'INSTAGRAM', key: 'saves',        label: 'Saves',         candidates: ['SAVES'], expect: 1 },
  { channel: 'INSTAGRAM', key: 'reposts',      label: 'Reposts',       candidates: ['REPOSTS'], expect: 14 },
]

const CHANNEL_ORDER = ['INSTAGRAM', 'FACEBOOK', 'LINKEDIN', 'TWITTER'] as const

async function main() {
  console.log(`Brand ${BRAND_ID} · window ${RANGE}\n`)
  console.log('For each ★ KPI cell: the first candidate that returns status=200 with a value is the')
  console.log('confirmed by-post name. A 400 rejects the name (Dash names it in the body).\n')

  const confirmed: Record<string, Record<string, { name: string; value: unknown }>> = {}

  for (const channel of CHANNEL_ORDER) {
    const cells = CELLS.filter((c) => c.channel === channel)
    if (!cells.length) continue
    console.log(`===== ${CHANNEL_LABEL[channel as keyof typeof CHANNEL_LABEL]} (${channel}) =====`)
    confirmed[channel] = {}

    for (const cell of cells) {
      let pick: { name: string; value: unknown } | null = null
      const lines: string[] = []
      for (const name of cell.candidates) {
        const r = await query(channel, [name])
        if (r.ok && name in r.resolved) {
          const val = r.resolved[name]
          lines.push(`      ${name.padEnd(24)} status=200  value=${JSON.stringify(val)}`)
          if (!pick) pick = { name, value: val } // first (most-preferred) that resolves wins
        } else if (r.ok) {
          lines.push(`      ${name.padEnd(24)} status=200  (key ABSENT from payload)`)
        } else {
          lines.push(`      ${name.padEnd(24)} status=400  ${r.rawSnippet.slice(0, 140)}`)
        }
      }
      const acc = cell.expect != null && pick != null
        ? (Number(pick.value) === cell.expect ? '  ✅ matches §6.2'
           : `  ⚠️ §6.2 expected ~${cell.expect} (data drift ok if sane)`)
        : ''
      console.log(`  ${cell.key} (${cell.label}) → ${pick ? `CONFIRMED ${pick.name} = ${JSON.stringify(pick.value)}${acc}` : '❌ NO working name — STOP & consult Dash catalog (§3b)'}`)
      lines.forEach((l) => console.log(l))
      if (pick) confirmed[channel][cell.key] = pick
    }
    console.log('')
  }

  // Batch proof: send each channel's confirmed ★ names together — must 200 as one batch.
  console.log('===== BATCH PROOF · confirmed ★ names sent together per channel =====')
  for (const channel of CHANNEL_ORDER) {
    const names = Object.values(confirmed[channel] ?? {}).map((c) => c.name)
    if (!names.length) continue
    const r = await query(channel, names)
    const missing = names.filter((m) => !(m in r.resolved))
    console.log(`  ${CHANNEL_LABEL[channel as keyof typeof CHANNEL_LABEL].padEnd(10)} status=${r.status}  ` + (r.ok
      ? (missing.length ? `⚠️ MISSING ${JSON.stringify(missing)}` : `✅ all ${names.length} resolved together`)
      : `❌ 400 — body: ${r.rawSnippet.slice(0, 200)}`))
  }
  console.log('')

  // Machine-readable summary to paste into the plan's KPI table + the PR.
  console.log('===== CONFIRMED TABLE (paste into the M3 plan Task 2 + PR) =====')
  for (const channel of CHANNEL_ORDER) {
    for (const [key, c] of Object.entries(confirmed[channel] ?? {})) {
      console.log(`  ${channel.padEnd(10)} ${key.padEnd(14)} byPost = ${c.name.padEnd(24)} value=${JSON.stringify(c.value)}`)
    }
  }
}

main().catch((err) => { console.error(err); process.exit(1) })
