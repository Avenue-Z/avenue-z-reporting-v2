/**
 * lib/screaming-frog/client.ts — server-side only
 *
 * Downloads the Screaming Frog "Internal All" CSV from Google Drive,
 * applies X-Point Framework checks, and returns a typed SFData summary
 * for the Technical Audit dashboard.
 *
 * Auth: GOOGLE_SERVICE_ACCOUNT_KEY (base64-encoded service account JSON)
 *       Same service account as GA4 and GSC clients.
 *
 * Drive file IDs per client are stored in clients.config.ts:
 *   sfCsvFileId     — current month's CSV (required)
 *   sfPrevCsvFileId — previous month's CSV (optional, enables delta)
 */

import { GoogleAuth } from 'google-auth-library'
import { getClientBySlug } from '@/lib/db/queries'
import type {
  SFData,
  SFIssue,
  SFIssueDelta,
  SFIssueSummary,
  SFOwner,
  SFSeverity,
  SFSnapshot,
} from './types'
import { timed } from '@/lib/perf'

// ─── Auth ─────────────────────────────────────────────────────────────────────

let _auth: GoogleAuth | null = null

function getAuth(): GoogleAuth {
  if (!_auth) {
    const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
    if (!raw) throw new Error('Missing GOOGLE_SERVICE_ACCOUNT_KEY env var')
    const credentials = JSON.parse(Buffer.from(raw, 'base64').toString('utf-8'))
    _auth = new GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    })
  }
  return _auth
}

// ─── Drive CSV download ────────────────────────────────────────────────────────

