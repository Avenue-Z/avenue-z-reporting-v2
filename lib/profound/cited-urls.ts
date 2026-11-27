// lib/profound/cited-urls.ts
// Profound side of the AEO Overview v2 Cited Sources URL table. One window is built from
// the answer stream (every answer's citation list, so "used in" counts answers) plus the
// v1 citations report (source category per URL), mapped to lib/aeo/cited-urls.ts.
import { cached } from '@/lib/cache'
import { profoundPost } from '@/lib/profound/client'
import {
  emptyCitedUrls,
  joinWindows,
  windowTooLong,
  type CitedUrls,
  type IsoWindow,
  type SourceType,
  type UrlWindow,
  type UrlWindowRow,
} from '@/lib/aeo/cited-urls'

const STREAM_URL = 'https://api.tryprofound.com/v2/prompts/answers/stream'
const STREAM_PATH = '/v2/prompts/answers/stream'

export function profoundPageKey(raw: string): string | null {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return null
  }
  if (!u.hostname) return null
  const host = u.hostname.toLowerCase().replace(/^www\./, '')
  const path = u.pathname.replace(/\/{2,}/g, '/')
  const kept = [...u.searchParams.entries()].filter(([k]) => !k.toLowerCase().startsWith('utm_'))
  const query = kept.length ? '?' + kept.map(([k, v]) => `${k}=${v}`).join('&') : ''
  return `${host}${path === '/' && !query ? '' : path}${query}`
}

export type ProfoundStream = { totalResults: number | null; answers: { citations: string[] }[] }

export function parseAnswerStream(text: string): ProfoundStream {
  let totalResults: number | null = null
  const answers: { citations: string[] }[] = []
  for (const block of text.split(/\r?\n\r?\n/)) {
    if (!block.trim()) continue
    let event = ''
    const data: string[] = []
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith('event:')) event = line.slice(6).trim()
      else if (line.startsWith('data:')) data.push(line.slice(5).trimStart())
    }
    if (event === 'error') throw new Error('Profound stream error event')
    if (event !== 'summary' && event !== 'result') continue
    let parsed: unknown
    try {
      parsed = JSON.parse(data.join('\n'))
    } catch {
      throw new Error('Profound stream sent a data line that is not JSON')
    }
    const obj = (parsed ?? {}) as { total_results?: unknown; citations?: unknown }
    if (event === 'summary') {
      totalResults = typeof obj.total_results === 'number' ? obj.total_results : null
    } else {
      answers.push({
        citations: Array.isArray(obj.citations) ? obj.citations.filter((c): c is string => typeof c === 'string') : [],
      })
    }
  }
  return { totalResults, answers }
}

export type ProfoundCategoryRow = { url: string; hostname: string; category: string }

export function parseCategoryRows(res: {
  info: { query?: { dimensions?: string[] } }
  data: { dimensions: (string | null)[] }[]
}): ProfoundCategoryRow[] {
  const dims = res.info?.query?.dimensions ?? []
  const iUrl = dims.indexOf('url')
  const iHost = dims.indexOf('hostname')
  const iCat = dims.indexOf('citation_category')
  if (iUrl < 0 || iHost < 0 || iCat < 0) return []
  const out: ProfoundCategoryRow[] = []
  for (const r of res.data ?? []) {
    const url = r.dimensions[iUrl]
    if (!url) continue
    out.push({ url, hostname: r.dimensions[iHost] ?? '', category: r.dimensions[iCat] ?? '' })
  }
  return out
}

export function profoundSource(category: string | undefined): { sourceType: SourceType; sourceLabel: string } {
  switch (category) {
    case 'owned': return { sourceType: 'own', sourceLabel: 'Own' }
    case 'competition': return { sourceType: 'competitor', sourceLabel: 'Competitor' }
    case 'earned_media': return { sourceType: 'third_party', sourceLabel: 'Earned media' }
    case 'earned_institutions': return { sourceType: 'third_party', sourceLabel: 'Institution' }
    case 'pr_wire': return { sourceType: 'third_party', sourceLabel: 'PR wire' }
    case 'social': return { sourceType: 'third_party', sourceLabel: 'Social' }
    default: return { sourceType: 'third_party', sourceLabel: 'Other' }
  }
}

function hostOfKey(key: string): string {
  return key.split(/[/?]/)[0]
}

