import { describe, expect, it } from 'vitest'
import { AEO_KPI_IDS, DEFAULT_KPIS } from '@/lib/report-sections/aeo-kpis'
import { KPI_CATALOG, effectiveKpis, peecSentimentScore, unavailableReason } from './kpi-catalog'

describe('KPI_CATALOG', () => {
  it('has an entry for every id with the right units', () => {
    for (const id of AEO_KPI_IDS) expect(KPI_CATALOG[id]).toBeDefined()
    expect(KPI_CATALOG['visibility-rank'].unit).toBe('places')
    expect(KPI_CATALOG['ai-sessions'].unit).toBe('pct')
    expect(KPI_CATALOG['ai-cvr'].unit).toBe('pts')
  })
})

describe('effectiveKpis', () => {
  it('defaults minus unavailable ones', () => {
    expect(effectiveKpis(null, { ga4Connected: true, provider: 'peec' })).toEqual([...DEFAULT_KPIS])
    expect(effectiveKpis(null, { ga4Connected: false, provider: 'peec' })).toEqual(['visibility', 'share-of-voice', 'used-as-source'])
    expect(effectiveKpis(null, { ga4Connected: true, provider: 'profound' })).toEqual(['visibility', 'share-of-voice', 'ai-sessions', 'ai-leads'])
  })
  it('keeps a saved selection unchanged', () => {
    expect(effectiveKpis(['ai-leads'], { ga4Connected: false, provider: 'peec' })).toEqual(['ai-leads'])
  })
})

describe('unavailableReason', () => {
  it('names the reason', () => {
    expect(unavailableReason('ai-cvr', { ga4Connected: false, provider: 'peec' })).toBe('Source not connected')
    expect(unavailableReason('used-as-source', { ga4Connected: true, provider: 'profound' })).toBe('Not available from Profound')
    expect(unavailableReason('visibility', { ga4Connected: false, provider: 'profound' })).toBeNull()
  })
})

describe('peecSentimentScore', () => {
  it('rescales -1..1 to 0..100', () => {
    expect(Math.round(peecSentimentScore(0.17157492682106137))).toBe(59)
    expect(peecSentimentScore(-1)).toBe(0)
    expect(peecSentimentScore(1)).toBe(100)
  })
})
