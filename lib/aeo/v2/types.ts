// Provider-neutral shapes for the AEO Overview v2 sections. Slices 3 and 5 add theirs here.
import type { DailyPoint } from '@/lib/aeo/types'
import type { AEOModel } from '@/lib/peec/models'

export type AeoV2Provider = 'peec' | 'profound'
export type CompareMode = 'previous_period' | 'previous_year'
export type UsedAsSourceBasis = 'answers' | 'citations'

/** One brand in the section 02 table. Percent values are 0-100; a prior is null when the brand had no row in the comparison window. */
export type BrandRowV2 = {
  name: string
  isYou: boolean
  rank: number
  visibility: number
  visibilityPrior: number | null
  sov: number
  sovPrior: number | null
  usedAsSource: number | null
  usedAsSourcePrior: number | null
}

export type BrandTrend = { name: string; isYou: boolean; points: DailyPoint[] }

export type VisibilityV2 = {
  /** Every tracked brand name; drives colors. */
  roster: string[]
  /** Sorted by visibility desc, rank 1..n. */
  brands: BrandRowV2[]
  /** Every brand with at least one point. */
  trend: BrandTrend[]
  usedAsSourceBasis: UsedAsSourceBasis
}

/** Answers that mentioned a brand, out of all answers: the unit every Topics & Prompts figure is built from. */
export type VisCount = { mentions: number; answers: number }
/** One (topic, brand, model) cell of the section 04 matrix. */
export type TopicCell = VisCount & { topic: string; brand: string; model: AEOModel }
/** The client brand's figures for one prompt on one model; position is posSum / posCount (average rank when mentioned). */
export type PromptModelStat = VisCount & { posSum: number; posCount: number }
export type PromptV2 = {
  id: string
  text: string
  topic: string
  current: Partial<Record<AEOModel, PromptModelStat>>
  /** null when the prompt had no answers in the comparison window. */
  prior: Partial<Record<AEOModel, PromptModelStat>> | null
}
/** All answers on one topic and model, whether or not a brand was mentioned: the denominator of every matrix cell. */
export type TopicAnswers = { topic: string; model: AEOModel; answers: number }
export type TopicsPromptsV2 = {
  you: string | null
  cells: TopicCell[]
  cellsPrior: TopicCell[]
  topicAnswers: TopicAnswers[]
  topicAnswersPrior: TopicAnswers[]
  prompts: PromptV2[]
}

/** One gauge's figures, in percent: the client, the client in the comparison window (null without one) and the competitor mean. */
export type ModelMetricV2 = { you: number | null; youPrior: number | null; competitorAvg: number | null }
/** Section 03: one AI model's three gauges. */
export type ModelStatV2 = { model: AEOModel; visibility: ModelMetricV2; sov: ModelMetricV2; usedAsSource: ModelMetricV2 }
/** `models` follows AEO_MODELS order. Peec lists the models where the client has answers in the current window; Profound
 *  lists every model with a row for any tracked asset (the client reads 0 on a model where it has none). */
export type ModelsV2 = { models: ModelStatV2[]; usedAsSourceBasis: UsedAsSourceBasis }
