/**
 * Supermetrics live discovery — server-side only. Lists the metrics and
 * connected accounts for a data source, for the manual query builder.
 * Verified endpoints (Bearer key): GET /query/fields and GET /query/accounts.
 */
import { SmQueryError } from './types'
import { smQuery } from './client'

const BASE = 'https://api.supermetrics.com/enterprise/v2'
const CLOSED_GROUP = 'CLOSED AND DISABLED ACCOUNTS'

export interface MetricOption { value: string; label: string; group?: string; dataType?: string }
export interface AccountOption { value: string; label: string; disabled?: boolean }

interface FieldRow { '@type'?: string; field_id?: string; field_name?: string; data_type?: string; group_name?: string }
interface AccountConn { accounts?: { account_id?: string; account_name?: string; group_name?: string }[] }

/** Keep only metrics (drop dimensions); map to {value,label,group,dataType}. */
export function parseFields(json: unknown): MetricOption[] {
  const data = (json as { data?: FieldRow[] }).data ?? []
  return data
    .filter((f): f is FieldRow & { field_id: string } => f['@type'] === 'ds_metric' && typeof f.field_id === 'string')
    .map((f) => ({ value: f.field_id, label: f.field_name || f.field_id, group: f.group_name || undefined, dataType: f.data_type }))
}

/** Flatten connections' accounts, dedupe by account_id, flag closed, sort active first. */
export function parseAccounts(json: unknown): AccountOption[] {
  const data = (json as { data?: AccountConn[] }).data ?? []
  const seen = new Set<string>()
  const out: AccountOption[] = []
  for (const conn of data) {
    for (const a of conn.accounts ?? []) {
      if (!a.account_id || seen.has(a.account_id)) continue
      seen.add(a.account_id)
      out.push({ value: a.account_id, label: a.account_name || a.account_id, disabled: a.group_name === CLOSED_GROUP })
    }
  }
  return out.sort((a, b) => Number(a.disabled ?? false) - Number(b.disabled ?? false))
}

async function getJson(endpoint: string, dsId: string, apiKey: string, fetchImpl: typeof fetch): Promise<unknown> {
  const url = `${BASE}/${endpoint}?json=${encodeURIComponent(JSON.stringify({ ds_id: dsId }))}`
  const res = await fetchImpl(url, { headers: { Authorization: `Bearer ${apiKey}` } })
  if (!res.ok) throw new SmQueryError(`Supermetrics ${res.status}`, res.status)
  return res.json()
}

export async function smFields(apiKey: string, dsId: string, fetchImpl: typeof fetch = fetch): Promise<MetricOption[]> {
  return parseFields(await getJson('query/fields', dsId, apiKey, fetchImpl))
}

export async function smAccounts(apiKey: string, dsId: string, fetchImpl: typeof fetch = fetch): Promise<AccountOption[]> {
  return parseAccounts(await getJson('query/accounts', dsId, apiKey, fetchImpl))
}

const COLUMN_RE = /^[A-Za-z0-9_]+$/

/** Keep only dimensions (drop metrics); map to {value,label,group}. */
export function parseDimensions(json: unknown): MetricOption[] {
  const data = (json as { data?: FieldRow[] }).data ?? []
  return data
    .filter((f): f is FieldRow & { field_id: string } => f['@type'] === 'ds_dimension' && typeof f.field_id === 'string')
    .map((f) => ({ value: f.field_id, label: f.field_name || f.field_id, group: f.group_name || undefined }))
}

export async function smDimensions(apiKey: string, dsId: string, fetchImpl: typeof fetch = fetch): Promise<MetricOption[]> {
  return parseDimensions(await getJson('query/fields', dsId, apiKey, fetchImpl))
}

/** Metrics + dimensions from a SINGLE /query/fields fetch (they share one payload). */
export async function smFieldsAndDimensions(
  apiKey: string,
  dsId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ metrics: MetricOption[]; dimensions: MetricOption[] }> {
  const json = await getJson('query/fields', dsId, apiKey, fetchImpl)
  return { metrics: parseFields(json), dimensions: parseDimensions(json) }
}

/** Distinct values of a dimension for one account, via a `fields=[column]` query. */
export async function smDimensionValues(
  apiKey: string,
  dsId: string,
  account: string,
  column: string,
  range: { startDate: string; endDate: string },
  opts: { fetchImpl?: typeof fetch } = {},
): Promise<string[]> {
  if (!COLUMN_RE.test(column)) throw new SmQueryError(`unsafe column: ${column}`)
  const result = await smQuery(
    { apiKey, dsId, dsAccounts: account, fields: [column], dateRange: `${range.startDate},${range.endDate}`, maxRows: 100 },
    opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {},
  )
  const seen = new Set<string>()
  const out: string[] = []
  for (const row of result.rows) {
    const v = row[0]
    if (typeof v === 'string' && v !== '' && !seen.has(v)) { seen.add(v); out.push(v) }
  }
  return out
}
