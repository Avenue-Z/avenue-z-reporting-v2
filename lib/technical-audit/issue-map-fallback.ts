import type { IssueMapRow } from './issue-map'

/** Built-in fallback for loadIssueMap when the Sheet is unavailable (no disk read at runtime). Base names only. */
export const ISSUE_MAP_FALLBACK: IssueMapRow[] = [
  { source: 'ahrefs', native: '4XX page', key: 'broken-internal-4xx', name: 'Broken internal pages (4xx)' },
  { source: 'sf', native: 'Internal Client Error (4xx)', key: 'broken-internal-4xx', name: 'Broken internal pages (4xx)' },
  { source: 'gsc_indexing', native: 'Not found (404)', key: 'broken-internal-4xx', name: 'Broken internal pages (4xx)' },
  { source: 'ahrefs', native: '404 page', key: 'broken-internal-4xx', name: 'Broken internal pages (4xx)' },
  { source: 'ahrefs', native: 'Redirect chain', key: 'redirect-chains', name: 'Redirect chains' },
  { source: 'sf', native: 'Redirect Chain', key: 'redirect-chains', name: 'Redirect chains' },
  { source: 'gsc_indexing', native: 'Redirect error', key: 'redirect-chains', name: 'Redirect chains' },
  { source: 'ahrefs', native: 'Noindex page', key: 'noindex-pages', name: 'Pages set to noindex' },
  { source: 'sf', native: 'Directives: Noindex', key: 'noindex-pages', name: 'Pages set to noindex' },
  { source: 'gsc_indexing', native: 'Excluded by \'noindex\' tag', key: 'noindex-pages', name: 'Pages set to noindex' },
  { source: 'ahrefs', native: 'Meta description tag missing or empty', key: 'meta-description-missing', name: 'Missing meta description' },
  { source: 'sf', native: 'Page Titles: Missing', key: 'page-title-missing', name: 'Missing page title' },
  { source: 'gsc_indexing', native: 'Page with redirect', key: 'redirected-pages', name: 'Pages that redirect' },
  { source: 'ahrefs', native: '3XX redirect', key: 'redirected-pages', name: 'Pages that redirect' },
  { source: 'sf', native: 'Internal Redirection (3xx)', key: 'redirected-pages', name: 'Pages that redirect' },
  { source: 'gsc_indexing', native: 'Server error (5xx)', key: 'server-errors-5xx', name: 'Server errors (5xx)' },
  { source: 'sf', native: 'Internal Server Error (5xx)', key: 'server-errors-5xx', name: 'Server errors (5xx)' },
  { source: 'gsc_cwv', native: 'LCP issue: longer than 2.5s', key: 'lcp-over-2-5s', name: 'LCP slower than 2.5s' },
  { source: 'gsc_cwv', native: 'LCP issue: longer than 4s', key: 'lcp-over-4s', name: 'LCP slower than 4s' },
  { source: 'gsc_cwv', native: 'CLS issue: more than 0.1', key: 'cls-over-0-1', name: 'CLS above 0.1' },
  { source: 'gsc_cwv', native: 'CLS issue: more than 0.25', key: 'cls-over-0-25', name: 'CLS above 0.25' },
  { source: 'gsc_cwv', native: 'INP issue: longer than 200ms', key: 'inp-over-200ms', name: 'INP slower than 200ms' },
  { source: 'gsc_cwv', native: 'INP issue: longer than 500ms', key: 'inp-over-500ms', name: 'INP slower than 500ms' },
]
