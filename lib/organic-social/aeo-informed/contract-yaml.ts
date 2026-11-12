// lib/organic-social/aeo-informed/contract-yaml.ts
// Renders the contract-core YAML design copy from contract.ts. `npx tsx scripts/gen-aeo-contract.ts` writes it; contract-yaml.test.ts fails on drift.
// contract-core is Python and cannot run in this app, so the runtime enforcement is gate.ts and shape.ts; this copy lets a Python run lint the same shapes.
import { CONTRACT_VERSION, INPUTS, OUTPUTS, RAW, type FieldSpec } from './contract'

export const CONTRACT_DIR = 'docs/contracts/aeo-informed-social'
const GENERATED = '# Generated from lib/organic-social/aeo-informed/contract.ts by scripts/gen-aeo-contract.ts. Do not edit by hand; contract-yaml.test.ts fails if this file drifts.'

const raw = Object.keys(RAW) as (keyof typeof RAW)[]
const BOUNDARY_NAMES: Record<keyof typeof RAW, string> = {
  reports_urls_response: 'peec_urls_raw',
  reports_brands_response: 'peec_brand_days_raw',
  brands_response: 'peec_brands_raw',
  brand_social_channels_response: 'peec_social_channels_raw',
  source_tags_response: 'peec_source_tags_raw',
  classifications_response: 'peec_classifications_raw',
}

function unsupported(s: FieldSpec, what: string): never {
  throw new Error(`contract-yaml: unsupported attribute for ${s.name} (${s.kind}): ${what}`)
}

function jsonType(s: FieldSpec): Record<string, unknown> {
  const nullableType = (t: string) => (s.nullable ? [t, 'null'] : t)
  const only = (allowed: (keyof FieldSpec)[]) => {
    for (const k of ['nullable', 'min', 'max', 'minLength', 'oneOf', 'prefix'] as (keyof FieldSpec)[]) if (s[k] !== undefined && !allowed.includes(k)) unsupported(s, String(k))
  }
  switch (s.kind) {
    case 'string': only(['nullable', 'minLength', 'prefix']); return { type: nullableType('string'), ...(s.minLength ? { minLength: s.minLength } : {}), ...(s.prefix ? { pattern: `^${s.prefix}` } : {}) }
    case 'int': only(['nullable', 'min']); return { type: nullableType('integer'), ...(s.min !== undefined ? { minimum: s.min } : {}) }
    case 'float':
    case 'number': only(['nullable', 'min', 'max']); return { type: nullableType('number'), ...(s.min !== undefined ? { minimum: s.min } : {}), ...(s.max !== undefined ? { maximum: s.max } : {}) }
    case 'bool': only([]); return { type: 'boolean' }
    case 'date': only([]); return { type: 'string', format: 'date' }
    case 'datePrefix': only([]); return { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}' }
    case 'idObject': only([]); return { type: 'object', required: ['id'], properties: { id: { type: 'string' } } }
    case 'idList': only([]); return { type: 'array', items: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } } }
    case 'stringList': only([]); return { type: 'array', items: { type: 'string' } }
  }
}
/** Exposed for the generator's own test. */
export const jsonTypeForTest = jsonType

function objectSchema(fields: readonly FieldSpec[]): Record<string, unknown> {
  return {
    type: 'object',
    required: fields.filter((f) => !f.optional).map((f) => f.name),
    properties: Object.fromEntries(fields.map((f) => [f.name, jsonType(f)])),
  }
}

const indent = (text: string, n: number) => text.split('\n').map((l) => ' '.repeat(n) + l).join('\n')

function payloadYaml(schema: string, header: string, body: Record<string, unknown>): string {
  return `${header}\n${GENERATED}\nschema: ${schema}\nversion: ${CONTRACT_VERSION}\nkind: payload\njson_schema:\n${indent(JSON.stringify(body, null, 2), 2)}\n`
}

const flow = (v: unknown): string => JSON.stringify(v)

