// @vitest-environment node
// The upload action (spec sections 5, 6, 10, 11). Node environment: FormData and File as a server action receives them.
// The parser runs for real on workbooks built in the test with made-up numbers; only the store and the client lookup
// are replaced.
import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { buildWorkbook } from '@/lib/organic-social/social-listening/test-workbook'

vi.mock('next/cache', () => ({ revalidateTag: vi.fn(), updateTag: vi.fn() }))
const h = vi.hoisted(() => {
  const SETTING = { enabled: true, brandTopic: 'Made Up Brand', industryTopic: 'Made Up Industry' }
  return {
    SETTING,
    client: (over: Record<string, unknown> = {}, cfg: Record<string, unknown> = {}) => ({
      id: 'client-uuid', slug: 'a-client', hiddenReports: [],
      dashSocialConfig: { brandId: 1, reportingMonths: { firstMonth: '2026-08' }, socialListening: SETTING, ...cfg },
      ...over,
    }),
  }
})
vi.mock('@/lib/db/queries', () => ({ getClientBySlug: vi.fn(async () => h.client()) }))
vi.mock('@/lib/organic-social/social-listening/store', () => ({ insertUpload: vi.fn(async () => ({ id: 'upload-uuid' })) }))
// The real parser, wrapped so one test can make it throw.
vi.mock('@/lib/organic-social/social-listening/export-parse', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/organic-social/social-listening/export-parse')>()
  return { ...actual, parseTalkwalkerExport: vi.fn(actual.parseTalkwalkerExport) }
})

import { auth } from '@/auth'
import { updateTag } from 'next/cache'
import { getClientBySlug } from '@/lib/db/queries'
import { insertUpload } from '@/lib/organic-social/social-listening/store'
import { parseTalkwalkerExport } from '@/lib/organic-social/social-listening/export-parse'
import { uploadSocialListeningExport } from './social-listening'

const as = (role: string, email: string | null = 'writer@avenuez.com') =>
  (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { role, email } })
const OCT = 'custom:2026-10-01,2026-10-31'
const FILE_NAME = 'private-file-name.xls'
const brandOct = () => buildWorkbook({ topic: 'brand', topicName: 'Made Up Brand', month: '2026-10' })

function form(fields: { clientSlug?: string; topic?: string; range?: string; file?: Uint8Array | null; extra?: Record<string, string> }) {
  const f = new FormData()
  if (fields.clientSlug !== undefined) f.set('clientSlug', fields.clientSlug)
  if (fields.topic !== undefined) f.set('topic', fields.topic)
  if (fields.range !== undefined) f.set('range', fields.range)
  if (fields.file) f.set('file', new File([new Uint8Array(fields.file)], FILE_NAME, { type: 'application/vnd.ms-excel' }))
  for (const [k, v] of Object.entries(fields.extra ?? {})) f.set(k, v)
  return f
}
const good = (over: Parameters<typeof form>[0] = {}) => form({ clientSlug: 'a-client', topic: 'brand', range: OCT, file: brandOct(), ...over })

let warn: ReturnType<typeof vi.spyOn>
let info: ReturnType<typeof vi.spyOn>
let error: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-19T15:00:00Z'))
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  info = vi.spyOn(console, 'info').mockImplementation(() => {})
  error = vi.spyOn(console, 'error').mockImplementation(() => {})
  as('INTERNAL_ANALYST')
})
afterEach(() => { vi.useRealTimers(); warn.mockRestore(); info.mockRestore(); error.mockRestore() })

const FORBIDDEN = { ok: false, errors: ['forbidden'] }

