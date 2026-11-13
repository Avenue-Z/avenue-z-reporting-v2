// lib/organic-social/aeo-informed/shape.test.ts
import { describe, it, expect } from 'vitest'
import { parseUrlRows, parseBrands, parseSocialChannels, parseSourceTags, parseClassifications, parseBrandDayRows, PeecShapeError } from './shape'

const urlRow = (o: Record<string, unknown> = {}) => ({
  url: 'https://x.com/a', classification: 'ARTICLE', title: 'T', channel_title: 'C',
  citation_count: 2, retrieval_count: 5, citation_rate: 0.4, citation_position: 3.5, citation_position_sum: 7, citation_position_count: 2,
  mentioned_brands: [{ id: 'b1' }], ...o,
})
const shapeErr = (fn: () => unknown) => { try { fn() } catch (e) { return e as PeecShapeError } throw new Error('did not throw') }

describe('parseUrlRows', () => {
  it('accepts a spec-shaped row and ignores extra fields', () => {
    const out = parseUrlRows({ data: [urlRow({ extra: 1, usage_count: 9 })] }, '/reports/urls')
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ url: 'https://x.com/a', citation_count: 2, retrieval_count: 5, citation_position: 3.5 })
    expect('extra' in out[0]).toBe(false)
  })
  it('allows nulls where Peec allows them', () => {
    const [r] = parseUrlRows({ data: [urlRow({ classification: null, title: null, channel_title: null, citation_position: null })] }, '/reports/urls')
    expect(r).toMatchObject({ classification: null, title: null, channel_title: null, citation_position: null })
  })
  it('treats a missing optional channel_title as null', () => {
    const row: Record<string, unknown> = urlRow(); delete row.channel_title
    expect(parseUrlRows({ data: [row] }, '/reports/urls')[0].channel_title).toBeNull()
  })
  it('keeps the optional date and chat id when present', () => {
    const [r] = parseUrlRows({ data: [urlRow({ date: '2026-09-03', chat: { id: 'ch_1' } })] }, '/reports/urls')
    expect(r).toMatchObject({ date: '2026-09-03', chat: { id: 'ch_1' } })
  })
  it('rejects a missing required field and names the row and field', () => {
    const row: Record<string, unknown> = urlRow(); delete row.citation_position_sum
    const e = shapeErr(() => parseUrlRows({ data: [urlRow(), row] }, '/reports/urls'))
    expect(e).toBeInstanceOf(PeecShapeError)
    expect(e.message).toContain('/reports/urls')
    expect(e.message).toContain('data[1].citation_position_sum')
  })
  it('rejects a stringified number, and the message does not echo the value', () => {
    const e = shapeErr(() => parseUrlRows({ data: [urlRow({ citation_count: '4' })] }, '/reports/urls'))
    expect(e.message).toContain('citation_count')
    expect(e.message).not.toContain('"4"')
  })
  it('rejects a negative count and a non-finite number', () => {
    expect(() => parseUrlRows({ data: [urlRow({ retrieval_count: -1 })] }, '/reports/urls')).toThrow(PeecShapeError)
    expect(() => parseUrlRows({ data: [urlRow({ retrieval_count: NaN })] }, '/reports/urls')).toThrow(PeecShapeError)
  })
  it('rejects mentioned_brands that is not a list of objects with an id', () => {
    expect(() => parseUrlRows({ data: [urlRow({ mentioned_brands: 'b1' })] }, '/reports/urls')).toThrow(PeecShapeError)
    expect(() => parseUrlRows({ data: [urlRow({ mentioned_brands: [{}] })] }, '/reports/urls')).toThrow(PeecShapeError)
  })
  it('rejects a body with no data array, a non-object body, and a non-object row', () => {
    expect(() => parseUrlRows({ rows: [] }, '/reports/urls')).toThrow(PeecShapeError)
    expect(() => parseUrlRows({ data: 'x' }, '/reports/urls')).toThrow(PeecShapeError)
    expect(() => parseUrlRows(null, '/reports/urls')).toThrow(PeecShapeError)
    expect(() => parseUrlRows({ data: [null] }, '/reports/urls')).toThrow(PeecShapeError)
  })
  it('accepts an empty data array', () => {
    expect(parseUrlRows({ data: [] }, '/reports/urls')).toEqual([])
  })
})

