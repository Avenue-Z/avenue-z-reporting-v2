import { beforeEach, expect, test, vi } from 'vitest'
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
