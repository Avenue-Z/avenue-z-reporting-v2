// lib/organic-social/aeo-informed/contract.test.ts
import { describe, it, expect } from 'vitest'
import { OUTPUTS, RAW, sampleRow, type FieldSpec } from './contract'
import { validateRow, validateRows } from './contract-validate'
import { parseUrlRows, parseBrands, parseSocialChannels, parseSourceTags, parseClassifications, parseBrandDayRows, PeecShapeError } from './shape'

const F = (over: Partial<FieldSpec> & Pick<FieldSpec, 'name' | 'kind'>): FieldSpec => over as FieldSpec

describe('validateRow: one rule at a time', () => {
  it('a missing required field', () => {
    expect(validateRow({}, [F({ name: 'a', kind: 'string' })]).map((v) => v.rule)).toEqual(['missing'])
  })
  it('an optional field may be absent', () => {
    expect(validateRow({}, [F({ name: 'a', kind: 'string', optional: true })])).toEqual([])
  })
  it('null where not nullable, and null where nullable', () => {
    expect(validateRow({ a: null }, [F({ name: 'a', kind: 'string' })]).map((v) => v.rule)).toEqual(['null'])
    expect(validateRow({ a: null }, [F({ name: 'a', kind: 'string', nullable: true })])).toEqual([])
  })
  it('the wrong type for each kind', () => {
    const bad: [FieldSpec['kind'], unknown][] = [['string', 5], ['int', '5'], ['int', 5.5], ['float', '5'], ['number', '5'], ['bool', 1], ['date', '2026-9-3'], ['date', 5], ['idList', 'x'], ['idList', [{}]], ['idObject', { id: 5 }], ['stringList', [1]]]
    for (const [kind, value] of bad) expect(validateRow({ a: value }, [F({ name: 'a', kind })]).map((v) => v.rule), `${kind} ${JSON.stringify(value)}`).toEqual(['type'])
  })
  it('accepts a good value for each kind', () => {
    const good: [FieldSpec['kind'], unknown][] = [['string', 'x'], ['int', 5], ['float', 0.5], ['number', 5.5], ['bool', false], ['date', '2026-09-03'], ['idList', [{ id: 'a' }]], ['idObject', { id: 'a' }], ['stringList', ['a']]]
    for (const [kind, value] of good) expect(validateRow({ a: value }, [F({ name: 'a', kind })]), kind).toEqual([])
  })
  it('NaN and Infinity are never a number', () => {
    for (const v of [NaN, Infinity, -Infinity]) expect(validateRow({ a: v }, [F({ name: 'a', kind: 'float' })]).map((x) => x.rule)).toEqual(['type'])
  })
  it('minimum, maximum, minLength, oneOf and prefix', () => {
    expect(validateRow({ a: -1 }, [F({ name: 'a', kind: 'int', min: 0 })]).map((v) => v.rule)).toEqual(['min'])
    expect(validateRow({ a: 2 }, [F({ name: 'a', kind: 'float', max: 1 })]).map((v) => v.rule)).toEqual(['max'])
    expect(validateRow({ a: '' }, [F({ name: 'a', kind: 'string', minLength: 1 })]).map((v) => v.rule)).toEqual(['minLength'])
    expect(validateRow({ a: 'z' }, [F({ name: 'a', kind: 'string', oneOf: ['x', 'y'] })]).map((v) => v.rule)).toEqual(['oneOf'])
    expect(validateRow({ a: 'tg_1' }, [F({ name: 'a', kind: 'string', prefix: 'stg_' })]).map((v) => v.rule)).toEqual(['prefix'])
  })
  it('a closed row rejects an extra field; an open row ignores it', () => {
    expect(validateRow({ a: 'x', b: 1 }, [F({ name: 'a', kind: 'string' })], { closed: true }).map((v) => v.rule)).toEqual(['extra'])
    expect(validateRow({ a: 'x', b: 1 }, [F({ name: 'a', kind: 'string' })])).toEqual([])
  })
  it('a violation names the row and field but never the value', () => {
    const v = validateRows([{ a: 'secret-value' }, { a: 5 }], [F({ name: 'a', kind: 'string' })], 'table')[0]
    expect(v.where).toBe('table[1].a')
    expect(JSON.stringify(v)).not.toContain('secret-value')
  })
})

