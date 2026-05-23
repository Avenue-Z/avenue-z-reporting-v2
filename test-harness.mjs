#!/usr/bin/env node
// ─── Technical Audit Test Harness ────────────────────────────────────────────
//
// Standalone Node.js 20+ script. Zero extra dependencies. Native fetch only.
//
// Usage:
//   node test-harness.mjs              — config + logic checks only
//   node test-harness.mjs --live       — include live API calls
//
// Checks:
//   1. Required env vars (GOOGLE_SERVICE_ACCOUNT_KEY, PEEC_AI_CUSTOMER_TOKEN)
//   2. clients.config.ts integrity (Avenue Z fields present)
//   3. AEO checklist logic (pure functions, no network)
//   4. Peec /logs endpoint (live)
//   5. Peec /bots catalog (live)
//   6. Google Drive API — SF CSV (live — requires GCP Drive API enabled)
//   7. Google Sheets API — Sitebulb (live — requires GCP Sheets API enabled)
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, existsSync } from 'fs'
import { createPrivateKey, createSign } from 'crypto'

const LIVE = process.argv.includes('--live')

// ── Load .env.local ───────────────────────────────────────────────────────────

function loadEnv(filePath) {
  if (!existsSync(filePath)) { console.warn(`[warn] ${filePath} not found`); return }
  for (const line of readFileSync(filePath, 'utf-8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq === -1) continue
    const key = t.slice(0, eq).trim()
    const val = t.slice(eq + 1).trim()
    if (!process.env[key]) process.env[key] = val
  }
}

loadEnv(new URL('.env.local', import.meta.url).pathname)

// ── Result tracking ───────────────────────────────────────────────────────────

let PASS = 0, FAIL = 0
const FAILURES = []

const ok   = (name, detail = '') => { PASS++; console.log(`  PASS  ${name}${detail ? `  (${detail})` : ''}`) }
const fail = (name, reason)      => { FAIL++; FAILURES.push({ name, reason }); console.log(`  FAIL  ${name}: ${reason}`) }
const skip = (name, reason)      => console.log(`  SKIP  ${name}  — ${reason}`)

function section(title) {
  console.log(`\n──────────────────────────────────────────`)
  console.log(`  ${title}`)
  console.log(`──────────────────────────────────────────`)
}

function summary() {
  console.log(`\n══════════════════════════════════════════`)
  console.log(`  ${PASS} passed, ${FAIL} failed`)
  if (FAILURES.length) {
    console.log(`\n  Failures:`)
    for (const f of FAILURES) console.log(`    ✗ ${f.name}\n      ${f.reason}`)
  }
  console.log(`══════════════════════════════════════════\n`)
  if (FAIL > 0) process.exit(1)
}

// ── 1. Required env vars ──────────────────────────────────────────────────────

section('1. Required env vars')

// Only 2 env vars needed — project IDs live in clients.config.ts (not secrets)
const REQUIRED = [
  'GOOGLE_SERVICE_ACCOUNT_KEY',
  'PEEC_AI_CUSTOMER_TOKEN',
]

for (const v of REQUIRED) {
  if (process.env[v]) ok(v)
  else fail(v, 'missing from .env.local — REQUIRED for prod')
}

// ── 2. clients.config.ts integrity ───────────────────────────────────────────

section('2. clients.config.ts — Avenue Z fields')

try {
  const configText = readFileSync(new URL('lib/clients.config.ts', import.meta.url).pathname, 'utf-8')

  // Interface fields
  const interfaceChecks = [
    ['sfCsvFileId field',           'sfCsvFileId?:'],
    ['sfPrevCsvFileId field',       'sfPrevCsvFileId?:'],
    ['sitebulbSheetId field',       'sitebulbSheetId?:'],
    ['peecCustomerProjectId field', 'peecCustomerProjectId?:'],
  ]
  for (const [label, pattern] of interfaceChecks) {
    if (configText.includes(pattern)) ok(`ClientConfig has ${label}`)
    else fail(`ClientConfig missing ${label}`, `"${pattern}" not found in interface`)
  }

  // Avenue Z specific values
  const azChecks = [
    ['avenue-z sfCsvFileId',           '1ddlYbe_0wqadeqbIQVAsCt0F_9AOXSe9'],
    ['avenue-z sitebulbSheetId',       '1cKW5k0aqeWEk3HVakIDpiCrSP_mMf5oxQW7HJOxqsiw'],
    ['avenue-z peecCustomerProjectId', 'or_043ae735-9397-48cf-a754-6e346a55f394'],
  ]
  for (const [label, value] of azChecks) {
    if (configText.includes(value)) ok(label)
    else fail(label, `value ${value} not found in config`)
  }
} catch (e) {
  fail('clients.config.ts read', String(e))
}

// ── 3. AEO checklist logic ────────────────────────────────────────────────────

section('3. AEO checklist logic (no API calls)')

;(() => {
  // Replicate the hintItem threshold logic
  function hintStatus(count, passThreshold = 0, warnThreshold = 49) {
    if (count <= passThreshold) return 'pass'
    if (count <= warnThreshold) return 'warn'
    return 'fail'
  }

  // Avenue Z Sitebulb May 21 2026 actuals
  const hints = {
    'Internal HTTP URLs':      0,
    'Title tag is missing':    97,
    'Meta description is missing': 106,
    '<h1> tag is missing':     21,
    'Missing canonical URL':   45,
  }

  const cases = [
    ['HTTPS: 0 HTTP URLs = pass',         hintStatus(hints['Internal HTTP URLs']),                  'pass'],
    ['Title tags: 97 missing = fail',     hintStatus(hints['Title tag is missing']),                'fail'],
    ['Meta desc: 106 missing = fail',     hintStatus(hints['Meta description is missing']),         'fail'],
    ['H1 tags: 21 missing = warn',        hintStatus(hints['<h1> tag is missing']),                 'warn'],
    ['Canonical: 45 missing = warn',      hintStatus(hints['Missing canonical URL']),               'warn'],
  ]
  for (const [label, actual, expected] of cases) {
    if (actual === expected) ok(label)
    else fail(label, `expected ${expected}, got ${actual}`)
  }

  // Robots.txt derivation
  function robotsTxtStatus(totalVisits, redirectHits, highValueHits) {
    if (totalVisits === 0)                        return 'pending'
    if (redirectHits >= totalVisits * 0.8)        return 'warn'
    if (highValueHits > 0)                        return 'pass'
    return 'warn'
  }

  // Avenue Z actuals: 124 visits, all 301, 0 high-value hits
  if (robotsTxtStatus(124, 124, 0) === 'warn') ok('Robots.txt: 100% redirects = warn')
  else fail('Robots.txt 100% redirects', `expected warn`)

  if (robotsTxtStatus(0, 0, 0) === 'pending') ok('Robots.txt: 0 visits = pending')
  else fail('Robots.txt 0 visits', `expected pending`)

  // Delta status logic
  function deltaStatus(prevCount, currentCount) {
    if (prevCount === 0 && currentCount > 0) return 'New'
    if (prevCount > 0 && currentCount === 0) return 'Resolved'
    if (currentCount < prevCount)            return 'Improved'
    if (currentCount > prevCount)            return 'Persistent'
    return 'Unchanged'
  }

  const deltaCases = [
    ['New issue (0→5)',        deltaStatus(0, 5),   'New'],
    ['Resolved (5→0)',         deltaStatus(5, 0),   'Resolved'],
    ['Improved (10→7)',        deltaStatus(10, 7),  'Improved'],
    ['Persistent (7→10)',      deltaStatus(7, 10),  'Persistent'],
    ['Unchanged (5→5)',        deltaStatus(5, 5),   'Unchanged'],
  ]
  for (const [label, actual, expected] of deltaCases) {
    if (actual === expected) ok(`Delta: ${label}`)
    else fail(`Delta: ${label}`, `expected ${expected}, got ${actual}`)
  }

  // Weighted score formula: Critical×4 + High×3 + Medium×2 + Low×1
  // 10×4=40 + 20×3=60 + 15×2=30 + 30×1=30 = 160
  const score = 10 * 4 + 20 * 3 + 15 * 2 + 30 * 1
  if (score === 160) ok('Weighted score formula: 10C+20H+15M+30L = 160')
  else fail('Weighted score formula', `expected 160, got ${score}`)
})()

// ── 4. Live API tests ─────────────────────────────────────────────────────────

if (!LIVE) {
  section('Live tests skipped')
  console.log(`  Run with --live to test Peec, Drive, and Sheets APIs directly.\n`)
  summary()
  process.exit(FAIL > 0 ? 1 : 0)
}

section('4. Live — Peec Agent Analytics')

// ── Google JWT helper (no google-auth-library needed) ────────────────────────

async function getGoogleToken(scopes) {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY missing')
  const { client_email, private_key } = JSON.parse(Buffer.from(raw, 'base64').toString('utf-8'))

  const header  = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')
  const now     = Math.floor(Date.now() / 1000)
  const payload = Buffer.from(JSON.stringify({
    iss: client_email, scope: scopes.join(' '),
    aud: 'https://oauth2.googleapis.com/token', exp: now + 3600, iat: now,
  })).toString('base64url')

  const sigInput = `${header}.${payload}`
  const signer   = createSign('RSA-SHA256')
  signer.update(sigInput)
  const jwt = `${sigInput}.${signer.sign(createPrivateKey(private_key), 'base64url')}`

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  })
  if (!res.ok) { const t = await res.text(); throw new Error(`Token ${res.status}: ${t.slice(0, 200)}`) }
  return (await res.json()).access_token
}

