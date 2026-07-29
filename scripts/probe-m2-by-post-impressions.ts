// scripts/probe-m2-by-post-impressions.ts
export {} // module scope
// GATE 1 of M2 (reporting-basis migration) — live metric-name diagnostic.
//   npx tsx --env-file=.env.local scripts/probe-m2-by-post-impressions.ts
//
// Read-only. Raw fetch (so we can print Dash's 400 BODY) replicating the exact URL
// lib/dash-social/client.ts builds. Goal: discover the real by-post metric names
// for X & LinkedIn exposure/engagements before trusting the M2b flip.
//
// Why raw fetch: DashSocialClient throws "400 at <url>" without the body, and the
// body is where Dash names the offending metric. Auth/host are already known-good
// (a 400, not 401, means the token works and only the params are wrong).
//
// BATCH CONTRACT (proven live 2026-07-29, PR #173 review #1): Dash 400s the WHOLE
// request if ANY requested metric is invalid for the channel — it does NOT drop the
// bad name and 200 with the rest. Evidence: the candidate superset below (valid names
// + one invalid) returns status=400 naming the offending metric. This is why
// headlines.ts wraps each channel in try/catch (a bad name ⇒ the channel's whole batch
// 400s ⇒ the channel drops on Overview / errors when scoped) rather than risking a
// silent 0. Step 0 below re-proves this contract each run; Step 1 runs the EXACT
// five-name production batch so we never ship a combination nobody tested.

import { OVERVIEW_KPI_KEYS, metricForKey, REPORTING_BASIS, CHANNELS, CHANNEL_LABEL } from '@/lib/organic-social/metrics'

const TOKEN = process.env.DASH_API_TOKEN
if (!TOKEN) { console.error('Missing DASH_API_TOKEN'); process.exit(1) }
const BRAND_ID = Number(process.env.PROBE_BRAND_ID ?? 26952)
const RANGE = process.env.PROBE_RANGE ?? '2026-06-22,2026-07-22'
const [s, e] = RANGE.split(',')
const start = `${s}T04:00:00Z`, end = `${e}T04:00:00Z`
// Dash requires a compare window (context_*) when require_posts/include_data is set —
// exactly what headlines.ts passes via resolveCompareIso. Prior equal-length window.
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
  // Which requested metrics actually came back with a value on the brand entry?
  // Response shape: { data: { "<brandId>": { metrics: { METRIC: {value,...} } } } } (types.ts).
  const brand = json?.data?.[String(BRAND_ID)]?.metrics ?? {}
  const resolved: Record<string, unknown> = {}
  for (const m of metrics) if (m in brand) resolved[m] = brand[m]?.value ?? brand[m]
  return { status: res.status, ok: res.ok, resolved, rawSnippet: body.slice(0, 400) }
}

// Shipped known-good combo (headlines.ts) + every by-post candidate to test in one batch.
const SHIPPED: Record<string, string[]> = {
  TWITTER:  ['TOTAL_FOLLOWERS', 'NET_NEW_FOLLOWERS', 'IMPRESSIONS', 'TOTAL_ENGAGEMENTS', 'AVG_ENGAGEMENT_RATE'],
  LINKEDIN: ['TOTAL_FOLLOWERS', 'NET_NEW_FOLLOWERS', 'IMPRESSIONS', 'ENGAGEMENTS', 'AVG_ENGAGEMENT_RATE'],
}
// Candidate by-post names to probe (superset — Dash returns only the valid ones if it drops-on-batch).
const CANDIDATES: Record<string, string[]> = {
  TWITTER:  ['IMPRESSIONS', 'IMPRESSIONS_BY_POST', 'IMPRESSIONS_ALL_POSTS', 'IMPRESSIONS_POSTS',
             'TOTAL_ENGAGEMENTS', 'TOTAL_ENGAGEMENTS_POSTS'],
  LINKEDIN: ['IMPRESSIONS', 'IMPRESSIONS_BY_POST', 'IMPRESSIONS_ALL_POSTS', 'IMPRESSIONS_POSTS',
             'ENGAGEMENTS', 'ENGAGEMENTS_BY_POST'],
}

