/** Supermetrics data-source ids. Verified live: AW, FA, LIA, SHP. */
export const DS_IDS = {
  GA4: 'GAWA',
  GOOGLE_ADS: 'AW',
  META: 'FA',
  LINKEDIN: 'LIA',
  SHOPIFY: 'SHP',
} as const
export type DsId = (typeof DS_IDS)[keyof typeof DS_IDS]
