// Unit B (plan 2026-11-24, F2): every tile and every chart card looks up the tooltip table, so once the team's definitions
// land each one draws its "?" hint, and the PDF drops them. Here the table is filled with made-up text for every key; the
// real table stays empty until the doc arrives.
import { beforeEach, expect, test, vi } from 'vitest'
import { render } from '@testing-library/react'

const h = vi.hoisted(() => ({ getClientBySlug: vi.fn(), getCommentaryForViewPrefix: vi.fn(async () => []), getSlMonth: vi.fn() }))
vi.mock('@/lib/db/queries', async (orig) => ({ ...(await orig<object>()), getClientBySlug: h.getClientBySlug, getCommentaryForViewPrefix: h.getCommentaryForViewPrefix }))
vi.mock('@/lib/organic-social/social-listening/store', () => ({ getSlMonth: h.getSlMonth }))
vi.mock('@/lib/organic-social/chart-notes/select', () => ({ getChartNotes: async () => [] }))
vi.mock('@/lib/organic-social/locked-range', async (orig) => ({ ...(await orig<object>()), requestClock: () => ({ today: '2026-11-19', lastCompleteUtcDay: '2026-11-18', liveDayInProgress: false }) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }), usePathname: () => '/x', useSearchParams: () => new URLSearchParams() }))
vi.mock('@/components/report-sections/commentary/monthly', () => ({ monthlyCommentary: vi.fn(async () => null) }))
// Every lookup answers, so a tile or card that never looks the table up is the one without a hint.
vi.mock('@/lib/organic-social/social-listening/tooltips', () => ({
  slTileTooltip: (topic: string, title: string) => `tile ${topic} ${title}`,
  slCardTooltip: (box: string) => `card ${box}`,
}))

import { parseTalkwalkerExport } from '@/lib/organic-social/social-listening/export-parse'
import { buildWorkbook } from '@/lib/organic-social/social-listening/test-workbook'
import type { SlTopic } from '@/lib/organic-social/social-listening/types'
import { SocialListeningSection } from './section'

const parsed = (topic: SlTopic) => {
  const name = topic === 'brand' ? 'Made Up Brand' : 'Made Up Industry'
  const r = parseTalkwalkerExport(buildWorkbook({ topic, topicName: name, month: '2026-10' }), { topic, topicName: name, month: '2026-10' })
  if (!r.ok) throw new Error('the test workbook did not parse')
  return r.data
}
const up = (topic: SlTopic) => ({ id: `u-${topic}`, month: '2026-10', topic, data: parsed(topic), beforeOpen: true, uploadedAt: new Date('2026-11-02T00:00:00Z') })

beforeEach(() => {
  h.getClientBySlug.mockResolvedValue({
    id: 'client-uuid', slug: 'a-client', hiddenReports: [], enabledReports: ['organic-social'],
    dashSocialConfig: { brandId: 1, reportingMonths: { firstMonth: '2026-08' }, socialListening: { enabled: true, brandTopic: 'Made Up Brand', industryTopic: 'Made Up Industry' } },
  })
  h.getSlMonth.mockResolvedValue({ uploads: [up('brand'), up('industry')], history: [], posts: [], trends: null })
})

const page = async (topic: SlTopic, exporting = false) =>
  render(<>{await SocialListeningSection({ clientSlug: 'a-client', servedRange: 'custom:2026-10-01,2026-10-31', role: 'CLIENT_VIEWER', email: null, topic, exporting })}</>).container
const hints = (c: HTMLElement) => [...c.querySelectorAll('[role="tooltip"]')].map((t) => t.textContent)

test.each(['brand', 'industry'] as const)('%s: every tile and every chart card has its hint, and only one', async (topic) => {
  const c = await page(topic)
  const tiles = c.querySelectorAll('[class*="kpi"]').length
  const cards = c.querySelectorAll('h3').length
  expect(hints(c)).toHaveLength(tiles + cards)
  expect(new Set(hints(c)).size).toBe(tiles + cards)
  expect(hints(c).filter((t) => t!.startsWith('tile '))).toHaveLength(tiles)
})

test('the hints are marked for the PDF to drop', async () => {
  const c = await page('brand', true)
  expect([...c.querySelectorAll('[role="tooltip"]')].every((t) => t.closest('[data-export-hide]'))).toBe(true)
})
