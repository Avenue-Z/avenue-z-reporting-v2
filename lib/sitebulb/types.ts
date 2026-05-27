// ─── Sitebulb Historical Hint Data — Shared Types ────────────────────────────
//
// The "Historical Hint Data" Google Sheet has one row per crawl, a "Date" column
// in position 0, and ~400 hint-name columns with counts of affected URLs.
//
// This module defines the raw parsed types and the derived AEO checklist
// structure consumed by the Technical Audit page.
// ─────────────────────────────────────────────────────────────────────────────

/** One crawl's worth of hint counts: hint name -> count of affected URLs */
export interface SitebulbHintRow {
  crawlDate: string              // e.g. "May 21, 2026" (as stored in the sheet)
  hints: Record<string, number>  // sparse: missing key == 0 affected URLs
}

/** What getSitebulbData() returns */
export interface SitebulbData {
  current: SitebulbHintRow
  prev:    SitebulbHintRow | null
}

// ---------------------------------------------------------------------------
// AEO Checklist types — derived from SitebulbData + optional Peec context
// ---------------------------------------------------------------------------

export type AEOStatus = 'pass' | 'fail' | 'warn' | 'pending'

export interface AEOChecklistItem {
  label:          string
  description:    string
  status:         AEOStatus
  affectedUrls:   number | null   // null == data not available
  prevAffectedUrls: number | null
  detail?:        string          // human-readable note surfaced in the UI
}

export interface AEOChecklist {
  structuredData: {
    organizationSchema: AEOChecklistItem
    faqSchema:          AEOChecklistItem
    articleSchema:      AEOChecklistItem
    breadcrumb:         AEOChecklistItem
  }
  contentFormat: {
    headingHierarchy:   AEOChecklistItem
    // content-format items are not derivable from crawl data alone — pending
  }
  crawlability: {
    robotsTxtLLMBots:   AEOChecklistItem
    sitemapFreshness:   AEOChecklistItem
    coreWebVitals:      AEOChecklistItem
    httpsCoverage:      AEOChecklistItem
    titleTags:          AEOChecklistItem
    metaDescriptions:   AEOChecklistItem
    h1Tags:             AEOChecklistItem
    canonicalTags:      AEOChecklistItem
  }
}
