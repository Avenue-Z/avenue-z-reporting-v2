// scripts/probe-peec-urls-agents.ts
export {} // module scope
// Run: npx tsx --env-file=.env.local scripts/probe-peec-urls-agents.ts
// Read-only. Confirms the real response shapes of /reports/urls and
// /agent-analytics/visits (+ /bots) before we wire them, since the existing
// agent-analytics comment about /visits looked stale vs the current docs.

const BASE = 'https://api.peec.ai/customer/v1'
const KEY = process.env.PEEC_AI_CUSTOMER_TOKEN
// Real project IDs live in scripts/seed.ts; allow env override.
const PID = process.env.PEEC_AI_PROJECT_ID ?? 'or_043ae735-9397-48cf-a754-6e346a55f394'

function iso(d: Date) { return d.toISOString().slice(0, 10) }
function last30() {
  const end = new Date()
  const start = new Date(end); start.setDate(start.getDate() - 29)
  return { start_date: iso(start), end_date: iso(end) }
}

async function post(path: string, body: Record<string, unknown>) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'X-API-Key': KEY!, 'Content-Type': 'application/json' },
    body: JSON.stringify({ project_id: PID, ...body }),
  })
  const txt = await res.text()
  let json: unknown = null
  try { json = JSON.parse(txt) } catch { /* leave raw */ }
  return { status: res.status, ok: res.ok, json, txt }
}

async function get(path: string, params: Array<[string, string]>) {
  const url = new URL(`${BASE}${path}`)
  url.searchParams.set('project_id', PID)
  for (const [k, v] of params) url.searchParams.append(k, v)
  const res = await fetch(url.toString(), { headers: { 'X-API-Key': KEY! } })
  const txt = await res.text()
  let json: unknown = null
  try { json = JSON.parse(txt) } catch { /* leave raw */ }
  return { status: res.status, ok: res.ok, json, txt, url: url.toString() }
}

function rows(j: unknown): Record<string, unknown>[] {
  const d = (j as { data?: unknown })?.data
  return Array.isArray(d) ? (d as Record<string, unknown>[]) : []
}

async function main() {
  if (!KEY) { console.log('Missing PEEC_AI_CUSTOMER_TOKEN'); process.exit(1) }
  console.log('project_id =', PID, '\n')
  const window = last30()

  // 1) /reports/urls — plain + a few dimension variations
  for (const dims of [undefined, ['model_channel_id'], ['tag_id'], ['prompt_id']] as (string[] | undefined)[]) {
    const r = await post('/reports/urls', { ...window, limit: 3, ...(dims ? { dimensions: dims } : {}) })
    const tag = dims ? `dimensions=${JSON.stringify(dims)}` : 'no dimensions'
    console.log(`--- POST /reports/urls (${tag}) -> ${r.status}`)
    if (!r.ok) { console.log('   err:', r.txt.slice(0, 300)); continue }
    const rs = rows(r.json)
    console.log('   totalCount:', (r.json as { totalCount?: number })?.totalCount)
    console.log('   row keys:', Object.keys(rs[0] ?? {}))
    console.log('   sample row:', JSON.stringify(rs[0] ?? {}, null, 2), '\n')
  }

  // 2) /agent-analytics/visits — group_by bot_id + request_path, daily
  const v = await get('/agent-analytics/visits', [
    ['start_date', window.start_date], ['end_date', window.end_date],
    ['group_by', 'bot_id'], ['group_by', 'request_path'],
    ['time_bucket', 'day'], ['limit', '5'],
  ])
  console.log(`--- GET /agent-analytics/visits (group_by bot_id+request_path, day) -> ${v.status}`)
  console.log('   url:', v.url)
  if (v.ok) {
    const rs = rows(v.json)
    console.log('   totalCount:', (v.json as { totalCount?: number })?.totalCount)
    console.log('   row keys:', Object.keys(rs[0] ?? {}))
    console.log('   sample rows:', JSON.stringify(rs.slice(0, 3), null, 2), '\n')
  } else { console.log('   err:', v.txt.slice(0, 300), '\n') }

  // 3) /agent-analytics/bots — confirm id/provider/type
  const b = await get('/agent-analytics/bots', [])
  console.log(`--- GET /agent-analytics/bots -> ${b.status}`)
  if (b.ok) {
    const arr = Array.isArray(b.json) ? (b.json as unknown[]) : rows(b.json)
    console.log('   count:', arr.length)
    console.log('   sample:', JSON.stringify(arr.slice(0, 3), null, 2))
  } else { console.log('   err:', b.txt.slice(0, 300)) }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