export function mapProfoundWindow(stream: ProfoundStream, categories: ProfoundCategoryRow[]): UrlWindow {
  const byUrl = new Map<string, string>()
  const hostCounts = new Map<string, Map<string, number>>()
  for (const c of categories) {
    const k = profoundPageKey(`https://${c.url}`) ?? c.url
    byUrl.set(k, c.category)
    const host = (c.hostname || hostOfKey(k)).toLowerCase().replace(/^www\./, '')
    const m = hostCounts.get(host) ?? new Map<string, number>()
    m.set(c.category, (m.get(c.category) ?? 0) + 1)
    hostCounts.set(host, m)
  }
  const hostCategory = (host: string): string | undefined => {
    const m = hostCounts.get(host)
    if (!m) return undefined
    let best: string | undefined
    let n = 0
    for (const [cat, count] of m) if (count > n) { best = cat; n = count }
    return best
  }

  const byKey = new Map<string, UrlWindowRow>()
  let totalCitations = 0
  for (const a of stream.answers) {
    const seen = new Set<string>()
    for (const raw of a.citations) {
      const key = profoundPageKey(raw)
      if (!key) continue
      totalCitations += 1
      let row = byKey.get(key)
      if (!row) {
        row = {
          key,
          url: key,
          title: null,
          ...profoundSource(byUrl.get(key) ?? hostCategory(hostOfKey(key)) ?? 'other'),
          pageType: null,
          answersUsing: 0,
          citations: 0,
        }
        byKey.set(key, row)
      }
      row.citations += 1
      if (!seen.has(key)) {
        seen.add(key)
        row.answersUsing += 1
      }
    }
  }
  return {
    rows: [...byKey.values()],
    totalAnswers: stream.answers.length,
    totalCitations,
    complete: stream.totalResults === stream.answers.length,
  }
}

const VISIBILITY_V1 = { field: 'analysis_type', operator: 'is', value: 'visibility' }
const VISIBILITY_V2 = { field: 'analysis_type', op: 'is', value: 'visibility' }

async function fetchStream(categoryId: string, w: IsoWindow): Promise<ProfoundStream> {
  const key = process.env.PROFOUND_AI_ACCESS_TOKEN
  if (!key) throw new Error('Missing env var: PROFOUND_AI_ACCESS_TOKEN')
  const res = await fetch(STREAM_URL, {
    method: 'POST',
    headers: { 'X-API-Key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      category_id: categoryId,
      start_date: w.startDate,
      end_date: w.endDate,
      include: ['citations'],
      filter: VISIBILITY_V2,
    }),
    // About 8 MB per 30 days, over the 2 MB data cache; the outer cached() holds the result.
    cache: 'no-store',
  })
  if (!res.ok) {
    const body = await res.text()
    console.error(`[cited-sources] profound ${res.status} ${STREAM_PATH}:`, body.slice(0, 300))
    throw new Error(`Profound API error ${res.status}: ${STREAM_PATH}`)
  }
  return parseAnswerStream(await res.text())
}

async function fetchCategories(categoryId: string, w: IsoWindow): Promise<ProfoundCategoryRow[]> {
  const res = await profoundPost(
    '/v1/reports/citations',
    {
      category_id: categoryId,
      start_date: w.startDate,
      end_date: w.endDate,
      metrics: ['count'],
      dimensions: ['citation_category', 'hostname', 'url'],
      filters: [VISIBILITY_V1],
      pagination: { limit: 50000 },
    },
    { revalidate: false },
  )
  const rows = parseCategoryRows(res as Parameters<typeof parseCategoryRows>[0])
  const total = res.info?.total_rows
  if (typeof total === 'number' && total > (res.data ?? []).length) {
    console.warn('[cited-sources] profound categories truncated', { total, received: (res.data ?? []).length })
  }
  return rows
}

async function getProfoundCitedUrlsImpl(
  clientSlug: string,
  current: IsoWindow,
  prior: IsoWindow | null,
): Promise<CitedUrls> {
  if (windowTooLong(current) || (prior && windowTooLong(prior))) return emptyCitedUrls('profound', { tooLong: true })
  const { getClientBySlug } = await import('@/lib/db/queries')
  const categoryId = (await getClientBySlug(clientSlug))?.profoundCategoryId
  if (!categoryId) return emptyCitedUrls('profound')
  const window = async (w: IsoWindow, withCategories: boolean): Promise<UrlWindow> => {
    const [stream, cats] = await Promise.all([
      fetchStream(categoryId, w),
      withCategories ? fetchCategories(categoryId, w) : Promise.resolve([]),
    ])
    const out = mapProfoundWindow(stream, cats)
    if (!out.complete) {
      console.warn('[cited-sources] profound stream ended early', {
        client: clientSlug, start: w.startDate, end: w.endDate,
        expected: stream.totalResults, received: stream.answers.length,
      })
    }
    return out
  }
  try {
    const [cur, pri] = await Promise.all([window(current, true), prior ? window(prior, false) : Promise.resolve(null)])
    return joinWindows('profound', cur, pri)
  } catch (e) {
    console.error('[cited-sources] profound fetch failed', {
      client: clientSlug, start: current.startDate, end: current.endDate,
    })
    throw e
  }
}

export const getProfoundCitedUrls = cached('profound', 'getProfoundCitedUrls', getProfoundCitedUrlsImpl, {
  version: 'v1',
  extractTags: ([slug]) => ({ client: slug }),
})
