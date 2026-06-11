// lib/aeo/types.ts
// Shared, framework-free types for the AEO Overview tab. Both provider
// clients (peec, profound) and the shared chart/ribbon import from here.

/** One day of visibility, 0–100. date is 'YYYY-MM-DD' (UTC). */
export type DailyPoint = { date: string; visibility: number }

export type BucketGranularity = 'daily' | 'weekly' | 'monthly' | 'quarterly'

/** A bucketed point ready for the chart. key sorts chronologically. */
export type ChartBucket = { key: string; label: string; visibility: number }

/** Whether a tracked prompt's topic came from the provider or keyword inference. */
export type TopicSource = 'provider' | 'inferred'

/** A single "biggest mover" entry; label is a brand or domain name. */
export type PeriodMover = { label: string; delta: number } | null

export type PromptOpportunity = { text: string; visibility: number } | null

/** The four movers behind the "What changed this period?" ribbon. */
export type PeriodChange = {
  visibilityMover: PeriodMover
  domainMover: PeriodMover
  competitorShift: PeriodMover
  promptOpportunity: PromptOpportunity
}
