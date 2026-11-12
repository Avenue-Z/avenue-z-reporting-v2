// lib/organic-social/aeo-informed/contract.ts
// The data contract for the AEO Informed Social adapter, as typed field specs. This file is the single source of truth:
//   - gate.ts validates every result against OUTPUTS at runtime,
//   - contract.test.ts proves the Peec response parsers in shape.ts reject everything RAW forbids,
//   - contract-yaml.ts renders the YAML design copy in docs/contracts/aeo-informed-social/ from it, and a test fails if the committed files drift.
// Raw shapes are from Peec's live OpenAPI (read 2026-11-09). Output shapes mirror SocialsRow, GapRow and GraphPoint.

/** `date` is a plain YYYY-MM-DD. `datePrefix` starts with one and may carry a time after it (what Peec sends on a date dimension; the parser cuts it to the day). */
export type FieldKind = 'string' | 'int' | 'float' | 'number' | 'bool' | 'date' | 'datePrefix' | 'idList' | 'idObject' | 'stringList'

export type FieldSpec = {
  name: string
  kind: FieldKind
  /** The value may be null. */
  nullable?: boolean
  /** The key may be absent (raw Peec rows only: some fields exist only when a dimension was requested). */
  optional?: boolean
  min?: number
  max?: number
  minLength?: number
  oneOf?: readonly (string | number | boolean)[]
  prefix?: string
}

export const CONTRACT_VERSION = '1.1.0'

const f = (name: string, kind: FieldKind, rest: Omit<FieldSpec, 'name' | 'kind'> = {}): FieldSpec => ({ name, kind, ...rest })

// Every graph id there is; a result draws four of them (graphOrder in graphs.ts: the first three and Instagram or TikTok).
export const GRAPH_IDS = ['used_as_source_all', 'citations_all', 'citations_linkedin', 'citations_instagram', 'citations_tiktok'] as const

// ---- outputs (closed: an extra field is a violation) ----
export const OUTPUTS = {
  socials_table: [
    f('rank', 'int', { min: 1 }),
    f('url', 'string', { minLength: 1 }),
    f('title', 'string', { nullable: true }),
    f('channelTitle', 'string', { nullable: true }),
    f('ownerBrandId', 'string', { nullable: true }),
    f('isOwnChannel', 'bool'),
    f('urlType', 'string', { nullable: true }),
    f('domainType', 'string', { minLength: 1 }),
    f('ownBrandMentioned', 'bool'),
    f('mentionedBrandCount', 'int', { min: 0 }),
    f('mentionedBrandNames', 'string', { nullable: true }),
    f('mentionedBrandIds', 'string', { nullable: true }),
    f('retrievals', 'int', { min: 0 }),
    f('retrievalsDelta', 'int', { nullable: true }),
    f('retrievedPct', 'float', { min: 0, max: 1 }),
    f('retrievedPctDelta', 'float', { nullable: true, min: -1, max: 1 }),
    f('totalCitations', 'int', { min: 0 }),
    f('totalCitationsDelta', 'int', { nullable: true }),
    // No maximum: a source can be cited more than once per retrieval (the outline's URL Gaps has 220 on 145, 152%).
    f('citationRate', 'float', { nullable: true, min: 0 }),
    f('citationRateDelta', 'float', { nullable: true }),
  ],
  url_gaps_table: [
    f('rank', 'int', { min: 1 }),
    f('url', 'string', { minLength: 1 }),
    f('title', 'string', { nullable: true }),
    f('channelTitle', 'string', { nullable: true }),
    f('urlType', 'string', { nullable: true }),
    f('domainType', 'string', { minLength: 1 }),
    f('mentionedBrandCount', 'int', { min: 0 }),
    f('mentionedBrandNames', 'string', { nullable: true }),
    f('mentionedBrandIds', 'string', { nullable: true }),
    f('citationShare', 'float', { min: 0, max: 1 }),
    f('citationPosition', 'float', { nullable: true, min: 1 }),
    f('retrievals', 'int', { min: 0 }),
    f('retrievalsDelta', 'int', { nullable: true }),
    f('totalCitations', 'int', { min: 0 }),
    f('totalCitationsDelta', 'int', { nullable: true }),
    f('citationRate', 'float', { nullable: true, min: 0 }),
    f('citationRateDelta', 'float', { nullable: true }),
  ],
  // One object per window (totals and totals.prior): the tiles before the tables. citationRate has no maximum, like the row rate.
  totals: [
    f('urlsCited', 'int', { min: 0 }),
    f('retrievals', 'int', { min: 0 }),
    f('citations', 'int', { min: 0 }),
    f('citationRate', 'float', { nullable: true, min: 0 }),
  ],
  graph_points: [
    f('graphId', 'string', { oneOf: GRAPH_IDS }),
    f('series', 'string', { minLength: 1 }),
    f('weekStart', 'date'),
    f('weekEnd', 'date'),
    f('value', 'float', { nullable: true, min: 0 }),
    f('unit', 'string', { oneOf: ['citations', 'percent'] }),
    f('partial', 'bool'),
  ],
} as const satisfies Record<string, readonly FieldSpec[]>

