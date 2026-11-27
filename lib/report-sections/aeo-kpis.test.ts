import { afterEach, describe, expect, it, vi } from 'vitest'
import { AEO_KPI_IDS, parseKpiSelection, readSavedKpis } from './aeo-kpis'

describe('parseKpiSelection', () => {
  it('returns ids in catalog order', () => {
    expect(parseKpiSelection(['ai-leads', 'visibility'])).toEqual(['visibility', 'ai-leads'])
    expect(parseKpiSelection([])).toEqual([])
  })
  it('rejects bad input', () => {
    expect(() => parseKpiSelection('nope')).toThrow('invalid kpis')
    expect(() => parseKpiSelection([1])).toThrow('invalid kpis')
    expect(() => parseKpiSelection(['bogus'])).toThrow('unknown kpi bogus')
    expect(() => parseKpiSelection(['sentiment', 'sentiment'])).toThrow('duplicate kpi sentiment')
    expect(() => parseKpiSelection([...AEO_KPI_IDS].slice(0, 6))).toThrow('at most 5 kpis')
  })
})

describe('readSavedKpis', () => {
  afterEach(() => vi.restoreAllMocks())
  it('returns null for undefined without warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(readSavedKpis(undefined, 'x')).toBeNull()
    expect(warn).not.toHaveBeenCalled()
  })
  it('warns and returns null for a non-array', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(readSavedKpis('oops', 'x')).toBeNull()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0][0])).toContain('slug=x')
  })
  it('keeps known ids, deduped, in catalog order, first five', () => {
    expect(readSavedKpis(['ai-cvr', 'bogus', 'visibility', 'visibility'], 'x')).toEqual(['visibility', 'ai-cvr'])
    expect(readSavedKpis([...AEO_KPI_IDS].reverse(), 'x')).toEqual(AEO_KPI_IDS.slice(0, 5))
    expect(readSavedKpis([], 'x')).toEqual([])
  })
})
