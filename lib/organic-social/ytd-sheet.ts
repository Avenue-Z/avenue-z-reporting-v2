// The team's YTD sheet (spec docs/superpowers/specs/2026-10-01-ytd-from-sheet-design.md): the per-year config, one
// read-only read per tab, and a strict parse. The sheet id, the tab and every value stay out of log lines and thrown
// messages: cached() memoizes and logs error messages (lib/cache.ts).
import { GoogleAuth } from 'google-auth-library'
import { cached } from '@/lib/cache'
import type { DashChannel } from './metrics'

export type YtdCell = { kind: 'number'; value: number } | { kind: 'na' | 'blank' | 'invalid' }
export type YtdTab = { followers: Partial<Record<DashChannel, YtdCell[]>>; views: Partial<Record<DashChannel, YtdCell[]>> }
export type YtdSheetEntry = { sheetId: string; tab: string }

export class YtdSheetLayoutError extends Error {
  constructor(readonly missing: string) { super(`ytd sheet layout not found: ${missing}`); this.name = 'YtdSheetLayoutError' }
}
export class YtdSheetReadError extends Error {
  constructor(readonly status: string) { super(`ytd sheet read failed: ${status}`); this.name = 'YtdSheetReadError' }
}

const SHEET_ID = /^[A-Za-z0-9_-]{20,100}$/
const NUMBER = /^(\d{1,3}(,\d{3})+|\d+)(\.\d+)?$/
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
const HEADERS: Record<string, DashChannel> = { instagram: 'INSTAGRAM', facebook: 'FACEBOOK', linkedin: 'LINKEDIN', tiktok: 'TIKTOK', x: 'TWITTER', twitter: 'TWITTER' }
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const firstCell = (row: unknown) => String((Array.isArray(row) ? row[0] : '') ?? '').trim()

/** The valid entry for the year on screen; 'none' when nothing is set for it; 'invalid' when something is set but
 *  unusable (the part warns once and draws version 1). */
export function ytdSheetFor(value: unknown, year: string): { kind: 'ok'; entry: YtdSheetEntry } | { kind: 'none' } | { kind: 'invalid' } {
  if (value === undefined) return { kind: 'none' }
  if (!isObj(value)) return { kind: 'invalid' }
  if (!Object.prototype.hasOwnProperty.call(value, year)) return { kind: 'none' }
  const e = value[year]
  if (!isObj(e) || typeof e.sheetId !== 'string' || !SHEET_ID.test(e.sheetId) || typeof e.tab !== 'string') return { kind: 'invalid' }
  const tab = e.tab.trim()
  if (tab.length === 0 || tab.length > 100) return { kind: 'invalid' }
  return { kind: 'ok', entry: { sheetId: e.sheetId, tab } }
}

export function classifyCell(raw: unknown): YtdCell {
  if (raw === undefined || raw === null) return { kind: 'blank' }
  const s = String(raw).trim()
  if (s === '') return { kind: 'blank' }
  if (/^n\/a$/i.test(s)) return { kind: 'na' }
  if (NUMBER.test(s)) return { kind: 'number', value: Number(s.replace(/,/g, '')) }
  return { kind: 'invalid' }
}

function block(grid: unknown[][], title: RegExp, name: 'followers' | 'views'): Partial<Record<DashChannel, YtdCell[]>> {
  const at = grid.findIndex((r) => title.test(firstCell(r)))
  if (at < 0) throw new YtdSheetLayoutError(`${name} title`)
  const header = Array.isArray(grid[at + 1]) ? grid[at + 1] : []
  const cols = new Map<DashChannel, number>()
  header.forEach((h, i) => {
    const ch = HEADERS[String(h ?? '').trim().toLowerCase()]
    if (ch && !cols.has(ch)) cols.set(ch, i)
  })
  if (cols.size === 0) throw new YtdSheetLayoutError(`${name} header`)
  const rows = MONTHS.map((m, i) => {
    const r = grid[at + 2 + i]
    if (!Array.isArray(r) || firstCell(r).toLowerCase() !== m) throw new YtdSheetLayoutError(`${name} ${m}`)
    return r
  })
  const out: Partial<Record<DashChannel, YtdCell[]>> = {}
  for (const [ch, i] of cols) out[ch] = rows.map((r) => classifyCell(r[i]))
  return out
}

export function parseYtdGrid(grid: unknown[][]): YtdTab {
  return { followers: block(grid, /^follower growth$/i, 'followers'), views: block(grid, /^views$/i, 'views') }
}

export function rangeFor(tab: string): string {
  return encodeURIComponent(`'${tab.replace(/'/g, "''")}'!A1:Z40`)
}

let auth: GoogleAuth | null = null
function getAuth(): GoogleAuth {
  if (!auth) {
    const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
    if (!raw) throw new YtdSheetReadError('no-key')
    let credentials: Record<string, unknown>
    try { credentials = JSON.parse(Buffer.from(raw, 'base64').toString('utf-8')) } catch { throw new YtdSheetReadError('bad-key') }
    auth = new GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] })
  }
  return auth
}

export async function readYtdTabImpl(sheetId: string, tab: string): Promise<unknown[][]> {
  let token: string | null | undefined
  try { token = await getAuth().getAccessToken() } catch (e) { throw e instanceof YtdSheetReadError ? e : new YtdSheetReadError('auth') }
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 10_000)
  let res: Response
  try {
    res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${rangeFor(tab)}`, {
      headers: { Authorization: `Bearer ${token}` }, signal: ctrl.signal, cache: 'no-store',
    })
  } catch {
    throw new YtdSheetReadError(ctrl.signal.aborted ? 'timeout' : 'network')
  } finally {
    clearTimeout(timer)
  }
  if (!res.ok) throw new YtdSheetReadError(String(res.status))
  const body = (await res.json().catch(() => null)) as { values?: unknown } | null
  if (!isObj(body) || (body.values !== undefined && !Array.isArray(body.values))) throw new YtdSheetReadError('malformed')
  return (body.values as unknown[][] | undefined) ?? []
}

/** At most one read per tab an hour; a failure is replayed for 30 seconds rather than re-asked on every render. */
export const readYtdTab = cached('google-sheets', 'ytdTab', readYtdTabImpl, {
  version: '1', ttlSeconds: 3600, negativeTtlSeconds: 30, healthCritical: true,
})