async function downloadDriveCsv(fileId: string): Promise<string> {
  const auth = getAuth()
  const token = await auth.getAccessToken()
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    {
      headers: { Authorization: `Bearer ${token}` },
      next: { revalidate: 3600 },
    }
  )
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Drive API ${res.status} downloading file ${fileId}: ${text.slice(0, 200)}`)
  }
  return res.text()
}

// ─── CSV parser (handles quoted fields, CRLF, BOM) ────────────────────────────

function parseCsv(text: string): Record<string, string>[] {
  const clean = text.startsWith('﻿') ? text.slice(1) : text
  const rows: Record<string, string>[] = []
  let headers: string[] = []
  let inQuote = false
  let field = ''
  let fields: string[] = []
  let isFirstRow = true

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i]
    const next = clean[i + 1]

    if (ch === '"') {
      if (inQuote && next === '"') { field += '"'; i++ }
      else inQuote = !inQuote
    } else if (ch === ',' && !inQuote) {
      fields.push(field); field = ''
    } else if ((ch === '\n' || (ch === '\r' && next === '\n')) && !inQuote) {
      if (ch === '\r') i++
      fields.push(field); field = ''
      if (isFirstRow) {
        headers = fields; isFirstRow = false
      } else if (fields.some(Boolean)) {
        const row: Record<string, string> = {}
        headers.forEach((h, idx) => { row[h] = fields[idx] ?? '' })
        rows.push(row)
      }
      fields = []
    } else {
      field += ch
    }
  }
  if (field !== '' || fields.length) {
    fields.push(field)
    if (!isFirstRow && fields.some(Boolean)) {
      const row: Record<string, string> = {}
      headers.forEach((h, idx) => { row[h] = fields[idx] ?? '' })
      rows.push(row)
    }
  }
  return rows
}

// ─── Column names (Screaming Frog "Internal All" export) ─────────────────────

const COL = {
  ADDRESS:            'Address',
  CONTENT_TYPE:       'Content Type',
  STATUS_CODE:        'Status Code',
  INDEXABILITY:       'Indexability',
  INDEXABILITY_STATUS:'Indexability Status',
  TITLE_1:            'Title 1',
  TITLE_1_LEN:        'Title 1 Length',
  TITLE_1_PIXEL:      'Title 1 Pixel Width',
  META_DESC_1:        'Meta Description 1',
  META_DESC_1_LEN:    'Meta Description 1 Length',
  H1_1:               'H1-1',
  H1_2:               'H1-2',
  META_ROBOTS_1:      'Meta Robots 1',
  X_ROBOTS_TAG_1:     'X-Robots-Tag 1',
  META_REFRESH_1:     'Meta Refresh 1',
  CANONICAL:          'Canonical Link Element 1',
  SIZE:               'Size (bytes)',
  WORD_COUNT:         'Word Count',
  TEXT_RATIO:         'Text Ratio',
  CRAWL_DEPTH:        'Crawl Depth',
  INLINKS:            'Unique Inlinks',
  OUTLINKS:           'Unique Outlinks',
  HASH:               'Hash',
  RESPONSE_TIME:      'Response Time',
  REDIRECT_URL:       'Redirect URL',
  REDIRECT_TYPE:      'Redirect Type',
}

// ─── Row helpers ──────────────────────────────────────────────────────────────

function s(row: Record<string, string>, col: string): string {
  return (row[col] ?? '').trim()
}
function n(row: Record<string, string>, col: string): number {
  const v = parseFloat(s(row, col))
  return isNaN(v) ? 0 : v
}
function empty(v: string): boolean {
  return !v || !v.trim()
}
function isHtml(row: Record<string, string>): boolean {
  return s(row, COL.CONTENT_TYPE).toLowerCase().includes('text/html')
}

// ─── Context for checks (duplicate detection, redirect sources) ───────────────

interface CheckContext {
  duplicateSets: Map<string, Set<string>>
  redirectSources: Set<string>
}

function buildContext(rows: Record<string, string>[]): CheckContext {
  const dupCols = [COL.TITLE_1, COL.META_DESC_1, COL.H1_1, COL.HASH]
  const duplicateSets = new Map<string, Set<string>>()
  for (const col of dupCols) {
    const counts = new Map<string, number>()
    for (const row of rows) {
      const v = s(row, col)
      if (v) counts.set(v, (counts.get(v) ?? 0) + 1)
    }
    duplicateSets.set(col, new Set([...counts.entries()].filter(([, c]) => c > 1).map(([k]) => k)))
  }
  const redirectSources = new Set<string>()
  for (const row of rows) {
    const code = n(row, COL.STATUS_CODE)
    if (code >= 300 && code <= 399) redirectSources.add(s(row, COL.ADDRESS))
  }
  return { duplicateSets, redirectSources }
}

// ─── X-Point Framework Check definitions ─────────────────────────────────────

interface XPFCheck {
  id: string
  name: string
  category: string
  severity: SFSeverity
  check: (row: Record<string, string>, ctx: CheckContext) => { flagged: boolean; detail: string }
  recommendedAction: string
  owner: SFOwner
}

const SEVERITY_RANK: Record<SFSeverity, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 }

const XPF_CHECKS: XPFCheck[] = [
  // ── Status codes ─────────────────────────────────────────────────────────────
  {
    id: 'status_5xx', name: 'Error (5XX) URL', category: 'status_codes', severity: 'Critical',
    check: (row) => { const c = n(row, COL.STATUS_CODE); return { flagged: c >= 500 && c <= 599, detail: `Status ${c}` } },
    recommendedAction: 'Fix all server errors — 5xx pages are excluded from Google index and LLM training crawls',
    owner: 'Dev',
  },
  {
    id: 'status_404', name: 'Not Found (404)', category: 'status_codes', severity: 'Critical',
    check: (row) => { const c = n(row, COL.STATUS_CODE); return { flagged: c === 404, detail: 'Status 404' } },
    recommendedAction: 'Redirect 404 URLs (301) to the most relevant live page, or restore the missing content',
    owner: 'Dev',
  },
  {
    id: 'status_4xx_other', name: 'Broken internal URLs (4xx)', category: 'status_codes', severity: 'High',
    check: (row) => { const c = n(row, COL.STATUS_CODE); return { flagged: c >= 400 && c < 500 && c !== 404, detail: `Status ${c}` } },
    recommendedAction: 'Audit all 4xx errors — remove or redirect all internal links pointing to them',
    owner: 'Dev',
  },
  // ── Crawlability ──────────────────────────────────────────────────────────────
  {
    id: 'internal_http', name: 'Internal HTTP URLs', category: 'crawlability', severity: 'Critical',
    check: (row) => { const a = s(row, COL.ADDRESS); return { flagged: a.startsWith('http://'), detail: 'Served over insecure HTTP' } },
    recommendedAction: 'Redirect all HTTP URLs to HTTPS — configure a server-level permanent redirect',
    owner: 'Dev',
  },
  {
    id: 'html_too_large', name: "HTML exceeds Google's 2MB limit", category: 'crawlability', severity: 'Critical',
    check: (row) => { const sz = n(row, COL.SIZE); return { flagged: sz > 2097152, detail: `${Math.round(sz / 1024)}KB` } },
    recommendedAction: 'Split large pages, remove inline scripts/styles, reduce HTML payload below 2MB',
    owner: 'Dev',
  },
  {
    id: 'blocked_robots', name: 'Disallowed URL (robots.txt)', category: 'crawlability', severity: 'Critical',
    check: (row) => { const st = s(row, COL.INDEXABILITY_STATUS); return { flagged: st === 'Blocked by Robots.txt', detail: 'Blocked by robots.txt' } },
    recommendedAction: 'Review robots.txt disallow rules — remove blocks from pages that should be indexed',
    owner: 'SEO',
  },
  {
    id: 'non_indexable', name: 'Non-Indexable Page', category: 'crawlability', severity: 'High',
    check: (row) => { const ix = s(row, COL.INDEXABILITY); return { flagged: ix === 'Non-Indexable', detail: s(row, COL.INDEXABILITY_STATUS) } },
    recommendedAction: 'Review non-indexable pages — remove noindex directives from pages that should rank',
    owner: 'SEO',
  },
  {
    id: 'noindex_meta', name: 'Noindex in Meta Robots', category: 'crawlability', severity: 'High',
    check: (row) => { const v = s(row, COL.META_ROBOTS_1).toLowerCase(); return { flagged: v.includes('noindex'), detail: `meta robots: ${s(row, COL.META_ROBOTS_1)}` } },
    recommendedAction: 'Remove noindex meta tag from pages that should appear in search results',
    owner: 'Dev',
  },
  {
    id: 'canonical_http', name: 'Canonical points to HTTP version', category: 'crawlability', severity: 'Critical',
    check: (row) => { const c = s(row, COL.CANONICAL); return { flagged: c.startsWith('http://'), detail: `Canonical: ${c.slice(0, 80)}` } },
    recommendedAction: 'Update all canonical tags to reference HTTPS URLs, not HTTP',
    owner: 'Dev',
  },
  // ── Redirects ─────────────────────────────────────────────────────────────────
  {
    id: 'redirect_chain', name: 'Redirect Chain Detected', category: 'redirects', severity: 'High',
    check: (row, ctx) => {
      const target = s(row, COL.REDIRECT_URL)
      const flagged = !!target && ctx.redirectSources.has(target)
      return { flagged, detail: flagged ? `Redirects to ${target.slice(0, 80)} (which also redirects)` : '' }
    },
    recommendedAction: 'Update all redirect chains to point directly to the final destination URL',
    owner: 'Dev',
  },
  {
    id: 'internal_redirected', name: 'Internal redirected URLs', category: 'redirects', severity: 'Medium',
    check: (row) => { const c = n(row, COL.STATUS_CODE); return { flagged: c >= 301 && c <= 399, detail: `Status ${c}` } },
    recommendedAction: 'Update internal links to point directly to canonical destination URLs',
    owner: 'SEO',
  },
  {
    id: 'redirect_self', name: 'URL redirects back to itself', category: 'redirects', severity: 'High',
    check: (row) => {
      const addr = s(row, COL.ADDRESS); const target = s(row, COL.REDIRECT_URL)
      return { flagged: !!target && target === addr, detail: `Redirect loop: ${addr.slice(0, 80)}` }
    },
    recommendedAction: 'Remove self-referencing redirect — serve the page directly or remove the redirect rule',
    owner: 'Dev',
  },
  // ── Canonicalization ──────────────────────────────────────────────────────────
  {
    id: 'missing_canonical', name: 'Missing canonical URL', category: 'canonicals', severity: 'Medium',
    check: (row) => {
      const html = isHtml(row); const c = s(row, COL.CANONICAL)
      return { flagged: html && empty(c), detail: 'No canonical tag' }
    },
    recommendedAction: 'Add self-referencing canonical tags to all HTML pages to prevent duplicate content signals',
    owner: 'Dev',
  },
  {
    id: 'canonicalized_away', name: 'Canonicalized URL', category: 'canonicals', severity: 'Medium',
    check: (row) => { const st = s(row, COL.INDEXABILITY_STATUS); return { flagged: st === 'Canonicalised', detail: `Canonical: ${s(row, COL.CANONICAL).slice(0, 80)}` } },
    recommendedAction: 'Review canonicalized pages — consolidate or redirect to the canonical URL',
    owner: 'SEO',
  },
  {
    id: 'duplicate_content', name: 'URLs with duplicate content', category: 'canonicals', severity: 'High',
    check: (row, ctx) => {
      const hash = s(row, COL.HASH)
      const flagged = !!hash && (ctx.duplicateSets.get(COL.HASH)?.has(hash) ?? false)
      return { flagged, detail: flagged ? 'Identical content found on multiple pages' : '' }
    },
    recommendedAction: 'Consolidate duplicate pages with canonical tags or 301 redirects to the primary URL',
    owner: 'SEO',
  },
  // ── Internal Linking ──────────────────────────────────────────────────────────
  {
    id: 'orphan_page', name: 'Orphaned page (zero inlinks)', category: 'links', severity: 'High',
    check: (row) => {
      const html = isHtml(row); const il = n(row, COL.INLINKS)
      return { flagged: html && il === 0, detail: '0 internal inlinks — not discoverable via crawl' }
    },
    recommendedAction: 'Add at least 2-3 internal links to orphaned pages from relevant site sections',
    owner: 'SEO',
  },
  {
    id: 'low_inlinks', name: 'Only one internal inlink', category: 'links', severity: 'High',
    check: (row) => {
      const html = isHtml(row); const il = n(row, COL.INLINKS)
      return { flagged: html && il === 1, detail: '1 internal inlink' }
    },
    recommendedAction: 'Add more internal links from topically-related pages to strengthen internal authority',
    owner: 'SEO',
  },
  {
    id: 'deep_page', name: 'Page too deep in site structure', category: 'links', severity: 'Medium',
    check: (row) => {
      const html = isHtml(row); const d = n(row, COL.CRAWL_DEPTH)
      return { flagged: html && d > 4, detail: `Crawl depth: ${d}` }
    },
    recommendedAction: 'Flatten site architecture — important pages should be within 3-4 clicks of the homepage',
    owner: 'SEO',
  },
  // ── Page Titles ───────────────────────────────────────────────────────────────
  {
    id: 'missing_title', name: 'Title tag is missing', category: 'titles', severity: 'Critical',
    check: (row) => { const html = isHtml(row); const t = s(row, COL.TITLE_1); return { flagged: html && empty(t), detail: 'No title tag' } },
    recommendedAction: 'Add a unique, descriptive title tag (50-60 chars) — missing titles tank CTR and rankings',
    owner: 'SEO',
  },
  {
    id: 'duplicate_title', name: 'Duplicate page title', category: 'titles', severity: 'High',
    check: (row, ctx) => {
      const t = s(row, COL.TITLE_1)
      const flagged = !empty(t) && (ctx.duplicateSets.get(COL.TITLE_1)?.has(t) ?? false)
      return { flagged, detail: flagged ? `"${t.slice(0, 60)}"` : '' }
    },
    recommendedAction: 'Rewrite duplicate titles — every page needs a unique title with a distinct primary keyword',
    owner: 'Content',
  },
  {
    id: 'title_too_long', name: 'Title tag too long (>580px)', category: 'titles', severity: 'Low',
    check: (row) => { const px = n(row, COL.TITLE_1_PIXEL); return { flagged: px > 580, detail: `${px}px wide` } },
    recommendedAction: 'Shorten title tags to under 580px (~60 chars) to prevent SERP truncation',
    owner: 'SEO',
  },
  {
    id: 'title_too_short', name: 'Title tag too short (<30 chars)', category: 'titles', severity: 'Low',
    check: (row) => {
      const t = s(row, COL.TITLE_1); const len = n(row, COL.TITLE_1_LEN)
      return { flagged: !empty(t) && len > 0 && len < 30, detail: `${len} chars` }
    },
    recommendedAction: 'Expand short titles to 30-60 characters — include primary keyword and brand',
    owner: 'SEO',
  },
  // ── Meta Descriptions ─────────────────────────────────────────────────────────
  {
    id: 'missing_meta_desc', name: 'Meta description is missing', category: 'meta_desc', severity: 'Low',
    check: (row) => { const html = isHtml(row); const d = s(row, COL.META_DESC_1); return { flagged: html && empty(d), detail: 'No meta description' } },
    recommendedAction: 'Add unique meta descriptions (140-160 chars) — improves CTR from search results',
    owner: 'SEO',
  },
  {
    id: 'duplicate_meta_desc', name: 'Duplicate meta description', category: 'meta_desc', severity: 'Low',
    check: (row, ctx) => {
      const d = s(row, COL.META_DESC_1)
      const flagged = !empty(d) && (ctx.duplicateSets.get(COL.META_DESC_1)?.has(d) ?? false)
      return { flagged, detail: flagged ? `"${d.slice(0, 60)}..."` : '' }
    },
    recommendedAction: 'Rewrite duplicate meta descriptions — each page needs unique copy with a CTA',
    owner: 'Content',
  },
  {
    id: 'meta_desc_too_long', name: 'Meta description too long', category: 'meta_desc', severity: 'Low',
    check: (row) => { const l = n(row, COL.META_DESC_1_LEN); return { flagged: l > 160, detail: `${l} chars` } },
    recommendedAction: 'Shorten meta descriptions to 140-160 characters to prevent SERP truncation',
    owner: 'SEO',
  },
  // ── Headings ──────────────────────────────────────────────────────────────────
  {
    id: 'missing_h1', name: '<h1> tag is missing', category: 'headings', severity: 'Medium',
    check: (row) => { const html = isHtml(row); const h = s(row, COL.H1_1); return { flagged: html && empty(h), detail: 'No H1 tag' } },
    recommendedAction: 'Add a single H1 tag to every page — include primary keyword in the heading',
    owner: 'Content',
  },
  {
    id: 'duplicate_h1', name: 'Duplicate H1 tag', category: 'headings', severity: 'Low',
    check: (row, ctx) => {
      const h = s(row, COL.H1_1)
      const flagged = !empty(h) && (ctx.duplicateSets.get(COL.H1_1)?.has(h) ?? false)
      return { flagged, detail: flagged ? `"${h.slice(0, 60)}"` : '' }
    },
    recommendedAction: 'Rewrite duplicate H1s — each page should have a unique primary heading',
    owner: 'Content',
  },
  {
    id: 'multiple_h1', name: 'Multiple H1 tags', category: 'headings', severity: 'Low',
    check: (row) => { const html = isHtml(row); const h2 = s(row, COL.H1_2); return { flagged: html && !empty(h2), detail: 'Multiple H1 tags detected' } },
    recommendedAction: 'Remove extra H1 tags — use a single H1 and H2s for subheadings',
    owner: 'Dev',
  },
  // ── Content Quality ───────────────────────────────────────────────────────────
  {
    id: 'thin_content', name: 'Thin content (<300 words)', category: 'content', severity: 'Medium',
    check: (row) => {
      const html = isHtml(row); const w = n(row, COL.WORD_COUNT)
      return { flagged: html && w > 0 && w < 300, detail: `${w} words` }
    },
    recommendedAction: 'Expand thin pages to 500+ words or merge with related content',
    owner: 'Content',
  },
  {
    id: 'low_text_ratio', name: 'Low text-to-HTML ratio', category: 'content', severity: 'Medium',
    check: (row) => {
      const html = isHtml(row); const r = n(row, COL.TEXT_RATIO)
      return { flagged: html && r > 0 && r < 10, detail: `${r}% text ratio` }
    },
    recommendedAction: 'Reduce inline scripts/styles and add meaningful text content to improve ratio',
    owner: 'Dev',
  },
  // ── Performance ───────────────────────────────────────────────────────────────
  {
    id: 'slow_ttfb', name: 'Slow server response time (TTFB)', category: 'performance', severity: 'High',
    check: (row) => {
      const html = isHtml(row); const rt = n(row, COL.RESPONSE_TIME)
      return { flagged: html && rt > 1.0, detail: `${rt.toFixed(2)}s TTFB` }
    },
    recommendedAction: 'Investigate server response time — target <500ms TTFB, review hosting/CDN configuration',
    owner: 'Dev',
  },
]

// ─── Build snapshot from parsed CSV rows ──────────────────────────────────────

function buildSnapshot(crawlDate: string, rows: Record<string, string>[]): SFSnapshot {
  const ctx = buildContext(rows)
  const htmlRows = rows.filter(isHtml)
  const allIssues: SFIssue[] = []

  for (const row of rows) {
    const url = s(row, COL.ADDRESS)
    if (!url) continue

    // Dedup: keep only the most severe check per category per URL
    const firedRank = new Map<string, number>()

    for (const check of XPF_CHECKS) {
      const { flagged, detail } = check.check(row, ctx)
      if (!flagged) continue

      const rank = SEVERITY_RANK[check.severity]
      const existing = firedRank.get(check.category)
      if (existing !== undefined && existing <= rank) continue
      firedRank.set(check.category, rank)

      allIssues.push({
        checkId: check.id,
        checkName: check.name,
        category: check.category,
        severity: check.severity,
        url,
        detail,
      })
    }
  }

  const criticalCount = allIssues.filter((i) => i.severity === 'Critical').length
  const highCount     = allIssues.filter((i) => i.severity === 'High').length
  const mediumCount   = allIssues.filter((i) => i.severity === 'Medium').length
  const lowCount      = allIssues.filter((i) => i.severity === 'Low').length

  // Aggregate into per-check summaries
  const summaryMap = new Map<string, SFIssueSummary>()
  for (const issue of allIssues) {
    const ex = summaryMap.get(issue.checkId)
    if (ex) { ex.count++ }
    else {
      summaryMap.set(issue.checkId, {
        checkId: issue.checkId,
        checkName: issue.checkName,
        category: issue.category,
        severity: issue.severity,
        count: 1,
        exampleUrl: issue.url,
      })
    }
  }

  const issueSummaries = [...summaryMap.values()].sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.count - a.count
  )

  return {
    crawlDate,
    totalUrls: rows.length,
    htmlUrls: htmlRows.length,
    criticalCount,
    highCount,
    mediumCount,
    lowCount,
    totalIssues: allIssues.length,
    topIssues: issueSummaries.slice(0, 10),
    issueSummaries,
  }
}

// ─── Delta computation ────────────────────────────────────────────────────────

function buildDelta(current: SFSnapshot, prev: SFSnapshot | null): SFIssueDelta[] {
  const checkMeta = new Map(XPF_CHECKS.map((c) => [c.id, { recommendedAction: c.recommendedAction, owner: c.owner }]))
  const currMap = new Map(current.issueSummaries.map((s) => [s.checkId, s]))
  const prevMap = prev ? new Map(prev.issueSummaries.map((s) => [s.checkId, s])) : new Map<string, SFIssueSummary>()

  const allIds = new Set([...currMap.keys(), ...prevMap.keys()])
  const deltas: SFIssueDelta[] = []

  for (const checkId of allIds) {
    const curr = currMap.get(checkId)
    const prevEntry = prevMap.get(checkId)
    const currentCount = curr?.count ?? 0
    const prevCount = prevEntry?.count ?? 0
    const delta = currentCount - prevCount

    const status: SFIssueDelta['status'] =
      prevCount === 0 && currentCount > 0 ? 'New'
      : prevCount > 0 && currentCount === 0 ? 'Resolved'
      : delta < 0 ? 'Improved'
      : delta > 0 ? 'Persistent'
      : 'Unchanged'

    const meta = checkMeta.get(checkId)
    deltas.push({
      checkId,
      checkName:         curr?.checkName ?? prevEntry?.checkName ?? checkId,
      category:          curr?.category  ?? prevEntry?.category  ?? '',
      severity:          curr?.severity  ?? prevEntry?.severity  ?? 'Low',
      prevCount,
      currentCount,
      delta,
      status,
      exampleUrl:        curr?.exampleUrl ?? prevEntry?.exampleUrl ?? '',
      recommendedAction: meta?.recommendedAction ?? '',
      owner:             meta?.owner ?? 'SEO',
    })
  }

  return deltas.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || Math.abs(b.delta) - Math.abs(a.delta))
}

// ─── Weighted score ───────────────────────────────────────────────────────────

function weightedScore(snap: SFSnapshot): number {
  return snap.criticalCount * 4 + snap.highCount * 3 + snap.mediumCount * 2 + snap.lowCount
}

// ─── Main export ──────────────────────────────────────────────────────────────

async function getSFDataImpl(clientSlug: string): Promise<SFData> {
  const config = await getClientBySlug(clientSlug)
  if (!config)         throw new Error(`Unknown client: ${clientSlug}`)
  if (!config.sfCsvFileId) throw new Error(`sfCsvFileId not configured for client: ${clientSlug}`)

  // Download and parse current CSV
  const csvText = await downloadDriveCsv(config.sfCsvFileId)
  const rows = parseCsv(csvText)

  // Best-effort crawl date: use today (SF CSV doesn't include date in rows)
  const crawlDate = new Date().toISOString().split('T')[0]
  const current = buildSnapshot(crawlDate, rows)

  // Download and parse previous CSV if configured
  let prev: SFSnapshot | null = null
  if (config.sfPrevCsvFileId) {
    try {
      const prevText = await downloadDriveCsv(config.sfPrevCsvFileId)
      const prevRows = parseCsv(prevText)
      prev = buildSnapshot('prev', prevRows)
    } catch (e) {
      console.warn(`[sf] Could not load prev CSV for ${clientSlug}:`, e)
    }
  }

  const delta = buildDelta(current, prev)

  const newIssues        = delta.filter((d) => d.status === 'New').reduce((sum, d) => sum + d.currentCount, 0)
  const resolvedIssues   = delta.filter((d) => d.status === 'Resolved').reduce((sum, d) => sum + d.prevCount, 0)
  const persistentIssues = delta.filter((d) => d.status === 'Persistent' || d.status === 'Unchanged').reduce((sum, d) => sum + d.currentCount, 0)

  return {
    current,
    prev,
    delta,
    newIssues,
    resolvedIssues,
    persistentIssues,
    weightedScore: weightedScore(current),
    prevWeightedScore: prev ? weightedScore(prev) : null,
  }
}

export const getSFData = timed(
  'screaming-frog',
  'getData',
  getSFDataImpl,
  ([clientSlug]) => ({ client: clientSlug }),
)

// Re-export types for convenience
export type { SFData, SFSnapshot, SFIssueSummary, SFIssueDelta, SFSeverity } from './types'
