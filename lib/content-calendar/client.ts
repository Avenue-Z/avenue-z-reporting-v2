/**
 * lib/content-calendar/client.ts -- server-side only
 *
 * Reads the Content Calendar Google Sheet and returns structured rows
 * for the Content Impact Tracker dashboard (PRD FR2, FR3, FR4, FR5).
 *
 * Auth: GOOGLE_SERVICE_ACCOUNT_KEY (base64-encoded service account JSON)
 *       Same service account as GA4, GSC, Sitebulb, and PR Proof clients.
 *
 * Sheet access required:
 *   avenue-z-reporting@avenue-z-reporting.iam.gserviceaccount.com (Viewer)
 *
 * Column detection is case-insensitive and alias-based -- the sheet does not
 * need to use exact column names. Common variations are handled automatically.
 *
 * Returns the first 1000 rows of the first (or most content-like) sheet tab.
 */

import { GoogleAuth } from 'google-auth-library'
import { getClientBySlug } from '@/lib/db/queries'
import type {
  ContentCalendarData,
  ContentCalendarRow,
  ContentAction,
  MatchStatus,
} from './types'

// ─── Auth ─────────────────────────────────────────────────────────────────────

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

// ─── Sheets fetch ─────────────────────────────────────────────────────────────

async function fetchSheetValues(sheetId: string): Promise<string[][]> {
  const auth = getAuth()
  const token = await auth.getAccessToken()
  // Fetch up to 1000 rows, columns A-Z. Range is A1:Z1000 on the first sheet.
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/A1:Z1000`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    next: { revalidate: 3600 }, // cache for 1 hour
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(
      `Sheets API ${res.status} for sheet ${sheetId}: ${text.slice(0, 200)}`
    )
  }
  const data = await res.json() as { values?: string[][] }
  return data.values ?? []
}

// ─── Column detection (PRD FR3: flexible field matching) ─────────────────────

/**
 * Maps semantic field names to ordered lists of accepted header aliases.
 * Headers are matched case-insensitively. First match wins.
 */
const COLUMN_ALIASES: Record<string, string[]> = {
  topic: [
    'topic', 'content topic', 'title', 'page title', 'content title',
    'subject', 'article', 'piece', 'content piece',
  ],
  url: [
    'url', 'page url', 'live url', 'publish url', 'published url',
    'link', 'page link', 'target url', 'destination url',
    // handles "Proposed Page Slug (or Live URL When Published)" and similar
    'proposed page slug (or live url when published)',
    'proposed page slug', 'page slug', 'slug', 'live url when published',
  ],
  contentType: [
    'content type', 'type', 'page type', 'asset type', 'content format',
    'format', 'piece type',
  ],
  status: [
    'status', 'content status', 'publish status', 'live status', 'state',
    'stage', 'publishing status',
  ],
  contentAction: [
    'content action', 'action type', 'content action type', 'action',
    'content action (new/optimized/other)', 'new/optimized', 'content action type (new/optimized/other)',
    'type of action', 'optimization type',
  ],
  publishDate: [
    'publish date', 'published date', 'date published', 'go live date',
    'launch date', 'date live', 'publish', 'live date', 'date launched',
    'published on',
  ],
  updateDate: [
    'update date', 'last updated', 'updated date', 'refresh date',
    'date updated', 'updated', 'last refresh', 'refresh', 'optimized date',
    'date optimized',
  ],
}

function buildColumnMap(headers: string[]): Map<string, number> {
  const map = new Map<string, number>()
  const lower = headers.map(h => (h ?? '').trim().toLowerCase())
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    for (const alias of aliases) {
      const idx = lower.indexOf(alias)
      if (idx !== -1) {
        map.set(field, idx)
        break
      }
    }
  }
  return map
}

// ─── Row normalization ────────────────────────────────────────────────────────

/**
 * Classify raw content action string into canonical values (PRD FR5).
 * Falls through to contentType-based heuristic when explicit action is absent.
 */
function parseContentAction(raw: string, contentTypeFallback = ''): ContentAction {
  const s = raw.trim().toLowerCase()
  if (s) {
    if (s === 'new' || s === 'net-new' || s === 'net new' || s.startsWith('new ')) return 'new'
    if (
      s === 'optimized' || s === 'optimised' || s === 'refresh' ||
      s === 'refreshed' || s === 'updated' || s === 'rewrite' ||
      s === 'rewritten' || s === 'expanded' || s.includes('optim') ||
      s.includes('refresh') || s.includes('rewrit') || s.includes('updat')
    ) return 'optimized'
    if (s.includes('new') || s.includes('blog') || s.includes('article') || s.includes('creat')) return 'new'
    return 'other'
  }
  // No explicit action column -- derive from Content Type (handles sheets like Renaissance's)
  const ct = contentTypeFallback.trim().toLowerCase()
  if (!ct) return 'other'
  if (
    ct.includes('optim') || ct.includes('existing') || ct.includes('refresh') ||
    ct.includes('updat') || ct.includes('rewrit') || ct.includes('redesi')
  ) return 'optimized'
  if (
    ct.includes('new') || ct.includes('blog') || ct.includes('article') ||
    ct.includes('creat') || ct.includes('net-new') || ct.includes('net new')
  ) return 'new'
  return 'other'
}

/**
 * Normalize a URL cell value to a canonical form or null.
 * Null = placeholder / TBD / not yet live (PRD data quality: unpublished rows).
 */
function normalizeUrl(raw: string | undefined): string | null {
  if (!raw) return null
  const s = raw.trim()
  if (!s) return null
  const lower = s.toLowerCase()
  if (
    lower === 'tbd' || lower === 'pending' || lower === 'n/a' ||
    lower === '-' || lower === 'na' || lower === 'placeholder'
  ) return null
  if (s.startsWith('http://') || s.startsWith('https://') || s.startsWith('/')) return s
  if (s.includes('.')) return `https://${s}`
  // Handle prefixed slugs like "(Keep existing) /guide/..." or "use: /path/"
  const embedded = s.match(/(?:https?:\/\/\S+|\/[\w/-]+)/)
  if (embedded) return embedded[0]
  return null
}

