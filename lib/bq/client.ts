import { BigQuery } from '@google-cloud/bigquery'

export const BQ_PROJECT = 'avenue-z-data-warehouse-prod'
const IDENT = /^[A-Za-z0-9_]+$/

let _bq: BigQuery | null = null

/**
 * Read-only client for the warehouse marts. BQ_READER_KEY is the base64 service-account JSON
 * for dashboard-reader@ (bigquery.jobUser on the project, bigquery.dataViewer on `marts` only).
 * Distinct from lib/bigquery/client.ts, the Fun Spot one-off, which uses ambient credentials.
 */
export function getBq(): BigQuery {
  if (!_bq) {
    const raw = process.env.BQ_READER_KEY
    if (!raw) throw new Error('Missing BQ_READER_KEY (base64 service-account JSON for dashboard-reader@)')
    let credentials: Record<string, unknown>
    try {
      credentials = JSON.parse(Buffer.from(raw, 'base64').toString('utf-8'))
    } catch {
      // Never rethrow the parse error: it quotes the text around the fault, i.e. part of the key, into the log.
      throw new Error('BQ_READER_KEY is not base64 service-account JSON')
    }
    _bq = new BigQuery({ projectId: BQ_PROJECT, credentials })
  }
  return _bq
}

/** Fully qualified, backtick-quoted mart reference. Both parts are checked: they are spliced into SQL. */
export function martRef(table: string): string {
  const dataset = process.env.BQ_MARTS_DATASET || 'marts'
  if (!IDENT.test(dataset) || !IDENT.test(table)) throw new Error(`invalid mart reference ${dataset}.${table}`)
  return `\`${BQ_PROJECT}.${dataset}.${table}\``
}

/** Every value reaches BigQuery as a named STRING parameter; SQL converts with date(@x) where needed. */
export async function bqRows(sql: string, params: Record<string, string>): Promise<Record<string, unknown>[]> {
  const [rows] = await getBq().query({ query: sql, params, location: 'US', jobTimeoutMs: 20_000 })
  return rows as Record<string, unknown>[]
}
