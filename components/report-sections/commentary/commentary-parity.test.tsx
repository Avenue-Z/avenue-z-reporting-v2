import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { ReactElement } from 'react'
import { render } from '@testing-library/react'
import type { CommentaryEntry } from '@/lib/commentary/types'

/**
 * Pre-change record for locked months (spec section 8): the props CommentarySection hands the panel
 * (what crosses the RSC boundary) for a client WITHOUT `reportingMonths`, on every view key that
 * renders Commentary, for an editor, an approver and a client email; and a failing auth() still
 * throws. Task 7 adds the locked-months tests to this file.
 */
let captured: Record<string, unknown> | null = null
vi.mock('./commentary-panel', () => ({
  CommentaryPanel: (props: Record<string, unknown>) => { captured = props; return null },
}))
const mockAuth = vi.fn()
vi.mock('@/auth', () => ({ auth: () => mockAuth() }))
const { getClientBySlug } = vi.hoisted(() => ({ getClientBySlug: vi.fn() }))
vi.mock('@/lib/db/queries', () => ({ getClientBySlug, getCommentaryForView: async () => ENTRIES }))

const E = (id: string, periodStart: string, periodEnd: string, status: 'approved' | 'draft', updatedAt: string): CommentaryEntry => ({
  id, viewKey: 'organic-social:instagram', bodyHtml: `<p>${id}</p>`, periodStart, periodEnd, status,
  updatedBy: 'writer@avenuez.com', updatedAt, approvedBy: status === 'approved' ? 'approver@avenuez.com' : null,
  approvedAt: status === 'approved' ? updatedAt : null, deletedAt: null, deletedBy: null,
})
const ENTRIES: CommentaryEntry[] = [
  E('sep', '2026-09-01', '2026-09-30', 'approved', '2026-10-05T10:00:00.000Z'),
  E('aug', '2026-08-01', '2026-08-31', 'approved', '2026-09-05T10:00:00.000Z'),
  E('sep-draft', '2026-09-01', '2026-09-30', 'draft', '2026-10-06T10:00:00.000Z'),
]

import { CommentarySection } from './index'

const VIEW_KEYS = ['organic-social', 'organic-social:instagram', 'meta-ads', 'linkedin-ads', 'paid-search', 'peec-ai', 'peec-ai:pr-influence', 'peec-ai:content-impact'] as const
const EMAILS = ['writer@avenuez.com', 'approver@avenuez.com', 'client@example.com']
const NON_OPTED = { id: 'client-1', slug: 'c', dashSocialConfig: { brandId: 1 } }

beforeEach(() => { captured = null; process.env.COMMENTARY_APPROVERS = 'approver@avenuez.com' })

async function panelProps(client: unknown, viewKey: string, email: string, role: string, extra: Record<string, unknown> = {}) {
  getClientBySlug.mockResolvedValue(client)
  mockAuth.mockResolvedValue({ user: { email, role } })
  captured = null
  const el = await CommentarySection({ clientSlug: 'c', viewKey: viewKey as never, ...extra } as never)
  if (el) render(el)
  return captured
}

test('what a client without reportingMonths hands the panel, per view key, email and role', async () => {
  const out: Record<string, unknown> = {}
  for (const viewKey of VIEW_KEYS) for (const email of EMAILS) for (const role of ['INTERNAL_ADMIN', 'CLIENT_VIEWER']) {
    out[`${viewKey} ${email} ${role}`] = await panelProps(NON_OPTED, viewKey, email, role)
  }
  expect(out).toMatchSnapshot()
})

test('a failing auth() still throws, as today', async () => {
  getClientBySlug.mockResolvedValue(NON_OPTED)
  mockAuth.mockRejectedValue(new Error('session down'))
  await expect(CommentarySection({ clientSlug: 'c', viewKey: 'organic-social:instagram' })).rejects.toThrow('session down')
})

