// The last look fixes, L5 and D2 (spec docs/superpowers/specs/2026-11-26-os-final-look.md): in staff's "Preview as client" a box
// resolves its month with the real role (so it shows the same month as the parts), and shows only the entry a client gets for
// that month, the one the PDF prints (clientMonthEntry, lib/commentary/month.ts): read-only, client-safe, no history, no staff
// notes. No entry for the client means no box, as a client sees.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { render } from '@testing-library/react'
import type { CommentaryEntry } from '@/lib/commentary/types'
import { ANALYSIS_LABELS } from '@/lib/commentary/labels'
import { clientMonthEntry } from '@/lib/commentary/month'
import { toClientSafeEntry } from '@/lib/commentary/select'
import { lockedRangeFor, requestClock } from '@/lib/organic-social/locked-range'
import { firstOf, lastOf } from '@/lib/organic-social/reporting-months'

const panels = vi.hoisted(() => ({ props: [] as Record<string, unknown>[] }))
vi.mock('./commentary-panel', () => ({
  CommentaryPanel: (props: Record<string, unknown>) => { panels.props.push(props); return null },
}))
const q = vi.hoisted(() => ({ rows: [] as unknown[] }))
vi.mock('@/lib/db/queries', () => ({ getCommentaryForView: async () => q.rows }))

const CLIENT = { id: 'c1', slug: 'acme', dashSocialConfig: { brandId: 1, reportingMonths: { firstMonth: '2026-08' } } }
const STAFF = { role: 'INTERNAL_ADMIN', email: 'staff@avenuez.com' }
const VIEW = 'organic-social:instagram' as const

function entry(id: string, month: string, status: 'approved' | 'draft'): CommentaryEntry {
  return {
    id, viewKey: VIEW, bodyHtml: `<p>${id}</p>`, periodStart: firstOf(month), periodEnd: lastOf(month), status,
    updatedBy: 'staff@avenuez.com', updatedAt: '2026-11-02T00:00:00.000Z', approvedBy: status === 'approved' ? 'staff@avenuez.com' : null,
    approvedAt: status === 'approved' ? '2026-11-03T00:00:00.000Z' : null, deletedAt: null, deletedBy: null,
  }
}
async function box(requestedRange: string, preview: boolean) {
  const { monthlyCommentary } = await import('./monthly')
  const el = await monthlyCommentary({ client: CLIENT, role: STAFF.role, email: STAFF.email, viewKey: VIEW, requestedRange, labels: ANALYSIS_LABELS, ...(preview ? { preview: true } : {}) })
  if (el) render(el)
  return el
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-19T15:00:00Z'))
  vi.stubEnv('COMMENTARY_APPROVERS', STAFF.email)
  panels.props = []
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })

describe('a box in staff\'s preview', () => {
  test('a month the client can open: the staff month, and only the entry the client gets, read-only and client-safe', async () => {
    const clientMonths = lockedRangeFor(CLIENT, 'CLIENT_VIEWER', undefined, requestClock())!.months
    const month = clientMonths[0].key
    const range = `custom:${firstOf(month)},${lastOf(month)}`
    q.rows = [entry('ok', month, 'approved'), entry('draft', month, 'draft')]
    const expected = clientMonthEntry(q.rows as CommentaryEntry[], month, clientMonths)!
    expect(expected.id).toBe('ok')
    await box(range, true)
    expect(panels.props).toHaveLength(1)
    const p = panels.props[0]
    expect(p.entries).toEqual([toClientSafeEntry(expected)])
    expect([p.initialId, p.clientEntryId]).toEqual(['ok', 'ok'])
    expect(p.capabilities).toEqual({ canEdit: false, canApprove: false })
    expect(p.history).toEqual([])
    expect(p.entryNotes).toBeUndefined()
    expect(p.defaultPeriod).toEqual({ start: firstOf(month), end: lastOf(month) })
  })

  test('the same month for staff without the preview still gets the editor\'s view (unchanged)', async () => {
    const month = lockedRangeFor(CLIENT, 'CLIENT_VIEWER', undefined, requestClock())!.months[0].key
    q.rows = [entry('ok', month, 'approved'), entry('draft', month, 'draft')]
    await box(`custom:${firstOf(month)},${lastOf(month)}`, false)
    expect((panels.props[0].capabilities as { canEdit: boolean }).canEdit).toBe(true)
    expect((panels.props[0].entries as unknown[]).length).toBe(2)
  })

  test('a month the client can\'t open yet: staff still get that month (same as the parts), and no box, as the PDF prints none', async () => {
    const staffMonth = lockedRangeFor(CLIENT, STAFF.role, 'custom:2026-11-01,2026-11-18', requestClock())!.month!.key
    const clientKeys = lockedRangeFor(CLIENT, 'CLIENT_VIEWER', undefined, requestClock())!.months.map((m) => m.key)
    expect(clientKeys).not.toContain(staffMonth)
    q.rows = [entry('nov', staffMonth, 'approved')]
    expect(await box('custom:2026-11-01,2026-11-18', true)).toBeNull()
    expect(panels.props).toHaveLength(0)
  })
})
