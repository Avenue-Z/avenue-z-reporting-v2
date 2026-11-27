import type { KpiId } from '@/lib/report-sections/aeo-kpis'
import { summarizeAiKpis } from '@/lib/ga4/ai-kpis'
import type { BrandRanking } from '@/lib/peec/client'
import type { PeecCtx } from '../ctx'
import type { DeltaUnit } from './delta'
import { pctChange } from './delta'
import { KPI_CATALOG, peecSentimentScore, unavailableReason } from './kpi-catalog'

export type KpiTileModel = {
  id: KpiId
  label: string
  badge: 'Peec' | 'Profound' | 'GA4'
  value: string
  delta: number | null
  unit: DeltaUnit
  footer: string
  state: 'ok' | 'not-connected' | 'unavailable'
}

const NO_VALUE = '--'

const fmt1 = (x: number): string => x.toFixed(1)

function mean(xs: number[]): number | null {
  return xs.length > 0 ? xs.reduce((a, b) => a + b, 0) / xs.length : null
}

/** Prior rank: 1 + the number of other brands whose prior visibility (visibility - visibilityDelta) is strictly higher. */
export function priorRank(rankings: BrandRanking[], you: BrandRanking): number {
  const prior = (b: BrandRanking) => b.visibility - b.visibilityDelta
  const mine = prior(you)
  return 1 + rankings.filter((b) => b !== you && prior(b) > mine).length
}

type Body = { value: string; delta: number | null; footer: string }

const pct = (n: number, d: number): number | null => (d > 0 ? (100 * n) / d : null)
const pctText = (x: number | null): string => (x === null ? NO_VALUE : `${fmt1(x)}%`)
const diff = (a: number | null, b: number | null): number | null => (a === null || b === null ? null : a - b)

function aeoBody(id: KpiId, ctx: PeecCtx, you: BrandRanking): Body {
  const avg = ctx.data.competitorAverages
  switch (id) {
    case 'visibility': {
      const v = ctx.modelActive ? ctx.visFiltered : you.visibility
      return { value: v === null ? NO_VALUE : `${fmt1(v)}%`, delta: you.visibilityDelta, footer: `Competitor avg · ${fmt1(avg.visibility)}%` }
    }
    case 'share-of-voice': {
      const v = ctx.modelActive ? mean(ctx.llmFiltered.map((r) => r.sov)) : you.sov
      return { value: v === null ? NO_VALUE : `${fmt1(v)}%`, delta: you.sovDelta, footer: `Competitor avg · ${fmt1(avg.sov)}%` }
    }
    case 'visibility-rank':
      return {
        value: `#${you.rank} of ${ctx.data.brandRankings.length}`,
        delta: priorRank(ctx.data.brandRankings, you) - you.rank,
        footer: 'Ranked by AI visibility among tracked brands',
      }
    case 'used-as-source': {
      const own = ctx.data.topDomains.find((d) => d.type === 'Own')
      if (!own) return { value: NO_VALUE, delta: null, footer: 'No owned domain cited' }
      const v = ctx.modelActive ? mean(ctx.llmFiltered.map((r) => r.ownDomainRetrieved)) : own.retrieved
      return { value: v === null ? NO_VALUE : `${fmt1(v)}%`, delta: own.retrievedDelta, footer: `Answers that retrieved ${own.domain}` }
    }
    default: {
      // sentiment (Peec)
      return {
        value: String(Math.round(peecSentimentScore(you.sentiment))),
        delta: 50 * you.sentimentDelta,
        footer: `Competitor avg · ${Math.round(peecSentimentScore(avg.sentiment))}`,
      }
    }
  }
}

function ga4Body(id: KpiId, ctx: PeecCtx): Body {
  const g = ctx.kpi.ga4
  if (g.status !== 'ok') return { value: NO_VALUE, delta: null, footer: 'GA4 data unavailable' }
  const now = summarizeAiKpis(g.now, ctx.models)
  const prior = g.prior ? summarizeAiKpis(g.prior, ctx.models) : null
  switch (id) {
    case 'ai-sessions':
      return { value: now.sessions.toLocaleString(), delta: prior ? pctChange(now.sessions, prior.sessions) : null, footer: 'GA4 sessions from AI referrers' }
    case 'ai-traffic-share': {
      const n = pct(now.sessions, now.totalSessions)
      return {
        value: pctText(n),
        delta: prior ? diff(n, pct(prior.sessions, prior.totalSessions)) : null,
        footer: `of ${now.totalSessions.toLocaleString()} total sessions`,
      }
    }
    case 'ai-leads':
      return {
        value: now.leads.toLocaleString(),
        delta: prior ? pctChange(now.leads, prior.leads) : null,
        footer: now.leadBasis === 'lead-events' ? 'GA4 lead events from AI sessions' : 'GA4 key events from AI sessions',
      }
    default: {
      // ai-cvr
      const n = pct(now.leads, now.sessions)
      return {
        value: pctText(n),
        delta: prior ? diff(n, pct(prior.leads, prior.sessions)) : null,
        footer: 'AI search leads ÷ AI search sessions',
      }
    }
  }
}

export function computeKpiTile(id: KpiId, ctx: PeecCtx): KpiTileModel {
  const { label, source, unit } = KPI_CATALOG[id]
  const badge: KpiTileModel['badge'] = source === 'ga4' ? 'GA4' : ctx.provider === 'profound' ? 'Profound' : 'Peec'
  const tile = (state: KpiTileModel['state'], b: Body): KpiTileModel => ({ id, label, badge, unit, state, ...b })

  const reason = unavailableReason(id, { ga4Connected: ctx.kpi.ga4Connected, provider: ctx.provider })
  if (reason) {
    return tile(reason === 'Source not connected' ? 'not-connected' : 'unavailable', { value: NO_VALUE, delta: null, footer: reason })
  }

  let body: Body
  const profoundSentiment = ctx.provider === 'profound' && id === 'sentiment'
  if (source === 'ga4') {
    body = ga4Body(id, ctx)
  } else if (profoundSentiment) {
    const s = ctx.kpi.profoundSentiment
    body =
      s && s.now !== null
        ? { value: `${Math.round(s.now)}%`, delta: s.prior === null ? null : s.now - s.prior, footer: 'Share of positive mentions' }
        : { value: NO_VALUE, delta: null, footer: 'Profound data unavailable' }
  } else if (!ctx.you) {
    body = { value: NO_VALUE, delta: null, footer: 'Brand not identified' }
  } else {
    body = aeoBody(id, ctx, ctx.you)
  }

  if (ctx.modelActive) {
    body = { ...body, delta: null }
    if (id === 'visibility-rank' || id === 'sentiment') {
      body = { value: NO_VALUE, delta: null, footer: 'Not available with a model filter' }
    }
  }
  return tile('ok', body)
}
