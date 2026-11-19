import { expect, test, vi } from 'vitest'

vi.mock('@/components/report-sections/organic-social', () => ({ OrganicSocialReport: function OrganicSocialReport() { return null } }))

import { exportReportElement } from './report-element'

const params = { clientSlug: 'c', dateRange: 'custom:2026-10-01,2026-10-31', compareRange: null, models: null }

test('the Social Listening export renders the client view (exporting), and no other tab gets the flag', () => {
  const sl = exportReportElement({ section: 'organic-social', subsectionId: 'organic-social-listening', channel: null, view: 'social-listening', pageTitle: 'Social Listening' }, params)
  expect(sl.props).toMatchObject({ view: 'social-listening', exporting: true })
  expect(sl.props).not.toHaveProperty('sl')
  for (const view of [null, 'influencer', 'aeo-informed'] as const) {
    const el = exportReportElement({ section: 'organic-social', subsectionId: null, channel: null, view, pageTitle: 'x' }, params)
    expect(el.props).not.toHaveProperty('exporting')
  }
})
