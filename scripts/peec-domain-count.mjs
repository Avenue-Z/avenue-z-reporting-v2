// One-shot probe: how many domains does Peec /reports/domains return for the
// Avenue Z project? Mirrors lib/peec/client.ts:peecPost exactly.
// Run: node --env-file=.env.local scripts/peec-domain-count.mjs

const BASE_URL = 'https://api.peec.ai/customer/v1'
const key = process.env.PEEC_AI_CUSTOMER_TOKEN
const pid = process.env.PEEC_AI_PROJECT_ID
const yourBrand = (process.env.PEEC_AI_YOUR_BRAND ?? '').toLowerCase()

if (!key || !pid) {
  console.error('Missing PEEC_AI_CUSTOMER_TOKEN or PEEC_AI_PROJECT_ID')
  process.exit(1)
}

// Match the deployed app: last 30 days, like default range
const today = new Date()
const end = today.toISOString().slice(0, 10)
const startD = new Date(today)
startD.setDate(startD.getDate() - 30)
const start = startD.toISOString().slice(0, 10)

async function fetchDomains(limit) {
  const res = await fetch(`${BASE_URL}/reports/domains`, {
    method: 'POST',
    headers: { 'X-API-Key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      project_id: pid,
      start_date: start,
      end_date: end,
      limit,
    }),
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`Peec ${res.status}: ${t.slice(0, 300)}`)
  }
  return res.json()
}

function summarize(label, json) {
  const rows = json?.data ?? []
  console.log(`\n=== ${label} ===`)
  console.log(`  rows returned : ${rows.length}`)
  if (rows.length === 0) return
  console.log(`  sample row keys: ${Object.keys(rows[0]).join(', ')}`)
  const byClass = {}
  for (const r of rows) {
    const c = r.classification ?? '(no classification)'
    byClass[c] = (byClass[c] || 0) + 1
  }
  console.log(`  classification breakdown:`)
  Object.entries(byClass).sort((a,b)=>b[1]-a[1]).forEach(([k,v]) => console.log(`    ${k}: ${v}`))
  const competitorRows = rows.filter((r) => r.classification === 'Competitor')
  console.log(`  classification === 'Competitor': ${competitorRows.length}`)
  if (competitorRows.length > 0 && competitorRows.length <= 30) {
    competitorRows.forEach((r, i) => console.log(`    ${i + 1}. ${r.domain} (retrieved=${r.retrieved_percentage}, citations=${r.citation_count})`))
  }
}

console.log(`Date range: ${start} → ${end}`)
console.log(`Project   : ${pid}`)
console.log(`Your brand: ${yourBrand || '(unset)'}`)

for (const limit of [5000]) {
  try {
    const json = await fetchDomains(limit)
    summarize(`final-verify limit=${limit}`, json)
  } catch (e) {
    console.error(`limit=${limit} FAILED:`, e.message)
  }
}
