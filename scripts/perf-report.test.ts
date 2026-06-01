import { strict as assert } from 'node:assert'
import { parseLines, perCall, perSection, perVendor, type PerfEntry } from './perf-report'

const sample = [
  `PERF {"ts":"2026-05-28T18:00:00.000Z","vendor":"db","fn":"getClientBySlug","client":"avenue-z","ms":12,"ok":true}`,
  `PERF {"ts":"2026-05-28T18:00:00.100Z","vendor":"ga4","fn":"runReport","client":"avenue-z","ms":400,"ok":true}`,
  `PERF {"ts":"2026-05-28T18:00:00.150Z","vendor":"ga4","fn":"runReport","client":"avenue-z","ms":600,"ok":true}`,
  `PERF {"ts":"2026-05-28T18:00:00.200Z","vendor":"ga4","fn":"runReport","client":"avenue-z","ms":800,"ok":false,"err":"boom"}`,
  `noise line that should be ignored`,
  `PERF {"ts":"2026-05-28T18:00:05.000Z","vendor":"db","fn":"getClientBySlug","client":"renaissance","ms":15,"ok":true}`,
  `PERF {"ts":"2026-05-28T18:00:05.100Z","vendor":"peec","fn":"getOverview","client":"renaissance","ms":1200,"ok":true}`,
]

const entries: PerfEntry[] = parseLines(sample)
assert.equal(entries.length, 6, 'should parse 6 PERF lines, skip noise')
assert.equal(entries[0].vendor, 'db')
assert.equal(entries[3].ok, false)

const call = perCall(entries)
const ga4Row = call.find((r) => r.vendor === 'ga4' && r.fn === 'runReport')!
assert.equal(ga4Row.n, 3)
assert.equal(ga4Row.err, 1)
assert.equal(ga4Row.median, 600)
assert.equal(ga4Row.max, 800)

const sections = perSection(entries)
// Section boundary: each occurrence of vendor=db, fn=getClientBySlug starts a new section
// for that client. So we should have 2 sections: avenue-z (4 entries) and renaissance (2).
const az = sections.find((s) => s.client === 'avenue-z')!
assert.equal(az.fetches, 4)
assert.equal(az.wall, 200) // 18:00:00.200 - 18:00:00.000
const renSec = sections.find((s) => s.client === 'renaissance')!
assert.equal(renSec.fetches, 2)
assert.equal(renSec.wall, 100)

const vendors = perVendor(entries)
const ga4Total = vendors.find((v) => v.vendor === 'ga4')!
assert.equal(ga4Total.totalCalls, 3)
assert.equal(ga4Total.totalWaitMs, 400 + 600 + 800)

console.log('perf-report.test: passed')
