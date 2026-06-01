// ─── PR Proof Library Client ─────────────────────────────────────────────────
//
// Reads a per-client Google Sheet via Sheets API v4 and returns PR placement
// data. Each client can have a differently-structured sheet — the column
// layout is declared on the `clients` row as `prProofColumnMap`.
//
// Default (legacy avenue-z) layout:
//   Row 0 : header — Client | Outlet | Headline | Publication Date | Link | Impact | Date Added
//   Rows 1+: PR placement entries
//
// When `prProofColumnMap` is null on the client row, the parser falls back
// to the default layout above.
//
// Auth: shared GOOGLE_SERVICE_ACCOUNT_KEY service account (base64 JSON)
//       scopes: spreadsheets.readonly
//
// Returns PRProofData with all placements for the specified client.
// ─────────────────────────────────────────────────────────────────────────────

import { GoogleAuth } from 'google-auth-library'
import { getClientBySlug } from '@/lib/db/queries'
import type { PRProofColumnMap } from '@/lib/db/schema'
import type { PRPlacement, PRProofData } from './types'
import { cached } from '@/lib/cache'

const DEFAULT_COLUMN_MAP: PRProofColumnMap = {
  client:          'A',
  outlet:          'B',
  headline:        'C',
  publicationDate: 'D',
  link:            'E',
  impact:          'F',
  dateAdded:       'G',
}

function colIndex(letter: string): number {
  // Supports multi-letter columns ("AA" → 26, "AB" → 27, …).
  let idx = 0
  for (const c of letter.toUpperCase()) {
    const code = c.charCodeAt(0)
    if (code < 65 || code > 90) throw new Error(`Invalid column letter: "${letter}"`)
    idx = idx * 26 + (code - 64)
  }
  return idx - 1
}

// ── Singleton auth ────────────────────────────────────────────────────────────

let _auth: GoogleAuth | null = null

function getAuth(): GoogleAuth {
  if (!_auth) {
    const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
    if (!raw) throw new Error('Missing env var: GOOGLE_SERVICE_ACCOUNT_KEY')
    const credentials = JSON.parse(Buffer.from(raw, 'base64').toString('utf-8'))
    _auth = new GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    })
  }
  return _auth
}

// ── Sheets fetch ──────────────────────────────────────────────────────────────

const SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets'

async function fetchSheetValues(sheetId: string): Promise<string[][]> {
  const auth  = getAuth()
  const token = await auth.getAccessToken()

  // Read A:Z of the first tab. The actual columns used depend on the per-
  // client prProofColumnMap; reading a wide range avoids capping it at the
  // default layout's width.
  //
  // valueRenderOption=FORMATTED_VALUE returns each cell as its display
  // string. UNFORMATTED_VALUE returns dates as Sheets serial numbers and
  // numerics as numbers — the parser below calls .trim() on each cell and
  // `new Date(publicationDate)` downstream, both of which assume strings.
  const url = `${SHEETS_BASE}/${sheetId}/values/A:Z?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    next:    { revalidate: 3600 },
  })

  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`Sheets API ${res.status} for PR Proof sheet ${sheetId}: ${txt.slice(0, 300)}`)
  }

  const json = await res.json() as { values?: string[][] }
  return json.values ?? []
}

// ── Domain extraction ─────────────────────────────────────────────────────────

function extractDomain(url: string): string {
  try {
    const hostname = new URL(url).hostname
    // Strip 'www.' prefix for cleaner matching
    return hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

// ── Parse rows into PRPlacement objects ───────────────────────────────────────

function parseRows(rows: string[][], clientName: string, map: PRProofColumnMap): PRPlacement[] {
  if (rows.length < 2) return [] // need at least header + 1 data row

  // Skip header row (index 0)
  const dataRows = rows.slice(1)
  const placements: PRPlacement[] = []

  // Cell accessor: undefined column letter → empty string. Trims at the source.
  const cell = (row: string[], letter: string | undefined): string => {
    if (!letter) return ''
    return (row[colIndex(letter)] ?? '').trim()
  }

  for (const row of dataRows) {
    // Only filter by client if the map declares a client column.
    // Single-tenant sheets omit `map.client` and include every data row.
    if (map.client) {
      const rowClient = cell(row, map.client)
      if (rowClient.toLowerCase() !== clientName.toLowerCase()) continue
    }

    const link = cell(row, map.link)
    if (!link) continue // skip incomplete entries

    placements.push({
      client:          map.client ? cell(row, map.client) : clientName,
      outlet:          cell(row, map.outlet),
      headline:        cell(row, map.headline),
      publicationDate: cell(row, map.publicationDate),
      link,
      domain:          extractDomain(link),
      impact:          cell(row, map.impact),
      dateAdded:       cell(row, map.dateAdded),
    })
  }

  // Sort by publication date descending (most recent first)
  placements.sort((a, b) => {
    const dateA = new Date(a.publicationDate).getTime()
    const dateB = new Date(b.publicationDate).getTime()
    if (isNaN(dateA) || isNaN(dateB)) return 0
    return dateB - dateA
  })

  return placements
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Fetch PR Proof Library data for a specific client.
 * Reads the Google Sheet, filters to rows where column A matches the client name,
 * and returns structured PR placement data.
 */
async function getPRProofDataImpl(clientSlug: string): Promise<PRProofData> {
  const client = await getClientBySlug(clientSlug)
  if (!client) throw new Error(`Unknown client slug: ${clientSlug}`)

  const sheetId = client.prProofSheetId
  if (!sheetId) {
    // No PR Proof sheet configured for this client; return empty
    return {
      placements: [],
      totalPlacements: 0,
      uniqueOutlets: 0,
      uniqueDomains: [],
      dateRange: null,
    }
  }

  const rows = await fetchSheetValues(sheetId)
  const columnMap = client.prProofColumnMap ?? DEFAULT_COLUMN_MAP
  const placements = parseRows(rows, client.name, columnMap)

  const uniqueOutlets = new Set(placements.map((p) => p.outlet))
  const uniqueDomains = [...new Set(placements.map((p) => p.domain))]

  const dates = placements
    .map((p) => p.publicationDate)
    .filter((d) => d && !isNaN(new Date(d).getTime()))
    .sort()

  return {
    placements,
    totalPlacements: placements.length,
    uniqueOutlets: uniqueOutlets.size,
    uniqueDomains,
    dateRange: dates.length > 0
      ? { earliest: dates[0], latest: dates[dates.length - 1] }
      : null,
  }
}

export const getPRProofData = cached(
  'pr-proof',
  'getData',
  getPRProofDataImpl,
  {
    extractTags: ([clientSlug]) => ({ client: clientSlug }),
  },
)

// ── Matchback helper (cross-reference with Peec data) ─────────────────────────

export type { PRPlacement, PRProofData } from './types'
export type { PRPlacementMatchback } from './types'
