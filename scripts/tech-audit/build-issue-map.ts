/**
 * Drafts the canonical issue map seed (spec §6.4) for AEO-team review.
 *   CACHE_DISABLE=1 npx tsx --env-file=.env.local scripts/tech-audit/build-issue-map.ts
 * Output: OUT_PATH or tmp/issue-map-seed.csv  (columns: source,native_issue_name,canonical_issue_key,canonical_issue_name,reviewed)
 * Spends ~50 Ahrefs API units per project. Never prints the API key.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { parseCsv } from '../../lib/technical-audit/issue-map'

// Site Audit project IDs, from docs/qa/technical-audit-source-probes.md (DB columns not populated yet).
const AHREFS_PROJECT_IDS = [
  8543164, 8543165, 8543166, 8543167, 8543168, 8543169, 8543172, 8543173, 8543176, 8543177, 8543178, 8645204,
  8674451, 8851204, 8878316, 9002108, 9371114, 10012602, 10110482, 10236590, 10287531, 10292001, 10311239, 10650735,
]

// Spec A.2 GSC indexing reasons + the 14 Renaissance reasons from the probes doc (union).
const GSC_INDEXING_REASONS = [
  'Server error (5xx)', 'Not found (404)', 'Soft 404', 'Redirect error', 'Blocked by robots.txt',
  'Blocked due to unauthorized request (401)', 'Crawled - currently not indexed', 'Discovered - currently not indexed',
  'Duplicate without user-selected canonical', 'Duplicate, Google chose different canonical than user',
  'Alternate page with proper canonical tag', 'Page with redirect', "Excluded by 'noindex' tag",
  'Blocked due to other 4xx issue', 'Blocked due to access forbidden (403)',
]
const GSC_CWV_ISSUES = [
  'LCP issue: longer than 2.5s', 'LCP issue: longer than 4s', 'CLS issue: more than 0.1',
  'CLS issue: more than 0.25', 'INP issue: longer than 200ms', 'INP issue: longer than 500ms',
]

// Conservative cross-tool equivalences; everything else keys on its own normalized name for the team to merge.
const ALIASES: Record<string, string> = {
  '4xx page': 'broken-internal-4xx', '404 page': 'broken-internal-4xx',
  'internal client error (4xx)': 'broken-internal-4xx', 'not found (404)': 'broken-internal-4xx',
  'internal server error (5xx)': 'server-errors-5xx', 'server error (5xx)': 'server-errors-5xx',
  'redirect chain': 'redirect-chains', 'noindex page': 'noindex-pages', "excluded by 'noindex' tag": 'noindex-pages',
  'page with redirect': 'redirected-pages', '3xx redirect': 'redirected-pages',
  'internal redirection (3xx)': 'redirected-pages',
}
const CANONICAL_NAMES: Record<string, string> = {
  'broken-internal-4xx': 'Broken internal pages (4xx)', 'server-errors-5xx': 'Server errors (5xx)',
  'redirect-chains': 'Redirect chains', 'noindex-pages': 'Pages set to noindex', 'redirected-pages': 'Pages that redirect',
}

const slug = (s: string) => s.toLowerCase().replace(/[‐-―]/g, '-').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
const keyFor = (name: string) => ALIASES[name.toLowerCase().replace(/[‐-―]/g, '-').trim()] ?? slug(name)
const nameFor = (key: string, native: string) => CANONICAL_NAMES[key] ?? native
const csvCell = (s: string) => (/[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)

// mergeIssues retries without these suffixes, so the map lists base names only.
const stripSuffix = (n: string) => n.replace(/ \((not indexable|desktop|mobile)\)$/i, '')

async function ahrefsNames(): Promise<Set<string>> {
  const key = process.env.AHREFS_API_KEY
  if (!key) throw new Error('AHREFS_API_KEY is not set')
  const names = new Set<string>()
  let ok = 0
  for (const id of AHREFS_PROJECT_IDS) {
    const res = await fetch(`https://api.ahrefs.com/v3/site-audit/issues?project_id=${id}`, {
      headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(60_000),
    })
    if (!res.ok) { console.warn(`Ahrefs project ${id}: HTTP ${res.status} (skipped)`); continue }
    const body = (await res.json()) as { issues?: { name?: string }[] }
    for (const i of body.issues ?? []) if (i.name) names.add(stripSuffix(i.name))
    ok++
  }
  console.log(`Ahrefs: ${ok}/${AHREFS_PROJECT_IDS.length} projects read`)
  return names
}

function sfNames(): Set<string> {
  const candidates: string[] = []
  const driveRoot = process.env.SF_EXPORTS_DIR
  if (driveRoot && existsSync(driveRoot)) {
    const walk = (d: string) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name)
        if (e.isDirectory()) walk(p)
        else if (/^issues_overview.*\.csv$/i.test(e.name)) candidates.push(p)
      }
    }
    walk(driveRoot)
  }
  const fixture = path.join(process.cwd(), 'lib/technical-audit/__fixtures__/sf-issues-overview.csv')
  if (!candidates.length && existsSync(fixture)) candidates.push(fixture)
  const names = new Set<string>()
  if (!candidates.length) {
    console.warn('WARNING: no Screaming Frog issues_overview CSV found (set SF_EXPORTS_DIR or add the fixture); skipping SF')
    return names
  }
  for (const file of candidates) {
    const rows = parseCsv(readFileSync(file, 'utf-8'))
    const col = (rows[0] ?? []).findIndex((h) => h.trim().toLowerCase() === 'issue name')
    if (col < 0) { console.warn(`WARNING: ${file} has no "Issue Name" column; skipped`); continue }
    for (const r of rows.slice(1)) if (r[col]?.trim()) names.add(stripSuffix(r[col].trim()))
  }
  return names
}

async function main() {
  const rows: [string, string][] = []
  const counts: Record<string, number> = {}
  const add = (source: string, names: Iterable<string>) => {
    for (const n of [...names].sort((a, b) => a.localeCompare(b))) rows.push([source, n])
    counts[source] = (counts[source] ?? 0) + [...names].length
  }
  add('ahrefs', await ahrefsNames())
  add('sf', sfNames())
  add('gsc_indexing', GSC_INDEXING_REASONS)
  add('gsc_cwv', GSC_CWV_ISSUES)

  const out = process.env.OUT_PATH ?? 'tmp/issue-map-seed.csv'
  mkdirSync(path.dirname(out), { recursive: true })
  const lines = ['source,native_issue_name,canonical_issue_key,canonical_issue_name,reviewed']
  for (const [source, native] of rows) {
    const key = keyFor(native)
    lines.push([source, native, key, nameFor(key, native), 'FALSE'].map(csvCell).join(','))
  }
  writeFileSync(out, lines.join('\n') + '\n')
  console.log(`Wrote ${rows.length} rows to ${out}`, counts)
}

main().catch((e) => { console.error(e instanceof Error ? e.message : 'failed'); process.exit(1) })
