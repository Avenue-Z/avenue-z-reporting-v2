// scripts/probe-aeo-topics.ts
export {} // module scope: keep top-level `main` out of the global script namespace
// Run: npx tsx --env-file=.env.local scripts/probe-aeo-topics.ts
// Read-only. Prints which fields Peec/Profound expose so we can group
// tracked prompts by real topics instead of keyword inference.

async function probePeec() {
  const key = process.env.PEEC_AI_CUSTOMER_TOKEN
  const pid = process.env.PEEC_AI_PROJECT_ID
  if (!key) return console.log('[peec] no PEEC_AI_CUSTOMER_TOKEN — skipped')
  const today = new Date().toISOString().slice(0, 10)
  const res = await fetch('https://api.peec.ai/customer/v1/queries/search', {
    method: 'POST',
    headers: { 'X-API-Key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...(pid ? { project_id: pid } : {}), start_date: `${today.slice(0, 4)}-01-01`, end_date: today, limit: 5 }),
  })
  const body = await res.json()
  console.log('[peec] /queries/search row keys:', Object.keys(body.data?.[0] ?? {}))
  console.log('[peec] sample row:', JSON.stringify(body.data?.[0] ?? {}, null, 2))
  // Also probe a topics endpoint if it exists:
  const t = await fetch('https://api.peec.ai/customer/v1/topics' + (pid ? `?project_id=${pid}` : ''), { headers: { 'X-API-Key': key } })
  console.log('[peec] /topics status:', t.status, t.ok ? JSON.stringify(await t.json()).slice(0, 400) : '')
}

async function probeProfound() {
  const key = process.env.PROFOUND_AI_ACCESS_TOKEN
  const categoryId = process.env.PROFOUND_CATEGORY_ID
  if (!key) return console.log('[profound] no PROFOUND_AI_ACCESS_TOKEN — skipped')
  const today = new Date().toISOString().slice(0, 10)
  const base = { category_id: categoryId, start_date: `${today.slice(0, 4)}-01-01`, end_date: today, pagination: { limit: 5 } }
  // Try a 'topic' dimension on the visibility report:
  for (const dims of [['topic'], ['prompt', 'topic']]) {
    const res = await fetch('https://api.tryprofound.com/v1/reports/visibility', {
      method: 'POST',
      headers: { 'X-API-Key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...base, metrics: ['visibility_score'], dimensions: dims }),
    })
    console.log(`[profound] dimensions=${JSON.stringify(dims)} status:`, res.status)
    if (res.ok) console.log('  sample:', JSON.stringify((await res.json()).data?.slice(0, 3) ?? []))
    else console.log('  err:', (await res.text()).slice(0, 200))
  }
}

async function main() {
  await probePeec()
  await probeProfound()
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err)
  process.exit(1)
})
