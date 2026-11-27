import { expect, test } from 'vitest'
import { render } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { PEEC_PARTS } from './registry'
import { FIXTURE_PEEC_CTX } from './__fixtures__/peec-ctx'
import type { AiKpiWindow } from '@/lib/ga4/ai-kpis'

const win = (total: number, sessions: number, leads: number): AiKpiWindow => ({
  totalSessions: total,
  bySource: [{ source: 'chatgpt.com', sessions, keyEvents: leads }],
  leadsBySource: null,
})

test('kpi-cards@2 golden', () => {
  const impl = PEEC_PARTS['kpi-cards'][2]
  const ctx = {
    ...FIXTURE_PEEC_CTX,
    audience: 'client' as const,
    kpi: { saved: null, ga4Connected: true, ga4: { status: 'ok' as const, now: win(1000, 80, 8), prior: win(900, 70, 6) }, profoundSentiment: null },
  }
  const resolved = { id: 'kpi-cards', version: 2, label: impl.defaultLabel }
  const { container } = render(<TooltipProvider>{impl.render(ctx, resolved)}</TooltipProvider>)
  expect(container.textContent).toContain('AI visibility')
  expect(container.textContent).toContain('GA4')
  expect(container.textContent).not.toContain('Edit KPIs')
  expect(container.firstChild).toMatchSnapshot()
})
