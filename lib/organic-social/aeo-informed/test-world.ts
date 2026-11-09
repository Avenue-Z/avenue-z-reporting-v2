// lib/organic-social/aeo-informed/test-world.ts
// A fake Peec server with invented data, shared by the orchestrator and gate tests. Not used by the app.
import { PeecHttpError } from './peec-read'
import type { PeecReader } from './peec-read'
import type { AeoInformedInput } from './index'

type Filter = { field: string; operator?: string; values?: unknown[]; value?: unknown }
export type Body = { start_date: string; end_date: string; filters?: Filter[]; dimensions?: string[]; [k: string]: unknown }
export type Row = Record<string, unknown> & { date: string }
export const OWN = 'b_own', GLOBEX = 'b_globex'
export const urlRow = (url: string, date: string, o: Record<string, unknown> = {}) => ({
  url, date, classification: 'ARTICLE', title: 'T ' + url.slice(-6), channel_title: null, citation_count: 0, retrieval_count: 1, citation_rate: 0,
  citation_position: null, citation_position_sum: 0, citation_position_count: 0, mentioned_brands: [], ...o,
})
export const OWN_URL = 'https://www.linkedin.com/pulse/own-1'
export const THIRD = 'https://www.linkedin.com/pulse/third'
export const GLOBEX_URL = 'https://www.linkedin.com/company/globex'
export const GAP_B = 'https://www.linkedin.com/pulse/gap-b'
export const GAP_C = 'https://www.linkedin.com/pulse/gap-c'
export const BY_DAY = [
  urlRow(OWN_URL, '2026-09-04', { channel_title: 'Example Life', retrieval_count: 10, citation_count: 5, mentioned_brands: [{ id: GLOBEX }] }),
  urlRow(OWN_URL, '2026-09-20', { channel_title: 'Example Life', retrieval_count: 3, citation_count: 1 }),
  urlRow(OWN_URL, '2026-10-10', { channel_title: 'Example Life', retrieval_count: 20, citation_count: 8, citation_position_sum: 6, citation_position_count: 3, mentioned_brands: [{ id: OWN }] }),
  urlRow(THIRD, '2026-10-12', { channel_title: 'Some Author', retrieval_count: 7, citation_count: 2 }),
  urlRow(GLOBEX_URL, '2026-10-15', { channel_title: 'Globex', retrieval_count: 4, citation_count: 1 }),
]
export const GAP_ROWS = [
  urlRow(THIRD, '2026-09-10', { channel_title: 'Some Author', retrieval_count: 6, citation_count: 3, citation_position_sum: 9, citation_position_count: 3, mentioned_brands: [{ id: GLOBEX }] }),
  urlRow(THIRD, '2026-08-20', { channel_title: 'Some Author', retrieval_count: 2, citation_count: 1, mentioned_brands: [{ id: GLOBEX }] }),
  // a second and third gap row: GAP_B ties with THIRD on retrievals (the URL breaks the tie), GAP_C has retrievals but no citations
  urlRow(GAP_B, '2026-09-12', { channel_title: 'Some Author', retrieval_count: 6, citation_count: 2, citation_position_sum: 4, citation_position_count: 2, mentioned_brands: [{ id: GLOBEX }] }),
  urlRow(GAP_C, '2026-09-15', { channel_title: 'Some Author', retrieval_count: 2, citation_count: 0, mentioned_brands: [{ id: GLOBEX }] }),
]
export const CHAT_ROWS = [
  urlRow(OWN_URL, '2026-09-04', { channel_title: 'Example Life', chat: { id: 'c1' } }),
  urlRow(OWN_URL, '2026-09-05', { channel_title: 'Example Life', chat: { id: 'c2' } }),
]