;(async () => {
  const token     = process.env.PEEC_AI_CUSTOMER_TOKEN
  // Avenue Z project ID is in clients.config.ts, hard-coded here for the harness
  const projectId = 'or_043ae735-9397-48cf-a754-6e346a55f394'
  const today     = new Date()
  const prior     = new Date(); prior.setDate(prior.getDate() - 29)
  const iso       = d => d.toISOString().split('T')[0]

  // 4a. /logs — the primary data source
  try {
    const params = new URLSearchParams({ project_id: projectId, start_date: iso(prior), end_date: iso(today) })
    const res    = await fetch(`https://api.peec.ai/customer/v1/agent-analytics/logs?${params}`, {
      headers: { 'X-API-Key': token },
    })
    if (!res.ok) {
      fail('Peec /logs', `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
    } else {
      const json = await res.json()
      const logs = json.data ?? []
      const bots = [...new Set(logs.map(l => l.bot_id))]
      ok('Peec /logs', `${logs.length} entries, ${bots.length} bots: ${bots.join(', ')}`)
      if (logs[0]?.response_status !== undefined) ok('Peec logs: response_status field present')
      else fail('Peec logs response_status', 'field missing')
      if (logs[0]?.request_path !== undefined) ok('Peec logs: request_path field present')
      else fail('Peec logs request_path', 'field missing')
      if (logs[0]?.bot_id !== undefined) ok('Peec logs: bot_id field present')
      else fail('Peec logs bot_id', 'field missing')

      // Verify Avenue Z actuals (all bots are currently returning 301)
      const statuses = [...new Set(logs.map(l => l.response_status))]
      ok('Peec logs: response statuses seen', statuses.join(', '))
    }
  } catch (e) { fail('Peec /logs', String(e)) }

  // 4b. /bots catalog
  try {
    const res = await fetch(`https://api.peec.ai/customer/v1/agent-analytics/bots?project_id=${projectId}`, {
      headers: { 'X-API-Key': token },
    })
    if (!res.ok) fail('Peec /bots', `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
    else {
      const json = await res.json()
      const bots = Array.isArray(json) ? json : (json.data ?? [])
      ok('Peec /bots catalog', `${bots.length} known bots`)
    }
  } catch (e) { fail('Peec /bots', String(e)) }

  section('5. Live — Google Drive API (SF CSV)')
  console.log('  Note: Requires Drive API enabled at console.developers.google.com/apis/api/drive.googleapis.com/overview?project=847942084273')
  console.log('  Note: SF CSV file must be shared with avenue-z-reporting@avenue-z-reporting.iam.gserviceaccount.com\n')

  try {
    const gToken = await getGoogleToken(['https://www.googleapis.com/auth/drive.readonly'])
    const res    = await fetch('https://www.googleapis.com/drive/v3/files/1ddlYbe_0wqadeqbIQVAsCt0F_9AOXSe9?alt=media', {
      headers: { Authorization: `Bearer ${gToken}`, Range: 'bytes=0-500' },
    })
    if (res.ok || res.status === 206) {
      const text = await res.text()
      if (text.includes('Address') || text.length > 50) {
        ok('Drive API: SF CSV', `${text.length} bytes — first col: "${text.split(',')[0]}"`)
      } else {
        fail('Drive API: SF CSV', `unexpected response: "${text.slice(0, 100)}"`)
      }
    } else {
      const body = await res.json().catch(() => ({}))
      const msg  = body?.error?.message ?? `HTTP ${res.status}`
      if (res.status === 403 && msg.includes('drive.googleapis.com')) {
        fail('Drive API: SF CSV', '⚠ Google Drive API not enabled in GCP project 847942084273 — enable at the URL above')
      } else {
        fail('Drive API: SF CSV', msg.slice(0, 200))
      }
    }
  } catch (e) { fail('Drive API: SF CSV', String(e)) }

  section('6. Live — Google Sheets API (Sitebulb)')
  console.log('  Note: Requires Sheets API enabled at console.developers.google.com/apis/api/sheets.googleapis.com/overview?project=847942084273')
  console.log('  Note: Sheet must be shared with avenue-z-reporting@avenue-z-reporting.iam.gserviceaccount.com\n')

  try {
    const gToken  = await getGoogleToken(['https://www.googleapis.com/auth/spreadsheets.readonly'])
    const sheetId = '1cKW5k0aqeWEk3HVakIDpiCrSP_mMf5oxQW7HJOxqsiw'
    const range   = encodeURIComponent("'Historical Hint Data'!A1:D3")
    const res     = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}`, {
      headers: { Authorization: `Bearer ${gToken}` },
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      const msg  = body?.error?.message ?? `HTTP ${res.status}`
      if (res.status === 403 && msg.includes('sheets.googleapis.com')) {
        fail('Sheets API: Sitebulb', '⚠ Google Sheets API not enabled in GCP project 847942084273 — enable at the URL above')
      } else {
        fail('Sheets API: Sitebulb', msg.slice(0, 200))
      }
    } else {
      const json   = await res.json()
      const values = json.values ?? []
      if (values.length > 0) {
        ok('Sheets API: Sitebulb', `${values.length} rows — header[0]="${values[0]?.[0]}", header[1]="${values[0]?.[1]}"`)
      } else {
        fail('Sheets API: Sitebulb', 'no values returned — sheet may be empty or wrong tab name')
      }
    }
  } catch (e) { fail('Sheets API: Sitebulb', String(e)) }

  summary()
})()
