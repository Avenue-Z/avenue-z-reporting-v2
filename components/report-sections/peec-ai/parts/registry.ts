// DO NOT import from ./bespoke — the ESLint boundary enforces this.
// Bespoke parts are merged at render time via mergeRegistries(PEEC_PARTS, BESPOKE_PARTS).
import type { PartRegistry } from '@/lib/report-sections/types'
import type { PeecCtx } from '../ctx'
import { overviewSynopsisV1 } from './overview-synopsis'
import { kpiCardsV1 } from './kpi-cards'
import { visibilityChartV1 } from './visibility-chart'
import { visibilityChartV2 } from './visibility-chart.v2'
import { llmBreakdownV1 } from './llm-breakdown'
import { winnersLosersV1 } from './winners-losers'
import { brandRankingsV1 } from './brand-rankings'
import { brandRankingsV2 } from './brand-rankings.v2'
import { domainsRowV1 } from './domains-row'
import { competitorVisibilityV1 } from './competitor-visibility'
import { competitorGapsV1 } from './competitor-gaps'
import { topicMatrixV1 } from './topic-matrix'
import { promptPerformanceV1 } from './prompt-performance'
import { footerV1 } from './footer'

export const PEEC_PARTS: PartRegistry<PeecCtx> = {
  'overview-synopsis': { 1: overviewSynopsisV1 },
  'kpi-cards':         { 1: kpiCardsV1 },
  'visibility-chart':  { 1: visibilityChartV1, 2: visibilityChartV2 },
  'llm-breakdown':     { 1: llmBreakdownV1 },
  'winners-losers':    { 1: winnersLosersV1 },
  'brand-rankings':    { 1: brandRankingsV1, 2: brandRankingsV2 },
  'topic-matrix':      { 1: topicMatrixV1 },
  'prompt-performance': { 1: promptPerformanceV1 },
  'domains-row':       { 1: domainsRowV1 },
  'competitor-visibility': { 1: competitorVisibilityV1 },
  'competitor-gaps':   { 1: competitorGapsV1 },
  'footer':            { 1: footerV1 },
}
