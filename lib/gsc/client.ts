/**
 * Google Search Console API client — server-side only.
 *
 * Auth: shared GOOGLE_SERVICE_ACCOUNT_KEY service account (same as GA4).
 * Per-client site URLs stored as env var names in clients.config.ts.
 * e.g. gscSiteUrl: 'GSC_SITE_URL_AVENUE_Z'
 *      GSC_SITE_URL_AVENUE_Z = 'https://avenuez.com/'   (URL-prefix property)
 *      GSC_SITE_URL_AVENUE_Z = 'sc-domain:avenuez.com'  (domain property)
 *
 * Date windows: 28 days, ending 2 days ago (GSC has a 2-3 day data lag).
 * Current vs prior period comparison for KPI deltas.
 */
import { JWT } from 'google-auth-library'
import { getClientBySlug } from '@/lib/clients.config'

const WINDOW = 28
const LAG = 2 // days GSC lags behind today

function isoDate(d: Date) {
  return d.toISOString().split('T')[0]
}

function periodDates(offsetDays: number): { startDate: string; endDate: string } {
  const end = new Date()
  end.setDate(end.getDate() - offsetDays - LAG)
  const start = new Date(end)
  start.setDate(start.getDate() - (WINDOW - 1))
  return { startDate: isoDate(start), endDate: isoDate(end) }
}

let _jwt: JWT | null = null

function getAuth(): JWT {
  if (!_jwt) {
    const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
    if (!raw) throw new Error('Missing GOOGLE_SERVICE_ACCOUNT_KEY env var')
    const credentials = JSON.parse(Buffer.from(raw, 'base64').toString('utf-8'))
    const subject = process.env.GSC_IMPERSONATE_EMAIL
    if (!subject) throw new Error('Missing GSC_IMPERSONATE_EMAIL env var — required for domain-wide delegation')
    _jwt = new JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
      subject,
    })
  }
  return _jwt
}

interface GSCQueryBody {
  startDate: string
  endDate: string
  dimensions?: string[]
  rowLimit?: number
  aggregationType?: 'auto' | 'byPage' | 'byProperty'
}

interface GSCRow {
  keys: string[]
  clicks: number
  impressions: number
  ctr: number
  position: number
}

interface GSCResponse {
  rows?: GSCRow[]
}

async function gscPost(siteUrl: string, body: GSCQueryBody): Promise<GSCResponse> {
  const auth = getAuth()
  const headers = await auth.getRequestHeaders()
  headers.set('Content-Type', 'application/json')
  const encoded = encodeURIComponent(siteUrl)
  const res = await fetch(
    `https://www.googleapis.com/webmasters/v3/sites/${encoded}/searchAnalytics/query`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      cache: 'no-store',
    }
  )
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`GSC API ${res.status}: ${text}`)
  }
  return res.json() as Promise<GSCResponse>
}

function delta(current: number, prior: number): number | null {
  if (!prior) return null
  return ((current - prior) / prior) * 100
}

export interface GSCKpis {
  clicks: number
  impressions: number
  ctr: number
  position: number
  clicksDelta: number | null
  impressionsDelta: number | null
  ctrDelta: number | null
  positionDelta: number | null
}

export interface GSCTrendRow {
  date: string
  clicks: number
  impressions: number
}

export interface GSCQueryRow {
  query: string
  clicks: number
  impressions: number
  ctr: number
  position: number
}

export interface GSCPageRow {
  page: string
  clicks: number
  impressions: number
  ctr: number
  position: number
}

export interface GSCOverview {
  kpis: GSCKpis
  trend: GSCTrendRow[]
  topQueries: GSCQueryRow[]
  topPages: GSCPageRow[]
  dateRange: { start: string; end: string }
}

export async function getGSCOverview(clientSlug: string): Promise<GSCOverview> {
  const config = getClientBySlug(clientSlug)
  if (!config) throw new Error(`Unknown client: ${clientSlug}`)
  if (!config.gscSiteUrl) throw new Error(`GSC not configured for client: ${clientSlug}`)

  const rawSiteUrl = process.env[config.gscSiteUrl]
  if (!rawSiteUrl) {
    throw new Error(`Missing env var: ${config.gscSiteUrl}`)
  }

  const current = periodDates(0)
  const prior = periodDates(WINDOW)

  const [kpiCurrent, kpiPrior, trendRes, queriesRes, pagesRes] = await Promise.all([
    gscPost(rawSiteUrl, { ...current, rowLimit: 1 }),
    gscPost(rawSiteUrl, { startDate: prior.startDate, endDate: prior.endDate, rowLimit: 1 }),
    gscPost(rawSiteUrl, { ...current, dimensions: ['date'], rowLimit: 90 }),
    gscPost(rawSiteUrl, { ...current, dimensions: ['query'], rowLimit: 25 }),
    gscPost(rawSiteUrl, { ...current, dimensions: ['page'], rowLimit: 25 }),
  ])

  const cur = kpiCurrent.rows?.[0]
  const pri = kpiPrior.rows?.[0]

  const kpis: GSCKpis = {
    clicks: cur?.clicks ?? 0,
    impressions: cur?.impressions ?? 0,
    ctr: cur?.ctr ?? 0,
    position: cur?.position ?? 0,
    clicksDelta: cur && pri ? delta(cur.clicks, pri.clicks) : null,
    impressionsDelta: cur && pri ? delta(cur.impressions, pri.impressions) : null,
    ctrDelta: cur && pri ? delta(cur.ctr, pri.ctr) : null,
    // Position: lower is better — invert the sign so green = improvement
    positionDelta: cur && pri ? -delta(cur.position, pri.position)! : null,
  }

  const trend: GSCTrendRow[] = (trendRes.rows ?? [])
    .sort((a, b) => a.keys[0].localeCompare(b.keys[0]))
    .map((r) => ({
      date: r.keys[0],
      clicks: r.clicks,
      impressions: r.impressions,
    }))

  const topQueries: GSCQueryRow[] = (queriesRes.rows ?? [])
    .sort((a, b) => b.clicks - a.clicks)
    .map((r) => ({
      query: r.keys[0],
      clicks: r.clicks,
      impressions: r.impressions,
      ctr: r.ctr,
      position: r.position,
    }))

  const topPages: GSCPageRow[] = (pagesRes.rows ?? [])
    .sort((a, b) => b.clicks - a.clicks)
    .map((r) => ({
      page: r.keys[0],
      clicks: r.clicks,
      impressions: r.impressions,
      ctr: r.ctr,
      position: r.position,
    }))

  return { kpis, trend, topQueries, topPages, dateRange: { start: current.startDate, end: current.endDate } }
}
