/**
 * Dash Social HTTP client — server-side only.
 * Modeled on dash-social-connection/src/dashsocial/client.py.
 * One Bearer token works across all hosts; brand selected per call by brandId.
 */
import type { ReportsDataParams, ReportsDataResponse, MediaV2Response } from './types'
export * from './types'

const DASHBOARD = 'https://dashboard.dashsocial.com'
const LIBRARY = 'https://library-backend.dashsocial.com'

export class DashApiError extends Error {}
export class DashAuthError extends DashApiError {}
export class DashRateLimitError extends DashApiError {}
export class DashTimeoutError extends DashApiError { constructor() { super('Dash Social request timed out') } }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export class DashSocialClient {
  private token: string
  private fetchImpl: typeof fetch
  private maxRetries: number
  private timeoutMs: number
  constructor(opts: { token: string; fetchImpl?: typeof fetch; maxRetries?: number; timeoutMs?: number }) {
    this.token = opts.token
    this.fetchImpl = opts.fetchImpl ?? fetch
    this.maxRetries = opts.maxRetries ?? 3
    this.timeoutMs = opts.timeoutMs ?? 30000
  }

  private async request<T>(method: string, url: string, body?: unknown): Promise<T> {
    const hasBody = body != null
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      Accept: 'application/json',
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
    }
    for (let attempt = 0; ; attempt++) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), this.timeoutMs)
      let res: Response
      try {
        res = await this.fetchImpl(url, {
          method, headers, body: hasBody ? JSON.stringify(body) : undefined,
          signal: controller.signal,
          next: { revalidate: 3600 },
        } as RequestInit)
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') throw new DashTimeoutError()
        throw err
      } finally {
        clearTimeout(timer)
      }
      if (res.status === 401 || res.status === 403) throw new DashAuthError(`${res.status} from ${url}`)
      if (res.status === 429) {
        if (attempt >= this.maxRetries) throw new DashRateLimitError(`429 persistent at ${url}`)
        const retry = Number(res.headers.get('Retry-After') ?? '2')
        await sleep(Math.min(retry, 10) * 1000)
        continue
      }
      if (res.status >= 500) {
        if (attempt >= this.maxRetries) throw new DashApiError(`${res.status} persistent at ${url}`)
        await sleep(Math.min(2 ** attempt, 8) * 1000)
        continue
      }
      if (!res.ok) throw new DashApiError(`${res.status} at ${url}`)
      return res.json() as Promise<T>
    }
  }

  getReportsData<M = unknown>(p: ReportsDataParams): Promise<ReportsDataResponse<M>> {
    const q = new URLSearchParams({
      brand_ids: String(p.brandId),
      channels: p.channels.join(','),
      metrics: p.metrics.join(','),
      report_type: p.reportType ?? 'TOTAL_METRIC',
      start_date: p.startDate,
      end_date: p.endDate,
    })
    if (p.timeScale) q.set('time_scale', p.timeScale)
    if (p.contextStartDate) q.set('context_start_date', p.contextStartDate)
    if (p.contextEndDate) q.set('context_end_date', p.contextEndDate)
    return this.request<ReportsDataResponse<M>>('GET', `${DASHBOARD}/reports/data?${q}`)
  }

  getMedia(p: { brandId: number; startDate: string; endDate: string; limit?: number }): Promise<MediaV2Response> {
    return this.request<MediaV2Response>('PUT', `${LIBRARY}/brands/${p.brandId}/media/v2`, {
      start_date: p.startDate, end_date: p.endDate, limit: p.limit ?? 50,
    })
  }
}