describe('parseUrlRows options', () => {
  it('requires a date on every row when asked (by-day pulls)', () => {
    expect(() => parseUrlRows({ data: [urlRow()] }, '/reports/urls', { requireDate: true })).toThrow(PeecShapeError)
    expect(parseUrlRows({ data: [urlRow({ date: '2026-09-03T00:00:00Z' })] }, '/reports/urls', { requireDate: true })[0].date).toBe('2026-09-03')
  })
  it('requires a chat id on every row when asked (chat-level pull)', () => {
    expect(() => parseUrlRows({ data: [urlRow({ date: '2026-09-03' })] }, '/reports/urls', { requireDate: true, requireChat: true })).toThrow(PeecShapeError)
    expect(parseUrlRows({ data: [urlRow({ date: '2026-09-03', chat: { id: 'ch_1' } })] }, '/reports/urls', { requireDate: true, requireChat: true })[0].chat).toEqual({ id: 'ch_1' })
  })
  it('without the options a missing date or chat is fine', () => {
    expect(parseUrlRows({ data: [urlRow()] }, '/reports/urls')).toHaveLength(1)
  })
})

describe('dates are checked, not silently dropped', () => {
  it('rejects a date that is not YYYY-MM-DD, or not a real day', () => {
    for (const bad of ['2026-9-3', '09/03/2026', '2026-02-30', 'yesterday']) {
      expect(() => parseUrlRows({ data: [urlRow({ date: bad })] }, '/reports/urls', { requireDate: true })).toThrow(PeecShapeError)
      expect(() => parseBrandDayRows({ data: [{ date: bad, visibility_total: 1 }] })).toThrow(PeecShapeError)
    }
  })
})

describe('parseBrands', () => {
  it('reads id, name and is_own', () => {
    expect(parseBrands({ data: [{ id: 'b1', name: 'Example', is_own: true, color: '#fff', domains: [] }] })).toEqual([{ id: 'b1', name: 'Example', is_own: true, color: '#fff' }])
  })
  it('parseBrands keeps a hex color and gives null when color is absent, not a string, or not a hex color', () => {
    const one = (color: unknown) => parseBrands({ data: [{ id: 'b1', name: 'X', is_own: false, ...(color === undefined ? {} : { color }) }] })[0].color
    expect(one('#60FDFF')).toBe('#60FDFF')
    expect(one('#60fdff80')).toBe('#60fdff80')
    expect(one(undefined)).toBeNull()
    expect(one(42)).toBeNull()
    expect(one('red;background:url(x)')).toBeNull()
  })
  it('rejects a missing is_own and an empty name', () => {
    expect(() => parseBrands({ data: [{ id: 'b1', name: 'X' }] })).toThrow(PeecShapeError)
    expect(() => parseBrands({ data: [{ id: 'b1', name: '', is_own: false }] })).toThrow(PeecShapeError)
  })
})

describe('parseSocialChannels', () => {
  it('reads brand_id, platform and channel_handle', () => {
    expect(parseSocialChannels({ data: [{ id: 'c', brand_id: 'b1', platform: 'linkedin', channel_id: 'x', channel_handle: 'company/foo' }] }))
      .toEqual([{ brand_id: 'b1', platform: 'linkedin', channel_handle: 'company/foo' }])
  })
  it('rejects a missing handle', () => {
    expect(() => parseSocialChannels({ data: [{ id: 'c', brand_id: 'b1', platform: 'linkedin' }] })).toThrow(PeecShapeError)
  })
})

describe('parseSourceTags and parseClassifications', () => {
  it('reads tag id and name', () => {
    expect(parseSourceTags({ data: [{ id: 'stg_1', name: 'Organic Social', color: 'pink' }], total_count: 1 })).toEqual([{ id: 'stg_1', name: 'Organic Social' }])
  })
  it('rejects a source tag id that is not stg_', () => {
    expect(() => parseSourceTags({ data: [{ id: 'tg_1', name: 'x', color: 'pink' }] })).toThrow(PeecShapeError)
  })
  it('reads classification names', () => {
    expect(parseClassifications({ data: [{ name: 'Organic Social', color: 'pink' }, { name: 'Editorial - Trade', color: 'teal' }] }, '/classifications/domains')).toEqual([{ name: 'Organic Social' }, { name: 'Editorial - Trade' }])
  })
})

describe('parseBrandDayRows', () => {
  it('reads the date and visibility_total, cutting the date to the day', () => {
    expect(parseBrandDayRows({ data: [{ date: '2026-10-07T00:00:00.000Z', visibility_total: 298, share_of_voice: 0.1 }] })).toEqual([{ date: '2026-10-07', visibility_total: 298 }])
  })
  it('rejects a missing visibility_total', () => {
    expect(() => parseBrandDayRows({ data: [{ date: '2026-10-07' }] })).toThrow(PeecShapeError)
  })
})
