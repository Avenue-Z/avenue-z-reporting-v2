// The Social Listening tab's rendered markup, pinned before its look moves into the shared Organic Social design kit
// (plan docs/superpowers/plans/2026-11-23-os-design-kit-phase0.md, Task 1). Moving files must not change these snapshots.
// The setup mirrors section.test.tsx (a made-up workbook through the real parser; the store and commentary read replaced).
import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import type { SlExport, SlMonthData, SlTopic, SlUpload } from '@/lib/organic-social/social-listening/types'
import type { CommentaryEntry } from '@/lib/commentary/types'

const h = vi.hoisted(() => ({
  getClientBySlug: vi.fn(), getCommentaryForViewPrefix: vi.fn(), getSlMonth: vi.fn(),
  clock: { value: { today: '2026-11-19', lastCompleteUtcDay: '2026-11-18', liveDayInProgress: false } },
}))
vi.mock('@/lib/db/queries', async (orig) => ({ ...(await orig<object>()), getClientBySlug: h.getClientBySlug, getCommentaryForViewPrefix: h.getCommentaryForViewPrefix }))
vi.mock('@/lib/organic-social/social-listening/store', () => ({ getSlMonth: h.getSlMonth }))
vi.mock('@/lib/organic-social/locked-range', async (orig) => ({ ...(await orig<object>()), requestClock: () => h.clock.value }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => '/x', useSearchParams: () => new URLSearchParams() }))
// Each analysis box is a marker naming its key: the box's own look is pinned by its own tests, and stays Social Listening's.
vi.mock('@/components/report-sections/commentary/monthly', () => ({
  monthlyCommentary: vi.fn(async ({ viewKey }: { viewKey: string }) => <div data-box={viewKey.split(':').at(-1)} />),
}))

import { parseTalkwalkerExport } from '@/lib/organic-social/social-listening/export-parse'
import { buildWorkbook } from '@/lib/organic-social/social-listening/test-workbook'
import { SL_BRAND_BOX_IDS } from '@/lib/organic-social/social-listening/boxes'
import { SocialListeningSection } from './section'

const SETTING = { enabled: true, brandTopic: 'Made Up Brand', industryTopic: 'Made Up Industry', industrySample: 10 }
const CLIENT = {
  id: 'client-uuid', slug: 'a-client', hiddenReports: [], enabledReports: ['organic-social'],
  dashSocialConfig: { brandId: 1, reportingMonths: { firstMonth: '2026-08' }, socialListening: SETTING },
}
const OCT = 'custom:2026-10-01,2026-10-31'

function parsed(topic: SlTopic): SlExport {
  const topicName = topic === 'brand' ? 'Made Up Brand' : 'Made Up Industry'
  const r = parseTalkwalkerExport(buildWorkbook({ topic, topicName, month: '2026-10' }), { topic, topicName, month: '2026-10' })
  if (!r.ok) throw new Error(`the test workbook did not parse: ${JSON.stringify(r.failed)}`)
  return r.data
}
const up = (id: string, data: SlExport): SlUpload => ({ id, month: data.month, topic: data.topic, data, beforeOpen: true, uploadedAt: new Date('2026-11-02T00:00:00Z') })
const monthData = (): SlMonthData => ({ uploads: [up('u-brand', parsed('brand')), up('u-industry', parsed('industry'))], history: [], posts: [], trends: null })
const approvedBox = (box: string): CommentaryEntry => ({
  id: `e-${box}`, viewKey: `organic-social:social-listening:${box}` as CommentaryEntry['viewKey'], bodyHtml: '<p>x</p>',
  periodStart: '2026-10-01', periodEnd: '2026-10-31', status: 'approved', updatedBy: 's@avenuez.com', updatedAt: '2026-11-03T00:00:00.000Z',
  approvedBy: 'a@avenuez.com', approvedAt: '2026-11-03T00:00:00.000Z', deletedAt: null, deletedBy: null,
})

/** A CSS module class renders in Vitest as `_card_e1fd3b`, the suffix derived from the stylesheet's path. Strip it, so moving the
 *  stylesheet (which changes nothing on screen) does not change the snapshot; every class name is kept. */
export const normalize = (html: string) => html.replace(/_([A-Za-z][A-Za-z0-9]*)_[0-9a-f]{6}\b/g, '$1')

const markup = async (o: Partial<Parameters<typeof SocialListeningSection>[0]> = {}) => {
  const el = await SocialListeningSection({ clientSlug: 'a-client', servedRange: OCT, role: 'INTERNAL_ADMIN', email: 'writer@avenuez.com', topic: 'brand', exporting: false, ...o })
  return normalize(render(<>{el}</>).container.innerHTML)
}

let warn: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  vi.clearAllMocks()
  h.getClientBySlug.mockResolvedValue(CLIENT)
  h.getCommentaryForViewPrefix.mockResolvedValue([])
  h.getSlMonth.mockResolvedValue(monthData())
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => { warn.mockRestore() })

describe('normalize', () => {
  test('keeps every class name and removes only the six-character path suffix', () => {
    expect(normalize('<div class="_card_e1fd3b _cardHead_e1fd3b x"><i class="_g4_0a1b2c"></i></div>'))
      .toBe('<div class="card cardHead x"><i class="g4"></i></div>')
  })
})

describe('Social Listening markup, pinned before the design kit move', () => {
  test('staff, brand', async () => { expect(await markup()).toMatchSnapshot() })
  test('staff, industry', async () => { expect(await markup({ topic: 'industry' })).toMatchSnapshot() })
  test('export, brand', async () => { expect(await markup({ exporting: true })).toMatchSnapshot() })
  test('export, industry', async () => { expect(await markup({ exporting: true, topic: 'industry' })).toMatchSnapshot() })
  test('client, brand, every box approved', async () => {
    h.getCommentaryForViewPrefix.mockResolvedValue(SL_BRAND_BOX_IDS.map(approvedBox))
    expect(await markup({ role: 'CLIENT_VIEWER', email: null })).toMatchSnapshot()
  })
})