describe('Commentary follows the month (locked-months clients)', () => {
  const OPTED = { id: 'client-1', slug: 'c', dashSocialConfig: { brandId: 1, reportingMonths: { firstMonth: '2026-08' } } }
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-20T14:00:00Z')) })
  afterEach(() => vi.useRealTimers())
  async function run(role: string, email: string, requestedRange?: string, client: unknown = OPTED) {
    getClientBySlug.mockResolvedValue(client)
    mockAuth.mockResolvedValue({ user: { email, role } })
    captured = null
    const el = await CommentarySection({ clientSlug: 'c', viewKey: 'organic-social:instagram', requestedRange } as never)
    if (el) render(el)
    return { props: captured as Record<string, unknown> | null, key: (el as ReactElement | null)?.key ?? null }
  }

  test('a client gets only the served month, approved, redacted, no history (edges 23, 30)', async () => {
    const { props, key } = await run('CLIENT_VIEWER', 'client@example.com')
    expect((props!.entries as CommentaryEntry[]).map((e) => [e.id, e.updatedBy, e.updatedAt])).toEqual([['sep', '', '']])
    expect([props!.initialId, props!.history, props!.capabilities, key]).toEqual(['sep', [], { canEdit: false, canApprove: false }, '2026-09'])
  })
  test('a client-role viewer with an Avenue Z email, even an approver, sees exactly what a client sees (edge 23)', async () => {
    const client = await run('CLIENT_VIEWER', 'client@example.com')
    expect(await run('CLIENT_VIEWER', 'writer@avenuez.com')).toEqual(client)
    expect(await run('CLIENT_VIEWER', 'approver@avenuez.com')).toEqual(client)
  })
  test('a client never gets the live month, even by asking for it', async () => {
    const { props } = await run('CLIENT_VIEWER', 'client@example.com', 'custom:2026-10-01,2026-10-19')
    expect((props!.entries as CommentaryEntry[]).map((e) => e.id)).toEqual(['sep'])
  })
  test('the team gets the month with drafts, a prefilled period, the empty text, and a panel keyed by the month (edge 21)', async () => {
    const { props, key } = await run('INTERNAL_ADMIN', 'writer@avenuez.com', 'custom:2026-09-01,2026-09-30')
    expect((props!.entries as CommentaryEntry[]).map((e) => e.id)).toEqual(['sep', 'sep-draft'])
    expect([props!.defaultPeriod, props!.emptyText, key]).toEqual([{ start: '2026-09-01', end: '2026-09-30' }, 'No commentary for September 2026 yet', '2026-09'])
    const aug = await run('INTERNAL_ADMIN', 'writer@avenuez.com', 'custom:2026-08-01,2026-08-31')
    expect([aug.key, (aug.props!.entries as CommentaryEntry[]).map((e) => e.id)]).toEqual(['2026-08', ['aug']])
  })
  test('an approver on the team keeps the full history log', async () => {
    const { props } = await run('INTERNAL_ADMIN', 'approver@avenuez.com', 'custom:2026-09-01,2026-09-30')
    expect((props!.history as unknown[]).length).toBeGreaterThan(0)
  })
  test('the team sees the live month empty, with Add, and the whole live month as the prefill', async () => {
    const { props } = await run('INTERNAL_ADMIN', 'writer@avenuez.com', 'custom:2026-10-01,2026-10-19')
    expect([props!.entries, props!.emptyText, props!.defaultPeriod]).toEqual([[], 'No commentary for October 2026 yet', { start: '2026-10-01', end: '2026-10-31' }])
  })
  test('no served month: nothing for a client, the empty panel for the team', async () => {
    const later = { ...OPTED, dashSocialConfig: { brandId: 1, reportingMonths: { firstMonth: '2027-01' } } }
    getClientBySlug.mockResolvedValue(later)
    mockAuth.mockResolvedValue({ user: { email: 'client@example.com', role: 'CLIENT_VIEWER' } })
    expect(await CommentarySection({ clientSlug: 'c', viewKey: 'organic-social:instagram' })).toBeNull()
    const team = await run('INTERNAL_ADMIN', 'writer@avenuez.com', undefined, later)
    expect([team.props!.entries, team.props!.emptyText]).toEqual([[], 'No reporting months yet'])
  })
  test('parity: requestedRange changes nothing for a client without the key; non-Organic Social views are untouched for an opted-in client', async () => {
    const base: Record<string, unknown> = {}
    const withRange: Record<string, unknown> = {}
    const optedOther: Record<string, unknown> = {}
    for (const viewKey of VIEW_KEYS) for (const email of EMAILS) for (const role of ['INTERNAL_ADMIN', 'CLIENT_VIEWER']) {
      const k = `${viewKey} ${email} ${role}`
      base[k] = await panelProps(NON_OPTED, viewKey, email, role)
      withRange[k] = await panelProps(NON_OPTED, viewKey, email, role, { requestedRange: 'custom:2026-10-01,2026-10-19' })
      if (!viewKey.startsWith('organic-social')) optedOther[k] = await panelProps({ ...NON_OPTED, dashSocialConfig: OPTED.dashSocialConfig }, viewKey, email, role)
    }
    expect(withRange).toEqual(base)
    for (const [k, v] of Object.entries(optedOther)) expect(v).toEqual(base[k])
  })
  test('the team is told when clients will see a withheld entry; a client gets neither the entry nor any note (edge 29, spec 3.9 example)', async () => {
    vi.setSystemTime(new Date('2026-09-15T14:00:00Z'))
    const cross = E('aug-cross', '2026-08-01', '2026-09-05', 'approved', '2026-09-06T10:00:00.000Z')
    ENTRIES.push(cross)
    try {
      const team = await run('INTERNAL_ADMIN', 'writer@avenuez.com', 'custom:2026-08-01,2026-08-31')
      expect(team.props!.entryNotes).toEqual({ 'aug-cross': 'Clients see this from Oct 12' })
      const client = await run('CLIENT_VIEWER', 'client@example.com', 'custom:2026-08-01,2026-08-31')
      expect((client.props!.entries as CommentaryEntry[]).map((e) => e.id)).toEqual(['aug'])
      expect(client.props!.entryNotes).toBeUndefined()
    } finally { ENTRIES.pop() }
  })
  test('a failing auth() still throws for an opted-in client, as today', async () => {
    getClientBySlug.mockResolvedValue(OPTED)
    mockAuth.mockRejectedValue(new Error('session down'))
    await expect(CommentarySection({ clientSlug: 'c', viewKey: 'organic-social:instagram' })).rejects.toThrow('session down')
  })
})
