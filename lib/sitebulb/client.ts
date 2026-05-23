// ─── Sitebulb Historical Hint Data Client ────────────────────────────────────
//
// Reads the "Historical Hint Data" Google Sheet via Sheets API v4.
// Sheet layout:
//   Row 0 : header – first cell is "Date", remaining cells are hint names
//   Rows 1+: crawl snapshots – first cell is crawl date, rest are URL counts
//
// Auth: shared GOOGLE_SERVICE_ACCOUNT_KEY service account (base64 JSON)
//       scopes: spreadsheets.readonly
//
// Returns the two most recent crawl rows as SitebulbData.
// ─────────────────────────────────────────────────────────────────────────────

import { GoogleAuth } from 'google-auth-library'
import { getClientBySlug } from '@/lib/clients.config'
import type { SitebulbData, SitebulbHintRow, AEOChecklist, AEOChecklistItem, AEOStatus } from './types'

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
const TAB_NAME = 'Historical Hint Data'

async function fetchSheetValues(sheetId: string): Promise<string[][]> {
  const auth  = getAuth()
  const token = await auth.getAccessToken()

  // Encode tab name for URL — single-quotes around names with spaces
  const range = encodeURIComponent(`'${TAB_NAME}'`)
  const url   = `${SHEETS_BASE}/${sheetId}/values/${range}?majorDimension=ROWS&valueRenderOption=UNFORMATTED_VALUE`

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    next:    { revalidate: 3600 },
  })

  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`Sheets API ${res.status} for ${sheetId}: ${txt.slice(0, 300)}`)
  }

  const json = await res.json() as { values?: string[][] }
  return json.values ?? []
}

// ── Parser ────────────────────────────────────────────────────────────────────

