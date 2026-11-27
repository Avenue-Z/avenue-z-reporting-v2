import { describe, it, expect } from 'vitest'
import { FIXTURE_PEEC_CTX } from '../parts/__fixtures__/peec-ctx'
import { buildPeecCtx, type KpiInputs, type PeecCtx } from '../ctx'
import type { BrandRanking, PeecOverview } from '@/lib/peec/client'
import type { AiKpiWindow } from '@/lib/ga4/ai-kpis'
import { computeKpiTile, priorRank } from './kpi-values'
import { formatDelta, deltaTone } from './delta'

const brand = (over: Partial<BrandRanking>): BrandRanking => ({
  rank: 1, name: 'X', visibility: 0, visibilityDelta: 0, sov: 0, sovDelta: 0,
  sentiment: 0, sentimentDelta: 0, position: 1, positionDelta: 0, ...over,
})

function rankings(): BrandRanking[] {
  const rows: BrandRanking[] = []
  for (let i = 1; i <= 29; i++) {
    rows.push(brand({ rank: i, name: `B${i}`, visibility: 60 - i, visibilityDelta: 0 }))
  }
  rows[8] = brand({ rank: 9, name: 'Renaissance', visibility: 24.9, visibilityDelta: -3.98, sov: 10, sovDelta: 1.2, sentiment: 0.17, sentimentDelta: -0.015, isYou: true })
  return rows
}

const data = {
  ...FIXTURE_PEEC_CTX.data,
  brandRankings: rankings(),
  competitorAverages: { visibility: 19.7, sov: 5.5, sentiment: 0.1, position: 4 },
  topDomains: [
    { domain: 'renaissancebenefits.com', retrieved: 37.0, retrievedDelta: -10.28, citationRate: 1, citationRateDelta: 0, citationCount: 1, priorCitationCount: 1, type: 'Own' as const },
  ],
} as PeecOverview

const win = (total: number, sessions: number, leads: number): AiKpiWindow => ({
  totalSessions: total,
  bySource: [
    { source: 'chatgpt.com', sessions: Math.round(sessions / 2), keyEvents: 50 },
    { source: 'perplexity.ai', sessions: sessions - Math.round(sessions / 2), keyEvents: 50 },
  ],
  leadsBySource: [{ source: 'chatgpt.com', leads }],
})

const ok: KpiInputs = {
  saved: null,
  ga4Connected: true,
  ga4: { status: 'ok', now: win(28785, 234, 4), prior: win(41618, 104, 1) },
  profoundSentiment: null,
}

function ctx(over: { kpi?: Partial<KpiInputs>; models?: ('ChatGPT')[] | null; provider?: 'peec' | 'profound'; d?: PeecOverview } = {}): PeecCtx {
  return buildPeecCtx({
    data: over.d ?? data,
    provider: over.provider ?? 'peec',
    models: over.models ?? null,
    aiTraffic: { available: false, sessions: 0, sessionsPrior: null },
    audience: 'internal',
    kpi: { ...ok, ...over.kpi },
  })
}