export function world(over: { brands?: Record<string, unknown>[]; classes?: { name: string }[]; tags?: { id: string; name: string }[]; failOn?: (path: string, body?: Body) => boolean; chatsPerDay?: number; byDay?: Row[]; chatDaysMissing?: string[]; gapRows?: Row[]; failStatus?: number } = {}) {
  const calls: { method: string; path: string; body?: Body; label?: string }[] = []
  let inFlight = 0, maxInFlight = 0
  const brands = over.brands ?? [{ id: OWN, name: 'Example', is_own: true }, { id: GLOBEX, name: 'Globex', is_own: false }]
  const reader: PeecReader = {
    async get(path, query, label) {
      inFlight++; maxInFlight = Math.max(maxInFlight, inFlight)
      calls.push({ method: 'GET', path, body: query as Body, label })
      await Promise.resolve(); inFlight--
      if (over.failOn?.(path)) throw new PeecHttpError(over.failStatus ?? 500, path, 'boom', label)
      if (path === '/brands') return { data: brands }
      if (path === '/brands/social-channels') return { data: [{ brand_id: OWN, platform: 'linkedin', channel_handle: 'company/examplebenefits' }, { brand_id: GLOBEX, platform: 'linkedin', channel_handle: 'company/globex' }] }
      if (path === '/classifications/domains') return { data: over.classes ?? [{ name: 'Organic Social' }, { name: 'Editorial - Trade' }] }
      if (path === '/source-tags') return { data: over.tags ?? [{ id: 'stg_1', name: 'Organic Social' }] }
      throw new Error('unexpected GET ' + path)
    },
    async post(path, rawBody, label) {
      const body = rawBody as Body
      inFlight++; maxInFlight = Math.max(maxInFlight, inFlight)
      calls.push({ method: 'POST', path, body, label })
      await Promise.resolve(); inFlight--
      if (over.failOn?.(path, body)) throw new PeecHttpError(over.failStatus ?? 500, path, 'boom', label)
      const within = (d: string) => d >= body.start_date && d <= body.end_date
      if (path === '/reports/brands') {
        const out: Record<string, unknown>[] = []
        for (let t = Date.parse(body.start_date + 'T00:00:00Z'); t <= Date.parse(body.end_date + 'T00:00:00Z'); t += 86_400_000) { const dd = new Date(t).toISOString().slice(0, 10); if (!over.chatDaysMissing?.includes(dd)) out.push({ date: dd, visibility_total: over.chatsPerDay ?? 100 }) }
        return { data: out }
      }
      const hasGap = (body.filters ?? []).some((f) => f.field === 'gap')
      const isChat = (body.dimensions ?? []).includes('chat_id')
      const src = isChat ? CHAT_ROWS : hasGap ? (over.gapRows ?? GAP_ROWS) : (over.byDay ?? BY_DAY)
      const inWindow = src.filter((r) => within(r.date))
      // Like Peec: without a date dimension the answer is one row per URL for the whole window, and the gap filter is judged on that whole window.
      if (hasGap && !(body.dimensions ?? []).includes('date')) {
        // ...and, as the live answer does, a URL whose rows name different competitors comes back as separate rows (one per set of brands).
        const byUrl = new Map<string, Record<string, unknown>>()
        for (const r of inWindow) {
          const k = (r.url as string) + '|' + (r.mentioned_brands as { id: string }[]).map((b) => b.id).sort().join(',')
          const e = byUrl.get(k)
          if (!e) { const first: Record<string, unknown> = { ...r, mentioned_brands: [...(r.mentioned_brands as { id: string }[])] }; delete first.date; byUrl.set(k, first); continue }
          for (const k of ['retrieval_count', 'citation_count', 'citation_position_sum', 'citation_position_count'] as const) e[k] = (e[k] as number) + (r[k] as number)
          for (const b of r.mentioned_brands as { id: string }[]) if (!(e.mentioned_brands as { id: string }[]).some((x) => x.id === b.id)) (e.mentioned_brands as { id: string }[]).push(b)
        }
        return { data: [...byUrl.values()] }
      }
      return { data: inWindow }
    },
  }
  return { reader, calls, maxInFlight: () => maxInFlight }
}

export const views = {
  socials: { start: '2026-10-07', end: '2026-11-05' },
  gaps: { start: '2026-09-01', end: '2026-09-30' },
  graphs: {
    citations_all: { from: '2026-08-14', weeks: 12 }, citations_linkedin: { from: '2026-09-03', weeks: 4 },
    citations_instagram: { from: '2026-10-24', weeks: 4 }, used_as_source_all: { from: '2026-09-03', weeks: 4 },
  },
}
export const input = (reader: PeecReader, o: Record<string, unknown> = {}) => ({ apiKey: 'skc-SECRET-KEY', projectId: 'or_p', asOf: '2026-11-08', now: () => Date.parse('2026-11-09T12:00:00Z'), views, reader, ...o }) as AeoInformedInput

