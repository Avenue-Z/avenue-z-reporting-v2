import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { cached } from '@/lib/cache'
import { googleToken } from './google'
import type { IssueMap } from './issues'
import type { TaIssueSource } from './types'

export type { IssueMap }

const SOURCES: readonly string[] = ['ahrefs', 'sf', 'gsc_indexing', 'gsc_cwv'] satisfies TaIssueSource[]
const HEADERS = ['source', 'native_issue_name', 'canonical_issue_key', 'canonical_issue_name'] as const
const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly'
const FETCH_TIMEOUT_MS = 10_000
const FIXTURE_PATH = path.join(process.cwd(), 'lib/technical-audit/__fixtures__/issue-map.csv')

/** Minimal RFC 4180 parser (quoted fields, escaped quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field); field = ''
      rows.push(row); row = []
    } else field += c
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  return rows
}

/** Rows (header first) to an IssueMap. Bad rows are skipped, first duplicate wins; throws on missing headers. */
export function parseIssueMapCsv(rows: string[][]): IssueMap {
  const header = (rows[0] ?? []).map((h) => h.trim().toLowerCase())
  const idx = HEADERS.map((h) => header.indexOf(h))
  if (idx.some((i) => i < 0)) throw new Error('issue map is missing required header columns')
  const map: IssueMap = new Map()
  let skipped = 0
  let duplicates = 0
  for (const r of rows.slice(1)) {
    const [source, native, key, name] = idx.map((i) => (r[i] ?? '').trim())
    if (!SOURCES.includes(source) || !native || !key) {
      if (r.some((c) => c.trim())) skipped++
      continue
    }
    const k = `${source}:${native}`
    if (map.has(k)) { duplicates++; continue }
    map.set(k, { key, name: name || native })
  }
  if (skipped || duplicates) console.warn(`[technical-audit] issue map: skipped ${skipped} malformed row(s), ${duplicates} duplicate mapping(s)`)
  return map
}

async function fetchSheetRows(): Promise<string[][]> {
  const id = process.env.TECH_AUDIT_ISSUE_MAP_SHEET_ID
  if (!id) throw new Error('TECH_AUDIT_ISSUE_MAP_SHEET_ID is not set')
  const token = await googleToken([SHEETS_SCOPE])
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}/values/A:E`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`Sheets API responded ${res.status}`)
  const body = (await res.json()) as { values?: unknown }
  if (!Array.isArray(body.values)) throw new Error('Sheets API returned no values')
  return body.values.map((r) => (Array.isArray(r) ? r.map((c) => String(c ?? '')) : []))
}

// Cached as entries: unstable_cache serializes to JSON, which cannot hold a Map.
const fetchSheetEntries = cached(
  'tech-audit',
  'issue-map',
  async () => [...parseIssueMapCsv(await fetchSheetRows())],
  { ttlSeconds: 3600 },
)

async function loadFixture(): Promise<IssueMap> {
  return parseIssueMapCsv(parseCsv(await readFile(FIXTURE_PATH, 'utf-8')))
}

/** Canonical issue map from the AEO team's Sheet (1h cache); falls back to the repo fixture on any failure. */
export async function loadIssueMap(): Promise<IssueMap> {
  try {
    return new Map(await fetchSheetEntries())
  } catch (err) {
    console.error(`[technical-audit] issue map Sheet unavailable, using fixture: ${err instanceof Error ? err.message : 'unknown error'}`)
    return loadFixture()
  }
}
