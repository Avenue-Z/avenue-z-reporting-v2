// lib/organic-social/aeo-informed/shape.ts
// Runtime checks on what Peec returns, so a changed vendor shape fails loudly instead of producing wrong tables.
// Required fields mirror the live OpenAPI (read 2026-11-09). Extra fields are ignored. Error text names the endpoint, the row and the
// field, never the value (rows hold client data).
import type { PeecBrand, PeecBrandDayRow, PeecSocialChannel, PeecUrlRow } from './types'
import { assertIsoDate } from './windows'

export class PeecShapeError extends Error {
  constructor(public path: string, public field: string, public expected: string, public saw: string) {
    super(`Peec ${path}: ${field} expected ${expected}, saw ${saw}`)
    this.name = 'PeecShapeError'
  }
}

const kind = (v: unknown): string => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v === 'number' && !Number.isFinite(v) ? 'non-finite number' : typeof v)

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)

function dataArray(body: unknown, path: string): Obj[] {
  if (!isObj(body)) throw new PeecShapeError(path, 'body', 'object', kind(body))
  const d = body.data
  if (!Array.isArray(d)) throw new PeecShapeError(path, 'data', 'array', kind(d))
  d.forEach((r, i) => { if (!isObj(r)) throw new PeecShapeError(path, `data[${i}]`, 'object', kind(r)) })
  return d as Obj[]
}

const str = (o: Obj, k: string, p: string, i: number, nonEmpty = false): string => {
  const v = o[k]
  if (typeof v !== 'string' || (nonEmpty && v.length === 0)) throw new PeecShapeError(p, `data[${i}].${k}`, nonEmpty ? 'non-empty string' : 'string', kind(v))
  return v
}
const strOrNull = (o: Obj, k: string, p: string, i: number, optional = false): string | null => {
  const v = o[k]
  if (v === undefined && optional) return null
  if (v !== null && typeof v !== 'string') throw new PeecShapeError(p, `data[${i}].${k}`, 'string or null', kind(v))
  return v
}
/** A date field: Peec may send a full timestamp, so cut it to the day, then require a real YYYY-MM-DD. A bad date is an error, never a row that silently falls outside every window. */
const day = (o: Obj, k: string, p: string, i: number): string => {
  const d = str(o, k, p, i, true).slice(0, 10)
  try { assertIsoDate(d) } catch { throw new PeecShapeError(p, `data[${i}].${k}`, 'a YYYY-MM-DD date', 'another format') }
  return d
}
const count = (o: Obj, k: string, p: string, i: number): number => {
  const v = o[k]
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) throw new PeecShapeError(p, `data[${i}].${k}`, 'number, 0 or more', kind(v))
  return v
}

export type UrlRowOptions = { requireDate?: boolean; requireChat?: boolean }

export function parseUrlRows(body: unknown, path: string, opts: UrlRowOptions = {}): PeecUrlRow[] {
  return dataArray(body, path).map((o, i) => {
    const brands = o.mentioned_brands
    if (!Array.isArray(brands)) throw new PeecShapeError(path, `data[${i}].mentioned_brands`, 'array', kind(brands))
    const mentioned = brands.map((b, j) => {
      if (!isObj(b) || typeof b.id !== 'string') throw new PeecShapeError(path, `data[${i}].mentioned_brands[${j}].id`, 'string', isObj(b) ? kind(b.id) : kind(b))
      return { id: b.id }
    })
    const pos = o.citation_position
    if (pos !== null && (typeof pos !== 'number' || !Number.isFinite(pos))) throw new PeecShapeError(path, `data[${i}].citation_position`, 'number or null', kind(pos))
    const row: PeecUrlRow = {
      url: str(o, 'url', path, i, true),
      classification: strOrNull(o, 'classification', path, i),
      title: strOrNull(o, 'title', path, i),
      channel_title: strOrNull(o, 'channel_title', path, i, true),
      citation_count: count(o, 'citation_count', path, i),
      retrieval_count: count(o, 'retrieval_count', path, i),
      citation_position: pos,
      citation_position_sum: count(o, 'citation_position_sum', path, i),
      citation_position_count: count(o, 'citation_position_count', path, i),
      mentioned_brands: mentioned,
    }
    if (o.date !== undefined || opts.requireDate) row.date = day(o, 'date', path, i)
    if (o.chat !== undefined || opts.requireChat) {
      const c = o.chat
      if (!isObj(c) || typeof c.id !== 'string') throw new PeecShapeError(path, `data[${i}].chat.id`, 'string', isObj(c) ? kind(c.id) : kind(c))
      row.chat = { id: c.id }
    }
    return row
  })
}

export function parseBrands(body: unknown): PeecBrand[] {
  const p = '/brands'
  return dataArray(body, p).map((o, i) => {
    if (typeof o.is_own !== 'boolean') throw new PeecShapeError(p, `data[${i}].is_own`, 'boolean', kind(o.is_own))
    return { id: str(o, 'id', p, i, true), name: str(o, 'name', p, i, true), is_own: o.is_own }
  })
}

export function parseSocialChannels(body: unknown): PeecSocialChannel[] {
  const p = '/brands/social-channels'
  return dataArray(body, p).map((o, i) => ({ brand_id: str(o, 'brand_id', p, i, true), platform: str(o, 'platform', p, i, true), channel_handle: str(o, 'channel_handle', p, i, true) }))
}

export function parseSourceTags(body: unknown): { id: string; name: string }[] {
  const p = '/source-tags'
  return dataArray(body, p).map((o, i) => {
    const id = str(o, 'id', p, i, true)
    if (!id.startsWith('stg_')) throw new PeecShapeError(p, `data[${i}].id`, 'an id starting stg_', 'another prefix')
    return { id, name: str(o, 'name', p, i, true) }
  })
}

export function parseClassifications(body: unknown, path: string): { name: string }[] {
  return dataArray(body, path).map((o, i) => ({ name: str(o, 'name', path, i, true) }))
}

export function parseBrandDayRows(body: unknown): PeecBrandDayRow[] {
  const p = '/reports/brands'
  return dataArray(body, p).map((o, i) => ({ date: day(o, 'date', p, i), visibility_total: count(o, 'visibility_total', p, i) }))
}