async function main() {
  console.log(`Brand ${BRAND_ID} · window ${RANGE}  ·  active basis = ${REPORTING_BASIS}\n`)

  // STEP 0 — prove the batch contract (PR #173 review #1). Send known-valid names +
  // one guaranteed-invalid sentinel. 400 ⇒ Dash rejects the WHOLE batch (headlines.ts's
  // catch is correct); 200-with-the-valid-ones-resolved ⇒ Dash drops-and-200 (the
  // silent-zero risk would be real and headlines.ts would need a presence check).
  console.log('===== STEP 0 · batch contract (invalid metric in a batch) =====')
  const contract = await query('TWITTER',
    ['TOTAL_FOLLOWERS', 'IMPRESSIONS', '__DEFINITELY_NOT_A_METRIC__'])
  const validResolvedDespiteBad = 'IMPRESSIONS' in contract.resolved
  console.log(`  status=${contract.status}  ` + (contract.ok
    ? `→ 200: Dash DROPPED the bad name and returned the valid ones (${JSON.stringify(contract.resolved)}). DROP-AND-200 contract.`
    : `→ 400: Dash REJECTED the whole batch. body: ${contract.rawSnippet.slice(0, 160)}`))
  console.log(`  VERDICT: ${contract.ok && validResolvedDespiteBad
    ? 'DROP-AND-200 — headlines.ts needs a presence check; a missing metric must not render 0.'
    : 'WHOLE-BATCH-400 — an invalid name 400s the channel; headlines.ts try/catch drops it (no silent 0 from a bad name).'}\n`)

  // STEP 1 — the EXACT five-name production batch per channel (PR #173 review #2).
  // This is literally what headlines.ts sends: OVERVIEW_KPI_KEYS resolved through the
  // ACTIVE basis. If any channel here 400s, production would drop that channel.
  console.log('===== STEP 1 · exact production 5-metric batch (active basis) =====')
  for (const channel of CHANNELS) {
    const prod = OVERVIEW_KPI_KEYS.map((k) => metricForKey(channel, k))
    const r = await query(channel, prod)
    const missing = prod.filter((m) => !(m in r.resolved))
    console.log(`  ${CHANNEL_LABEL[channel].padEnd(10)} status=${r.status}  ` + (r.ok
      ? (missing.length ? `⚠️ 200 but MISSING ${JSON.stringify(missing)} — ${JSON.stringify(r.resolved)}`
                        : `✅ all 5 resolved — ${JSON.stringify(r.resolved)}`)
      : `❌ 400 — production would DROP this channel. body: ${r.rawSnippet.slice(0, 200)}`))
  }
  console.log('')

  for (const channel of ['TWITTER', 'LINKEDIN'] as const) {
    console.log(`===== ${channel} =====`)

    // 1) Does the SHIPPED 5-metric request 200? (Confirms request shape / window / token are fine.)
    const shipped = await query(channel, SHIPPED[channel])
    console.log(`[shipped 5-metric combo] status=${shipped.status}`)
    if (shipped.ok) console.log(`  resolved: ${JSON.stringify(shipped.resolved)}`)
    else console.log(`  body: ${shipped.rawSnippet}`)

    // 2) Superset of candidates in ONE batch — read back which names Dash honors.
    const sup = await query(channel, CANDIDATES[channel])
    console.log(`[candidate superset] status=${sup.status}`)
    if (sup.ok) console.log(`  RESOLVED NAMES → ${JSON.stringify(sup.resolved)}`)
    else console.log(`  body: ${sup.rawSnippet}`)

    // 3) Each candidate ALONE — a 400 body names the bad metric; a 200 proves the name.
    for (const m of CANDIDATES[channel]) {
      const one = await query(channel, [m])
      const val = one.ok ? JSON.stringify(one.resolved[m] ?? null) : `400 · ${one.rawSnippet.slice(0, 160)}`
      console.log(`  ${m.padEnd(24)} status=${one.status}  ${one.ok ? 'value=' + val : val}`)
    }
    console.log('')
  }
  console.log('READ: whichever names return status=200 with a real value (esp. in the superset) are the')
  console.log('      correct by-post metric ids. Update metrics.ts + metrics.test.ts EXPECTED to match, then re-run.')
}

main().catch((err) => { console.error(err); process.exit(1) })