describe('who may upload', () => {
  test('a client role is refused even with an @avenuez.com email; nothing is read or stored', async () => {
    as('CLIENT_ADMIN', 'writer@avenuez.com')
    expect(await uploadSocialListeningExport(good())).toEqual(FORBIDDEN)
    expect(getClientBySlug).not.toHaveBeenCalled()
    expect(insertUpload).not.toHaveBeenCalled()
  })
  test('a team role without an @avenuez.com email is refused, and so is no session', async () => {
    as('INTERNAL_ADMIN', 'someone@example.com')
    expect(await uploadSocialListeningExport(good())).toEqual(FORBIDDEN)
    ;(auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    expect(await uploadSocialListeningExport(good())).toEqual(FORBIDDEN)
    expect(insertUpload).not.toHaveBeenCalled()
  })
})

describe('the client and its setting are re-checked on the server', () => {
  test('an unknown client', async () => {
    vi.mocked(getClientBySlug).mockResolvedValueOnce(undefined as never)
    expect(await uploadSocialListeningExport(good())).toEqual({ ok: false, errors: ['client not found'] })
  })
  test('a client without the setting, with it switched off, or with the tab hidden', async () => {
    const OFF = { ok: false, errors: ['Social listening is not on for this client.'] }
    vi.mocked(getClientBySlug).mockResolvedValueOnce(h.client({}, { socialListening: undefined }) as never)
    expect(await uploadSocialListeningExport(good())).toEqual(OFF)
    vi.mocked(getClientBySlug).mockResolvedValueOnce(h.client({}, { socialListening: { ...h.SETTING, enabled: false } }) as never)
    expect(await uploadSocialListeningExport(good())).toEqual(OFF)
    vi.mocked(getClientBySlug).mockResolvedValueOnce(h.client({ hiddenReports: ['organic-social-listening'] }) as never)
    expect(await uploadSocialListeningExport(good())).toEqual(OFF)
    expect(insertUpload).not.toHaveBeenCalled()
  })
  test('an industry upload for a client with no industry topic', async () => {
    vi.mocked(getClientBySlug).mockResolvedValueOnce(h.client({}, { socialListening: { enabled: true, brandTopic: 'Made Up Brand' } }) as never)
    const file = buildWorkbook({ topic: 'industry', topicName: 'Made Up Industry', month: '2026-10' })
    expect(await uploadSocialListeningExport(good({ topic: 'industry', file }))).toEqual({ ok: false, errors: ['This client has no industry topic.'] })
  })
  test('a missing slug, an unknown topic or no file', async () => {
    expect(await uploadSocialListeningExport(good({ clientSlug: '' }))).toEqual({ ok: false, errors: ['invalid client'] })
    expect(await uploadSocialListeningExport(good({ topic: 'paid' }))).toEqual({ ok: false, errors: ['invalid topic'] })
    expect(await uploadSocialListeningExport(good({ file: null }))).toEqual({ ok: false, errors: ['Choose the Talkwalker .xls export to upload.'] })
    expect(insertUpload).not.toHaveBeenCalled()
  })
})

describe('the month', () => {
  test('the live month is refused (R2-13)', async () => {
    const r = await uploadSocialListeningExport(good({ range: 'custom:2026-11-01,2026-11-18' }))
    expect(r).toEqual({ ok: false, errors: ['Upload opens when November 2026 ends.'] })
    expect(insertUpload).not.toHaveBeenCalled()
  })
  test('comes from the range, never a month field in the form', async () => {
    const r = await uploadSocialListeningExport(good({ extra: { month: '2026-09' } }))
    expect(r).toEqual({ ok: true, month: '2026-10', beforeOpen: false })
    expect(vi.mocked(insertUpload).mock.calls[0][0].month).toBe('2026-10')
  })
  test('a file for another month than the served one is refused by V4', async () => {
    const sep = buildWorkbook({ topic: 'brand', topicName: 'Made Up Brand', month: '2026-09' })
    const r = await uploadSocialListeningExport(good({ file: sep }))
    expect(r.ok).toBe(false)
    expect(insertUpload).not.toHaveBeenCalled()
  })
})

describe('storing', () => {
  test('stores the parsed export, the raw bytes, their sha256 and size, and who uploaded', async () => {
    const bytes = brandOct()
    expect(await uploadSocialListeningExport(good({ file: bytes }))).toEqual({ ok: true, month: '2026-10', beforeOpen: false })
    const arg = vi.mocked(insertUpload).mock.calls[0][0]
    expect(arg).toMatchObject({
      clientId: 'client-uuid', month: '2026-10', topic: 'brand', byteSize: bytes.length, beforeOpen: false, by: 'writer@avenuez.com',
      sha256: createHash('sha256').update(bytes).digest('hex'),
    })
    expect(arg.raw).toEqual(bytes)
    expect(arg.data).toMatchObject({ version: 1, topic: 'brand', month: '2026-10' })
  })

  test('beforeOpen on both sides of 00:00 New York on the open day (R2-15)', async () => {
    vi.setSystemTime(new Date('2026-11-12T04:59:59Z'))
    expect(await uploadSocialListeningExport(good())).toMatchObject({ ok: true, beforeOpen: true })
    vi.setSystemTime(new Date('2026-11-12T05:00:00Z'))
    expect(await uploadSocialListeningExport(good())).toMatchObject({ ok: true, beforeOpen: false })
    expect(vi.mocked(insertUpload).mock.calls.map((c) => c[0].beforeOpen)).toEqual([true, false])
  })

  test('two uploads in a row both store, newest current (append-only, no error shown)', async () => {
    expect((await uploadSocialListeningExport(good())).ok).toBe(true)
    expect((await uploadSocialListeningExport(good())).ok).toBe(true)
    expect(insertUpload).toHaveBeenCalledTimes(2)
  })

  test('the store refreshes the page (updateTag in insertUpload); the action adds no second refresh', async () => {
    await uploadSocialListeningExport(good())
    expect(updateTag).not.toHaveBeenCalled()
  })
})

describe('refusals and logs', () => {
  test('a brand file uploaded as industry is refused by V5; nothing stored; the log names slug, topic, month, rules and size only', async () => {
    const r = await uploadSocialListeningExport(good({ topic: 'industry' }))
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.errors.length).toBeGreaterThan(0)
    expect(insertUpload).not.toHaveBeenCalled()
    const line = String(warn.mock.calls[0][0])
    expect(line).toMatch(/^\[social-listening\] upload refused slug=a-client topic=industry month=2026-10 rules=\S*V5\S* bytes=\d+$/)
    expect(line).not.toContain(FILE_NAME)
  })

  test('a stored upload logs slug, topic, month, size and beforeOpen, never the file name', async () => {
    await uploadSocialListeningExport(good())
    const line = String(info.mock.calls[0][0])
    expect(line).toMatch(/^\[social-listening\] upload stored slug=a-client topic=brand month=2026-10 bytes=\d+ beforeOpen=false$/)
    expect(line).not.toContain(FILE_NAME)
  })

  test('a workbook that breaks the parser is refused plainly; the log names no part of the error or the file', async () => {
    vi.mocked(parseTalkwalkerExport).mockImplementationOnce(() => { throw new Error('cell text: private value') })
    expect(await uploadSocialListeningExport(good())).toEqual({ ok: false, errors: ["This isn't the original Talkwalker .xls export. Upload the file as downloaded."] })
    expect(insertUpload).not.toHaveBeenCalled()
    const line = error.mock.calls.map((c) => c.map(String).join(' ')).join('\n')
    expect(line).toMatch(/^\[social-listening\] upload parse failed slug=a-client topic=brand month=2026-10 bytes=\d+$/)
    expect(line).not.toContain('private value')
    expect(line).not.toContain(FILE_NAME)
  })

  test('a failed write says so plainly and logs no database message, which can hold the row', async () => {
    vi.mocked(insertUpload).mockRejectedValueOnce(Object.assign(new Error('Failing row contains (private value)'), { code: '23514' }))
    expect(await uploadSocialListeningExport(good())).toEqual({ ok: false, errors: ['Could not save the upload. Try again.'] })
    const line = error.mock.calls.map((c) => c.map(String).join(' ')).join('\n')
    expect(line).toMatch(/\[social-listening\] upload failed to store slug=a-client topic=brand month=2026-10 code=23514/)
    expect(line).not.toContain('private value')
  })
})
