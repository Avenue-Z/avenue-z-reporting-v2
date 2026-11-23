import { expect, test, vi } from 'vitest'

vi.mock('@/components/report-sections/peec-ai', () => ({ PeecAIReport: function PeecAIReport() { return null } }))
vi.mock('@/components/report-sections/peec-ai/content-impact', () => ({ ContentImpactReport: function ContentImpactReport() { return null } }))

import { exportReportElement } from './report-element'

const params = { clientSlug: 'c', dateRange: 'custom:2026-10-01,2026-10-31', compareRange: null, models: null }

// The PDF follows client visibility whoever exports it (spec R-14 / D-4).
test.each(['content-impact', null] as const)('the peec-ai export (%s) renders as the client audience', (subsectionId) => {
  const el = exportReportElement({ section: 'peec-ai', subsectionId, pageTitle: 'x' } as never, params)
  expect(el.props).toMatchObject({ audience: 'client' })
})