/**
 * Normalize a date cell value. Returns raw string or null if empty/placeholder.
 */
function normalizeDate(raw: string | undefined): string | null {
  if (!raw) return null
  const s = raw.trim()
  if (!s || s.toLowerCase() === 'tbd' || s.toLowerCase() === 'pending' || s === '-') return null
  return s
}

/**
 * Derive match status from URL presence and status string (PRD FR4).
 */
function deriveMatchStatus(url: string | null, statusRaw: string): MatchStatus {
  if (!url) return 'unpublished'
  const s = statusRaw.trim().toLowerCase()
  if (s.includes('redirect')) return 'redirected'
  if (
    s.includes('draft') || s.includes('planned') || s.includes('pending') ||
    s.includes('not live') || s.includes('scheduled') || s.includes('wip') ||
    s.includes('in progress') || s.includes('review')
  ) return 'unpublished'
  if (
    s.includes('live') || s.includes('published') || s.includes('active') ||
    s.includes('complete') || s.includes('done')
  ) return 'matched'
  return 'unknown'
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function getContentCalendarData(
  clientSlug: string
): Promise<ContentCalendarData> {
  const config = await getClientBySlug(clientSlug)
  if (!config) throw new Error(`Unknown client: ${clientSlug}`)
  if (!config.contentCalendarSheetId) {
    throw new Error(
      `contentCalendarSheetId not configured for client: ${clientSlug}. ` +
      `Share the sheet with avenue-z-reporting@avenue-z-reporting.iam.gserviceaccount.com ` +
      `(Viewer) and set contentCalendarSheetId on the client row in the database.`
    )
  }

  const raw = await fetchSheetValues(config.contentCalendarSheetId)
  if (raw.length < 2) return emptyData()

  const headers = raw[0]
  const colMap  = buildColumnMap(headers)
  const dataRows = raw.slice(1)

  const rows: ContentCalendarRow[] = dataRows
    .filter(r => r && r.some(cell => (cell ?? '').trim())) // skip blank rows
    .map(r => {
      const get = (field: string): string =>
        colMap.has(field) ? ((r[colMap.get(field)!] ?? '').trim()) : ''

      const url    = normalizeUrl(get('url'))
      const status = get('status')

      return {
        topic:         get('topic') || '(untitled)',
        url,
        contentType:   get('contentType')    || 'Unknown',
        status:        status                || 'Unknown',
        contentAction: parseContentAction(get('contentAction'), get('contentType')),
        publishDate:   normalizeDate(get('publishDate')),
        updateDate:    normalizeDate(get('updateDate')),
        matchStatus:   deriveMatchStatus(url, status),
        // Enriched downstream in content-impact.tsx by cross-referencing Peec + Agent Analytics
        aiCitations:   null,
        aiBotVisits:   null,
      }
    })

  return {
    rows,
    plannedCount:   rows.length,
    liveCount:      rows.filter(r => r.matchStatus === 'matched' || r.matchStatus === 'unknown').length,
    newCount:       rows.filter(r => r.contentAction === 'new').length,
    optimizedCount: rows.filter(r => r.contentAction === 'optimized').length,
    unmatchedCount: rows.filter(r => r.matchStatus !== 'matched').length,
  }
}

function emptyData(): ContentCalendarData {
  return {
    rows:           [],
    plannedCount:   0,
    liveCount:      0,
    newCount:       0,
    optimizedCount: 0,
    unmatchedCount: 0,
  }
}

export type { ContentCalendarData, ContentCalendarRow, ContentAction, MatchStatus }
