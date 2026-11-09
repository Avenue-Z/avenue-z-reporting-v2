// lib/organic-social/aeo-informed/unverified.ts
/** Rules not yet proven against the client's outline. Always returned, unconditionally, in this order (meta.unverified). */
export const UNVERIFIED = [
  'url_gaps_item_count',
  'competitor_table_definition',
  'own_channel_non_linkedin_and_competitor_matching',
  'pdf_columns_cropped',
] as const
export type UnverifiedId = (typeof UNVERIFIED)[number]
