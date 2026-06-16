// lib/content-calendar/date.test.ts
// Run: npx tsx lib/content-calendar/date.test.ts
import { strict as assert } from 'node:assert'
import { parseYearHint, parseCalendarDate } from './date'

// ── parseYearHint: pull a 4-digit year out of a month-context cell ───────────
assert.equal(parseYearHint('March 2026'), 2026)
assert.equal(parseYearHint('April 2026'), 2026)
assert.equal(parseYearHint('  June 2026 '), 2026)
assert.equal(parseYearHint('2026'), 2026)
assert.equal(parseYearHint('Q1 2025'), 2025)
assert.equal(parseYearHint(''), null)
assert.equal(parseYearHint(undefined), null)
assert.equal(parseYearHint('no year here'), null)

const TODAY = new Date('2026-06-16T00:00:00Z')

// ── parseCalendarDate: ISO passthrough ───────────────────────────────────────
assert.equal(parseCalendarDate('2026-03-03', { today: TODAY }), '2026-03-03')
assert.equal(parseCalendarDate('2026-03-03T10:30:00', { today: TODAY }), '2026-03-03')

// ── M/D/YYYY and zero-padded variants ────────────────────────────────────────
assert.equal(parseCalendarDate('3/3/2026', { today: TODAY }), '2026-03-03')
assert.equal(parseCalendarDate('03/03/2026', { today: TODAY }), '2026-03-03')
assert.equal(parseCalendarDate('12/25/2025', { today: TODAY }), '2025-12-25')

// ── M/D/YY (2-digit year → 2000+) ────────────────────────────────────────────
assert.equal(parseCalendarDate('3/3/26', { today: TODAY }), '2026-03-03')

// ── bare M/D + yearHint (authoritative; no future check) ─────────────────────
assert.equal(parseCalendarDate('3/3', { yearHint: 2026, today: TODAY }), '2026-03-03')
assert.equal(parseCalendarDate('5/18', { yearHint: 2026, today: TODAY }), '2026-05-18')
assert.equal(parseCalendarDate('12/25', { yearHint: 2025, today: TODAY }), '2025-12-25')

// ── bare M/D, no hint → nearest non-future year heuristic ────────────────────
assert.equal(parseCalendarDate('3/3', { today: TODAY }), '2026-03-03')   // past this year
assert.equal(parseCalendarDate('6/16', { today: TODAY }), '2026-06-16')  // == today
assert.equal(parseCalendarDate('12/25', { today: TODAY }), '2025-12-25') // future this year → prior year

// ── placeholders / empties → null ────────────────────────────────────────────
for (const v of ['', '   ', 'TBD', 'tbd', 'pending', '-', 'n/a', 'N/A', 'na']) {
  assert.equal(parseCalendarDate(v, { today: TODAY }), null, `expected null for ${JSON.stringify(v)}`)
}
assert.equal(parseCalendarDate(undefined, { today: TODAY }), null)

// ── invalid / garbage → null (validated by real-date round-trip) ─────────────
assert.equal(parseCalendarDate('hello', { today: TODAY }), null)
assert.equal(parseCalendarDate('13/2', { yearHint: 2026, today: TODAY }), null)  // month > 12
assert.equal(parseCalendarDate('2/30', { yearHint: 2026, today: TODAY }), null)  // Feb 30 not a real date
assert.equal(parseCalendarDate('4/31', { yearHint: 2026, today: TODAY }), null)  // Apr 31 not a real date

console.log('date.test.ts: all assertions passed')
