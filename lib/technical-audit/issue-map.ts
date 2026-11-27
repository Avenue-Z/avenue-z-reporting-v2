import { cached } from '@/lib/cache'
import { googleToken } from './google'
import { ISSUE_MAP_FALLBACK } from './issue-map-fallback'
import type { IssueMap } from './issues'
import type { TaIssueSource } from './types'

export type { IssueMap }
export interface IssueMapRow { source: TaIssueSource; native: string; key: string; name: string }

const SOURCES: readonly string[] = ['ahrefs', 'sf', 'gsc_indexing', 'gsc_cwv'] satisfies TaIssueSource[]
const HEADERS = ['source', 'native_issue_name', 'canonical_issue_key', 'canonical_issue_name'] as const
const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly'
const FETCH_TIMEOUT_MS = 10_000

/** True for a key that starts with a known source followed by `:`; reserved for unmapped rows' override keys. */
export const hasSourcePrefix = (key: string) => SOURCES.some((s) => key.startsWith(`${s}:`))

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
    // A canonical key shaped like `source:native` would collide with the override keys of unmapped rows.
    if (!SOURCES.includes(source) || !native || !key || hasSourcePrefix(key)) {
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
  let token: string
  try {
    token = await googleToken([SHEETS_SCOPE])
  } catch {
    // Never the raw text: a malformed key's JSON.parse error can echo the key itself.
    throw new Error('Google auth error')
  }
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}/values/A:E`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`Sheets API responded ${res.status}`)
  const body = (await res.json()) as { values?: unknown }
  if (!Array.isArray(body.values)) throw new Error('Sheets API returned no values')
  return body.values.map((r) => (Array.isArray(r) ? r.map((c) => String(c ?? '')) : []))
}

// Cached as entries: unstable_cache serializes to JSON, which cannot hold a Map. A Sheet with no valid rows is a
// failure (thrown, so never cached as an empty map); a failure is replayed for 5 minutes so an outage costs one
// Sheets timeout per window, not one per render. healthCritical is false: an unset or unreachable Sheet falls back to
// the built-in list and the page renders fine, so it must not count as a vendor failure in the health beacon.
const fetchSheetEntries = cached(
  'tech-audit',
  'issue-map',
  async () => {
    const entries = [...parseIssueMapCsv(await fetchSheetRows())]
    if (entries.length === 0) throw new Error('issue map Sheet has no valid rows')
    return entries
  },
  { ttlSeconds: 3600, negativeTtlSeconds: 300, healthCritical: false },
)

function loadFallback(): IssueMap {
  return new Map(ISSUE_MAP_FALLBACK.map((r) => [`${r.source}:${r.native}`, { key: r.key, name: r.name }]))
}

/** Canonical issue map from the AEO team's Sheet (1h cache); falls back to the built-in list on any failure or an empty Sheet. */
export async function loadIssueMap(): Promise<IssueMap> {
  try {
    return new Map(await fetchSheetEntries())
  } catch {
    console.error('[technical-audit] issue map Sheet unavailable, using built-in fallback')
    return loadFallback()
  }
}
