// lib/organic-social/aeo-informed/column-map.test.ts
import { describe, it, expect } from 'vitest'
import { PDF_COLUMN_MAP } from './column-map'
import { buildSocialsRows, buildGapRows } from './tables'
import { buildCitationGraph } from './graphs'

const agg = { url: 'u', title: null, channelTitle: null, classification: null, retrievals: 1, citations: 1, positionSum: 0, positionCount: 0, brandIds: [] }
const brands = [{ id: 'b', name: 'B', isOwn: true, platforms: [] }]
const socialsFields = Object.keys(buildSocialsRows({ current: [agg], prior: [], chatsCurrent: 1, chatsPrior: 1, brands, domainType: 'x' })[0])
const gapFields = Object.keys(buildGapRows({ current: [agg], prior: [], brands, domainType: 'x' })[0])
const graphFields = Object.keys(buildCitationGraph({ graphId: 'citations_all', platforms: ['linkedin'], rows: [], brands, ownBrandId: 'b', ownBrandName: 'B', from: '2026-09-03', weeks: 1, asOf: '2026-11-08' })[0])

describe('PDF_COLUMN_MAP', () => {
  const fieldsOf = (t: string) => ({ socials: socialsFields, gaps: gapFields, graph: graphFields } as Record<string, string[]>)[t]
  it('every mapped field exists on the output it names', () => {
    for (const m of PDF_COLUMN_MAP.filter((x) => x.field !== null && ['socials', 'gaps', 'graph'].includes(x.output))) {
      expect(fieldsOf(m.output), `${m.pdf}`).toContain(m.field)
    }
  })
  it('every output field of every table and graph appears in the map', () => {
    for (const [out, fields] of [['socials', socialsFields], ['gaps', gapFields], ['graph', graphFields]] as const) {
      const mapped = new Set(PDF_COLUMN_MAP.filter((x) => x.output === out).map((x) => x.field))
      for (const f of fields) expect(mapped.has(f), `${out}.${f} has no PDF column`).toBe(true)
    }
  })
  it('names every item in the outline, and marks brand logos as not available', () => {
    const names = PDF_COLUMN_MAP.map((m) => m.pdf.toLowerCase())
    for (const needle of ['insights', 'domain tags', 'url tags', 'indicators', 'date range', 'mentions (logos)', 'citation share', 'citation position', 'used as a source', 'citations on linkedin', 'citations on instagram']) {
      expect(names.some((n) => n.includes(needle)), needle).toBe(true)
    }
    expect(PDF_COLUMN_MAP.find((m) => m.pdf.toLowerCase().includes('mentions (logos)'))!.status).toBe('not_available')
  })
  it('the socials Total is derived (named by the team, not reproduced), its change stays unverified, and citation rate is mapped on both tables', () => {
    const socials = (field: string) => PDF_COLUMN_MAP.filter((m) => m.output === 'socials' && m.field === field)
    expect(socials('totalCitations').map((m) => m.status)).toEqual(['derived'])
    expect(socials('totalCitationsDelta').map((m) => m.status)).toEqual(['unverified'])
    for (const out of ['socials', 'gaps']) for (const field of ['citationRate', 'citationRateDelta']) {
      expect(PDF_COLUMN_MAP.filter((m) => m.output === out && m.field === field).map((m) => m.status), `${out}.${field}`).toEqual(['derived'])
    }
  })
  it('every entry has a status and a note', () => {
    for (const m of PDF_COLUMN_MAP) { expect(['exact', 'derived', 'unverified', 'not_available']).toContain(m.status); expect(m.note.length).toBeGreaterThan(0) }
  })
})
