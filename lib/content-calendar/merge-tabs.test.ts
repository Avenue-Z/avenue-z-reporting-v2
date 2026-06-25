// lib/content-calendar/merge-tabs.test.ts
// Run: npx tsx --env-file=.env.local lib/content-calendar/merge-tabs.test.ts
// (env-file only satisfies the DB module-load guard; this test never hits the DB)
//
// Regression for the "new tab pushed the published content to index 1" bug:
// each tab has its OWN header layout, so merging must parse every tab against
// its own column map. The two layouts below are the REAL Renaissance headers —
// "March – June 2026" has a "Suggested Author (Blog Only)" column that shifts
// the URL column from index 9 (July–Sept) to index 10 (March–June).
import { strict as assert } from 'node:assert'
import { parseTabRows } from './client'

// Tab 1 — "July – September 2026" layout (no "Suggested Author"): URL at index 9.
const JUL_SEP: string[][] = [
  ['Date', 'Priority', 'Content Type', 'Topic', 'Status', 'Publish Date',
   'Suggested Category Tags (Blog Only)', 'Why', 'How',
   'Proposed Page Slug (or Live URL When Published)', 'Relevant AI Queries',
   'Keyword(s)', 'Internal Linking Opportunities', 'Inspiration / Competitor URLs',
   'Organic Social Support', 'Notes', 'hours'],
  ['July 2026', 'P1', 'Blog', 'Future planned piece', 'Planned', '',
   'tags', 'why', 'how', '/blog/future-piece/', 'queries', 'kw', 'links',
   'inspo', 'social', 'notes', '4'],
]

// Tab 2 — "March – June 2026" layout (HAS "Suggested Author"): URL at index 10.
const MAR_JUN: string[][] = [
  ['Date', 'Priority', 'Content Type', 'Topic', 'Status', 'Publish Date',
   'Suggested Author (Blog Only)', 'Suggested Category Tags (Blog Only)', 'Why', 'How',
   'Proposed Page Slug (or Live URL When Published)', 'Relevant AI Queries',
   'Keyword(s)', 'Internal Linking Opportunities', 'Inspiration / Competitor URLs',
   'Organic Social Support', 'Notes'],
  ['March 2026', 'P1', 'Blog', 'Published dental piece', 'Published', '2026-03-03',
   'Jane', 'tags', 'why', 'how',
   'https://renaissancebenefits.com/plans/dental-insurance/', 'queries', 'kw',
   'links', 'inspo', 'social', 'notes'],
]

// Each tab parses against its own column map.
const julRows = parseTabRows(JUL_SEP)
assert.equal(julRows.length, 1, 'July–Sept: one data row')
assert.equal(julRows[0].status, 'Planned')
assert.equal(julRows[0].url, '/blog/future-piece/', 'URL resolved at index 9')
assert.equal(julRows[0].publishDate, null, 'no publish date')

const marRows = parseTabRows(MAR_JUN)
assert.equal(marRows.length, 1, 'March–June: one data row')
assert.equal(marRows[0].status, 'Published')
assert.equal(
  marRows[0].url,
  'https://renaissancebenefits.com/plans/dental-insurance/',
  'URL resolved at index 10 despite the extra Suggested Author column',
)
assert.equal(marRows[0].publishDate, '2026-03-03', 'publish date parsed')

// Merging across tabs keeps both, with each row mapped via its own tab layout.
const merged = [...julRows, ...marRows]
assert.equal(merged.length, 2, 'merged row count = sum of tabs')
const published = merged.filter(r => r.status.trim().toLowerCase() === 'published')
assert.equal(published.length, 1, 'exactly the March–June row is published')
assert.equal(published[0].topic, 'Published dental piece')

// A tab with only a header (or empty) contributes no rows.
assert.deepEqual(parseTabRows([['Date', 'Status']]), [], 'header-only tab → no rows')
assert.deepEqual(parseTabRows([]), [], 'empty tab → no rows')

console.log('merge-tabs.test.ts: all assertions passed')
