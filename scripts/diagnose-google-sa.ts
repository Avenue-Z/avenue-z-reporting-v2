/**
 * Throwaway diagnostic: exercises the shared GOOGLE_SERVICE_ACCOUNT_KEY against
 * each Google surface the dashboard uses (GA4 Data API, Drive, Sheets) and prints
 * the exact per-resource result. Read-only. Run:
 *   npx tsx --env-file=.env.local scripts/diagnose-google-sa.ts
 */
import { BetaAnalyticsDataClient } from '@google-analytics/data'
import { GoogleAuth } from 'google-auth-library'

// Resource IDs mirrored from scripts/seed.ts
const RESOURCES = [
  {
    slug: 'avenue-z',
    ga4PropertyId: 'properties/355114071',
    sfCsvFileId: '1ddlYbe_0wqadeqbIQVAsCt0F_9AOXSe9',
    sitebulbSheetId: '1cKW5k0aqeWEk3HVakIDpiCrSP_mMf5oxQW7HJOxqsiw',
  },
  {
    slug: 'renaissance',
    ga4PropertyId: 'properties/310998391',
    sfCsvFileId: '10zM21GXKKfkQTLoZg8Q99YC38oioRFEs',
    sitebulbSheetId: '1a-kMXV3VQg2_wo9r4xkSf3BRqw4ZLT8qBzdocrveNGs',
  },
]

const SITEBULB_TAB = 'Historical Hint Data'

function decodeKey(): { client_email: string; project_id: string; raw: string } {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
  if (!raw) throw new Error('Missing GOOGLE_SERVICE_ACCOUNT_KEY env var')
  const json = JSON.parse(Buffer.from(raw, 'base64').toString('utf-8'))
  return { client_email: json.client_email, project_id: json.project_id, raw }
}

function short(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  return msg.replace(/\s+/g, ' ').slice(0, 240)
}

async function testGA4(client: BetaAnalyticsDataClient, property: string) {
  try {
    const [res] = await client.runReport({
      property,
      dateRanges: [{ startDate: '7daysAgo', endDate: 'yesterday' }],
      metrics: [{ name: 'sessions' }],
    })
    const sessions = res.rows?.[0]?.metricValues?.[0]?.value ?? '0'
    return `OK   (sessions last 7d = ${sessions})`
  } catch (e) {
    return `FAIL ${short(e)}`
  }
}

async function testDrive(token: string, fileId: string) {
  try {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    if (!res.ok) return `FAIL ${res.status} ${(await res.text()).replace(/\s+/g, ' ').slice(0, 200)}`
    const bytes = (await res.text()).length
    return `OK   (downloaded ${bytes} bytes)`
  } catch (e) {
    return `FAIL ${short(e)}`
  }
}

async function testSheets(token: string, sheetId: string) {
  try {
    const range = encodeURIComponent(`'${SITEBULB_TAB}'`)
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}?majorDimension=ROWS`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    if (!res.ok) return `FAIL ${res.status} ${(await res.text()).replace(/\s+/g, ' ').slice(0, 200)}`
    const json = (await res.json()) as { values?: string[][] }
    return `OK   (${json.values?.length ?? 0} rows on '${SITEBULB_TAB}')`
  } catch (e) {
    return `FAIL ${short(e)}`
  }
}

async function main() {
  const key = decodeKey()
  console.log('\n=== Service account ===')
  console.log('client_email:', key.client_email)
  console.log('project_id:  ', key.project_id)
  console.log('(grant this email Viewer on the GA4 properties + share the Drive/Sheets files with it)\n')

  const ga4Client = new BetaAnalyticsDataClient({
    credentials: JSON.parse(Buffer.from(key.raw, 'base64').toString('utf-8')),
  })
  const driveToken = await new GoogleAuth({
    credentials: JSON.parse(Buffer.from(key.raw, 'base64').toString('utf-8')),
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  }).getAccessToken()
  const sheetsToken = await new GoogleAuth({
    credentials: JSON.parse(Buffer.from(key.raw, 'base64').toString('utf-8')),
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  }).getAccessToken()

  for (const r of RESOURCES) {
    console.log(`=== ${r.slug} ===`)
    console.log(`  GA4    ${r.ga4PropertyId.padEnd(22)} -> ${await testGA4(ga4Client, r.ga4PropertyId)}`)
    console.log(`  Drive  ${r.sfCsvFileId.padEnd(36)} -> ${await testDrive(driveToken!, r.sfCsvFileId)}`)
    console.log(`  Sheets ${r.sitebulbSheetId.padEnd(36)} -> ${await testSheets(sheetsToken!, r.sitebulbSheetId)}`)
    console.log()
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