function parseHintRow(headers: string[], dataRow: string[]): SitebulbHintRow {
  // headers[0] is "Date", headers[1..n] are hint names
  const crawlDate = String(dataRow[0] ?? 'unknown')
  const hints: Record<string, number> = {}

  for (let i = 1; i < headers.length; i++) {
    const hintName = headers[i]
    if (!hintName) continue
    const raw = dataRow[i]
    const count = raw === undefined || raw === '' ? 0 : Number(raw)
    if (!isNaN(count) && count > 0) {
      hints[hintName] = count
    }
  }

  return { crawlDate, hints }
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function getSitebulbData(clientSlug: string): Promise<SitebulbData> {
  const config = getClientBySlug(clientSlug)
  if (!config) throw new Error(`Unknown client: ${clientSlug}`)
  if (!config.sitebulbSheetId) throw new Error(`sitebulbSheetId not configured for client: ${clientSlug}`)

  const values = await fetchSheetValues(config.sitebulbSheetId)

  if (values.length < 2) {
    throw new Error(`Sitebulb sheet ${config.sitebulbSheetId} has fewer than 2 rows — no data rows found`)
  }

  const headers  = values[0].map(String)
  // Data rows are crawls in chronological order; take the last 2
  const dataRows = values.slice(1)
  const currentRow = dataRows[dataRows.length - 1]
  const prevRow    = dataRows.length >= 2 ? dataRows[dataRows.length - 2] : null

  return {
    current: parseHintRow(headers, currentRow),
    prev:    prevRow ? parseHintRow(headers, prevRow) : null,
  }
}

// ── AEO checklist builder ─────────────────────────────────────────────────────
//
// Maps Sitebulb hint names to AEO checklist items.
// Thresholds:
//   pass    = 0 affected URLs
//   warn    = 1–49 affected URLs
//   fail    = 50+ affected URLs
//   pending = hint not present in sheet (cannot determine)

function hintItem(
  label: string,
  description: string,
  hintName: string | null,
  current: SitebulbHintRow,
  prev: SitebulbHintRow | null,
  opts: {
    passThreshold?: number   // max affected URLs for pass (default 0)
    warnThreshold?: number   // max affected URLs for warn (default 49)
    invert?: boolean         // true when higher count = better (e.g. pages with schema)
    detail?: (count: number, prev: number | null) => string
  } = {},
): AEOChecklistItem {
  if (!hintName) {
    return { label, description, status: 'pending', affectedUrls: null, prevAffectedUrls: null }
  }

  const count     = current.hints[hintName] ?? 0
  const prevCount = prev ? (prev.hints[hintName] ?? 0) : null

  const passThreshold = opts.passThreshold ?? 0
  const warnThreshold = opts.warnThreshold ?? 49

  let status: AEOStatus
  if (count <= passThreshold)       status = 'pass'
  else if (count <= warnThreshold)  status = 'warn'
  else                              status = 'fail'

  const detail = opts.detail?.(count, prevCount)

  return {
    label,
    description,
    status,
    affectedUrls:     count,
    prevAffectedUrls: prevCount,
    ...(detail ? { detail } : {}),
  }
}

export function buildAEOChecklist(
  data: SitebulbData,
  robotsTxtStatus?: 'pass' | 'fail' | 'warn' | 'pending',
): AEOChecklist {
  const { current, prev } = data

  return {
    structuredData: {
      organizationSchema: {
        label:       'Organization schema',
        description: 'Identifies the brand, logo, and social profiles to AI crawlers.',
        status:      'pending',
        affectedUrls: null,
        prevAffectedUrls: null,
        detail:      'Sitebulb hint not available — verify via Google Rich Results Test',
      },
      faqSchema: {
        label:       'FAQ schema',
        description: 'Q&A markup is the highest-signal format for LLM extraction.',
        status:      'pending',
        affectedUrls: null,
        prevAffectedUrls: null,
        detail:      'Sitebulb hint not available — verify via Schema Markup Validator',
      },
      articleSchema: {
        label:       'Article / BlogPosting',
        description: 'Signals publication date and authorship for content trust scoring.',
        status:      'pending',
        affectedUrls: null,
        prevAffectedUrls: null,
      },
      breadcrumb: {
        label:       'BreadcrumbList',
        description: 'Site hierarchy clarity — improves content context for LLMs.',
        status:      'pending',
        affectedUrls: null,
        prevAffectedUrls: null,
      },
    },
    contentFormat: {
      headingHierarchy: hintItem(
        'Heading hierarchy',
        'Proper H1→H2→H3 structure helps LLMs segment and retrieve content.',
        '<h1> tag is missing',
        current,
        prev,
        {
          warnThreshold: 10,
          detail: (c, p) =>
            `${c} page${c !== 1 ? 's' : ''} missing H1${p !== null ? ` (was ${p})` : ''}`,
        },
      ),
    },
    crawlability: {
      robotsTxtLLMBots: {
        label:       'Robots.txt — LLM bots',
        description: 'Ensure GPTBot, ClaudeBot, PerplexityBot are not blocked.',
        status:      robotsTxtStatus ?? 'pending',
        affectedUrls: null,
        prevAffectedUrls: null,
        detail:
          robotsTxtStatus === 'fail'
            ? 'One or more LLM crawlers are being blocked or redirected — check robots.txt'
            : robotsTxtStatus === 'pass'
            ? 'All major LLM bots have access'
            : undefined,
      },
      sitemapFreshness: {
        label:       'Sitemap freshness',
        description: 'XML sitemap submitted and updated in the last 30 days.',
        status:      'pending',
        affectedUrls: null,
        prevAffectedUrls: null,
        detail:      'Verify via Google Search Console sitemap report',
      },
      coreWebVitals: {
        label:       'Core Web Vitals',
        description: 'Page speed is a proxy signal for content quality in LLM scoring.',
        status:      'pending',
        affectedUrls: null,
        prevAffectedUrls: null,
        detail:      'Connect GSC CWV API to populate',
      },
      httpsCoverage: hintItem(
        'HTTPS coverage',
        'All pages served over HTTPS — baseline trust signal.',
        'Internal HTTP URLs',
        current,
        prev,
        {
          warnThreshold: 5,
          detail: (c, p) =>
            c === 0
              ? 'All internal URLs are HTTPS'
              : `${c} internal HTTP URL${c !== 1 ? 's' : ''} detected${p !== null ? ` (was ${p})` : ''}`,
        },
      ),
      titleTags: hintItem(
        'Title tags',
        'Every indexable page should have a unique, descriptive title tag.',
        'Title tag is missing',
        current,
        prev,
        {
          warnThreshold: 10,
          detail: (c, p) =>
            `${c} page${c !== 1 ? 's' : ''} missing title tag${p !== null ? ` (was ${p})` : ''}`,
        },
      ),
      metaDescriptions: hintItem(
        'Meta descriptions',
        'Meta descriptions influence click-through and content summarization by LLMs.',
        'Meta description is missing',
        current,
        prev,
        {
          passThreshold: 0,
          warnThreshold: 20,
          detail: (c, p) =>
            `${c} page${c !== 1 ? 's' : ''} missing meta description${p !== null ? ` (was ${p})` : ''}`,
        },
      ),
      h1Tags: hintItem(
        'H1 tags',
        'H1 tags are the primary semantic signal for page topic to AI crawlers.',
        '<h1> tag is missing',
        current,
        prev,
        {
          warnThreshold: 10,
          detail: (c, p) =>
            `${c} page${c !== 1 ? 's' : ''} missing H1${p !== null ? ` (was ${p})` : ''}`,
        },
      ),
      canonicalTags: hintItem(
        'Canonical tags',
        'Canonical signals prevent duplicate content confusion in LLM indexing.',
        'Missing canonical URL',
        current,
        prev,
        {
          warnThreshold: 20,
          detail: (c, p) =>
            `${c} page${c !== 1 ? 's' : ''} missing canonical${p !== null ? ` (was ${p})` : ''}`,
        },
      ),
    },
  }
}