describe('the output contracts', () => {
  it('describe exactly the fields the builders return', () => {
    expect(OUTPUTS.socials_table.map((f) => f.name)).toEqual(['rank', 'url', 'title', 'channelTitle', 'ownerBrandId', 'isOwnChannel', 'urlType', 'domainType', 'ownBrandMentioned', 'mentionedBrandCount', 'mentionedBrandNames', 'retrievals', 'retrievalsDelta', 'retrievedPct', 'retrievedPctDelta', 'totalCitations', 'totalCitationsDelta'])
    expect(OUTPUTS.url_gaps_table.map((f) => f.name)).toEqual(['rank', 'url', 'title', 'channelTitle', 'urlType', 'domainType', 'mentionedBrandCount', 'mentionedBrandNames', 'citationShare', 'citationPosition', 'retrievals', 'retrievalsDelta', 'totalCitations', 'totalCitationsDelta'])
    expect(OUTPUTS.graph_points.map((f) => f.name)).toEqual(['graphId', 'series', 'weekStart', 'weekEnd', 'value', 'unit', 'partial'])
  })
  it('a sample row built from each contract passes it', () => {
    for (const fields of Object.values(OUTPUTS)) expect(validateRow(sampleRow(fields), fields, { closed: true })).toEqual([])
  })
})

// The parsers in shape.ts and the raw contracts must say the same thing. For every field of every raw contract: a sample passes, and removing it,
// retyping it, nulling it (when not nullable) or breaking its minimum makes the parser throw.
describe('shape.ts and the raw contracts agree (the parsers reject what the contract forbids)', () => {
  type Parse = (body: unknown) => unknown
  const parsers: Record<keyof typeof RAW, Parse> = {
    reports_urls_response: (b) => parseUrlRows(b, '/reports/urls'),
    reports_brands_response: (b) => parseBrandDayRows(b),
    brands_response: (b) => parseBrands(b),
    brand_social_channels_response: (b) => parseSocialChannels(b),
    source_tags_response: (b) => parseSourceTags(b),
    classifications_response: (b) => parseClassifications(b, '/classifications/domains'),
  }
  const wrongValue = (f: FieldSpec): unknown => ({ string: 5, int: 'x', float: 'x', number: 'x', bool: 'x', date: 'nope', idList: 'x', idObject: 'x', stringList: 'x' })[f.kind]
  for (const [name, c] of Object.entries(RAW) as [keyof typeof RAW, (typeof RAW)[keyof typeof RAW]][]) {
    describe(name, () => {
      const parse = parsers[name]
      it('accepts a sample row built from the contract', () => {
        expect(() => parse({ data: [sampleRow(c.rows)] })).not.toThrow()
      })
      for (const f of c.rows) {
        if (!f.optional) it(`rejects a row with ${f.name} missing`, () => {
          const row = sampleRow(c.rows); delete row[f.name]
          expect(() => parse({ data: [row] })).toThrow(PeecShapeError)
        })
        it(`rejects ${f.name} with the wrong type`, () => {
          const row = { ...sampleRow(c.rows), [f.name]: wrongValue(f) }
          expect(() => parse({ data: [row] })).toThrow(PeecShapeError)
        })
        if (!f.nullable && !f.optional) it(`rejects ${f.name} set to null`, () => {
          const row = { ...sampleRow(c.rows), [f.name]: null }
          expect(() => parse({ data: [row] })).toThrow(PeecShapeError)
        })
        if (f.min !== undefined) it(`rejects ${f.name} below its minimum`, () => {
          const row = { ...sampleRow(c.rows), [f.name]: f.min! - 1 }
          expect(() => parse({ data: [row] })).toThrow(PeecShapeError)
        })
        if (f.prefix) it(`rejects ${f.name} without the ${f.prefix} prefix`, () => {
          const row = { ...sampleRow(c.rows), [f.name]: 'zz_1' }
          expect(() => parse({ data: [row] })).toThrow(PeecShapeError)
        })
      }
      it('rejects a body with no data array', () => {
        expect(() => parse({ rows: [] })).toThrow(PeecShapeError)
      })
    })
  }
})
