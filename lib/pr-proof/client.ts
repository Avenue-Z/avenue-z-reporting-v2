// ─── PR Proof Library Client ─────────────────────────────────────────────────
//
// Reads the PR Proof Library Google Sheet via Sheets API v4.
// Sheet layout:
//   Row 0 : header — Client | Outlet | Headline | Publication Date | Link | Impact | Date Added
//   Rows 1+: PR placement entries across all clients
//
// This client filters to a single client by matching column A (Client) against
// the client name from clients.config.ts.
//
// Auth: shared GOOGLE_SERVICE_ACCOUNT_KEY service account (base64 JSON)
//       scopes: spreadsheets.readonly
//
// Returns PRProofData with all placements for the specified client.
// ─────────────────────────────────────────────────────────────────────────────

import { GoogleAuth } from 'google-auth-library'
import { getClientBySlug } from '@/lib/db/queries'
import type { PRPlacement, PRProofData } from './types'
import { cached } from '@/lib/cache'

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

  // Read the entire first sheet (no tab name needed since PR Proof uses Sheet1)
  const url = `${SHEETS_BASE}/${sheetId}/values/A:G?majorDimension=ROWS&valueRenderOption=UNFORMATTED_VALUE`

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

function parseRows(rows: string[][], clientName: string): PRPlacement[] {
  if (rows.length < 2) return [] // need at least header + 1 data row

  // Skip header row (index 0)
  const dataRows = rows.slice(1)

  const placements: PRPlacement[] = []

  for (const row of dataRows) {
    const rowClient       = (row[0] ?? '').trim()
    const outlet          = (row[1] ?? '').trim()
    const headline        = (row[2] ?? '').trim()
    const publicationDate = (row[3] ?? '').trim()
    const link            = (row[4] ?? '').trim()
    const impact          = (row[5] ?? '').trim()
    const dateAdded       = (row[6] ?? '').trim()

    // Filter: only include rows matching the requested client
    // Case-insensitive comparison to handle variations
    if (rowClient.toLowerCase() !== clientName.toLowerCase()) continue

    // Skip rows with no link (incomplete entries)
    if (!link) continue

    placements.push({
      client: rowClient,
      outlet,
      headline,
      publicationDate,
      link,
      domain: extractDomain(link),
      impact,
      dateAdded,
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
  const placements = parseRows(rows, client.name)

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