function tabularYaml(schema: string, header: string, fields: readonly FieldSpec[]): string {
  const lines = fields.map((s) => {
    if (s.kind === 'datePrefix' || s.kind === 'idList' || s.kind === 'idObject' || s.kind === 'stringList' || s.prefix !== undefined) unsupported(s, 'kind or prefix in a tabular output')
    const parts = [`name: ${s.name}`, `type: ${s.kind === 'number' ? 'float' : s.kind}`]
    if (s.nullable) parts.push('nullable: true')
    if (s.min !== undefined) parts.push(`minimum: ${s.min}`)
    if (s.max !== undefined) parts.push(`maximum: ${s.max}`)
    if (s.minLength !== undefined) parts.push(`min_length: ${s.minLength}`)
    if (s.oneOf) parts.push(`enum: [${s.oneOf.map(flow).join(', ')}]`)
    return `  - {${parts.join(', ')}}`
  })
  return `${header}\n${GENERATED}\nschema: ${schema}\nversion: ${CONTRACT_VERSION}\nkind: tabular\nfields:\n${lines.join('\n')}\n`
}

const OUTPUT_HEADERS: Record<keyof typeof OUTPUTS, [string, string]> = {
  socials_table: ['aeo.socials_table', '# SocialsRow (tables.ts): socialsAll, socialsOwn and socialsCompetitor. Percentages are fractions 0..1. A delta is null when the URL has no row in the previous window.'],
  url_gaps_table: ['aeo.url_gaps_table', '# GapRow (tables.ts). citationShare is a row\'s citations over the sum across every row of the same pull. citationPosition is null when no chat cited the URL inline.'],
  graph_points: ['aeo.graph_points', '# GraphPoint (graphs.ts). value is null in every bucket of a graph that has no own source in its window ("No source data").'],
}

export function renderContractFiles(): Record<string, string> {
  const files: Record<string, string> = {}
  for (const name of raw) {
    const c = RAW[name]
    files[`schemas/peec/${name}/${CONTRACT_VERSION}.yaml`] = payloadYaml(
      `peec.${name}`,
      `# Raw response of ${c.path}, from the live Peec OpenAPI (read 2026-11-09). Open on extra keys (raw boundary). ${c.note}`,
      { type: 'object', required: ['data'], properties: { data: { type: 'array', items: objectSchema(c.rows) } } },
    )
  }
  files[`schemas/aeo/url_agg/${CONTRACT_VERSION}.yaml`] = payloadYaml('aeo.url_agg', '# One URL after summing every row Peec returned for it (urls.ts aggregateByUrl). The key is the exact Peec URL string: never lib/url.ts urlJoinKey, which drops the query string.', objectSchema(INPUTS.url_agg))
  for (const name of Object.keys(OUTPUTS) as (keyof typeof OUTPUTS)[]) {
    const [schema, header] = OUTPUT_HEADERS[name]
    files[`schemas/aeo/${name}/${CONTRACT_VERSION}.yaml`] = tabularYaml(schema, header, OUTPUTS[name])
  }
  const rawLines = raw.map((n) => `  - {name: ${BOUNDARY_NAMES[n]}, schema: peec.${n}@1, source: {kind: api, format: json}, mode: observe}`)
  files['contract.yaml'] = [
    '# AEO Informed Social: the Peec boundaries behind lib/organic-social/aeo-informed. Every boundary is in observe mode.',
    GENERATED,
    '# The runtime enforcement is lib/organic-social/aeo-informed/gate.ts (outputs) and shape.ts (raw responses); see README.md in this folder.',
    'system: aeo-informed-social',
    `version: ${CONTRACT_VERSION}`,
    'raw:',
    ...rawLines,
    'inputs:',
    '  - {name: url_agg, schema: aeo.url_agg@1, source: {kind: api, format: json}, mode: observe}',
    'outputs:',
    '  - {name: socials_all, schema: aeo.socials_table@1, sink: {kind: file, format: json}, mode: observe}',
    '  - {name: socials_own, schema: aeo.socials_table@1, sink: {kind: file, format: json}, mode: observe}',
    '  - {name: socials_competitor, schema: aeo.socials_table@1, sink: {kind: file, format: json}, mode: observe}',
    '  - {name: url_gaps, schema: aeo.url_gaps_table@1, sink: {kind: file, format: json}, mode: observe}',
    '  - {name: graph_points, schema: aeo.graph_points@1, sink: {kind: file, format: json}, mode: observe}',
    '',
  ].join('\n')
  return files
}