// ---- the internal per-URL sum (UrlAgg), validated in tests only ----
export const INPUTS = {
  url_agg: [
    f('url', 'string', { minLength: 1 }),
    f('title', 'string', { nullable: true }),
    f('channelTitle', 'string', { nullable: true }),
    f('classification', 'string', { nullable: true }),
    f('retrievals', 'number', { min: 0 }),
    f('citations', 'number', { min: 0 }),
    f('positionSum', 'number', { min: 0 }),
    f('positionCount', 'number', { min: 0 }),
    f('brandIds', 'stringList'),
  ],
} as const satisfies Record<string, readonly FieldSpec[]>

// ---- raw Peec responses (open: extra fields are ignored). `path` is the endpoint, `rows` the fields of one element of `data`. ----
export const RAW = {
  reports_urls_response: {
    path: 'POST /reports/urls',
    note: 'date is required on every by-day pull and chat.id on the chat-level pull (shape.ts parseUrlRows options). Deprecated fields are not listed.',
    rows: [
      f('url', 'string', { minLength: 1 }),
      f('classification', 'string', { nullable: true }),
      f('title', 'string', { nullable: true }),
      f('channel_title', 'string', { nullable: true, optional: true }),
      f('date', 'datePrefix', { optional: true }),
      f('chat', 'idObject', { optional: true }),
      f('citation_count', 'number', { min: 0 }),
      f('retrieval_count', 'number', { min: 0 }),
      f('citation_position', 'number', { nullable: true }),
      f('citation_position_sum', 'number', { min: 0 }),
      f('citation_position_count', 'number', { min: 0 }),
      f('mentioned_brands', 'idList'),
    ],
  },
  reports_brands_response: {
    path: 'POST /reports/brands (dimensions date, brand_id filter on the own brand)',
    note: 'One row per day. visibility_total is the number of chats that day and covers every day.',
    rows: [f('date', 'datePrefix'), f('visibility_total', 'number', { min: 0 })],
  },
  brands_response: {
    path: 'GET /brands',
    note: 'A color is returned but no logo or image. color is read leniently for the Mentions dots (shape.ts hexColor): a hex string is kept, anything else is null, never an error, because a cosmetic field must not fail the view. So it is not a checked field here.',
    rows: [f('id', 'string', { minLength: 1 }), f('name', 'string', { minLength: 1 }), f('is_own', 'bool')],
  },
  brand_social_channels_response: {
    path: 'GET /brands/social-channels',
    note: 'No url field, only platform, handle and channel id.',
    rows: [f('brand_id', 'string', { minLength: 1 }), f('platform', 'string', { minLength: 1 }), f('channel_handle', 'string', { minLength: 1 })],
  },
  source_tags_response: {
    path: 'GET /source-tags',
    note: 'Source tags are a different thing from prompt tags (GET /tags). Filter ids start stg_ and go in url_tag_id or domain_tag_id, never tag_id.',
    rows: [f('id', 'string', { minLength: 1, prefix: 'stg_' }), f('name', 'string', { minLength: 1 })],
  },
  classifications_response: {
    path: 'GET /classifications/domains and /classifications/urls',
    note: 'A custom classification is referenced by name in the domain_classification and url_classification filters.',
    rows: [f('name', 'string', { minLength: 1 })],
  },
} as const satisfies Record<string, { path: string; note: string; rows: readonly FieldSpec[] }>

/** A valid row for a field list. Used by tests and by the contract drift checks. */
export function sampleRow(fields: readonly FieldSpec[]): Record<string, unknown> {
  const row: Record<string, unknown> = {}
  for (const s of fields) {
    switch (s.kind) {
      case 'string': row[s.name] = s.oneOf ? s.oneOf[0] : s.prefix ? `${s.prefix}1` : 'x'; break
      case 'int': row[s.name] = Math.max(s.min ?? 0, 0); break
      case 'float':
      case 'number': row[s.name] = Math.min(Math.max(s.min ?? 0, 0), s.max ?? Infinity); break
      case 'bool': row[s.name] = false; break
      case 'date':
      case 'datePrefix': row[s.name] = '2026-09-03'; break
      case 'idList': row[s.name] = [{ id: 'a' }]; break
      case 'idObject': row[s.name] = { id: 'a' }; break
      case 'stringList': row[s.name] = ['a']; break
    }
  }
  return row
}
