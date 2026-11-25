// Screaming Frog source: finds each brand's run folders in Drive and parses the Issues Overview export.
// Safety: file contents and tokens never appear in errors; messages use fixed strings and our own column names.
import * as XLSX from 'xlsx'
import { googleToken } from './google'
import type { Parsed, SfResult, SourceIssue } from './types'

const DRIVE = 'https://www.googleapis.com/drive/v3/files'
const SCOPE = 'https://www.googleapis.com/auth/drive.readonly'
const TIMEOUT_MS = 15_000
const MAX_PAGES = 50
const MAX_BYTES = 20 * 1024 * 1024
const FOLDER_MIME = 'application/vnd.google-apps.folder'
const ISSUES_FILE = /^issues_overview.*\.csv$/i

export function parseRunFolderName(name: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})_\d{6}$/.exec(name)
  if (!m) return null
  const mo = Number(m[2])
  const d = Number(m[3])
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
  return `${m[1]}-${m[2]}-${m[3]}`
}

async function driveFetch(url: string): Promise<Response> {
  const token = await googleToken([SCOPE])
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: ctrl.signal })
    if (!res.ok) throw new Error(`Drive ${res.status}`)
    return res
  } catch (e) {
    if (ctrl.signal.aborted) throw new Error('Drive timeout')
    if (e instanceof Error && e.message.startsWith('Drive ')) throw e
    throw new Error('Drive request failed')
  } finally {
    clearTimeout(timer)
  }
}

interface DriveFile { id: string; name: string }

async function listChildren(parentId: string, extraQuery: string): Promise<DriveFile[]> {
  if (!/^[A-Za-z0-9_-]+$/.test(parentId)) throw new Error('Invalid folder id')
  const out: DriveFile[] = []
  let pageToken: string | undefined
  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({
      q: `'${parentId}' in parents and trashed=false${extraQuery}`,
      fields: 'nextPageToken,files(id,name)',
      pageSize: '1000',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
    })
    if (pageToken) params.set('pageToken', pageToken)
    const res = await driveFetch(`${DRIVE}?${params}`)
    let body: { files?: DriveFile[]; nextPageToken?: string }
    try { body = await res.json() } catch { throw new Error('Drive invalid response') }
    if (!body || !Array.isArray(body.files)) throw new Error('Drive invalid response')
    out.push(...body.files)
    pageToken = body.nextPageToken
    if (!pageToken) return out
  }
  throw new Error('Drive listing exceeded page limit')
}

export async function listSfRuns(folderId: string): Promise<{ date: string; folderId: string }[]> {
  const files = await listChildren(folderId, ` and mimeType='${FOLDER_MIME}'`)
  const latest = new Map<string, { name: string; folderId: string }>()
  for (const f of files) {
    const date = parseRunFolderName(f.name)
    if (!date) continue
    const cur = latest.get(date)
    if (!cur || f.name > cur.name) latest.set(date, { name: f.name, folderId: f.id })
  }
  return [...latest.entries()]
    .map(([date, v]) => ({ date, folderId: v.folderId }))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
}

export async function fetchIssuesOverview(runFolderId: string): Promise<{ bytes: Uint8Array } | null> {
  const files = await listChildren(runFolderId, ` and mimeType!='${FOLDER_MIME}'`)
  const match = files.filter(f => ISSUES_FILE.test(f.name)).sort((a, b) => (a.name < b.name ? 1 : -1))[0]
  if (!match) return null
  const res = await driveFetch(`${DRIVE}/${encodeURIComponent(match.id)}?alt=media&supportsAllDrives=true`)
  const buf = new Uint8Array(await res.arrayBuffer())
  if (buf.byteLength > MAX_BYTES) throw new Error('Drive file too large')
  return { bytes: buf }
}

const REQUIRED = ['Issue Name', 'Issue Type', 'Issue Priority', 'URLs'] as const
type Bucket = 'issue' | 'warning' | 'opportunity'
const BUCKETS: Record<string, Bucket> = { issue: 'issue', warning: 'warning', opportunity: 'opportunity' }

export function parseSfIssuesOverview(csv: string, crawlDate: string): Parsed<SfResult> {
  const text = csv.replace(/^﻿/, '')
  let rows: unknown[][]
  try {
    const wb = XLSX.read(text, { type: 'string' })
    const sheet = wb.Sheets[wb.SheetNames[0]]
    if (!sheet) return { ok: false, reason: 'Empty file' }
    rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, blankrows: false, defval: '' })
  } catch {
    return { ok: false, reason: 'Unreadable file' }
  }
  const header = (rows[0] ?? []).map(h => String(h).trim())
  const idx: Record<string, number> = {}
  for (const col of REQUIRED) {
    const i = header.indexOf(col)
    if (i < 0) return { ok: false, reason: `Missing column '${col}'` }
    idx[col] = i
  }
  const issueTypes = { issue: 0, warning: 0, opportunity: 0 }
  const urls = { issue: 0, warning: 0, opportunity: 0 }
  const issues: SourceIssue[] = []
  for (const row of rows.slice(1)) {
    const type = BUCKETS[String(row[idx['Issue Type']] ?? '').trim().toLowerCase()]
    if (!type) continue
    const raw = row[idx['URLs']]
    const n = typeof raw === 'number' ? raw : Number(String(raw ?? '').replace(/,/g, '').trim())
    if (String(raw ?? '').trim() === '' || !Number.isFinite(n) || n < 0) {
      return { ok: false, reason: "Non-numeric value in column 'URLs'" }
    }
    issueTypes[type] += 1
    urls[type] += n
    issues.push({
      source: 'sf',
      nativeName: String(row[idx['Issue Name']] ?? '').trim(),
      nativeSeverity: String(row[idx['Issue Priority']] ?? '').trim(),
      urlCount: n,
    })
  }
  if (rows.length > 1 && issues.length === 0) return { ok: false, reason: "No recognised 'Issue Type' values" }
  return { ok: true, value: { crawlDate, issueTypes, urls, issues } }
}