describe('computeKpiTile', () => {
  it('visibility', () => {
    const t = computeKpiTile('visibility', ctx())
    expect(t.value).toBe('24.9%')
    expect(t.delta).toBeCloseTo(-3.98)
    expect(t.unit).toBe('pts')
    expect(t.footer).toBe('Competitor avg · 19.7%')
    expect(t.badge).toBe('Peec')
  })

  it('rank', () => {
    const t = computeKpiTile('visibility-rank', ctx())
    expect(t.value).toBe('#9 of 29')
    expect(t.unit).toBe('places')
  })

  it('priorRank counts brands with a strictly higher prior visibility', () => {
    const a = brand({ name: 'A', visibility: 50, visibilityDelta: 20 })
    const you = brand({ name: 'You', visibility: 40, visibilityDelta: -15, isYou: true })
    const b = brand({ name: 'B', visibility: 35, visibilityDelta: 0 })
    expect(priorRank([a, you, b], you)).toBe(1)
    // current rank 2, so the tile delta is 1 - 2 = -1: one place down
    expect(formatDelta(priorRank([a, you, b], you) - 2, 'places')).toBe('↓ 1 place')
    expect(deltaTone(-1, 'higher', 'places')).toBe('bad')
  })

  it('used as a source', () => {
    const t = computeKpiTile('used-as-source', ctx())
    expect(t.value).toBe('37.0%')
    expect(t.delta).toBeCloseTo(-10.28)
    expect(t.footer).toBe('Answers that retrieved renaissancebenefits.com')
  })

  it('peec sentiment is rescaled to 0-100', () => {
    const t = computeKpiTile('sentiment', ctx())
    expect(t.value).toBe('59')
    expect(t.delta).toBeCloseTo(-0.75)
  })

  it('ga4 tiles', () => {
    const c = ctx()
    const s = computeKpiTile('ai-sessions', c)
    expect(s.value).toBe('234')
    expect(s.delta).toBeCloseTo(125.0)
    expect(s.badge).toBe('GA4')
    const sh = computeKpiTile('ai-traffic-share', c)
    expect(sh.value).toBe('0.8%')
    expect(sh.delta).toBeCloseTo(0.56, 1)
    const l = computeKpiTile('ai-leads', c)
    expect(l.value).toBe('4')
    expect(l.delta).toBe(300)
    expect(l.footer).toBe('GA4 lead events from AI sessions')
    const cv = computeKpiTile('ai-cvr', c)
    expect(cv.value).toBe('1.7%')
    expect(cv.delta).toBeCloseTo(0.75, 1)
  })

  it('prior zero gives no delta', () => {
    const c = ctx({ kpi: { ga4: { status: 'ok', now: win(28785, 234, 4), prior: win(41618, 0, 0) } } })
    expect(computeKpiTile('ai-sessions', c).delta).toBeNull()
    expect(computeKpiTile('ai-leads', c).delta).toBeNull()
    expect(computeKpiTile('ai-cvr', c).delta).toBeNull()
  })

  it('ga4 error', () => {
    const c = ctx({ kpi: { ga4: { status: 'error' } } })
    const t = computeKpiTile('ai-sessions', c)
    expect(t.value).toBe('--')
    expect(t.footer).toBe('GA4 data unavailable')
    expect(t.state).toBe('ok')
    expect(computeKpiTile('visibility', c).value).toBe('24.9%')
  })

  it('not connected', () => {
    const t = computeKpiTile('ai-leads', ctx({ kpi: { ga4Connected: false, ga4: { status: 'not-configured' } } }))
    expect(t.state).toBe('not-connected')
    expect(t.footer).toBe('Source not connected')
    expect(t.value).toBe('--')
    expect(t.delta).toBeNull()
  })

  it('model filter', () => {
    const c = ctx({ models: ['ChatGPT'] })
    for (const id of ['visibility', 'share-of-voice', 'used-as-source', 'ai-sessions', 'ai-leads'] as const) {
      expect(computeKpiTile(id, c).delta).toBeNull()
    }
    const r = computeKpiTile('visibility-rank', c)
    expect(r.value).toBe('--')
    expect(r.footer).toBe('Not available with a model filter')
    expect(computeKpiTile('ai-sessions', c).value).toBe('117')
  })

  it('profound used-as-source is unavailable', () => {
    const t = computeKpiTile('used-as-source', ctx({ provider: 'profound' }))
    expect(t.state).toBe('unavailable')
    expect(t.footer).toBe('Not available from Profound')
    expect(t.badge).toBe('Profound')
  })

  it('profound sentiment', () => {
    const t = computeKpiTile('sentiment', ctx({ provider: 'profound', kpi: { profoundSentiment: { now: 72.4, prior: 70 } } }))
    expect(t.value).toBe('72%')
    expect(t.delta).toBeCloseTo(2.4)
    expect(computeKpiTile('sentiment', ctx({ provider: 'profound' })).value).toBe('--')
  })

  it('no identified brand', () => {
    const d = { ...data, brandRankings: data.brandRankings.map((b) => ({ ...b, isYou: false })) } as PeecOverview
    const t = computeKpiTile('visibility', ctx({ d }))
    expect(t.value).toBe('--')
    expect(t.footer).toBe('Brand not identified')
  })
})
