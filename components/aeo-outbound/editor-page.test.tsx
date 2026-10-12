// The editor page (app/tools/new-business/[reportId]/page.tsx). It lives here because vitest.config.ts lists no app/tools glob.
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

const m = vi.hoisted(() => ({ getReport: vi.fn(), opens: vi.fn() }))
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND') } }))
vi.mock('@/lib/auth/page-access', () => ({ requireStaff: vi.fn(async () => ({ user: { email: 'ryan@avenuez.com', role: 'INTERNAL_ANALYST' } })) }))
vi.mock('@/lib/aeo-outbound/access', () => ({ outboundAccess: vi.fn(async () => ({ ok: true })) }))
vi.mock('@/lib/aeo-outbound/store', async (o) => ({ ...(await o<object>()), getReport: m.getReport, opensForReportQuery: m.opens }))

import NewBusinessEditorPage from '@/app/tools/new-business/[reportId]/page'

const ID = 'c7d8e0a1-1111-4111-8111-111111111111'
const row = (over: Record<string, unknown> = {}) => ({
  id: ID, status: 'draft', brandName: 'Example Co', peecProjectName: 'Example', peecProjectId: 'or_a', revision: 2, createdAt: new Date('2026-10-08T15:00:00Z'),
  shareRevokedAt: null, shareToken: null, shareRecipient: null, error: null, errorCode: null, openCount: 0, progressStep: 0,
  data: { projectId: 'or_a', projectName: 'p', projectStatus: 'PITCH', windowLabel: 'Oct 1, 2026 to Oct 8, 2026', models: ['ChatGPT UI'] },
  slots: null, notes: [{ kind: 'long_dash', text: 'a note' }], unreadable: false, ...over,
})
beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => {}) })
afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks() })

test('B4: an unreadable row never sends its unvalidated notes or data to the client', async () => {
  m.getReport.mockResolvedValue(row({ unreadable: true, notes: 'not an array', data: { projectId: 5 } }))
  const el = await NewBusinessEditorPage({ params: Promise.resolve({ reportId: ID }) })
  const props = (el as unknown as { props: Record<string, unknown> }).props
  expect(props.notes).toEqual([])
  expect(props.about).toBeNull()
  expect(props.unreadable).toBe(true)
  expect(props.brand).toBe('Example Co')
  expect(props.id).toBe(ID)
})

test('B4: a readable row still passes its notes and about', async () => {
  m.getReport.mockResolvedValue(row())
  const el = await NewBusinessEditorPage({ params: Promise.resolve({ reportId: ID }) })
  const props = (el as unknown as { props: Record<string, unknown> }).props
  expect(props.notes).toEqual([{ kind: 'long_dash', text: 'a note' }])
  expect(props.about).toMatchObject({ projectId: 'or_a' })
})
