import type { Granularity } from '@/lib/dashboard/types'

/** Supermetrics data-source ids. Verified live: AW, FA, LIA, SHP. */
export const DS_IDS = {
  GA4: 'GAWA',
  GOOGLE_ADS: 'AW',
  META: 'FA',
  LINKEDIN: 'LIA',
  SHOPIFY: 'SHP',
} as const
export type DsId = (typeof DS_IDS)[keyof typeof DS_IDS]

/**
 * Per-DS time-dimension field IDs used by resolveSeriesBlock. Verified
 * against live /query/fields for the DSes the paid-media team uses.
 * Spot-check any new DS before adding it — SM does not version field IDs.
 */
export const SM_TIME_DIMENSION: Partial<Record<DsId, Record<Granularity, string>>> = {
  GAWA: { day: 'Date', week: 'Week', month: 'Month' }, // GA4
  AW:   { day: 'Date', week: 'Week', month: 'Month' }, // Google Ads
  FA:   { day: 'Date', week: 'Week', month: 'Month' }, // Meta
  SHP:  { day: 'Date', week: 'Week', month: 'Month' }, // Shopify
  LIA:  { day: 'Date', week: 'Week', month: 'Month' }, // LinkedIn
}
